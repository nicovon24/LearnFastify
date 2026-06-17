/**
 * STATS SERVICE
 *
 * Esta es la parte con lógica de negocio real del proyecto.
 * No es solo CRUD — hay cálculos y agregaciones.
 *
 * Estrategia de query:
 * Para calcular las stats de un jugador necesitamos todos sus partidos.
 * Usamos un QueryBuilder de TypeORM para hacer un JOIN eficiente:
 * traemos los partidos donde el jugador aparece en la tabla pivot match_players.
 *
 * QueryBuilder vs find():
 * - find({ relations: [] }) es simple pero carga TODO (sin filtros eficientes).
 * - QueryBuilder permite JOINs selectivos, subqueries, ORDER BY, etc.
 * En producción, con muchos datos, el QB es la herramienta correcta.
 *
 * getPlayerStats() devuelve un objeto PlayerStats con las métricas calculadas.
 * Esta lógica está acá (en el service) y NO en el controller — el controller
 * solo llama a este método y devuelve el resultado.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Player } from '../players/entities/player.entity';
import { Match } from '../matches/entities/match.entity';
import { PlayerStats } from './interfaces/player-stats.interface';

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(Player)
    private readonly playerRepository: Repository<Player>,
    @InjectRepository(Match)
    private readonly matchRepository: Repository<Match>,
  ) {}

  async getPlayerStats(playerId: string): Promise<PlayerStats> {
    // Verificamos que el jugador existe
    const player = await this.playerRepository.findOneBy({ id: playerId });
    if (!player) {
      throw new NotFoundException(`Jugador con id "${playerId}" no encontrado`);
    }

    /**
     * QueryBuilder: trae todos los partidos donde este jugador participó.
     * 'match' es el alias de la entidad Match.
     * innerJoin('match.players', 'player') hace el JOIN con la tabla pivot.
     * where('player.id = :playerId') filtra por el jugador específico.
     * orderBy('match.date', 'DESC') ordena del más reciente al más antiguo.
     */
    const matches = await this.matchRepository
      .createQueryBuilder('match')
      .innerJoin('match.players', 'player')
      .where('player.id = :playerId', { playerId })
      .orderBy('match.date', 'DESC')
      .getMany();

    // Cálculo de métricas
    const matchesPlayed = matches.length;

    // Competiciones únicas en las que participó
    const competitions = [
      ...new Set(matches.map((m) => m.competition).filter(Boolean)),
    ] as string[];

    const lastMatchDate = matches.length > 0 ? matches[0].date : null;

    return {
      playerId: player.id,
      playerName: player.name,
      playerPosition: player.position,
      playerClub: player.club ?? null,
      matchesPlayed,
      competitions,
      lastMatchDate,
    };
  }

  async getAllPlayersStats(): Promise<PlayerStats[]> {
    const players = await this.playerRepository.find();
    return Promise.all(players.map((p) => this.getPlayerStats(p.id)));
  }
}
