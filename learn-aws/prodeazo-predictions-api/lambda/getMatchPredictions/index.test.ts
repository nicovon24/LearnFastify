/**
 * Tests unitarios de getMatchPredictions.
 */

import { APIGatewayProxyEvent } from "aws-lambda";
import { docClient } from "../shared/aws-clients";

jest.mock("../shared/aws-clients", () => ({
  docClient: { send: jest.fn() },
  snsClient: { send: jest.fn() },
}));

import { handler } from "./index";

process.env.TABLE_NAME = "Predictions";
process.env.REGION = "us-east-1";

function buildEvent(matchId?: string): Partial<APIGatewayProxyEvent> {
  return {
    pathParameters: matchId ? { matchId } : null,
    requestContext: {} as APIGatewayProxyEvent["requestContext"],
    body: null,
    headers: {},
    multiValueHeaders: {},
    httpMethod: "GET",
    isBase64Encoded: false,
    path: `/predictions/match/${matchId ?? ""}`,
    queryStringParameters: null,
    multiValueQueryStringParameters: null,
    stageVariables: null,
    resource: "/predictions/match/{matchId}",
  };
}

describe("getMatchPredictions handler", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test("debería devolver 200 con predicciones y estadísticas", async () => {
    // Mockeamos DynamoDB para devolver dos predicciones
    (docClient.send as jest.Mock).mockResolvedValue({
      Items: [
        { userId: "user-1", matchId: "match-001", homeScore: 2, awayScore: 1, createdAt: "2024-01-01" },
        { userId: "user-2", matchId: "match-001", homeScore: 1, awayScore: 1, createdAt: "2024-01-01" },
      ],
    });

    const event = buildEvent("match-001");
    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);

    const body = JSON.parse(result.body);
    expect(body.matchId).toBe("match-001");
    expect(body.count).toBe(2);
    expect(body.predictions).toHaveLength(2);

    // Verificamos las estadísticas calculadas
    expect(body.stats.predictedOutcomes.homeWin).toBe(1);  // user-1: 2-1
    expect(body.stats.predictedOutcomes.draw).toBe(1);     // user-2: 1-1
    expect(body.stats.predictedOutcomes.awayWin).toBe(0);
  });

  test("debería devolver 200 con lista vacía si no hay predicciones", async () => {
    (docClient.send as jest.Mock).mockResolvedValue({ Items: [] });

    const event = buildEvent("match-999");
    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.count).toBe(0);
    expect(body.predictions).toEqual([]);
  });

  test("debería devolver 400 si falta matchId en el path", async () => {
    const event = buildEvent(); // sin matchId
    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).message).toContain("matchId");
    expect(docClient.send).not.toHaveBeenCalled();
  });

  test("debería devolver 500 si DynamoDB falla", async () => {
    (docClient.send as jest.Mock).mockRejectedValue(new Error("DB error"));

    const event = buildEvent("match-001");
    const result = await handler(event as APIGatewayProxyEvent);

    expect(result.statusCode).toBe(500);
  });
});
