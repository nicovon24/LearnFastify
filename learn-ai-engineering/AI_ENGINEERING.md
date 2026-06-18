# AI Engineering — Guía de referencia rápida

---

## La idea central

AI Engineering no es crear modelos de ML — es **integrar LLMs existentes** (como Claude o GPT) en aplicaciones reales. La diferencia entre "hacer un chat simple" y "hacer un sistema de AI production-ready" está en cuatro capas que este proyecto cubre:

```
Etapa 1: API directa de LLM
  → Entender qué pasa "debajo" cuando llamás a la API de Anthropic
  → Structured Output / Tool Use para forzar JSON

Etapa 2: Vercel AI SDK
  → Streaming de respuestas al frontend
  → Tool calling declarativo
  → Generative UI (renderizar componentes según la respuesta del modelo)

Etapa 3: RAG (Retrieval Augmented Generation)
  → Embeddings: convertir texto a vectores semánticos
  → pgvector: similarity search en Postgres
  → El modelo responde con contexto relevante, no solo con su conocimiento interno

Etapa 4: Agentes / Orquestación con LangGraph
  → Grafo explícito de decisiones (vs caja negra del AI SDK)
  → Nodos: classify → fetchStats/fetchReports → synthesize
  → Debuggeable, modificable, controlable
```

---

## 1. API directa de LLM — Anthropic SDK

**Cuándo usarla:** cuando necesitás control total sobre el request o querés entender qué hace el AI SDK por debajo.

```typescript
import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const response = await anthropic.messages.create({
  model: "claude-3-5-haiku-20241022",  // Haiku: rápido y barato
  max_tokens: 1024,
  system: "Sos un asistente de scouting de fútbol.",
  messages: [
    { role: "user", content: "Analizá a Rodrigo Espinoza" }
  ],
});

// Extraer el texto de la respuesta
const text = response.content.find(b => b.type === "text")?.text;
```

### Structured Output — forzar JSON con Tool Use

**Problema:** los LLMs devuelven texto libre por defecto. Para obtener JSON garantizado, usás **tool use**: le decís al modelo que tiene una "función" con un schema, y el modelo la "llama" con argumentos que siguen ese schema exacto.

```typescript
const response = await anthropic.messages.create({
  model: "claude-3-5-haiku-20241022",
  max_tokens: 512,
  tools: [{
    name: "extract_player_data",
    description: "Extrae datos estructurados del reporte de scouting",
    input_schema: {
      type: "object",
      properties: {
        rating: { type: "number", minimum: 1, maximum: 10 },
        position: { type: "string" },
        strengths: { type: "array", items: { type: "string" } },
      },
      required: ["rating", "position", "strengths"],
    },
  }],
  tool_choice: { type: "any" },  // FUERZA al modelo a llamar una tool (no texto libre)
  messages: [{ role: "user", content: reportText }],
});

// Extraer el JSON del tool use block
const toolBlock = response.content.find(b => b.type === "tool_use");
const data = toolBlock.input; // { rating: 8, position: "Delantero", strengths: [...] }
```

**Por qué esto funciona:** el modelo no ejecuta ninguna función real — solo genera los argumentos en el formato pedido. Nosotros tomamos esos argumentos como nuestro resultado estructurado.

---

## 2. Vercel AI SDK — Streaming + Tools

**Qué es:** abstracción sobre las APIs de los LLMs que agrega streaming, tool calling y generative UI de forma declarativa.

### streamText — respuestas en streaming

```typescript
import { streamText } from "ai";
import { anthropic } from "@ai-sdk/anthropic";

// En una API route de Next.js:
const result = streamText({
  model: anthropic("claude-3-5-sonnet-20241022"),
  system: "Sos un asistente de scouting.",
  messages: [{ role: "user", content: "Analizá a Espinoza" }],
});

// toTextStreamResponse() convierte al protocolo que useChat() entiende
return result.toTextStreamResponse();
```

### En el frontend — streaming manual

```typescript
// Leer el stream token por token (lo que useChat hace internamente)
const response = await fetch("/api/chat", {
  method: "POST",
  body: JSON.stringify({ messages }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();
let accumulated = "";

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  accumulated += decoder.decode(value, { stream: true });
  setContent(accumulated);  // re-renderiza con cada chunk → efecto de streaming
}
```

### Generative UI — renderizar componentes según la respuesta

**Concepto:** cuando el modelo devuelve datos estructurados de un jugador, el frontend renderiza una card visual en vez de texto plano.

