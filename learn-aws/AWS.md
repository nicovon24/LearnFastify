# AWS CDK + Serverless — Guía de referencia rápida

---

## La idea central

AWS CDK te permite definir **infraestructura como código TypeScript**. En vez de clickear en la consola de AWS o escribir YAML de CloudFormation, describís los recursos de AWS como objetos y clases. CDK genera el template de CloudFormation por debajo.

```
Tu código TypeScript (CDK)
       ↓  cdk synth
Template de CloudFormation (JSON/YAML)
       ↓  cdk deploy
Recursos reales en AWS (Lambda, DynamoDB, etc.)
```

**Para desarrollo local → Floci:**
```
cdklocal deploy → Floci (http://localhost:4566) en vez de AWS real
```

---

## Arquitectura del proyecto

```
Request HTTP
       ↓
  API Gateway (REST API)       → entrada HTTP pública, rate limiting, CORS
       ↓
  Cognito Authorizer           → valida el JWT antes de ejecutar la Lambda
  (endpoints protegidos)
       ↓
  Lambda (Node.js)             → lógica de negocio — compute sin servidor
       ↓
  DynamoDB                     → base de datos NoSQL — sin servidor
       ↓ (solo en createPrediction)
  SNS Topic                    → pub/sub — desacopla efectos secundarios
       ↓
  CloudWatch                   → logs automáticos + alarmas de errores
```

---

## 1. CDK Stack — la unidad de despliegue

**Qué es:** un Stack de CDK = un template de CloudFormation. Todo lo que definís en el constructor del Stack se despliega junto. Equivalente a todos los recursos de un proyecto en un solo `docker-compose.yml`.

```typescript
// lib/mi-stack.ts
import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export class MiStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // Cada "new XXX(this, 'LogicalId', { ... })" define un recurso de AWS
    const tabla = new dynamodb.Table(this, "MiTabla", {
      tableName: "mi-tabla",
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,  // borrar tabla al hacer cdk destroy
    });
  }
}
```

```typescript
// bin/mi-app.ts — entry point
const app = new cdk.App();
new MiStack(app, "MiStack", {
  env: { account: "000000000000", region: "us-east-1" },
});
```

---

## 2. Servicios principales — qué es cada uno

### Lambda — Compute serverless

```typescript
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as lambda from "aws-cdk-lib/aws-lambda";

const myFn = new lambdaNodejs.NodejsFunction(this, "MyFn", {
  functionName: "myFunction",
  entry: path.join(__dirname, "../lambda/myFunction/index.ts"),
  handler: "handler",
  runtime: lambda.Runtime.NODEJS_20_X,
  timeout: cdk.Duration.seconds(30),
  memorySize: 256,           // más memoria = más CPU (Lambda los escala juntos)
  environment: {
    TABLE_NAME: tabla.tableName,  // inyectamos la env var desde CDK
  },
});
```

**Cuándo usarlo:** lógica de negocio que no necesita correr 24/7. Pagás por invocación, no por tiempo encendido.

**Modelo de ejecución:**
```typescript
// lambda/myFunction/index.ts
import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  const body = JSON.parse(event.body ?? "{}");
  const pathParam = event.pathParameters?.id;
  const queryParam = event.queryStringParameters?.page;
  const userId = event.requestContext?.authorizer?.claims?.sub; // Cognito claim

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: "OK" }),
  };
};
```

---

### DynamoDB — Base de datos NoSQL serverless

```typescript
const tabla = new dynamodb.Table(this, "PredictionsTable", {
  tableName: "Predictions",
  partitionKey: { name: "userId", type: dynamodb.AttributeType.STRING },
  sortKey:      { name: "matchId", type: dynamodb.AttributeType.STRING },
  billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});

// GSI: índice para buscar por matchId (la sort key no es suficiente sin la partition key)
tabla.addGlobalSecondaryIndex({
  indexName: "MatchIndex",
  partitionKey: { name: "matchId", type: dynamodb.AttributeType.STRING },
  projectionType: dynamodb.ProjectionType.ALL,
});
```

**Reglas de diseño de DynamoDB:**

| Concepto | Qué es | Analogía |
|---|---|---|
| **Partition Key (PK)** | Clave de distribución — divide datos en particiones | El piso del edificio |
| **Sort Key (SK)** | Clave de orden dentro de una partición | El apartamento en ese piso |
| **GSI** | Índice secundario — nueva PK para otras queries | Otro directorio del edificio |
| **Query** | Busca por PK (y opcionalmente SK) — eficiente O(n resultados) | Buscar en un piso específico |
| **Scan** | Lee toda la tabla — costoso O(tabla completa) | Buscar en todos los pisos |

