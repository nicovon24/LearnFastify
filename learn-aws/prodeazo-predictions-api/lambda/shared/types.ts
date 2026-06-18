/**
 * lambda/shared/types.ts — Tipos del dominio compartidos entre las Lambdas
 *
 * POR QUÉ tipos compartidos:
 *   Las tres Lambdas trabajan con el mismo dominio (predicciones).
 *   Centralizar los tipos evita inconsistencias y facilita el mantenimiento.
 */

/**
 * Una predicción de partido guardada en DynamoDB.
 *
 * SOBRE EL DISEÑO DE DYNAMODB:
 *   En DynamoDB, no hay schema fijo como en SQL. Cada item puede tener
 *   distintos atributos, pero todos deben tener la PK y SK.
 *   Los tipos los definimos en TypeScript — DynamoDB no los enforcea.
 */
export interface Prediction {
  userId: string;         // Partition Key (PK) — identifica al usuario
  matchId: string;        // Sort Key (SK) — identifica el partido
  homeScore: number;      // Predicción del score local
  awayScore: number;      // Predicción del score visitante
  createdAt: string;      // ISO timestamp — cuándo se hizo la predicción
  updatedAt?: string;     // ISO timestamp — cuándo se actualizó (si se editó)
}

/** Body del request POST /predictions */
export interface CreatePredictionBody {
  matchId: string;
  homeScore: number;
  awayScore: number;
}

/** Respuesta estándar de la API para errores */
export interface ApiError {
  message: string;
  code?: string;
}

/** Evento publicado en SNS cuando se crea una predicción */
export interface NewPredictionEvent {
  eventType: "NEW_PREDICTION";
  userId: string;
  matchId: string;
  homeScore: number;
  awayScore: number;
  createdAt: string;
}
