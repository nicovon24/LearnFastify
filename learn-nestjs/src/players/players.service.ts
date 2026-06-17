/**
 * PLAYERS SERVICE
 *
 * Toda la lógica de negocio del dominio Players vive acá.
 * El controller llama a estos métodos — no sabe nada de TypeORM.
 *
 * Repository<Player> es el objeto que TypeORM nos da para operar
 * sobre la tabla players:
 *   - find(), findOne(), findOneBy() → queries SELECT
 *   - create() → instancia la entidad (no la guarda en DB aún)
 *   - save() → INSERT o UPDATE según si la entidad tiene id o no
 *   - remove() → DELETE
 *
 * NotFoundException es una HttpException de Nest que devuelve 404 automáticamente.
 * Nunca lances Error genérico si querés control del status HTTP — usá las
 * excepciones de @nestjs/common (BadRequestException, ConflictException, etc.)
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Player } from './entities/player.entity';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';

@Injectable()
export class PlayersService {
  constructor(
    @InjectRepository(Player)
    private readonly playerRepository: Repository<Player>,
  ) {}

  async create(dto: CreatePlayerDto): Promise<Player> {
    const player = this.playerRepository.create(dto);
    return this.playerRepository.save(player);
  }

  async findAll(): Promise<Player[]> {
    return this.playerRepository.find({ order: { name: 'ASC' } });
  }

  async findOne(id: string): Promise<Player> {
    const player = await this.playerRepository.findOneBy({ id });
    if (!player) {
      throw new NotFoundException(`Jugador con id "${id}" no encontrado`);
    }
    return player;
  }

  async update(id: string, dto: UpdatePlayerDto): Promise<Player> {
    const player = await this.findOne(id); // lanza 404 si no existe
    Object.assign(player, dto);
    return this.playerRepository.save(player);
  }

  async remove(id: string): Promise<{ message: string }> {
    const player = await this.findOne(id); // lanza 404 si no existe
    await this.playerRepository.remove(player);
    return { message: `Jugador "${player.name}" eliminado` };
  }
}
