/**
 * lib/prodeazo-predictions-api-stack.ts — Stack principal de CDK
 *
 * Un "Stack" de CDK es una unidad de despliegue de CloudFormation.
 * Todo lo que se define en este archivo se convierte en un template de
 * CloudFormation cuando corrés "cdk synth", y se despliega cuando corrés
 * "cdk deploy" (o "cdklocal deploy" para Floci).
 *
 * ARQUITECTURA:
 *   Internet → API Gateway → Cognito Authorizer → Lambda → DynamoDB
 *                                                       ↘ SNS → (subscribers futuros)
 *                                               CloudWatch ← (logs y métricas)
 */

import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as sns from "aws-cdk-lib/aws-sns";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdaNodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as apigateway from "aws-cdk-lib/aws-apigateway";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as path from "path";

export class ProdeazoPredictionsStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ══════════════════════════════════════════════════════════════════════════
    // 1. DYNAMODB — Base de datos de predicciones
    // ══════════════════════════════════════════════════════════════════════════
    //
    // POR QUÉ DynamoDB y no RDS/Postgres:
    //   - Sin servidor (serverless): no hay instancia que gestionar o pagar
    //     cuando no hay tráfico. Escala automáticamente.
    //   - Las predicciones tienen un acceso muy predecible: "dame las predicciones
    //     del usuario X" o "dame las predicciones del partido Y". DynamoDB
    //     es ideal para este patrón de acceso clave-valor.
    //   - Integración nativa con Lambda sin gestión de connection pools.
    //
    // DISEÑO DE KEYS (importante para DynamoDB):
    //   Partition Key (PK): userId — agrupa todas las predicciones de un usuario
    //   Sort Key (SK): matchId — dentro de las predicciones de un usuario,
    //                  ordena/filtra por partido
    //
    //   Este diseño permite dos accesos eficientes:
    //     1. "Predicciones del usuario X" → query PK=userId (usa solo la partition key)
    //     2. "Predicción del usuario X para el partido Y" → GetItem PK=userId + SK=matchId
    //
    //   Para acceder por matchId (sin userId), necesitamos un GSI (Global Secondary Index).
    const predictionsTable = new dynamodb.Table(this, "PredictionsTable", {
      tableName: "Predictions",

      // billingMode: PAY_PER_REQUEST = se paga por operación, no por capacidad reservada.
      // Para desarrollo y cargas variables, es más económico.
      // En producción con tráfico predecible, PROVISIONED puede ser más barato.
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,

      partitionKey: {
        name: "userId",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "matchId",
        type: dynamodb.AttributeType.STRING,
      },

      // removalPolicy: DESTROY borra la tabla al hacer "cdk destroy".
      // En producción usarías RETAIN para proteger los datos de borrados accidentales.
      // Para desarrollo local con Floci, DESTROY es conveniente.
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // GSI (Global Secondary Index): índice secundario global para buscar por matchId.
    //
    // POR QUÉ un GSI:
    //   Sin el GSI, "dame todas las predicciones del partido Y" requeriría
    //   un SCAN de toda la tabla (costoso e ineficiente).
    //   Con el GSI, la misma query es una operación de índice eficiente.
    //
    //   El GSI invierte las claves: matchId pasa a ser la partition key del índice.
    //   DynamoDB mantiene el índice sincronizado automáticamente.
    predictionsTable.addGlobalSecondaryIndex({
      indexName: "MatchIndex",
      partitionKey: {
        name: "matchId",
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL, // copia todos los atributos al índice
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 2. COGNITO USER POOL — Autenticación de usuarios
    // ══════════════════════════════════════════════════════════════════════════
    //
    // POR QUÉ Cognito y no manejar auth en las Lambdas:
    //   Cognito es el servicio de AWS para autenticación. Maneja:
    //     - Registro y login de usuarios (email/password, OAuth, etc.)
    //     - Tokens JWT (ID Token, Access Token, Refresh Token)
    //     - Multi-factor authentication
    //   Al integrarlo como Authorizer de API Gateway, el token se valida ANTES
    //   de que la Lambda se ejecute — la Lambda no tiene que validar nada.
    //
    //   DIFERENCIA IMPORTANTE DE TU GUÍA:
    //     IAM: controla acceso a recursos AWS (¿puede esta Lambda leer DynamoDB?)
    //     Cognito: controla acceso de usuarios finales a la aplicación (¿está logueado?)
    //   Son dos sistemas distintos que se complementan.
    const userPool = new cognito.UserPool(this, "ProdeazoUserPool", {
      userPoolName: "prodeazo-users",

      // selfSignUpEnabled: permite que los usuarios se registren solos (sin admin).
      // Para Prodeazo, queremos que cualquiera pueda registrarse.
      selfSignUpEnabled: true,

      signInAliases: {
        email: true, // login con email (además del username por defecto)
      },

      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: false, // relajado para UX — en producción podría ser true
        requireDigits: true,
        requireSymbols: false,
      },

      // autoVerify: verifica el email automáticamente para simplificar el flow local.
      // En producción querrías verificación real por email.
      autoVerify: { email: true },

      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // User Pool Client: la "aplicación" que va a hacer requests de autenticación.
    // Cada cliente puede tener distintos flujos de auth habilitados.
    const userPoolClient = new cognito.UserPoolClient(this, "ProdeazoUserPoolClient", {
      userPool,
      userPoolClientName: "prodeazo-web-client",
      // authFlows: qué métodos de autenticación permite este cliente
      authFlows: {
        userPassword: true,           // login con usuario + contraseña (para testing)
        userSrp: true,                // Secure Remote Password (más seguro, para producción)
      },
      // generateSecret: false — para apps web/mobile que no pueden guardar un secreto
      generateSecret: false,
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 3. SNS TOPIC — Mensajería desacoplada
    // ══════════════════════════════════════════════════════════════════════════
    //
    // POR QUÉ SNS en vez de que createPrediction haga todo directamente:
    //   Sin SNS: createPrediction → guarda en DynamoDB → envía email → actualiza ranking → ...
    //   Con SNS:  createPrediction → guarda en DynamoDB → publica en SNS
    //             SNS → emailLambda (independiente)
    //             SNS → rankingLambda (independiente)
    //             SNS → analyticsLambda (independiente)
    //
    //   Ventajas:
    //     - createPrediction es más rápida y simple — solo hace su trabajo
    //     - Si rankingLambda falla, no afecta a createPrediction ni a los demás
    //     - Podés agregar nuevos subscribers sin modificar createPrediction
    //     - Cada subscriber puede escalar independientemente
    //
    //   DIFERENCIA SNS vs EventBridge (de tu guía):
    //     SNS: pub/sub simple — "publica y todos los subscribers reciben"
    //     EventBridge: enrutamiento por reglas — "si el evento tiene campo X=Y, mandalo a Z"
    //     Para nuestro caso, SNS es suficiente y más simple.
    const newPredictionTopic = new sns.Topic(this, "NewPredictionTopic", {
      topicName: "NewPredictionTopic",
      displayName: "Evento: nueva predicción creada en Prodeazo",
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 4. IAM — Roles con mínimo privilegio para las Lambdas
    // ══════════════════════════════════════════════════════════════════════════
    //
    // POR QUÉ mínimo privilegio (Principle of Least Privilege):
    //   Si una Lambda tiene permisos de admin sobre toda la cuenta y es comprometida,
    //   el atacante tiene acceso total. Si solo tiene permisos para leer UNA tabla,
    //   el daño está contenido.
    //
    //   CDK crea un IAM Role por Lambda automáticamente cuando usas NodejsFunction.
    //   Nosotros le agregamos solo los permisos específicos que necesita cada una.
    //   Esto es "Security IN the cloud" — tu responsabilidad según el Shared Responsibility Model.

    // ══════════════════════════════════════════════════════════════════════════
    // 5. LAMBDAS — Funciones serverless
    // ══════════════════════════════════════════════════════════════════════════
    //
    // NodejsFunction: construct de CDK que usa esbuild para bundlear el TypeScript
    // de la Lambda automáticamente. Sin esto, tendrías que compilar y empaquetar manualmente.

    // Variables de entorno comunes a todas las Lambdas
    const commonEnvVars = {
      // TABLE_NAME: el nombre de la tabla DynamoDB.
      // POR QUÉ env var y no hardcodeado: si renombrás la tabla, solo cambiás aquí.
      // CDK la inyecta automáticamente desde el construct de DynamoDB.
      TABLE_NAME: predictionsTable.tableName,
      // AWS_ENDPOINT_URL_DYNAMODB: cuando está seteada, el SDK de AWS la usa
      // para apuntar a esa URL en vez de a AWS real.
      // Esto es lo que permite que las Lambdas locales hablen con Floci.
      AWS_ENDPOINT_URL_DYNAMODB: process.env.AWS_ENDPOINT_URL ?? "",
      AWS_ENDPOINT_URL_SNS: process.env.AWS_ENDPOINT_URL ?? "",
      // REGION: la región de AWS (nos la pasan las variables de entorno del CDK)
      REGION: this.region,
    };

    // ── Lambda: createPrediction ────────────────────────────────────────────
    const createPredictionFn = new lambdaNodejs.NodejsFunction(
      this,
      "CreatePredictionFn",
      {
        functionName: "createPrediction",
        // entry: path al archivo TypeScript de la Lambda.
        // NodejsFunction lo bundlea automáticamente con esbuild.
        entry: path.join(__dirname, "../lambda/createPrediction/index.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(30),
        // memorySize: más memoria = más CPU también (Lambda asigna CPU proporcional a RAM).
        // 256MB es un buen balance para funciones simples que hacen queries a DB.
        memorySize: 256,
        environment: {
          ...commonEnvVars,
          SNS_TOPIC_ARN: newPredictionTopic.topicArn,
        },
        // logRetention: cuánto tiempo guardar los logs en CloudWatch.
        // Reducirlo baja costos. ONE_WEEK está bien para desarrollo.
        logRetention: logs.RetentionDays.ONE_WEEK,
        bundling: {
          // externalModules: módulos que NO se incluyen en el bundle de la Lambda.
          // El SDK de AWS está disponible en el runtime de Lambda — no hace falta empaquetar.
          externalModules: ["@aws-sdk/*"],
          // minify: comprimir el código. Menos peso = cold start más rápido.
          minify: true,
        },
      }
    );

    // Permisos mínimos para createPrediction:
    // - Escribir en la tabla DynamoDB (PutItem)
    // - Publicar en el topic de SNS
    // No necesita leer ni borrar — solo esas dos operaciones.
    predictionsTable.grantWriteData(createPredictionFn);
    newPredictionTopic.grantPublish(createPredictionFn);

    // ── Lambda: getPredictionsByUser ────────────────────────────────────────
    const getPredictionsByUserFn = new lambdaNodejs.NodejsFunction(
      this,
      "GetPredictionsByUserFn",
      {
        functionName: "getPredictionsByUser",
        entry: path.join(__dirname, "../lambda/getPredictionsByUser/index.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        environment: commonEnvVars,
        logRetention: logs.RetentionDays.ONE_WEEK,
        bundling: { externalModules: ["@aws-sdk/*"], minify: true },
      }
    );

    // Solo necesita leer — no puede escribir ni borrar
    predictionsTable.grantReadData(getPredictionsByUserFn);

    // ── Lambda: getMatchPredictions ─────────────────────────────────────────
    const getMatchPredictionsFn = new lambdaNodejs.NodejsFunction(
      this,
      "GetMatchPredictionsFn",
      {
        functionName: "getMatchPredictions",
        entry: path.join(__dirname, "../lambda/getMatchPredictions/index.ts"),
        handler: "handler",
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        environment: commonEnvVars,
        logRetention: logs.RetentionDays.ONE_WEEK,
        bundling: { externalModules: ["@aws-sdk/*"], minify: true },
      }
    );

    // Solo necesita leer (usa el GSI MatchIndex)
    predictionsTable.grantReadData(getMatchPredictionsFn);

    // ══════════════════════════════════════════════════════════════════════════
    // 6. API GATEWAY — Entrada HTTP pública
    // ══════════════════════════════════════════════════════════════════════════
    //
    // POR QUÉ API Gateway y no un ALB o Lambda Function URL:
    //   - API Gateway maneja autenticación (Cognito Authorizer), rate limiting,
    //     CORS, y request/response mapping sin código adicional.
    //   - Es el patrón estándar para APIs serverless en AWS.
    //   - Las Lambda Function URLs son más simples pero no tienen Authorizer nativo.
    const api = new apigateway.RestApi(this, "ProdeazoApi", {
      restApiName: "prodeazo-predictions-api",
      description: "API de predicciones de partidos — Prodeazo",
      // defaultCorsPreflightOptions: habilita CORS automáticamente para todas las rutas.
      // Sin esto, el navegador rechaza los requests desde el frontend.
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ["Content-Type", "Authorization"],
      },
      deployOptions: {
        stageName: "local",
        // tracingEnabled: X-Ray tracing para ver el tiempo de cada paso.
        // Útil para diagnosticar si la demora está en Lambda o DynamoDB.
        tracingEnabled: true,
        // accessLogDestination + accessLogFormat: logs de cada request HTTP.
        // Te permiten ver en CloudWatch exactamente qué llegó a la API.
        accessLogDestination: new apigateway.LogGroupLogDestination(
          new logs.LogGroup(this, "ApiGatewayAccessLogs", {
            retention: logs.RetentionDays.ONE_WEEK,
            removalPolicy: cdk.RemovalPolicy.DESTROY,
          })
        ),
      },
    });

    // ── Cognito Authorizer ──────────────────────────────────────────────────
    //
    // El Authorizer intercepta el request ANTES de que llegue a la Lambda.
    // Valida el JWT del header "Authorization".
    // Si es válido → pasa a la Lambda.
    // Si no es válido → devuelve 401 Unauthorized sin ejecutar la Lambda.
    //
    // POR QUÉ esto es importante para la arquitectura:
    //   Sin el Authorizer, tendrías que validar el JWT en cada Lambda.
    //   Con el Authorizer, la validación es centralizada y garantizada —
    //   ninguna Lambda corre sin que el token haya sido verificado.
    const cognitoAuthorizer = new apigateway.CognitoUserPoolsAuthorizer(
      this,
      "CognitoAuthorizer",
      {
        cognitoUserPools: [userPool],
        authorizerName: "CognitoJwtAuthorizer",
        // resultsCacheTtl: cuánto tiempo cachear la validación del token.
        // Con 5 minutos, si el mismo token hace muchos requests, solo valida 1 vez.
        resultsCacheTtl: cdk.Duration.minutes(5),
      }
    );

    // Opciones de autorización para endpoints protegidos
    const authOptions: apigateway.MethodOptions = {
      authorizer: cognitoAuthorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    };

    // ── Definición de rutas ─────────────────────────────────────────────────

    // /predictions
    const predictionsResource = api.root.addResource("predictions");

    // POST /predictions → createPrediction (PROTEGIDO con Cognito)
    predictionsResource.addMethod(
      "POST",
      new apigateway.LambdaIntegration(createPredictionFn),
      authOptions // <-- requiere token de Cognito válido
    );

    // /predictions/me
    const meResource = predictionsResource.addResource("me");

    // GET /predictions/me → getPredictionsByUser (PROTEGIDO)
    meResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getPredictionsByUserFn),
      authOptions
    );

    // /predictions/match/{matchId}
    const matchResource = predictionsResource
      .addResource("match")
      .addResource("{matchId}");

    // GET /predictions/match/{matchId} → getMatchPredictions (PÚBLICO — sin Authorizer)
    // POR QUÉ público: ver las predicciones de un partido no requiere estar logueado.
    // Cualquiera puede ver qué predijo la gente, pero solo usuarios autenticados pueden
    // crear predicciones.
    matchResource.addMethod(
      "GET",
      new apigateway.LambdaIntegration(getMatchPredictionsFn)
      // sin authOptions → no requiere autenticación
    );

    // ══════════════════════════════════════════════════════════════════════════
    // 7. CLOUDWATCH — Observabilidad
    // ══════════════════════════════════════════════════════════════════════════
    //
    // CloudWatch es el servicio de observabilidad de AWS. Incluye:
    //   - Logs: todos los console.log() de las Lambdas van automáticamente a CloudWatch
    //   - Métricas: datos numéricos en el tiempo (errores, latencia, invocaciones)
    //   - Alarmas: notificaciones cuando una métrica supera un umbral
    //
    // Las Lambdas de Node.js envían logs a CloudWatch automáticamente — no hay que
    // configurar nada extra más que el logRetention que definimos arriba.

    // Métrica de errores de createPrediction:
    // Lambda genera automáticamente métricas estándar en el namespace "AWS/Lambda".
    // metricErrors() devuelve la métrica de errores (invocaciones que terminaron en error).
    const createPredictionErrorsMetric = createPredictionFn.metricErrors({
      period: cdk.Duration.minutes(5),    // agrega los errores cada 5 minutos
      statistic: "Sum",                    // suma total de errores en el período
    });

    // Alarma: si hay más de 5 errores en 5 minutos, la alarma se activa.
    //
    // POR QUÉ una alarma:
    //   En producción, esto dispararía una notificación a SNS → email al equipo.
    //   En local/desarrollo, igual vale tenerla para ver cómo se configura.
    //   Es la diferencia entre enterarte de un problema cuando un usuario se queja
    //   o antes de que llegue a los usuarios.
    new cloudwatch.Alarm(this, "CreatePredictionErrorsAlarm", {
      alarmName: "createPrediction-errors-alarm",
      alarmDescription: "Más de 5 errores en 5 minutos en createPrediction",
      metric: createPredictionErrorsMetric,
      threshold: 5,
      evaluationPeriods: 1,       // evalúa en 1 período (los 5 minutos configurados)
      // treatMissingData: ¿qué hacer cuando no hay datos?
      // NOT_BREACHING: sin datos = todo bien (Lambda no se ejecutó → no hubo errores)
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      // comparisonOperator: la condición de la alarma
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // ══════════════════════════════════════════════════════════════════════════
    // 8. OUTPUTS — Valores exportados al finalizar el deploy
    // ══════════════════════════════════════════════════════════════════════════
    //
    // Los CfnOutput generan salidas en CloudFormation que se muestran
    // al final de "cdk deploy". Útil para saber la URL de la API sin
    // tener que buscarla en la consola.

    new cdk.CfnOutput(this, "ApiUrl", {
      value: api.url,
      description: "URL base de la API Gateway (endpoint local de Floci)",
    });

    new cdk.CfnOutput(this, "UserPoolId", {
      value: userPool.userPoolId,
      description: "Cognito User Pool ID — necesario para hacer login",
    });

    new cdk.CfnOutput(this, "UserPoolClientId", {
      value: userPoolClient.userPoolClientId,
      description: "Cognito App Client ID — necesario para hacer login",
    });

    new cdk.CfnOutput(this, "TableName", {
      value: predictionsTable.tableName,
      description: "Nombre de la tabla DynamoDB",
    });

    new cdk.CfnOutput(this, "SnsTopicArn", {
      value: newPredictionTopic.topicArn,
      description: "ARN del topic SNS de nuevas predicciones",
    });
  }
}
