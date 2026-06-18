-- ============================================================
-- Scout AI Copilot — Setup de base de datos en Supabase
-- ============================================================
-- Correr este SQL en: Supabase dashboard → SQL Editor
--
-- Paso 1: habilitamos la extensión pgvector.
-- pgvector agrega el tipo `vector` a Postgres y las funciones
-- de similarity search (cosine, dot product, L2 distance).
-- Sin esto, no podemos guardar embeddings ni hacer búsquedas semánticas.
-- ============================================================

-- Habilitar pgvector (solo necesario la primera vez)
create extension if not exists vector;

-- ============================================================
-- Tabla: players
-- Stats básicas de cada jugador. Es la tabla "estructurada"
-- que el nodo fetchStats del agente va a consultar.
-- ============================================================
create table if not exists players (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  position        text not null,
  age             integer not null,
  team            text not null,
  goals           integer not null default 0,
  assists         integer not null default 0,
  matches         integer not null default 0,
  minutes_played  integer not null default 0,
  pass_accuracy   numeric(4,1) not null default 0,  -- ej: 87.5
  rating          numeric(3,1) not null default 0,  -- ej: 7.8
  created_at      timestamptz default now()
);

-- ============================================================
-- Tabla: scouting_reports
-- Reportes de scouting en texto libre con su embedding.
--
-- La columna `embedding` es de tipo `vector(1536)` — eso es el
-- número de dimensiones del modelo text-embedding-3-small de OpenAI.
-- Si usás otro modelo de embeddings, cambiá ese número:
--   - text-embedding-3-large: 3072
--   - Voyage voyage-large-2:  1536 (igual, pero diferente modelo)
-- ============================================================
create table if not exists scouting_reports (
  id          uuid primary key default gen_random_uuid(),
  player_id   uuid references players(id) on delete cascade,
  player_name text not null,
  scout_name  text not null,
  date        date not null,
  content     text not null,     -- el texto libre del reporte
  embedding   vector(1536),      -- el vector generado por el modelo de embeddings
  created_at  timestamptz default now()
);

-- ============================================================
-- Índice para similarity search
--
-- ivfflat es el algoritmo de indexado aproximado de pgvector.
-- Sin este índice, cada búsqueda haría una comparación bruta
-- con TODOS los reportes (O(n)). Con el índice, es mucho más rápido.
--
-- lists = 100 es un buen valor para tablas de < 1 millón de filas.
-- Para más filas, aumentar lists. Para menos de ~1000 filas,
-- el índice no ayuda mucho pero tampoco hace daño.
-- ============================================================
create index if not exists scouting_reports_embedding_idx
  on scouting_reports
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

-- ============================================================
-- Función: match_scouting_reports
-- Esta función es la que hace el similarity search.
-- La llamamos desde TypeScript con supabase.rpc('match_scouting_reports', {...})
--
-- Por qué una función en vez de hacer el query directo:
--   - Supabase no expone los operadores de pgvector (<=> para cosine)
--     directamente en su query builder de JavaScript.
--   - Crear una función de Postgres nos permite llamarla vía RPC
--     y usar esos operadores nativamente.
-- ============================================================
create or replace function match_scouting_reports(
  query_embedding vector(1536),  -- el embedding de la pregunta del usuario
  match_count     int default 3, -- cuántos reportes devolver
  min_similarity  float default 0.5  -- umbral mínimo de similitud (0 a 1)
)
returns table (
  id          uuid,
  player_id   uuid,
  player_name text,
  scout_name  text,
  date        date,
  content     text,
  similarity  float
)
language sql stable
as $$
  select
    sr.id,
    sr.player_id,
    sr.player_name,
    sr.scout_name,
    sr.date,
    sr.content,
    -- <=> es el operador de cosine DISTANCE (0 = igual, 2 = opuesto)
    -- lo convertimos a SIMILARITY (1 = igual, -1 = opuesto) con 1 - distancia
    1 - (sr.embedding <=> query_embedding) as similarity
  from scouting_reports sr
  where 1 - (sr.embedding <=> query_embedding) > min_similarity
  order by sr.embedding <=> query_embedding  -- ordenamos por distancia (menor = más similar)
  limit match_count;
$$;
