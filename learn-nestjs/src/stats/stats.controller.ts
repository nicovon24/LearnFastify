/**
 * STATS CONTROLLER
 *
 * Controller delgado: solo define las rutas y delega a StatsService.
 * No hay lógica de cálculo acá.
 *
 * GET /stats → todas las stats (puede ser costoso en producción, útil para demo)
 * GET /stats/player/:id → stats de un jugador específico
 */

import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { StatsService } from './stats.service';

@ApiTags('stats')
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  @ApiOperation({ summary: 'Estadísticas agregadas de todos los jugadores' })
  @ApiResponse({ status: 200, description: 'Lista de stats por jugador' })
  getAllStats() {
    return this.statsService.getAllPlayersStats();
  }

  @Get('player/:id')
  @ApiOperation({ summary: 'Estadísticas de un jugador específico' })
  @ApiResponse({ status: 200, description: 'Stats del jugador' })
  @ApiResponse({ status: 404, description: 'Jugador no encontrado' })
  getPlayerStats(@Param('id') id: string) {
    return this.statsService.getPlayerStats(id);
  }
}
