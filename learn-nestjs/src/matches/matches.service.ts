/**
 * MATCHES SERVICE
 *
 * Muestra cómo trabajar con relaciones en TypeORM:
 *
 * addPlayerToMatch():
 * Para agregar un jugador a un partido necesitamos cargar la relación
 * "players" del partido (que por defecto no se carga — eager: false).
 * Lo hacemos con relations: ['players'] en el findOne.
 * Luego simplemente pusheamos el player al array y guardamos el partido.
 * TypeORM se encarga de insertar la fila en la tabla pivot match_players.
 *
 * Esto ilustra el patrón de TypeORM para relaciones ManyToMany:
 * cargar la entidad con sus relaciones → modificar el array → save().
 */

import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Match } from './entities/match.entity';
import { Player } from '../players/entities/player.entity';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';

@Injectable()
export class MatchesService {
  constructor(
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,
    @InjectRepository(Player)
    private readonly playerRepository: Repository<Player>,
  ) {}

  async create(dto: CreateMatchDto): Promise<Match> {
    const match = this.matchRepository.create({
      ...dto,
      date: new Date(dto.date),
      players: [],
    });
    return this.matchRepository.save(match);
  }

  async findAll(): Promise<Match[]> {
    // Incluimos la relación 'players' para que cada partido traiga su lista
    return this.matchRepository.find({
      relations: { players: true },
      order: { date: 'DESC' },
    });
  }

  async findOne(id: string): Promise<Match> {
    const match = await this.matchRepository.findOne({
      where: { id },
      relations: { players: true },
    });
    if (!match) {
      throw new NotFoundException(`Partido con id "${id}" no encontrado`);
    }
    return match;
  }

  async update(id: string, dto: UpdateMatchDto): Promise<Match> {
    const match = await this.findOne(id);
    Object.assign(match, {
      ...dto,
      ...(dto.date ? { date: new Date(dto.date) } : {}),
    });
    return this.matchRepository.save(match);
  }

  async remove(id: string): Promise<{ message: string }> {
    const match = await this.findOne(id);
    await this.matchRepository.remove(match);
    return { message: `Partido eliminado` };
  }

  /**
   * Agregar un jugador a un partido.
   * Ilustra el manejo de relaciones ManyToMany en TypeORM:
   * cargamos la relación, verificamos que no esté duplicado,
   * pusheamos y guardamos.
   */
  async addPlayerToMatch(matchId: string, playerId: string): Promise<Match> {
    const match = await this.findOne(matchId); // ya incluye relations: ['players']

    const player = await this.playerRepository.findOneBy({ id: playerId });
    if (!player) {
      throw new NotFoundException(`Jugador con id "${playerId}" no encontrado`);
    }

    const alreadyAdded = match.players.some((p) => p.id === playerId);
    if (alreadyAdded) {
      throw new BadRequestException('El jugador ya está en este partido');
    }

    match.players.push(player);
    return this.matchRepository.save(match);
  }

  /**
   * Remover un jugador de un partido.
   */
  async removePlayerFromMatch(matchId: string, playerId: string): Promise<Match> {
    const match = await this.findOne(matchId);
    match.players = match.players.filter((p) => p.id !== playerId);
    return this.matchRepository.save(match);
  }
}
