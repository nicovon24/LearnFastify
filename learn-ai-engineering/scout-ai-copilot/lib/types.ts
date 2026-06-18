/**
 * Tipos del dominio compartidos en toda la aplicación.
 * Tenerlos en un solo lugar evita duplicación y hace que
 * los cambios de schema se propaguen automáticamente.
 */

// ── Jugador ──────────────────────────────────────────────────────────────────

/** Stats básicas de un jugador, como vendrían de la tabla `players`. */
export interface PlayerStats {
  id: string;
  name: string;
  position: string;       // ej: "Mediocampista ofensivo"
  age: number;
  team: string;
  goals: number;
  assists: number;
  matches: number;
  minutesPlayed: number;
  passAccuracy: number;   // porcentaje, ej: 87.5
  rating: number;         // rating general 1-10
}

// ── Reporte de scouting ──────────────────────────────────────────────────────

/** Reporte de scouting como lo guarda la DB (sin el vector de embedding). */
export interface ScoutingReport {
  id: string;
  playerId: string;
  playerName: string;
  scoutName: string;
  date: string;           // ISO date string
  content: string;        // el texto libre del reporte
  similarity?: number;    // solo presente cuando viene de similarity search
}

// ── Resultado del endpoint de extracción ─────────────────────────────────────

/**
 * Lo que devuelve /api/extract-report.
 * Es el JSON estructurado que el modelo extrae de un texto libre de scouting.
 */
export interface ExtractedReport {
  rating: number;                 // rating sugerido del jugador (1-10)
  posicionSugerida: string;       // posición táctica sugerida
  fortalezas: string[];           // lista de fortalezas detectadas
  debilidades: string[];          // lista de debilidades detectadas
}

// ── Estado del grafo de LangGraph ────────────────────────────────────────────

/**
 * El "estado" que fluye entre nodos del grafo de LangGraph.
 * Cada nodo puede leer y modificar este objeto.
 * Definirlo explícitamente es una de las ventajas de LangGraph:
 * sabés exactamente qué información tiene disponible cada nodo.
 */
export interface AgentState {
  question: string;                       // la pregunta original del usuario
  playerName?: string;                    // nombre del jugador extraído de la pregunta
  needsStats: boolean;                    // ¿el nodo classify decidió que necesita stats?
  needsReports: boolean;                  // ¿el nodo classify decidió que necesita reportes?
  playerStats?: PlayerStats | null;       // resultado de getPlayerStats (si se llamó)
  scoutingReports?: ScoutingReport[];     // resultado de searchScoutingReports (si se llamó)
  finalResponse?: string;                 // respuesta final armada por el nodo synthesize
}