**SDK v3 para DynamoDB en Lambda:**
```typescript
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand, QueryCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

const client = DynamoDBDocumentClient.from(new DynamoDBClient({ region: "us-east-1" }));

// Escribir
await client.send(new PutCommand({
  TableName: "Predictions",
  Item: { userId: "u1", matchId: "m1", homeScore: 2, awayScore: 1 },
}));

// Leer por partition key
await client.send(new QueryCommand({
  TableName: "Predictions",
  KeyConditionExpression: "#userId = :userId",
  ExpressionAttributeNames: { "#userId": "userId" },  // userId es palabra reservada
  ExpressionAttributeValues: { ":userId": "u1" },
}));

// Leer por GSI
await client.send(new QueryCommand({
  TableName: "Predictions",
  IndexName: "MatchIndex",
  KeyConditionExpression: "matchId = :matchId",
  ExpressionAttributeValues: { ":matchId": "m1" },
}));
```

---

### API Gateway — HTTP front-door

```typescript
import * as apigateway from "aws-cdk-lib/aws-apigateway";

const api = new apigateway.RestApi(this, "MiApi", {
  restApiName: "mi-api",
  defaultCorsPreflightOptions: {
    allowOrigins: apigateway.Cors.ALL_ORIGINS,
    allowMethods: apigateway.Cors.ALL_METHODS,
  },
  deployOptions: { stageName: "local" },
});

// Definir rutas
const predictions = api.root.addResource("predictions");

predictions.addMethod("POST",
  new apigateway.LambdaIntegration(createPredictionFn),
  { authorizer: cognitoAuthorizer, authorizationType: apigateway.AuthorizationType.COGNITO }
);

predictions.addResource("me").addMethod("GET",
  new apigateway.LambdaIntegration(getPredictionsByUserFn),
  { authorizer: cognitoAuthorizer, authorizationType: apigateway.AuthorizationType.COGNITO }
);

// Ruta pública (sin authorizer)
predictions.addResource("match").addResource("{matchId}").addMethod("GET",
  new apigateway.LambdaIntegration(getMatchPredictionsFn)
);
```

---

### Cognito — Autenticación de usuarios

**Diferencia clave de la guía CLF-C02:**
- **IAM** → controla quién puede usar recursos de AWS (Lambdas, DynamoDB, etc.)
- **Cognito** → controla quién puede usar tu aplicación (usuarios finales)

```typescript
import * as cognito from "aws-cdk-lib/aws-cognito";

const userPool = new cognito.UserPool(this, "UserPool", {
  selfSignUpEnabled: true,
  signInAliases: { email: true },
  passwordPolicy: { minLength: 8, requireDigits: true },
  removalPolicy: cdk.RemovalPolicy.DESTROY,
});

const userPoolClient = new cognito.UserPoolClient(this, "UserPoolClient", {
  userPool,
  authFlows: { userPassword: true, userSrp: true },
  generateSecret: false,
});

// Authorizer — valida el JWT antes de ejecutar la Lambda
const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, "Authorizer", {
  cognitoUserPools: [userPool],
  resultsCacheTtl: cdk.Duration.minutes(5),
});
```

---

### SNS — Mensajería pub/sub

**Por qué usar SNS en vez de hacer todo en la misma Lambda:**

Sin SNS: `createPrediction → guarda en DB → envía email → actualiza ranking → analytics`
Con SNS:  `createPrediction → guarda en DB → publica evento`
          `SNS → emailLambda (independiente)`
          `SNS → rankingLambda (independiente)`

Si rankingLambda falla, no afecta a createPrediction. Podés agregar subscribers sin modificar el producer.

```typescript
import * as sns from "aws-cdk-lib/aws-sns";

const topic = new sns.Topic(this, "NewPredictionTopic", {
  topicName: "NewPredictionTopic",
});

// Dar permiso a la Lambda para publicar
topic.grantPublish(createPredictionFn);
```

```typescript
// En la Lambda — publicar un evento
import { SNSClient, PublishCommand } from "@aws-sdk/client-sns";

const sns = new SNSClient({ region: "us-east-1" });

await sns.send(new PublishCommand({
  TopicArn: process.env.SNS_TOPIC_ARN,
  Message: JSON.stringify({ eventType: "NEW_PREDICTION", userId, matchId }),
  MessageAttributes: {
    eventType: { DataType: "String", StringValue: "NEW_PREDICTION" },
  },
}));
```

---

### IAM — Mínimo privilegio

**Qué es:** cada Lambda tiene su propio IAM Role. Le asignamos solo los permisos que necesita. Si una Lambda es comprometida, el atacante solo puede hacer lo que esa Lambda podía hacer.

