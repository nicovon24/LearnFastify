/**
 * lambda/shared/aws-clients.ts — Clientes de AWS SDK v3
 *
 * POR QUÉ AWS SDK v3 en vez de v2:
 *   - Modular: importás solo los clientes que necesitás (bundle más liviano)
 *   - Mejor TypeScript: tipos generados automáticamente, más precisos
 *   - Tree-shaking: esbuild puede eliminar código no usado
 *   v2 sigue funcionando, pero v3 es el estándar desde 2021.
 *
 * POR QUÉ crear los clientes fuera del handler:
 *   Lambda reutiliza el mismo contenedor (runtime) entre invocaciones en caliente.
 *   Si creás el cliente dentro del handler, se crea en cada invocación.
 *   Si está fuera, se crea UNA vez cuando Lambda carga el módulo (cold start)
 *   y se reutiliza en todas las invocaciones calientes — mucho más eficiente.
 *
 * POR QUÉ la configuración de endpoint:
 *   Cuando AWS_ENDPOINT_URL_DYNAMODB está seteada, el cliente apunta
 *   a esa URL en vez de a AWS real. Esto permite usar Floci localmente
 *   sin cambiar el código de las Lambdas.
 *   En producción esa env var no existe → el cliente apunta a AWS real.
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { SNSClient } from "@aws-sdk/client-sns";

// ── DynamoDB ─────────────────────────────────────────────────────────────────
//
// DynamoDBClient: el cliente "bajo nivel" — trabaja con tipos DynamoDB nativos
//   ({ S: "value" }, { N: "42" }, etc.)
//
// DynamoDBDocumentClient: wrapper sobre DynamoDBClient que convierte
//   automáticamente entre tipos JavaScript ({ userId: "123" }) y tipos DynamoDB.
//   Siempre usarlo en aplicaciones — es mucho más cómodo.

const dynamoConfig: ConstructorParameters<typeof DynamoDBClient>[0] = {
  region: process.env.REGION ?? "us-east-1",
};

// Cuando AWS_ENDPOINT_URL_DYNAMODB está seteada (en Floci), apuntamos ahí.
// Sin esta variable, el SDK usa el endpoint de AWS real automáticamente.
if (process.env.AWS_ENDPOINT_URL_DYNAMODB) {
  dynamoConfig.endpoint = process.env.AWS_ENDPOINT_URL_DYNAMODB;
  // credentials falsas para Floci — Floci acepta cualquier credencial
  dynamoConfig.credentials = {
    accessKeyId: "test",
    secretAccessKey: "test",
  };
}

const dynamoClient = new DynamoDBClient(dynamoConfig);

// marshallOptions: cómo serializar valores JavaScript → DynamoDB
//   removeUndefinedValues: elimina campos con valor undefined del item
//   (si no, DynamoDB devuelve error al intentar guardar undefined)
export const docClient = DynamoDBDocumentClient.from(dynamoClient, {
  marshallOptions: {
    removeUndefinedValues: true,
    convertEmptyValues: false,
  },
});

// ── SNS ──────────────────────────────────────────────────────────────────────

const snsConfig: ConstructorParameters<typeof SNSClient>[0] = {
  region: process.env.REGION ?? "us-east-1",
};

if (process.env.AWS_ENDPOINT_URL_SNS) {
  snsConfig.endpoint = process.env.AWS_ENDPOINT_URL_SNS;
  snsConfig.credentials = {
    accessKeyId: "test",
    secretAccessKey: "test",
  };
}

export const snsClient = new SNSClient(snsConfig);
