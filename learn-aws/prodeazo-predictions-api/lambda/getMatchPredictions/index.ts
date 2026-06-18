/**
 * lambda/getMatchPredictions/index.ts
 *
 * GET /predictions/match/{matchId} — Devuelve todas las predicciones para un partido.
 * PÚBLICO — no requiere autenticación.
 *
 * POR QUÉ usa el GSI (Global Secondary Index) MatchIndex:
 *   La tabla tiene userId como partition key y matchId como sort key.
 *   Para buscar "todas las predicciones del partido X", necesitamos
 *   buscar por matchId — que es la sort key, no la partition key.
 *
 *   En DynamoDB, no podés hacer un Query eficiente por sort key sin conocer
 *   la partition key. El GSI "MatchIndex" invierte las claves:
 *     GSI Partition Key: matchId
 *     GSI Sort Key: userId
 *   Ahora podemos hacer un Query por matchId eficiente.
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient } from "../shared/aws-clients";
import { Prediction } from "../shared/types";

const TABLE_NAME = process.env.TABLE_NAME!;
const MATCH_INDEX = "MatchIndex";

export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("getMatchPredictions invocado");

  try {
    const matchId = event.pathParameters?.matchId;

    if (!matchId) {
      return {
        statusCode: 400,
        headers: corsHeaders(),
        body: JSON.stringify({ message: "matchId es requerido en el path" }),
      };
    }

    // QueryCommand sobre el GSI MatchIndex.
    // IndexName: especifica que la query va sobre el índice, no sobre la tabla principal.
    // DynamoDB enruta la query al índice automáticamente.
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: MATCH_INDEX,
        KeyConditionExpression: "matchId = :matchId",
        ExpressionAttributeValues: {
          ":matchId": matchId,
        },
        // Límite de resultados por página. Para partidos con muchas predicciones,
        // implementaríamos paginación con LastEvaluatedKey.
        // Por ahora, limitamos a 100 para evitar timeouts.
        Limit: 100,
      })
    );

    const predictions = (result.Items ?? []) as Prediction[];

    // Calcular estadísticas básicas del partido
    const stats = computeMatchStats(predictions, matchId);

    return {
      statusCode: 200,
      headers: corsHeaders(),
      body: JSON.stringify({
        matchId,
        count: predictions.length,
        predictions,
        stats,
      }),
    };
  } catch (error) {
    console.error("Error en getMatchPredictions:", error);
    return {
      statusCode: 500,
      headers: corsHeaders(),
      body: JSON.stringify({ message: "Error interno del servidor" }),
    };
  }
};

/**
 * Calcula estadísticas agregadas de las predicciones de un partido.
 * Esto podría moverse a un servicio separado en producción.
 */
function computeMatchStats(predictions: Prediction[], matchId: string) {
  if (predictions.length === 0) {
    return { matchId, totalPredictions: 0 };
  }

  const homeTotals = predictions.reduce((sum, p) => sum + p.homeScore, 0);
  const awayTotals = predictions.reduce((sum, p) => sum + p.awayScore, 0);

  const homeWins = predictions.filter((p) => p.homeScore > p.awayScore).length;
  const draws = predictions.filter((p) => p.homeScore === p.awayScore).length;
  const awayWins = predictions.filter((p) => p.homeScore < p.awayScore).length;

  return {
    matchId,
    totalPredictions: predictions.length,
    averageHomeScore: (homeTotals / predictions.length).toFixed(1),
    averageAwayScore: (awayTotals / predictions.length).toFixed(1),
    predictedOutcomes: {
      homeWin: homeWins,
      draw: draws,
      awayWin: awayWins,
    },
  };
}

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  };
}