```typescript
// CDK aplica el principio automáticamente con métodos grant*
tabla.grantWriteData(createPredictionFn);  // solo PutItem — no puede leer ni borrar
tabla.grantReadData(getPredictionsFn);     // solo GetItem/Query — no puede escribir
topic.grantPublish(createPredictionFn);   // solo Publish — no puede suscribirse
```

**Comparación con acceso sin restricciones (lo que NO hay que hacer):**
```typescript
// ❌ MAL: acceso total a toda la cuenta
createPredictionFn.addToRolePolicy(new iam.PolicyStatement({
  actions: ["*"], resources: ["*"],
}));

// ✅ BIEN: solo lo necesario
tabla.grantWriteData(createPredictionFn);
```

---

### CloudWatch — Observabilidad

```typescript
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";

// Alarma: más de 5 errores en 5 minutos
new cloudwatch.Alarm(this, "ErrorsAlarm", {
  alarmName: "createPrediction-errors-alarm",
  metric: createPredictionFn.metricErrors({
    period: cdk.Duration.minutes(5),
    statistic: "Sum",
  }),
  threshold: 5,
  evaluationPeriods: 1,
  treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
});
```

Los logs de las Lambdas van a CloudWatch automáticamente — cada `console.log()` en la Lambda aparece en `/aws/lambda/nombreFuncion`.

---

## 3. Comandos principales de CDK

| Comando | Qué hace |
|---|---|
| `cdk synth` | Genera el template de CloudFormation (no despliega) |
| `cdk deploy` | Despliega a AWS real |
| `cdklocal deploy` | Despliega a Floci (emulador local) |
| `cdklocal bootstrap aws://000000000000/us-east-1` | Prepara Floci para CDK (primera vez) |
| `cdk destroy` | Borra todos los recursos del stack |
| `cdk diff` | Muestra qué cambiaría si desplegás ahora |

---

## 4. Floci — emulador local de AWS

**Qué es:** emula los servicios de AWS localmente. Lambda, DynamoDB, API Gateway, Cognito, SNS corren en `localhost:4566`. No necesitás cuenta de AWS ni gastar un centavo.

```yaml
# docker-compose.floci.yml
services:
  floci:
    image: floci/floci:latest
    ports:
      - "4566:4566"
    environment:
      - SERVICES=lambda,dynamodb,apigateway,cognito-idp,sns,cloudwatch,logs,cloudformation
      - LAMBDA_EXECUTOR=docker        # Lambdas corren en containers Docker reales
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock  # Floci necesita Docker para Lambda
```

```bash
# Variables para apuntar a Floci en vez de AWS real
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
export AWS_ENDPOINT_URL=http://localhost:4566
```

---

## Resumen: servicios AWS y cuándo usarlos

| Servicio | Cuándo usarlo | No usarlo cuando |
|---|---|---|
| **Lambda** | Lógica sin servidor, cargas variables, eventos | Procesos de más de 15 min, mucha CPU constante |
| **DynamoDB** | Acceso por clave, escala automática, sin schema fijo | Queries complejos con JOIN, relaciones fuertes |
| **RDS/Aurora** | SQL, relaciones, queries complejos | Necesitás serverless o escala sin gestión |
| **API Gateway** | HTTP público, auth, rate limiting | WebSockets (usa WebSocket API), streaming |
| **Cognito** | Auth de usuarios finales (login/registro) | Auth de servicios/máquinas (usa IAM roles) |
| **SNS** | Pub/sub: 1 mensaje → múltiples subscribers | Cola FIFO, procesamiento por lotes (usa SQS) |
| **SQS** | Cola de mensajes, retry automático, FIFO | Broadcast a múltiples subscribers (usa SNS) |
| **S3** | Almacenamiento de archivos, frontend estático | Base de datos, acceso por clave frecuente |
| **CloudFront** | CDN, caché, reducir latencia global | Cargas que cambian muy frecuentemente |
| **CloudWatch** | Logs, métricas, alarmas de todos los servicios | APM detallado (usa X-Ray para trazas) |

---

## El ciclo completo de un request

`POST /predictions` con JWT válido:

1. **API Gateway** recibe el request
2. **Cognito Authorizer** valida el JWT — si es inválido, devuelve 401 sin ejecutar Lambda
3. **Lambda `createPrediction`** recibe el `event` con body, path params, y claims de Cognito
4. Lambda valida el body manualmente (sin framework)
5. **`PutCommand`** → escribe en **DynamoDB** con `docClient.send()`
6. **`PublishCommand`** → publica en **SNS** el evento `NEW_PREDICTION`
7. Lambda devuelve `{ statusCode: 201, body: JSON.stringify(resultado) }`
8. **API Gateway** convierte eso en una respuesta HTTP
9. **CloudWatch** recibe los logs del `console.log()` de la Lambda automáticamente
