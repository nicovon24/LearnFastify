/**
 * lambda/getPredictionsByUser/index.ts
 *
 * GET /predictions/me — Devuelve todas las predicciones del usuario autenticado.
 *
 * PATRÓN DE ACCESO A DYNAMODB:
 *   Usamos Query (no Scan) con la partition key userId.
 *   Query es O(resultados) — eficiente.
 *   Scan es O(tabla completa) — nunca usar en producción.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../shared/aws-clients";
import { Prediction } from "../shared/types";

const TABLE_NAME = process.env.TABLE_NAME!;

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("getPredictionsByUser invocado");

  try {
    const claims = event.requestContext?.authorizer?.claims;
    const userId: string = claims?.sub ?? "test-user-local";

    // QueryCommand: busca items por partition key (y opcionalmente sort key).
    // KeyConditionExpression: condición sobre las claves — aquí solo filtramos
    // por userId (todos los partidos del usuario).
    //
    // POR QUÉ ExpressionAttributeNames/#userId:
    //   "userId" es una palabra reservada en DynamoDB.
    //   ExpressionAttributeNames permite usar aliases (#userId) para evitar
    //   conflictos con palabras reservadas. Es un detalle específico de DynamoDB.
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "#userId = :userId",
        ExpressionAttributeNames: {
          "#userId": "userId",
        },
        ExpressionAttributeValues: {
          ":userId": userId,
        },
        // ScanIndexForward: true = ordenado ascendente por sort key (matchId).
        // false = descendente. Para predicciones, el orden por matchId es razonable.
        ScanIndexForward: true,
      })
    );

    const predictions = (result.Items ?? []) as Prediction[];

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        userId,
        count: predictions.length,
        predictions,
      }),
    };
  } catch (error) {
    console.error("Error en getPredictionsByUser:", error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ message: "Error interno del servidor" }),
    };
  }
};

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };
}