```typescript
// Patrón: el backend incluye un marcador especial en la respuesta
const responseText = `PLAYER_DATA:${JSON.stringify(stats)}:END_PLAYER_DATA\n\n${textResponse}`;

// El frontend detecta el marcador y renderiza el componente
const statsMatch = content.match(/PLAYER_DATA:([\s\S]*?):END_PLAYER_DATA/);
if (statsMatch) {
  const stats = JSON.parse(statsMatch[1]);
  return <PlayerCard stats={stats} />;  // UI generada por el modelo
}
```

---

## 3. RAG — Retrieval Augmented Generation

**Problema que resuelve:** los LLMs tienen conocimiento hasta su fecha de entrenamiento. Para datos propios (reportes de scouting, documentos internos), necesitás darle el contexto relevante en cada prompt.

**Flujo de RAG:**
```
Tiempo de indexado:
  Texto del reporte → modelo de embeddings → vector de 1536 dimensiones → pgvector

Tiempo de query:
  Pregunta del usuario → modelo de embeddings → vector → similarity search → reportes relevantes
  [pregunta + reportes relevantes] → LLM → respuesta contextualizada
```

### Embeddings — texto a vectores

```typescript
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Convertir texto a vector
const response = await openai.embeddings.create({
  model: "text-embedding-3-small",  // 1536 dimensiones, barato y bueno
  input: "Jugador con excelente visión de juego y pases precisos",
});

const vector: number[] = response.data[0].embedding;
// [0.0234, -0.0891, 0.1234, ... ] → 1536 números que representan el significado
```

**Importante:** siempre usá el mismo modelo para indexar y para buscar. Mezclar modelos da resultados sin sentido (los vectores viven en "espacios semánticos" distintos).

### pgvector — similarity search en Postgres

```sql
-- Setup en Supabase
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE scouting_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_name TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536)  -- columna de tipo vector
);

-- Función para similarity search
CREATE FUNCTION match_reports(query_embedding vector(1536), match_count int)
RETURNS TABLE (id uuid, content text, similarity float)
LANGUAGE sql AS $$
  SELECT id, content,
    1 - (embedding <=> query_embedding) as similarity  -- <=> es cosine distance
  FROM scouting_reports
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
```

```typescript
// Buscar reportes similares a una pregunta
const queryEmbedding = await generateEmbedding(userQuestion);

const { data } = await supabase.rpc("match_reports", {
  query_embedding: queryEmbedding,
  match_count: 3,
});
// data: [{ content: "reporte más relevante...", similarity: 0.89 }, ...]
```

---

## 4. LangGraph — Orquestación explícita de agentes

**Problema que resuelve:** con solo el AI SDK + tools, el modelo decide implícitamente cuándo llamar cada tool — es una caja negra. Con LangGraph, el flujo de decisión es un **grafo explícito** que podés ver, debuggear y modificar.

```
Sin LangGraph (caja negra):     Con LangGraph (explícito):
                                   [classify]
  [modelo + tools] → ?               ↓  ↓
                               [fetchStats] [fetchReports]
                                       ↓
                                  [synthesize]
```

### Definir el Estado del grafo

```typescript
import { StateGraph, Annotation, START, END } from "@langchain/langgraph";

// El estado fluye entre nodos — cada nodo puede leerlo y modificarlo
const AgentState = Annotation.Root({
  question: Annotation<string>(),
  playerName: Annotation<string | undefined>(),
  needsStats: Annotation<boolean>(),
  needsReports: Annotation<boolean>(),
  playerStats: Annotation<PlayerStats | null | undefined>(),
  scoutingReports: Annotation<ScoutingReport[] | undefined>(),
  finalResponse: Annotation<string | undefined>(),
});
```

### Definir los nodos

```typescript
// Nodo 1: classify — decide qué datos necesita
async function classifyNode(state) {
  const response = await anthropic.messages.create({
    // ... prompt que devuelve { needsStats: bool, needsReports: bool, playerName: str }
    tool_choice: { type: "any" },
  });
  return {
    needsStats: toolOutput.needsStats,
    needsReports: toolOutput.needsReports,
    playerName: toolOutput.playerName,
  };
}

// Nodo 2a: fetchStats — llama a la DB
async function fetchStatsNode(state) {
  const stats = await getPlayerStats(state.playerName);
  return { playerStats: stats };
}

// Nodo 2b: fetchReports — hace similarity search
async function fetchReportsNode(state) {
  const reports = await searchScoutingReports(state.question);
  return { scoutingReports: reports };
}

// Nodo 3: synthesize — combina y genera respuesta final
async function synthesizeNode(state) {
  // Combina state.playerStats y state.scoutingReports
  const response = await anthropic.messages.create({ /* ... */ });
  return { finalResponse: response };
}
```

### Construir el grafo

