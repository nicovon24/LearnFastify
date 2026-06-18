# Scout AI Copilot

Proyecto de aprendizaje que cubre las **4 etapas del roadmap de AI dev** en un solo proyecto cohesivo, usando el dominio de scouting de fútbol como hilo conductor.

## Qué cubre cada etapa del roadmap

| Etapa | Dónde aparece en el proyecto |
|---|---|
| **1. API directa de LLM** | `/api/extract-report` — llamada cruda a `@anthropic-ai/sdk` con structured output via tool use |
| **2. Vercel AI SDK** | `/api/chat` — `streamText` + `useChat` en el frontend para streaming. `PlayerCard` como Generative UI |
| **3. RAG con pgvector** | `searchScoutingReports()` — embeddings en Supabase/pgvector con similarity search |
| **4. Agentes/orquestación** | Grafo de LangGraph: `classify → fetchStats/fetchReports → synthesize` — flujo explícito en vez de caja negra |

---

## Stack

- **Next.js 14+** (App Router) + TypeScript
- **Vercel AI SDK** (`ai`, `@ai-sdk/anthropic`) — streaming al frontend
- **@anthropic-ai/sdk** — llamada directa a la API (Etapa 1)
- **@langchain/langgraph** — orquestación explícita del agente
- **Supabase** (Postgres + pgvector) — base de datos + similarity search
- **OpenAI** (`text-embedding-3-small`) — generación de embeddings
- **TailwindCSS** — estilos

---

## Setup

### 1. Variables de entorno

Copiá `.env.example` a `.env.local` y completá los valores:

```bash
cp .env.example .env.local
```

```env
ANTHROPIC_API_KEY=sk-ant-...       # Anthropic Console → API Keys
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_KEY=eyJ...                 # Supabase → Project Settings → API → anon key
OPENAI_API_KEY=sk-...              # platform.openai.com → API Keys
```

### 2. Setup de la base de datos en Supabase

