# Prodeazo Predictions API

API serverless de predicciones de partidos, construida con AWS CDK. Diseñada para correr 100% en local usando **Floci** (emulador de AWS) — sin cuenta de AWS, sin costos.

Cubre en código los servicios principales de la guía CLF-C02: Lambda, DynamoDB, API Gateway, Cognito, SNS, CloudWatch y CloudFormation (vía CDK).

---

## Arquitectura

```
Usuario (curl/Postman/Frontend)
          │
          │  HTTP Request
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                     API GATEWAY (REST API)                       │
│  POST /predictions          ─── Cognito Authorizer ──►          │
│  GET  /predictions/me       ─── Cognito Authorizer ──►          │
│  GET  /predictions/match/{id} ─── (público, sin auth) ──►       │
└─────────────────────────────────────────────────────────────────┘
          │                   │                    │
          ▼                   ▼                    ▼
  createPrediction   getPredictionsByUser   getMatchPredictions
     (Lambda)             (Lambda)              (Lambda)
          │                   │                    │
          │                   │                    │ (usa GSI MatchIndex)
          ▼                   ▼                    ▼
┌──────────────────────────────────────────────────────────────────┐
│              DYNAMODB — Tabla "Predictions"                       │
│  PK: userId | SK: matchId | homeScore | awayScore | createdAt    │
│  GSI "MatchIndex": PK: matchId | SK: userId                      │
└──────────────────────────────────────────────────────────────────┘
          │
          │  Solo createPrediction publica en SNS
          ▼
┌──────────────────────────────────────────────────────────────────┐
│              SNS — Topic "NewPredictionTopic"                     │
│  Mensaje: { eventType, userId, matchId, homeScore, awayScore }   │
│  Subscribers futuros: rankingLambda, emailLambda, analytics...   │
└──────────────────────────────────────────────────────────────────┘

  CloudWatch: logs automáticos de cada Lambda + alarma de errores en createPrediction
  Cognito:    Authorizer en API Gateway — valida JWT antes de ejecutar las Lambdas protegidas
  IAM:        cada Lambda tiene su propio Role con mínimo privilegio (solo los permisos que necesita)
```

### Por qué esta arquitectura toca los 4 dominios del CLF-C02

| Dominio CLF-C02 | Dónde aparece |
|---|---|
| **Domain 1 — Cloud Concepts** | SNS desacopla createPrediction de los efectos secundarios (ranking, email, etc.) — patrón pub/sub |
| **Domain 2 — Security & Compliance** | IAM Roles con mínimo privilegio: createPrediction solo puede escribir en DynamoDB y publicar en SNS |
| **Domain 3 — Cloud Technology** | Lambda (compute), DynamoDB (database), API Gateway (networking), CloudWatch (monitoring) |
| **Domain 4 — Billing** | CDK genera CloudFormation → tags en todos los recursos → filtrables en Cost Explorer |

---

## Prerrequisitos

- **Node.js 20+** y **npm**
- **Docker Desktop** (necesario para Floci y para que las Lambdas corran en containers)
- **AWS CLI**: `aws --version`

---

## Setup inicial

```bash
cd learn-aws/prodeazo-predictions-api

# Instalar dependencias (CDK, AWS SDK, types, Jest, etc.)
npm install

# Instalar cdklocal globalmente (el wrapper de CDK para emuladores locales)
npm install -g aws-cdk-local aws-cdk
```

---

## Levantar y desplegar (paso a paso)

### Paso 1 — Setear variables de entorno

**PowerShell (Windows):**
```powershell
$env:AWS_ACCESS_KEY_ID = "test"
$env:AWS_SECRET_ACCESS_KEY = "test"
$env:AWS_DEFAULT_REGION = "us-east-1"
$env:AWS_ENDPOINT_URL = "http://localhost:4566"
```

**bash/zsh (Linux/Mac):**
```bash
export AWS_ACCESS_KEY_ID=test
export AWS_SECRET_ACCESS_KEY=test
export AWS_DEFAULT_REGION=us-east-1
export AWS_ENDPOINT_URL=http://localhost:4566
```

### Paso 2 — Levantar Floci

```bash
npm run floci:up
# Floci corre en background. Para ver los logs: npm run floci:logs
# Para verificar que está listo:
curl http://localhost:4566/_floci/health
```

### Paso 3 — Bootstrap de CDK

Bootstrap = prepara la infraestructura que CDK necesita para desplegarse (un bucket S3 para los assets).
Solo hace falta correlo una vez por cuenta/región.

```bash
npm run bootstrap:local
# Equivalente a: cdklocal bootstrap aws://000000000000/us-east-1
```

### Paso 4 — Deploy del stack

```bash
npm run deploy:local
# Equivalente a: cdklocal deploy --require-approval never
```

Al finalizar, el output muestra las URLs y IDs que necesitás:

```
Outputs:
ProdeazoPredictionsStack.ApiUrl = http://localhost:4566/restapis/abc123/local/_user_request_/
ProdeazoPredictionsStack.UserPoolId = us-east-1_XXXXXXXX
ProdeazoPredictionsStack.UserPoolClientId = XXXXXXXXXX
ProdeazoPredictionsStack.TableName = Predictions
ProdeazoPredictionsStack.SnsTopicArn = arn:aws:sns:us-east-1:000000000000:NewPredictionTopic
```

---