```typescript
// Función de routing — devuelve qué nodo(s) ejecutar después
function routeAfterClassify(state) {
  const next = [];
  if (state.needsStats) next.push("fetchStats");
  if (state.needsReports) next.push("fetchReports");
  if (next.length === 0) next.push("synthesize");
  return next;  // puede devolver múltiples → ejecución en paralelo
}

const workflow = new StateGraph(AgentState)
  .addNode("classify", classifyNode)
  .addNode("fetchStats", fetchStatsNode)
  .addNode("fetchReports", fetchReportsNode)
  .addNode("synthesize", synthesizeNode)
  .addEdge(START, "classify")
  .addConditionalEdges("classify", routeAfterClassify, ["fetchStats", "fetchReports", "synthesize"])
  .addEdge("fetchStats", "synthesize")
  .addEdge("fetchReports", "synthesize")
  .addEdge("synthesize", END);

export const graph = workflow.compile();

// Invocar
const result = await graph.invoke({ question: "¿cómo viene Espinoza?" });
console.log(result.finalResponse);
```

---

## 5. Supabase — cliente para Next.js

```typescript
// lib/db/supabase.ts — lazy init para no fallar en build
import { createClient, SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabase() {
  if (!_client) {
    _client = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
  }
  return _client;
}
```

**Por qué lazy init:** si creás el cliente al cargar el módulo, Next.js falla durante el build porque las env vars no están disponibles. Con lazy init, el cliente se crea en runtime cuando se llama la función.

---

## Modelos de Anthropic — cuándo usar cada uno

| Modelo | Velocidad | Costo | Cuándo usarlo |
|---|---|---|---|
| `claude-3-5-haiku-20241022` | Rápido | Barato | Clasificación, extracción, respuestas cortas |
| `claude-3-5-sonnet-20241022` | Medio | Medio | Análisis, respuestas complejas, producción |
| `claude-3-opus-20240229` | Lento | Caro | Tareas muy complejas, razonamiento profundo |

---

## Resumen: qué tecnología resuelve qué problema

| Problema | Tecnología |
|---|---|
| Obtener JSON garantizado del LLM | Tool Use / Structured Output con `@anthropic-ai/sdk` |
| Streaming de tokens al frontend | `streamText` + `toTextStreamResponse()` del AI SDK |
| Buscar en documentos propios por significado | RAG: embeddings + pgvector + `similarity search` |
| Flujo de decisión visible y debuggeable | LangGraph: grafo con nodos `classify → fetch → synthesize` |
| Renderizar UI según respuesta del modelo | Generative UI: marcadores en el texto + parseo en el frontend |

---

## Resumen visual: qué archivo hace qué

```
scout-ai-copilot/
├── app/
│   ├── api/extract-report/route.ts  → Etapa 1: @anthropic-ai/sdk directo, Tool Use
│   └── api/chat/route.ts            → Etapa 2+4: streamText + LangGraph
│
├── components/
│   ├── PlayerCard.tsx               → Generative UI: card visual del jugador
│   └── ChatMessage.tsx              → Parsea marcadores y renderiza PlayerCard
│
├── lib/
│   ├── types.ts                     → Tipos del dominio (PlayerStats, ScoutingReport)
│   ├── agent/graph.ts               → Etapa 4: grafo de LangGraph (4 nodos)
│   └── db/
│       ├── supabase.ts              → Cliente lazy de Supabase
│       ├── players.ts               → getPlayerStats() — consulta SQL
│       └── scoutingReports.ts       → searchScoutingReports() — RAG con pgvector
│
└── scripts/
    ├── setup-db.sql                 → SQL para crear tablas y función match_reports
    └── seed.ts                      → Inserta jugadores y reportes con embeddings
```

---

## El ciclo completo de una pregunta

`"¿cómo viene jugando Espinoza?"`:

1. Frontend envía `POST /api/chat` con la pregunta
2. **`/api/chat`** invoca `runScoutingAgent(question)`
3. **Nodo `classify`** (LangGraph): el modelo decide `needsStats=true, needsReports=true, playerName="Espinoza"`
4. **Nodo `fetchStats`** (en paralelo con fetchReports): `getPlayerStats("Espinoza")` → consulta Supabase
5. **Nodo `fetchReports`** (en paralelo): `searchScoutingReports("Espinoza")` → embedding de la pregunta → similarity search con pgvector → 3 reportes relevantes
6. **Nodo `synthesize`**: recibe stats + reportes → el modelo genera una respuesta con recomendación
7. `/api/chat` toma la respuesta y llama `streamText()` del AI SDK para transmitirla al frontend
8. Frontend lee el stream token por token → texto aparece progresivamente
9. Si la respuesta incluye datos de stats → frontend detecta el marcador → renderiza `<PlayerCard />`
