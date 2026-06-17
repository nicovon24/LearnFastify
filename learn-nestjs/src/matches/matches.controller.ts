/**
 * MATCHES CONTROLLER
 *
 * Incluye rutas anidadas para la relación Match ↔ Player:
 *   POST /matches/:id/players/:playerId → agregar jugador al partido
 *   DELETE /matches/:id/players/:playerId → quitar jugador del partido
 *
 * Esta es una convención REST para manejar relaciones:
 * el recurso secundario (player) vive bajo el recurso primario (match).
 *
 * Los endpoints de escritura están protegidos con JwtAuthGuard.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { MatchesService } from './matches.service';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('matches')
@Controller('matches')
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get()
  @ApiOperation({ summary: 'Listar todos los partidos' })
  findAll() {
    return this.matchesService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un partido por ID' })
  findOne(@Param('id') id: string) {
    return this.matchesService.findOne(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Crear un partido (requiere JWT)' })
  create(@Body() dto: CreateMatchDto) {
    return this.matchesService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Actualizar un partido (requiere JWT)' })
  update(@Param('id') id: string, @Body() dto: UpdateMatchDto) {
    return this.matchesService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Eliminar un partido (requiere JWT)' })
  remove(@Param('id') id: string) {
    return this.matchesService.remove(id);
  }

  // ─── Rutas de relación Match ↔ Player ─────────────────────────────────────

  @Post(':id/players/:playerId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Agregar jugador a un partido (requiere JWT)' })
  @ApiResponse({ status: 201, description: 'Jugador agregado al partido' })
  @ApiResponse({ status: 400, description: 'Jugador ya está en el partido' })
  addPlayer(@Param('id') id: string, @Param('playerId') playerId: string) {
    return this.matchesService.addPlayerToMatch(id, playerId);
  }

  @Delete(':id/players/:playerId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Quitar jugador de un partido (requiere JWT)' })
  removePlayer(@Param('id') id: string, @Param('playerId') playerId: string) {
    return this.matchesService.removePlayerFromMatch(id, playerId);
  }
}
