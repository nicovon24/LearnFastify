/**
 * MATCH ENTITY
 *
 * Relación ManyToMany con Player:
 *
 * @ManyToMany(() => Player, (player) => player.matches)
 * Un partido tiene muchos jugadores y un jugador tiene muchos partidos.
 * TypeORM necesita una tabla pivot para esto — se crea automáticamente
 * como "match_players" gracias a @JoinTable().
 *
 * @JoinTable() va solo en UN lado de la relación (el "dueño").
 * En el otro lado (Player) se usa solo @ManyToMany sin @JoinTable.
 *
 * { eager: false } → los players NO se cargan automáticamente en cada query.
 * Para cargarlos, tenés que pedirlos explícitamente con relations: ['players']
 * o en un QueryBuilder con .leftJoinAndSelect().
 * Esto es importante para performance: no querés cargar datos que no necesitás.
 *
 * Campos de resultado:
 * homeScore/awayScore son nullable → el partido puede cargarse antes de jugarse.
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Player } from '../../players/entities/player.entity';

@Entity('matches')
export class Match {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  homeTeam: string;

  @Column()
  awayTeam: string;

  @Column({ type: 'timestamp' })
  date: Date;

  @Column({ nullable: true })
  homeScore: number;

  @Column({ nullable: true })
  awayScore: number;

  @Column({ nullable: true })
  competition: string;

  /**
   * @ManyToMany + @JoinTable → crea la tabla pivot "match_players"
   * { eager: false } → no cargar los jugadores en cada query por defecto
   */
  @ManyToMany(() => Player, { eager: false })
  @JoinTable({ name: 'match_players' })
  players: Player[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