1. Creá un proyecto en [supabase.com](https://supabase.com)
2. Abrí **SQL Editor** en el dashboard
3. Pegá y ejecutá el contenido de `scripts/setup-db.sql`
   - Habilita la extensión `pgvector`
   - Crea las tablas `players` y `scouting_reports`
   - Crea el índice de similarity search
   - Crea la función `match_scouting_reports`

### 3. Seed de datos

```bash
# Instala dotenv y openai si no los tenés
npm install --save-dev dotenv tsx openai

# Corre el seed
npx tsx scripts/seed.ts
```

Esto inserta 6 jugadores ficticios y 6 reportes de scouting con sus embeddings.

### 4. Levantar el proyecto

```bash
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

---

## Flujo completo — diagrama

```
Usuario escribe una pregunta
         │
         ▼
  POST /api/chat
  (Next.js App Router)
         │
         ▼
  ┌─────────────────────────────────────────────────┐
  │           GRAFO DE LANGGRAPH                    │
  │                                                 │
  │  [classify]                                     │
  │   ↓ Lee la pregunta                             │
  │   ↓ Decide: ¿necesita stats? ¿necesita reportes?│
  │   ↓ Extrae el nombre del jugador                │
  │         │                                       │
  │    ┌────┴────┐                                  │
  │    │         │  (pueden correr en paralelo)     │
  │    ▼         ▼                                  │
  │ [fetchStats] [fetchReports]                     │
  │   ↓             ↓                               │
  │   getPlayerStats()  searchScoutingReports()     │
  │   (Supabase SQL)    (pgvector similarity search)│
  │         │                                       │
  │         └──────────┐                            │
  │                    ▼                            │
  │             [synthesize]                        │
  │              ↓ Combina stats + reportes         │
  │              ↓ Genera respuesta con recomendación│
  └─────────────────────────────────────────────────┘
         │
         ▼
  streamText (AI SDK)
  → stream de tokens al frontend
         │
         ▼
  useChat() en el browser
  → renderiza tokens en tiempo real
  → si hay PLAYER_STATS_DATA en la respuesta:
     renderiza <PlayerCard /> (Generative UI)
         │
         ▼
  Usuario ve la respuesta + card del jugador
```

---

## Estructura del proyecto

```
scout-ai-copilot/
├── app/
│   ├── api/
│   │   ├── extract-report/
│   │   │   └── route.ts      ← Etapa 1: API cruda de Anthropic
│   │   └── chat/
│   │       └── route.ts      ← Etapa 2+4: AI SDK + LangGraph
│   ├── page.tsx              ← UI principal con useChat
│   ├── layout.tsx
│   └── globals.css
├── components/
│   ├── PlayerCard.tsx        ← Etapa 2: Generative UI
│   └── ChatMessage.tsx       ← Parsea y renderiza mensajes
├── lib/
│   ├── types.ts              ← Tipos TypeScript del dominio
│   ├── agent/
│   │   └── graph.ts          ← Etapa 4: Grafo de LangGraph
│   └── db/
│       ├── supabase.ts       ← Cliente de Supabase
│       ├── players.ts        ← getPlayerStats()
│       └── scoutingReports.ts ← searchScoutingReports() (RAG)
└── scripts/
    ├── setup-db.sql          ← SQL para crear tablas en Supabase
    └── seed.ts               ← Seed de jugadores y reportes
```

---

## Endpoints de la API

### `POST /api/extract-report`
Extrae información estructurada de un reporte de scouting en texto libre.
**Etapa 1** — llamada directa a `@anthropic-ai/sdk` con tool use para forzar JSON.

```bash
curl -X POST http://localhost:3000/api/extract-report \
  -H "Content-Type: application/json" \
  -d '{"reportText": "El jugador tiene excelente visión de juego y pases precisos. Su debilidad es el aspecto físico."}'
```

Respuesta:
```json
{
  "success": true,
  "data": {
    "rating": 7,
    "posicionSugerida": "Mediocampista ofensivo",
    "fortalezas": ["Visión de juego", "Precisión en pases"],
    "debilidades": ["Aspecto físico"]
  },
  "meta": { "model": "...", "inputTokens": 150, "outputTokens": 80 }
}
```

### `POST /api/chat`
Chat principal con streaming. Invoca el grafo de LangGraph internamente.
**Etapas 2 + 4** — AI SDK streaming + LangGraph orquestación.

---

## Por qué LangGraph cambia el juego

Con solo el AI SDK (`streamText + tools`), el modelo decide IMPLÍCITAMENTE cuándo llamar cada tool. El flujo es una caja negra: no sabés si llamó las dos tools, solo una, o ninguna, ni por qué.

Con LangGraph, el flujo de decisión es EXPLÍCITO y visible en el código:

```
classify → decide qué tools usar
    ↓
fetchStats (si needsStats=true)   ← ves el resultado de esta decisión
fetchReports (si needsReports=true) ← ves el resultado de esta también
    ↓
synthesize → combina todo
```

Podés loguear el estado después de cada nodo, debuggear en qué nodo falló algo, y modificar la lógica de ruteo sin tocar el modelo.

---

## Jugadores en la base de datos (seed)

| Jugador | Posición | Equipo | Rating |
|---|---|---|---|
| Marcos Villalba | Mediocampista ofensivo | Atlético Norteño | 7.8 |
| Rodrigo Espinoza | Delantero centro | Club Deportivo Sur | 8.1 |
| Lautaro Méndez | Lateral derecho | Reserva Unión FC | 6.9 |
| Facundo Herrera | Defensor central | Rivadavia SC | 7.5 |
| Sebastián Coria | Extremo izquierdo | Los Cóndores FC | 7.6 |
| Diego Ferreira | Volante defensive | Deportivo Central | 7.2 |

---

## Próximos pasos (mejoras posibles)

- [ ] Streaming real del grafo de LangGraph (token por token, no la respuesta completa)
- [ ] `useObject()` del AI SDK para Generative UI más elegante
- [ ] Visualización del grafo (LangSmith o LangGraph Studio)
- [ ] Agregar más jugadores y reportes reales
- [ ] Auth con Supabase para múltiples usuarios