## Probar los endpoints

### Crear una predicción (sin Authorizer activado — modo test local)

```bash
API_URL="http://localhost:4566/restapis/{api-id}/local/_user_request_"

curl -X POST "$API_URL/predictions" \
  -H "Content-Type: application/json" \
  -d '{
    "matchId": "river-boca-2024-01",
    "homeScore": 2,
    "awayScore": 1
  }'
```

Respuesta esperada (201):
```json
{
  "message": "Predicción creada exitosamente",
  "prediction": {
    "userId": "test-user-local",
    "matchId": "river-boca-2024-01",
    "homeScore": 2,
    "awayScore": 1,
    "createdAt": "2024-01-15T..."
  }
}
```

### Ver predicciones de un partido

```bash
curl "$API_URL/predictions/match/river-boca-2024-01"
```

### Verificar que los datos quedaron en DynamoDB

```bash
aws dynamodb scan --table-name Predictions
```

### Ver los logs de la Lambda en CloudWatch

```bash
aws logs tail /aws/lambda/createPrediction --follow
```

### Ver el template de CloudFormation que CDK generó

```bash
npm run synth
# Genera cdk.out/ProdeazoPredictionsStack.template.json
# Podés abrirlo para ver exactamente qué genera CDK en CloudFormation
```

---

## Autenticación con Cognito (flujo completo)

Para usar los endpoints protegidos con autenticación real:

```bash
# 1. Registrar un usuario
aws cognito-idp sign-up \
  --client-id {UserPoolClientId} \
  --username usuario@ejemplo.com \
  --password "MiPassword123"

# 2. Confirmar el usuario (en local, Floci puede auto-confirmar)
aws cognito-idp admin-confirm-sign-up \
  --user-pool-id {UserPoolId} \
  --username usuario@ejemplo.com

# 3. Hacer login y obtener el token
aws cognito-idp initiate-auth \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=usuario@ejemplo.com,PASSWORD="MiPassword123" \
  --client-id {UserPoolClientId}

# 4. Usar el IdToken en los requests protegidos
curl -X POST "$API_URL/predictions" \
  -H "Content-Type: application/json" \
  -H "Authorization: {IdToken}" \
  -d '{"matchId": "match-001", "homeScore": 1, "awayScore": 0}'
```

---

## Correr los tests

Los tests son unitarios — mockean DynamoDB y SNS con Jest. No necesitan Floci ni Docker corriendo.

```bash
npm test
npm run test:coverage
```

---

## Estructura del proyecto

```
prodeazo-predictions-api/
├── bin/
│   └── prodeazo-predictions-api.ts    ← Entry point de la App CDK
├── lib/
│   └── prodeazo-predictions-api-stack.ts  ← Stack CDK: toda la infraestructura
├── lambda/
│   ├── shared/
│   │   ├── types.ts                   ← Tipos TypeScript del dominio
│   │   └── aws-clients.ts             ← Clientes DynamoDB y SNS (SDK v3)
│   ├── createPrediction/
│   │   ├── index.ts                   ← POST /predictions → DynamoDB + SNS
│   │   └── index.test.ts              ← Tests Jest con mocks
│   ├── getPredictionsByUser/
│   │   └── index.ts                   ← GET /predictions/me → DynamoDB Query
│   └── getMatchPredictions/
│       ├── index.ts                   ← GET /predictions/match/{id} → GSI Query
│       └── index.test.ts              ← Tests Jest con mocks
├── docker-compose.floci.yml           ← Floci (emulador de AWS local)
├── .env.local                         ← Variables de entorno para local
├── cdk.json                           ← Config de CDK (entry point, feature flags)
├── package.json                       ← Dependencias y scripts
└── tsconfig.json
```

---

## Pasar a AWS real (cuando quieras)

Cuando quieras una URL pública de verdad, el mismo código se despliega a AWS real:

```bash
# 1. Configurar credenciales reales de AWS
aws configure

# 2. Desepchar las variables de entorno de Floci
# (no exportar AWS_ENDPOINT_URL)

# 3. Bootstrap en tu cuenta real
cdk bootstrap aws://{tu-account-id}/us-east-1

# 4. Deploy a AWS real
cdk deploy
```

El código de CDK y de las Lambdas es exactamente el mismo — solo cambia `cdklocal` por `cdk`.
Lo único que no emula Floci (y que tendrías en AWS real) es CloudFront y AWS Budgets.

---

## Servicios de AWS usados — mapa con la guía CLF-C02

| Servicio | En el código | Concepto del CLF-C02 |
|---|---|---|
| **Lambda** | 3 funciones en `lambda/` | Serverless compute, pago por invocación |
| **DynamoDB** | Tabla `Predictions` + GSI `MatchIndex` | NoSQL managed, partition key design |
| **API Gateway** | REST API con 3 rutas | HTTP front-door para Lambdas |
| **Cognito** | User Pool + Authorizer | Auth de usuarios (≠ IAM que es para recursos) |
| **SNS** | Topic `NewPredictionTopic` | Pub/sub: decoupling de microservicios |
| **CloudWatch** | Logs automáticos + alarma de errores | Observabilidad: logs, métricas, alarmas |
| **IAM** | Roles por Lambda con least privilege | Security IN the cloud (tu responsabilidad) |
| **CloudFormation** | Generado por CDK (`cdk synth`) | IaC — infraestructura como código |
