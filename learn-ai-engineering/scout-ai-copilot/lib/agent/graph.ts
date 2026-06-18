/**
 * lib/agent/graph.ts — El grafo de LangGraph
 *
 * ──────────────────────────────────────────────────────────────────────────
 * POR QUÉ LangGraph en vez de dejar que el AI SDK decida todo:
 *
 *   Con solo el AI SDK y streamText + tools, el modelo decide IMPLÍCITAMENTE
 *   cuándo llamar qué tool. Funciona, pero es una caja negra: no sabés por qué
 *   llamó una tool y no otra, no podés debuggear el flujo paso a paso, y si
 *   el modelo toma una decisión extraña, es difícil corregirla.
 *
 *   Con LangGraph, el flujo de decisión es EXPLÍCITO como un grafo dirigido:
 *     classify → (fetchStats y/o fetchReports) → synthesize
 *   Cada nodo hace UNA cosa. Podés ver qué decidió classify, qué datos
 *   obtuvieron los nodos de fetch, y cómo los combinó synthesize.
 *   Si algo falla o da resultados raros, sabés EXACTAMENTE en qué nodo está el problema.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * FLUJO DEL GRAFO:
 *
 *  [START]
 *     │
 *     ▼
 *  [classify]          ← lee la pregunta, decide qué datos necesita
 *     │
 *     ├──── needsStats=true  ──────────────────────► [fetchStats]
 *     │                                                    │
 *     └──── needsReports=true ──► [fetchReports]           │
 *                │                     │                   │
 *                └─────────────────────┴───────────────────┘
 *                                      │
 *                                      ▼
 *                                 [synthesize]     ← combina todo y responde
 *                                      │
 *                                      ▼
 *                                    [END]
 */

import { StateGraph, Annotation, START, END } from "@langchain/langgraph";
import Anthropic from "@anthropic-ai/sdk";
import { getPlayerStats } from "@/lib/db/players";
import { searchScoutingReports } from "@/lib/db/scoutingReports";
import type { PlayerStats, ScoutingReport } from "@/lib/types";

// No instanciamos Anthropic al cargar el módulo (fallaría en build sin ANTHROPIC_API_KEY).
// Cada nodo lo crea en runtime cuando se ejecuta. El costo de crear el cliente
// es mínimo (es solo configuración, no hace ninguna llamada de red).
function getAnthropic() {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
}

// ── Definición del Estado del grafo ──────────────────────────────────────────
//
// El "estado" es el objeto que fluye entre nodos. Cada nodo puede leer
// los campos que necesita y escribir los campos que produce.
//
// Annotation.Root es la forma en que LangGraph define el schema del estado.
// El segundo argumento de Annotation() es el "reducer" — cómo se fusionan
// actualizaciones al mismo campo (acá usamos el default: reemplazar).
const AgentStateAnnotation = Annotation.Root({
  question: Annotation<string>(),
  playerName: Annotation<string | undefined>(),
  needsStats: Annotation<boolean>(),
  needsReports: Annotation<boolean>(),
  playerStats: Annotation<PlayerStats | null | undefined>(),
  scoutingReports: Annotation<ScoutingReport[] | undefined>(),
  finalResponse: Annotation<string | undefined>(),
});

type AgentState = typeof AgentStateAnnotation.State;

