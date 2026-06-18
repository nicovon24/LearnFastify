/**
 * Backend Node/Express — Football API
 *
 * App minimalista que conecta a PostgreSQL y expone:
 *   GET /health        → liveness/readiness probe de K8s
 *   GET /api/players   → lista jugadores desde Postgres
 *   POST /api/players  → crea un jugador
 *
 * Las variables de entorno vienen inyectadas por K8s desde:
 *   - ConfigMap: PORT, DB_HOST, DB_NAME
 *   - Secret:    DB_USER, DB_PASSWORD
 *
 * Esto es el patrón "12 Factor App" — la app no sabe en qué entorno corre,
 * lee toda su configuración de variables de entorno. La misma imagen Docker
 * funciona en local, staging y producción — solo cambia el ConfigMap/Secret.
 */

import express, { Request, Response } from "express";
import { Pool } from "pg";

const app = express();
app.use(express.json());

// ── Config desde variables de entorno ────────────────────────────────────────
const PORT     = parseInt(process.env.PORT     || "3000");
const DB_HOST  = process.env.DB_HOST           || "localhost";
const DB_NAME  = process.env.DB_NAME           || "footballdb";
const DB_USER  = process.env.DB_USER           || "postgres";
const DB_PASS  = process.env.DB_PASSWORD       || "postgres";

// ── Pool de conexiones a Postgres ─────────────────────────────────────────────
//
// Pool mantiene múltiples conexiones abiertas y las reutiliza.
// En K8s con 2 réplicas del backend, cada Pod tiene su propio pool.
// La DB_HOST es el nombre del Service de Postgres ("postgres-service"),
// que K8s resuelve por DNS interno: postgres-service.default.svc.cluster.local
const pool = new Pool({
  host:     DB_HOST,
  database: DB_NAME,
  user:     DB_USER,
  password: DB_PASS,
  port:     5432,
  // Si la DB no está lista todavía, reintentar la conexión automáticamente
  connectionTimeoutMillis: 5000,
});

// ── Inicializar tabla en primer arranque ──────────────────────────────────────
async function initDb(): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS players (
        id        SERIAL PRIMARY KEY,
        name      VARCHAR(100) NOT NULL,
        position  VARCHAR(50)  NOT NULL,
        team      VARCHAR(100),
        goals     INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Seed con datos de ejemplo si la tabla está vacía
    const { rowCount } = await client.query("SELECT 1 FROM players LIMIT 1");
    if (!rowCount) {
      await client.query(`
        INSERT INTO players (name, position, team, goals) VALUES
          ('Lionel Messi',   'Delantero', 'Inter Miami',    820),
          ('Rodrigo Espinoza','Mediocampista','Prodeazo FC',  12),
          ('Kylian Mbappé',  'Delantero', 'Real Madrid',   280),
          ('Erling Haaland', 'Delantero', 'Manchester City',220)
      `);
      console.log("[db] Seed data inserted");
    }
  } finally {
    client.release();
  }
}

// ── Endpoints ─────────────────────────────────────────────────────────────────

/**
 * GET /health
 *
 * Este endpoint es el que usan las probes de K8s:
 *   - liveness probe:  ¿el proceso sigue vivo y respondiendo?
 *   - readiness probe: ¿la app está lista para recibir tráfico real?
 *
 * Acá también chequeamos la conexión a la DB para readiness — si la DB
 * no está disponible, la app no está "lista" aunque el proceso esté vivo.
 */
app.get("/health", async (_req: Request, res: Response) => {
  try {
    // Verificar que la DB responde
    await pool.query("SELECT 1");
    res.status(200).json({ status: "ok", db: "connected" });
  } catch {
    // Si la DB no responde, la readiness probe va a fallar
    // K8s va a sacar este Pod del Service hasta que se recupere
    res.status(503).json({ status: "degraded", db: "unreachable" });
  }
});

/**
 * GET /api/players
 * Devuelve todos los jugadores desde Postgres.
 */
app.get("/api/players", async (_req: Request, res: Response) => {
  try {
    const result = await pool.query(
      "SELECT * FROM players ORDER BY goals DESC"
    );
    res.json({
      count: result.rowCount,
      players: result.rows,
    });
  } catch (err) {
    console.error("[GET /api/players] Error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

/**
 * POST /api/players
 * Crea un jugador nuevo.
 * Body: { name, position, team, goals }
 */
app.post("/api/players", async (req: Request, res: Response) => {
  const { name, position, team = "", goals = 0 } = req.body;

  if (!name || !position) {
    res.status(400).json({ error: "name and position are required" });
    return;
  }

  try {
    const result = await pool.query(
      "INSERT INTO players (name, position, team, goals) VALUES ($1, $2, $3, $4) RETURNING *",
      [name, position, team, goals]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error("[POST /api/players] Error:", err);
    res.status(500).json({ error: "Database error" });
  }
});

// ── Arrancar servidor ─────────────────────────────────────────────────────────

async function start(): Promise<void> {
  try {
    await initDb();
    console.log("[db] Tables ready");
  } catch (err) {
    console.warn("[db] Init failed — DB might not be ready yet, K8s will retry via readiness probe:", err);
  }

  app.listen(PORT, () => {
    console.log(`[server] Football API running on port ${PORT}`);
    console.log(`[server] DB_HOST=${DB_HOST}, DB_NAME=${DB_NAME}`);
  });
}

start();
