/**
 * lambda/createPrediction/index.ts
 *
 * POST /predictions — Crea una predicción de partido.
 *
 * FLUJO:
 *   1. API Gateway valida el token de Cognito (antes de llegar acá)
 *   2. Extraemos el userId del token (Cognito lo inyecta en requestContext)
 *   3. Validamos el body del request
 *   4. Guardamos en DynamoDB
 *   5. Publicamos en SNS (desacoplado — si falla SNS, la predicción ya está guardada)
 *   6. Devolvemos 201 Created
 *
 * SOBRE EL MODELO DE EJECUCIÓN DE LAMBDA:
 *   Cada invocación recibe un objeto "event" con toda la info del request.
 *   Para API Gateway, event.body tiene el body JSON como string,
 *   event.requestContext.authorizer.claims tiene los claims del JWT de Cognito.
 *   El "context" tiene info de la invocación actual (requestId, función, etc.).
 */

import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { PutCommand } from "@aws-sdk/lib-dynamodb";
import { PublishCommand } from "@aws-sdk/client-sns";
import { docClient, snsClient } from "../shared/aws-clients";
import {
  CreatePredictionBody,
  NewPredictionEvent,
  Prediction,
} from "../shared/types";

const TABLE_NAME = process.env.TABLE_NAME!;
const SNS_TOPIC_ARN = process.env.SNS_TOPIC_ARN!;

/**
 * Handler principal de la Lambda.
 *
 * POR QUÉ APIGatewayProxyEvent y APIGatewayProxyResult:
 *   Son tipos del paquete @types/aws-lambda que corresponden exactamente
 *   al shape del event que API Gateway manda a la Lambda, y al shape
 *   que la Lambda debe devolver para que API Gateway lo convierta a una
 *   respuesta HTTP válida.
 */
export const handler = async (
  event: APIGatewayProxyEvent
): Promise<APIGatewayProxyResult> => {
  console.log("createPrediction invocado:", JSON.stringify(event, null, 2));

  try {
    // ── 1. Extraer el userId del token de Cognito ────────────────────────────
    //
    // Cuando el Cognito Authorizer valida el token, inyecta los "claims" del JWT
    // en event.requestContext.authorizer.claims.
    // El claim "sub" (subject) es el userId único en Cognito.
    //
    // En el contexto de Floci local: si el Authorizer no está activado en el test,
    // tenemos un fallback con un userId de prueba para no romper el flujo.
    const claims = event.requestContext?.authorizer?.claims;
    const userId: string = claims?.sub ?? "test-user-local";

    // ── 2. Validar el body ───────────────────────────────────────────────────
    if (!event.body) {
      return errorResponse(400, "Body requerido");
    }

    let body: CreatePredictionBody;
    try {
      body = JSON.parse(event.body) as CreatePredictionBody;
    } catch {
      return errorResponse(400, "Body JSON inválido");
    }

    const { matchId, homeScore, awayScore } = body;

    if (!matchId || typeof matchId !== "string") {
      return errorResponse(400, "matchId es requerido y debe ser string");
    }
    if (typeof homeScore !== "number" || homeScore < 0) {
      return errorResponse(400, "homeScore debe ser un número >= 0");
    }
    if (typeof awayScore !== "number" || awayScore < 0) {
      return errorResponse(400, "awayScore debe ser un número >= 0");
    }

    // ── 3. Guardar en DynamoDB ───────────────────────────────────────────────
    //
    // PutCommand: inserta o reemplaza un item completo.
    // Si el usuario ya hizo una predicción para este partido, la sobreescribe.
    // (Para edición de predicciones, esto está bien — es la última predicción.)
    const now = new Date().toISOString();

    const prediction: Prediction = {
      userId,
      matchId,
      homeScore,
      awayScore,
      createdAt: now,
    };

    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: prediction,
        // ConditionExpression: podríamos agregar una condición para evitar
        // sobreescribir predicciones después de que el partido empezó.
        // Lo dejamos sin condición para simplificar el aprendizaje.
      })
    );

    console.log(`Predicción guardada: userId=${userId}, matchId=${matchId}`);

    // ── 4. Publicar en SNS ───────────────────────────────────────────────────
    //
    // POR QUÉ después de guardar en DynamoDB:
    //   Si SNS falla, la predicción ya está en DB (no se pierde).
    //   Si guardáramos después de SNS y DynamoDB fallara, habríamos publicado
    //   un evento por una predicción que no existe en DB.
    //   "Persistir primero, publicar después" es el orden correcto.
    //
    // POR QUÉ no await el PublishCommand en el happy path de producción:
    //   Para reducir la latencia del response, podría dispararse "fire and forget".
    //   Acá lo awaiteamos para que los errores de SNS se logueen correctamente.
    const snsEvent: NewPredictionEvent = {
      eventType: "NEW_PREDICTION",
      userId,
      matchId,
      homeScore,
      awayScore,
      createdAt: now,
    };

    try {
      await snsClient.send(
        new PublishCommand({
          TopicArn: SNS_TOPIC_ARN,
          // Message: el cuerpo del mensaje SNS (debe ser string)
          Message: JSON.stringify(snsEvent),
          // Subject: resumen del mensaje (visible en notificaciones por email)
          Subject: `Nueva predicción: usuario ${userId} predijo partido ${matchId}`,
          // MessageAttributes: metadatos adicionales que los subscribers pueden usar
          // para filtrar mensajes sin deserializar el body.
          MessageAttributes: {
            eventType: {
              DataType: "String",
              StringValue: "NEW_PREDICTION",
            },
          },
        })
      );
      console.log("Evento publicado en SNS");
    } catch (snsError) {
      // Si SNS falla, logueamos pero NO fallamos el response al usuario.
      // La predicción está guardada — el error de SNS es un problema de infraestructura.
      // En producción, esto podría ir a una DLQ (Dead Letter Queue) para reintento.
      console.error("Error publicando en SNS (predicción guardada de todas formas):", snsError);
    }

    // ── 5. Respuesta 201 Created ─────────────────────────────────────────────
    return {
      statusCode: 201,
      headers: corsHeaders(),
      body: JSON.stringify({
        message: "Predicción creada exitosamente",
        prediction,
      }),
    };
  } catch (error) {
    console.error("Error en createPrediction:", error);
    return errorResponse(500, "Error interno del servidor");
  }
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function corsHeaders() {
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}

function errorResponse(statusCode: number, message: string): APIGatewayProxyResult {
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify({ message }),
  };
}
