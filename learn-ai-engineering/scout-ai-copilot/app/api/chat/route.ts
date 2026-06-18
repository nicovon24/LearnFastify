/**
 * /api/chat — Etapa 2+4: AI SDK + LangGraph juntos
 *
 * POR QUÉ combinamos LangGraph con el AI SDK acá:
 *   - LangGraph maneja la ORQUESTACIÓN: qué tools llamar y en qué orden.
 *   - El AI SDK maneja el STREAMING hacia el frontend: el protocolo de
 *     streaming de texto que useChat() del frontend entiende.
 *
 *   LangGraph no tiene streaming built-in compatible con useChat(), así que
 *   usamos un patrón "adapter": ejecutamos el grafo (que puede tardar varios
 *   segundos haciendo múltiples calls a la API), y cuando termina,
 *   streameamos la respuesta final al cliente.
 *
 *   Para hacer STREAMING REAL del grafo (token por token), se necesitaría
 *   implementar un ReadableStream manualmente — lo anotamos como mejora futura.
 *
 * SOBRE GENERATIVE UI:
 *   Cuando el grafo devuelve stats de un jugador, incluimos esos datos en la
 *   respuesta como un objeto JSON especial. El frontend detecta ese objeto
 *   y renderiza un componente PlayerCard en vez de solo texto.
 */

import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { NextRequest, NextResponse } from "next/server";
import { runScoutingAgent } from "@/lib/agent/graph";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const messages = body.messages as Array<{ role: string; content: string }>;

    if (!messages || messages.length === 0) {
      return NextResponse.json(
        { error: "messages es requerido" },
        { status: 400 }
      );
    }

    // Tomamos el último mensaje del usuario como la pregunta actual
    const lastUserMessage = messages
      .filter((m) => m.role === "user")
      .at(-1);

    if (!lastUserMessage) {
      return NextResponse.json(
        { error: "No hay mensaje del usuario" },
        { status: 400 }
      );
    }

    // ── 1. Ejecutar el grafo de LangGraph ────────────────────────────────────
    //
    // runScoutingAgent() corre todo el flujo:
    //   classify → (fetchStats / fetchReports) → synthesize
    // y devuelve la respuesta final más el estado completo del grafo.
    //
    // El estado completo es valioso para la Generative UI: si el grafo
    // obtuvo stats de un jugador, las incluimos en la respuesta para que
    // el frontend pueda renderizar el componente PlayerCard.
    const { response, state } = await runScoutingAgent(lastUserMessage.content);

    // ── 2. Preparar el contexto para el streaming ────────────────────────────
    //
    // Si el grafo obtuvo stats de un jugador, las adjuntamos a la respuesta
    // como un bloque JSON especial. El frontend parsea esto para saber cuándo
    // mostrar la PlayerCard.
    //
    // Este es el patrón de "Generative UI": en vez de que el frontend tenga
    // que hacer un fetch separado para las stats, el backend las incluye
    // directamente en el stream de la respuesta del chat.
    let systemPrompt = `Sos un asistente de scouting. Transmitís la siguiente respuesta al usuario exactamente como está, sin modificarla.`;

    let userPrompt = response;

    if (state.playerStats) {
      // Incluimos las stats como JSON en el prompt para que el modelo
      // las pueda referenciar al transmitir. El frontend detecta este bloque.
      const statsJson = JSON.stringify(state.playerStats);
      userPrompt = `PLAYER_STATS_DATA:${statsJson}:END_PLAYER_STATS\n\n${response}`;
      systemPrompt +=
        " La respuesta puede incluir un bloque PLAYER_STATS_DATA al inicio — dejalo tal cual.";
    }

    // ── 3. Streamear la respuesta al frontend con el AI SDK ──────────────────
    //
    // streamText() del AI SDK genera un stream de texto token por token.
    // Aunque nosotros ya tenemos la respuesta completa de LangGraph,
    // usamos streamText para que el frontend la reciba progresivamente
    // (mejor UX que esperar el response completo).
    //
    // toDataStreamResponse() convierte el stream al protocolo que
    // useChat() del frontend entiende automáticamente.
    const result = streamText({
      model: anthropic("claude-3-5-haiku-20241022"),
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error("[chat] Error:", error);
    return NextResponse.json(
      { error: "Error al procesar la consulta" },
      { status: 500 }
    );
  }
}
