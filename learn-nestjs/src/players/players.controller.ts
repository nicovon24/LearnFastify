/**
 * PLAYERS CONTROLLER
 *
 * Define las rutas del dominio Players bajo el prefijo /players.
 *
 * Patrón de auth en este controller:
 *   - GET /players y GET /players/:id → públicos (sin @UseGuards)
 *   - POST, PATCH, DELETE → protegidos con @UseGuards(JwtAuthGuard)
 *
 * ¿Por qué aplicar el guard a nivel método y no a nivel clase?
 * Porque queremos granularidad: lectura pública, escritura protegida.
 * Si lo aplicás a nivel clase con @UseGuards(JwtAuthGuard) en @Controller,
 * TODOS los endpoints requieren JWT — incluso los GETs.
 *
 * @ApiBearerAuth('JWT') → le dice a Swagger que ese endpoint requiere
 * el token JWT para poder probarlo desde la UI de /api/docs.
 *
 * @Param('id') → extrae el parámetro :id de la URL.
 * @Body() → extrae y valida el body contra el DTO.
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
import { PlayersService } from './players.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('players')
@Controller('players')
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  // ─── Endpoints PÚBLICOS ────────────────────────────────────────────────────

  @Get()
  @ApiOperation({ summary: 'Listar todos los jugadores' })
  @ApiResponse({ status: 200, description: 'Lista de jugadores' })
  findAll() {
    return this.playersService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un jugador por ID' })
  @ApiResponse({ status: 200, description: 'Datos del jugador' })
  @ApiResponse({ status: 404, description: 'Jugador no encontrado' })
  findOne(@Param('id') id: string) {
    return this.playersService.findOne(id);
  }

  // ─── Endpoints PROTEGIDOS con JWT ─────────────────────────────────────────

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Crear un nuevo jugador (requiere JWT)' })
  @ApiResponse({ status: 201, description: 'Jugador creado' })
  @ApiResponse({ status: 401, description: 'No autenticado' })
  create(@Body() dto: CreatePlayerDto) {
    return this.playersService.create(dto);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Actualizar un jugador (requiere JWT)' })
  update(@Param('id') id: string, @Body() dto: UpdatePlayerDto) {
    return this.playersService.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT')
  @ApiOperation({ summary: 'Eliminar un jugador (requiere JWT)' })
  remove(@Param('id') id: string) {
    return this.playersService.remove(id);
  }
}