// ── NODO 1: classify ─────────────────────────────────────────────────────────
//
// POR QUÉ existe este nodo separado:
//   Clasificar la intención ANTES de buscar datos es más eficiente y explícito.
//   Si la pregunta es "¿cuántos goles hizo Espinoza?", no tiene sentido buscar
//   reportes de scouting — con las stats alcanza. Este nodo toma esa decisión
//   UNA VEZ, y el grafo rutea en consecuencia. Con el AI SDK, el modelo podría
//   llamar ambas tools siempre "por las dudas".
async function classifyNode(state: AgentState): Promise<Partial<AgentState>> {
  const response = await getAnthropic().messages.create({
    model: "claude-3-5-haiku-20241022",
    max_tokens: 256,
    system: `Sos un asistente de scouting de fútbol. 
Tu tarea es analizar la pregunta del usuario y decidir qué información necesitás.
SIEMPRE respondé llamando la tool classify_intent — nunca con texto libre.`,
    tools: [
      {
        name: "classify_intent",
        description: "Clasifica qué información necesita la pregunta",
        input_schema: {
          type: "object",
          properties: {
            playerName: {
              type: "string",
              description:
                "Nombre del jugador mencionado en la pregunta. String vacío si no hay ninguno.",
            },
            needsStats: {
              type: "boolean",
              description:
                "true si la pregunta necesita estadísticas del jugador (goles, asistencias, partidos, etc.)",
            },
            needsReports: {
              type: "boolean",
              description:
                "true si la pregunta necesita reportes de scouting (análisis cualitativo, fortalezas, debilidades, etc.)",
            },
          },
          required: ["playerName", "needsStats", "needsReports"],
        },
      },
    ],
    tool_choice: { type: "any" },
    messages: [{ role: "user", content: state.question }],
  });

  const toolBlock = response.content.find((b) => b.type === "tool_use");
  if (!toolBlock || toolBlock.type !== "tool_use") {
    // Fallback: si el modelo no llamó la tool, pedimos todo
    return { playerName: undefined, needsStats: true, needsReports: true };
  }

  const input = toolBlock.input as {
    playerName: string;
    needsStats: boolean;
    needsReports: boolean;
  };

  return {
    playerName: input.playerName || undefined,
    needsStats: input.needsStats,
    needsReports: input.needsReports,
  };
}

// ── NODO 2a: fetchStats ───────────────────────────────────────────────────────
//
// POR QUÉ existe este nodo separado:
//   Separa la DECISIÓN (classify) de la EJECUCIÓN (fetchStats).
//   Este nodo es puro y simple: toma el playerName del estado y llama a la DB.
//   Si mañana querés cambiar la fuente de datos (de Supabase a una API externa),
//   solo cambiás este nodo — classify y synthesize no cambian nada.
async function fetchStatsNode(state: AgentState): Promise<Partial<AgentState>> {
  if (!state.playerName) {
    return { playerStats: null };
  }

  const stats = await getPlayerStats(state.playerName);
  return { playerStats: stats };
}

// ── NODO 2b: fetchReports ─────────────────────────────────────────────────────
//
// POR QUÉ existe este nodo separado:
//   Similar a fetchStats — separa ejecución de decisión.
//   Además, la búsqueda semántica usa el texto de la pregunta ORIGINAL
//   (no solo el nombre del jugador), lo que devuelve reportes más relevantes
//   al contexto de la pregunta.
async function fetchReportsNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  // Buscamos con la pregunta completa para mejor relevancia semántica
  const query = state.playerName
    ? `${state.question} ${state.playerName}`
    : state.question;

  const reports = await searchScoutingReports(query, 3);
  return { scoutingReports: reports };
}

