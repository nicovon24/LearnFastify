/**
 * lib/db/scoutingReports.ts — Búsqueda semántica sobre reportes de scouting
 *
 * POR QUÉ similarity search y no búsqueda por palabra clave:
 *   Si un usuario pregunta "¿quién tiene buen desplazamiento ofensivo?",
 *   un LIKE en la DB no va a encontrar un reporte que diga "proyección en banda excelente".
 *   La búsqueda semántica compara el SIGNIFICADO de la pregunta con el significado
 *   de cada reporte — aunque no compartan palabras exactas.
 *
 * FLUJO:
 *   1. Convertimos la query del usuario en un vector (embedding)
 *   2. Comparamos ese vector con los embeddings almacenados en pgvector
 *   3. Los más similares (cosine similarity más alta) son los más relevantes
 */

import OpenAI from "openai";
import { supabase } from "./supabase";
import type { ScoutingReport } from "@/lib/types";

// No instanciamos OpenAI al cargar el módulo (fallaría en build sin env vars).
// Se crea dentro de la función, en runtime.

/**
 * Busca los reportes de scouting más relevantes para una query en texto libre.
 * Devuelve entre 0 y `matchCount` reportes ordenados por relevancia.
 */
export async function searchScoutingReports(
  query: string,
  matchCount: number = 3
): Promise<ScoutingReport[]> {
  // ── Paso 1: Convertir la query en embedding ──────────────────────────────
  //
  // Usamos el MISMO modelo que usamos al hacer el seed.
  // IMPORTANTE: Si seedeamos con text-embedding-3-small, tenemos que buscar
  // con text-embedding-3-small. Mezclar modelos daría resultados sin sentido
  // porque los vectores vivirían en "espacios semánticos" distintos.
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  const embeddingResponse = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: query,
  });
  const queryEmbedding = embeddingResponse.data[0].embedding;

  // ── Paso 2: Llamar la función de Postgres via RPC ────────────────────────
  //
  // Usamos supabase.rpc() para llamar la función `match_scouting_reports`
  // que definimos en setup-db.sql. Esa función usa el operador <=> de pgvector
  // para calcular la cosine distance entre los vectores.
  const { data, error } = await supabase.rpc("match_scouting_reports", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    min_similarity: 0.4,  // solo devolvemos reportes con >40% de similitud
  });

  if (error) {
    console.error("[searchScoutingReports] Error en similarity search:", error);
    return [];
  }

  if (!data || data.length === 0) {
    return [];
  }

  // ── Paso 3: Mapear a nuestro tipo TypeScript ─────────────────────────────
  return data.map(
    (row: {
      id: string;
      player_id: string;
      player_name: string;
      scout_name: string;
      date: string;
      content: string;
      similarity: number;
    }) => ({
      id: row.id,
      playerId: row.player_id,
      playerName: row.player_name,
      scoutName: row.scout_name,
      date: row.date,
      content: row.content,
      similarity: row.similarity,
    })
  );
}
