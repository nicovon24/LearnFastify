/**
 * PLAYER STATS INTERFACE
 *
 * Define la forma del objeto de respuesta de estadísticas.
 * No es una entidad de DB — es solo un contrato TypeScript de
 * qué datos devuelve StatsService.getPlayerStats().
 *
 * Usar interfaces para los tipos de retorno de los services
 * es una buena práctica: el controller no necesita saber cómo
 * se calcula — solo necesita saber qué forma tiene el resultado.
 */

export interface PlayerStats {
  playerId: string;
  playerName: string;
  playerPosition: string;
  playerClub: string | null;
  matchesPlayed: number;
  competitions: string[];
  lastMatchDate: Date | null;
}
