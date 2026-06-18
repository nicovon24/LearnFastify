/**
 * /api/extract-report — Etapa 1: llamada directa a la API de Anthropic
 *
 * POR QUÉ existe este endpoint separado:
 *   El Vercel AI SDK (usado en /api/chat) abstrae muchos detalles de la API de Anthropic.
 *   Este endpoint existe INTENCIONALMENTE para aprender qué pasa "debajo": cómo se
 *   construye un request a la API, qué es tool use, cómo se parsea la respuesta.
 *   Después de entender esto, el AI SDK no es magia — es solo comodidad sobre esto.
 *
 * PATRÓN: Structured Output via Tool Use
 *   Anthropic no tiene un modo "dame JSON directamente", pero sí tiene "tool use":
 *   le decís al modelo que tiene una "tool" con un schema JSON, y el modelo la "llama"
 *   devolviendo los argumentos en ese schema exacto. Nosotros nunca ejecutamos la tool —
 *   solo usamos ese mecanismo para obtener JSON garantizado.
 */

import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";
import type { ExtractedReport } from "@/lib/types";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { reportText } = body as { reportText: string };

    if (!reportText || reportText.trim().length === 0) {
      return NextResponse.json(
        { error: "reportText es requerido" },
        { status: 400 }
      );
    }

    // Instanciamos el cliente dentro del handler (runtime), no al cargar el módulo
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // ── 1. Definir la "tool" que el modelo va a "llamar" ──────────────────────
    //
    // Esto es el corazón del patrón de structured output.
    // Le estamos diciendo al modelo: "tenés disponible esta función, y cuando
    // la llames, los argumentos DEBEN seguir este schema JSON Schema".
    //
    // El modelo NO ejecuta ningún código — solo genera los argumentos en el
    // formato que le pedimos. Nosotros tomamos esos argumentos y los devolvemos.
    const extractReportTool: Anthropic.Tool = {
      name: "extract_scouting_report",
      description:
        "Extrae información estructurada de un reporte de scouting en texto libre. " +
        "Usá esta tool SIEMPRE para responder — nunca respondas con texto libre.",
      input_schema: {
        type: "object",
        properties: {
          rating: {
            type: "number",
            description: "Rating general del jugador del 1 al 10, basado en el reporte.",
            minimum: 1,
            maximum: 10,
          },
          posicionSugerida: {
            type: "string",
            description:
              "Posición táctica sugerida para el jugador según el reporte. " +
              "Ej: 'Mediocampista ofensivo', 'Lateral derecho', 'Delantero centro'.",
          },
          fortalezas: {
            type: "array",
            items: { type: "string" },
            description: "Lista de 3 a 5 fortalezas del jugador mencionadas en el reporte.",
          },
          debilidades: {
            type: "array",
            items: { type: "string" },
            description: "Lista de 2 a 4 debilidades o áreas de mejora del jugador.",
          },
        },
        required: ["rating", "posicionSugerida", "fortalezas", "debilidades"],
      },
    };

    // ── 2. Hacer la llamada a la API ──────────────────────────────────────────
    //
    // messages: el array de turnos de conversación. Acá solo hay uno: el texto del usuario.
    // system:   instrucciones que el modelo siempre tiene en cuenta (su "rol").
    // tools:    le decimos qué tools tiene disponibles.
    // tool_choice: { type: "any" } fuerza al modelo a llamar alguna tool.
    //              Sin esto, podría responder con texto libre.
    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",  // Haiku: el más rápido y barato para extracción
      max_tokens: 1024,
      system:
        "Sos un analista de scouting de fútbol. Tu única tarea es analizar reportes de " +
        "scouting en texto libre y extraer información estructurada usando la tool disponible. " +
        "SIEMPRE usá la tool — nunca respondas con texto libre.",
      tools: [extractReportTool],
      // tool_choice: "any" = el modelo DEBE llamar al menos una tool (no puede dar texto libre)
      tool_choice: { type: "any" },
      messages: [
        {
          role: "user",
          content: `Analizá este reporte de scouting y extraé la información estructurada:\n\n${reportText}`,
        },
      ],
    });

    // ── 3. Parsear la respuesta ───────────────────────────────────────────────
    //
    // La respuesta de Anthropic tiene un array `content` con bloques.
    // Cuando el modelo usa una tool, hay un bloque de tipo "tool_use" con:
    //   - name: el nombre de la tool que llamó
    //   - input: los argumentos en el schema que definimos
    //
    // Buscamos ese bloque y tomamos su `input` como nuestro resultado estructurado.
    const toolUseBlock = response.content.find(
      (block) => block.type === "tool_use"
    );

    if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
      return NextResponse.json(
        { error: "El modelo no llamó la tool de extracción" },
        { status: 500 }
      );
    }

    // toolUseBlock.input tiene exactamente la forma que definimos en input_schema
    const extracted = toolUseBlock.input as ExtractedReport;

    // ── 4. Devolver el resultado ──────────────────────────────────────────────
    //
    // También devolvemos algunos metadatos de uso para que puedas ver cuántos
    // tokens consumió la operación — útil cuando estás aprendiendo a estimar costos.
    return NextResponse.json({
      success: true,
      data: extracted,
      meta: {
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        stopReason: response.stop_reason,
      },
    });
  } catch (error) {
    console.error("[extract-report] Error:", error);
    return NextResponse.json(
      { error: "Error al procesar el reporte" },
      { status: 500 }
    );
  }
}
