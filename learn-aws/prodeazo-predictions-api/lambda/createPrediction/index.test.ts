/**
 * Tests unitarios de createPrediction.
 *
 * ESTRATEGIA:
 *   Mockeamos docClient y snsClient para no necesitar DynamoDB ni SNS reales.
 *   Testeamos que la Lambda llame a los clientes con los parámetros correctos,
 *   y que devuelva los status codes HTTP correctos.
 *
 * SOBRE MOCKEAR EL AWS SDK v3:
 *   El SDK v3 usa el patrón Command — en vez de métodos directos como
 *   dynamodb.putItem(), usás docClient.send(new PutCommand({...})).
 *   Para mockear, necesitamos interceptar el método .send() del cliente.
 *
 *   Usamos jest.mock() para reemplazar el módulo shared/aws-clients con
 *   una versión donde docClient.send y snsClient.send son jest.fn().
 *   Esto es "module mocking" — equivalente a @Mock en Mockito.
 */

import { APIGatewayProxyEvent } from "aws-lambda";
import { docClient, snsClient } from "../shared/aws-clients";

// jest.mock() intercepta el import del módulo y reemplaza sus exports con mocks.
// Debe ir ANTES del import de la lambda (jest lo hoists automáticamente).
jest.mock("../shared/aws-clients", () => ({
  docClient: {
    send: jest.fn(),
  },
  snsClient: {
    send: jest.fn(),
  },
}));

// Importamos el handler DESPUÉS de los mocks
import { handler } from "./index";

// Seteamos las env vars que la Lambda espera
process.env.TABLE_NAME = "Predictions";
process.env.SNS_TOPIC_ARN = "arn:aws:sns:us-east-1:000000000000:NewPredictionTopic";
process.env.REGION = "us-east-1";

// ── Helper: construir un APIGatewayProxyEvent mínimo ─────────────────────────
function buildEvent(
  body: object,
  userId = "user-test-123"
): Partial<APIGatewayProxyEvent> {
  return {
    body: JSON.stringify(body),
    requestContext: {
      authorizer: {
        claims: { sub: userId },
      },
    } as APIGatewayProxyEvent["requestContext"],
    pathParameters: null,
    queryStringParameters: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: "POST",
    isBase64Encoded: false,
    path: "/predictions",
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: "/predictions",
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("createPrediction handler", () => {
  beforeEach(() => {
    // Reseteamos los mocks antes de cada test para no tener estado compartido.
    // Equivalente a clearAllMocks() de Jest — limpia calls, instances y results.
    jest.clearAllMocks();

    // Configuramos el mock de DynamoDB para que resuelva exitosamente
    (docClient.send as jest.Mock).mockResolvedValue({});

    // Configuramos el mock de SNS para que resuelva exitosamente
    (snsClient.send as jest.Mock).mockResolvedValue({
      MessageId: "msg-123",
    });
  });

  // Test 1: flujo feliz
  test("debería crear una predicción y devolver 201", async () => {
    const event = buildEvent({
      matchId: "match-001",
      homeScore: 2,
      awayScore: 1,
    });

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(201);

    const body = JSON.parse(result.body);
    expect(body.message).toBe("Predicción creada exitosamente");
    expect(body.prediction.matchId).toBe("match-001");
    expect(body.prediction.homeScore).toBe(2);
    expect(body.prediction.awayScore).toBe(1);
    expect(body.prediction.userId).toBe("user-test-123");

    // Verificamos que se llamó a DynamoDB con los parámetros correctos
    expect(docClient.send).toHaveBeenCalledTimes(1);

    // Verificamos que se publicó en SNS
    expect(snsClient.send).toHaveBeenCalledTimes(1);
  });

  // Test 2: body vacío
  test("debería devolver 400 si no hay body", async () => {
    const event = buildEvent({});
    // Sobreescribimos el body
    (event as APIGatewayProxyEvent).body = null;

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toBe("Body requerido");
    expect(docClient.send).not.toHaveBeenCalled();
    expect(snsClient.send).not.toHaveBeenCalled();
  });

  // Test 3: matchId faltante
  test("debería devolver 400 si falta matchId", async () => {
    const event = buildEvent({ homeScore: 2, awayScore: 1 });

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain("matchId");
  });

  // Test 4: score negativo
  test("debería devolver 400 si homeScore es negativo", async () => {
    const event = buildEvent({ matchId: "match-001", homeScore: -1, awayScore: 0 });

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain("homeScore");
  });

  // Test 5: DynamoDB falla → 500
  test("debería devolver 500 si DynamoDB falla", async () => {
    (docClient.send as jest.Mock).mockRejectedValue(
      new Error("DynamoDB connection error")
    );

    const event = buildEvent({ matchId: "match-001", homeScore: 1, awayScore: 1 });

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(500);
    // SNS no debería haberse llamado si DynamoDB falló
    expect(snsClient.send).not.toHaveBeenCalled();
  });

  // Test 6: SNS falla pero la predicción igual se guarda (201)
  test("debería devolver 201 aunque SNS falle", async () => {
    // DynamoDB resuelve bien
    (docClient.send as jest.Mock).mockResolvedValue({});
    // SNS falla
    (snsClient.send as jest.Mock).mockRejectedValue(
      new Error("SNS timeout")
    );

    const event = buildEvent({ matchId: "match-001", homeScore: 0, awayScore: 2 });

    const result = await handler(event as APIGatewayProxyEvent);

    // La predicción se guarda igual — SNS es "best effort"
    expect(result.statusCode).toBe(201);
    expect(docClient.send).toHaveBeenCalledTimes(1);
  });

  // Test 7: JSON inválido en el body
  test("debería devolver 400 si el body no es JSON válido", async () => {
    const event = buildEvent({});
    (event as APIGatewayProxyEvent).body = "{ invalid json }";

    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain("JSON");
  });
});