// ── NODO 3: synthesize ────────────────────────────────────────────────────────
//
// POR QUÉ existe este nodo separado:
//   Este nodo SOLO tiene una responsabilidad: combinar datos y generar respuesta.
//   Recibe el estado completo (con stats y/o reportes ya cargados) y produce
//   la respuesta final. Si classify y fetch son correctos, synthesize siempre
//   tiene la información que necesita — no tiene que "adivinar" qué buscar.
async function synthesizeNode(
  state: AgentState
): Promise<Partial<AgentState>> {
  // Construimos el contexto para el modelo con lo que se obtuvo
  const contextParts: string[] = [];

  if (state.playerStats) {
    contextParts.push(`ESTADÍSTICAS DE ${state.playerStats.name.toUpperCase()}:
- Posición: ${state.playerStats.position}
- Equipo: ${state.playerStats.team}
- Edad: ${state.playerStats.age} años
- Partidos: ${state.playerStats.matches} | Minutos: ${state.playerStats.minutesPlayed}
- Goles: ${state.playerStats.goals} | Asistencias: ${state.playerStats.assists}
- Precisión de pase: ${state.playerStats.passAccuracy}%
- Rating general: ${state.playerStats.rating}/10`);
  }

  if (state.scoutingReports && state.scoutingReports.length > 0) {
    const reportsText = state.scoutingReports
      .map(
        (r, i) =>
          `Reporte ${i + 1} (Scout: ${r.scoutName}, ${r.date}):\n${r.content}`
      )
      .join("\n\n---\n\n");
    contextParts.push(`REPORTES DE SCOUTING:\n${reportsText}`);
  }

  if (contextParts.length === 0) {
    return {
      finalResponse:
        "No encontré información sobre ese jugador en la base de datos. " +
        "Verificá que el nombre esté correcto.",
    };
  }

  const context = contextParts.join("\n\n═══════════════════════════════\n\n");

  const response = await getAnthropic().messages.create({
    model: "claude-3-5-sonnet-20241022",  // Sonnet para la respuesta final: más calidad
    max_tokens: 1024,
    system: `Sos un asistente de scouting de fútbol con mucha experiencia.
Basándote en la información provista, respondé la pregunta del usuario de forma clara y útil.
Incluí siempre:
1. Una respuesta directa a la pregunta
2. Los datos relevantes que respaldan tu respuesta
3. Una recomendación final explicando en qué te basás
Sé conciso pero completo. No inventes datos que no estén en el contexto.`,
    messages: [
      {
        role: "user",
        content: `Pregunta: ${state.question}\n\nInformación disponible:\n${context}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  const finalResponse = textBlock?.type === "text" ? textBlock.text : "No se pudo generar una respuesta.";

  return { finalResponse };
}

// ── Función de routing después de classify ────────────────────────────────────
//
// En LangGraph, las "conditional edges" son funciones que, dado el estado,
// devuelven el NOMBRE del próximo nodo (o array de nodos para ejecución paralela).
// Esto es lo que hace el flujo "explícito" — el código dice exactamente
// a dónde va el control según la decisión de classify.
function routeAfterClassify(state: AgentState): string[] {
  const nextNodes: string[] = [];

  if (state.needsStats) nextNodes.push("fetchStats");
  if (state.needsReports) nextNodes.push("fetchReports");

  // Si classify no necesita nada (pregunta general), vamos directo a synthesize
  if (nextNodes.length === 0) nextNodes.push("synthesize");

  return nextNodes;
}

// ── Construcción del grafo ────────────────────────────────────────────────────
//
// StateGraph toma el schema del estado como argumento.
// Luego le agregamos nodos y edges (conexiones entre nodos).
const workflow = new StateGraph(AgentStateAnnotation)
  .addNode("classify", classifyNode)
  .addNode("fetchStats", fetchStatsNode)
  .addNode("fetchReports", fetchReportsNode)
  .addNode("synthesize", synthesizeNode)
  // Edge fijo: el grafo empieza siempre en classify
  .addEdge(START, "classify")
  // Conditional edge: classify → (fetchStats y/o fetchReports y/o synthesize)
  // send() le dice a LangGraph que puede ir a MÚLTIPLES nodos en paralelo
  .addConditionalEdges("classify", routeAfterClassify, [
    "fetchStats",
    "fetchReports",
    "synthesize",
  ])
  // Ambos nodos de fetch convergen en synthesize
  .addEdge("fetchStats", "synthesize")
  .addEdge("fetchReports", "synthesize")
  // synthesize siempre termina el grafo
  .addEdge("synthesize", END);

// Compilamos el grafo — esto valida la estructura y lo prepara para ejecutarse
export const scoutingGraph = workflow.compile();

/**
 * Función de conveniencia para invocar el grafo desde el API route.
 * Recibe la pregunta del usuario y devuelve la respuesta final + el estado
 * completo (útil para debuggear qué decidió cada nodo).
 */
export async function runScoutingAgent(question: string): Promise<{
  response: string;
  state: AgentState;
}> {
  // Invocamos el grafo con el estado inicial
  // needsStats y needsReports empiezan en false — classify los actualiza
  const finalState = await scoutingGraph.invoke({
    question,
    needsStats: false,
    needsReports: false,
  });

  return {
    response: finalState.finalResponse ?? "No se pudo generar una respuesta.",
    state: finalState,
  };
}
