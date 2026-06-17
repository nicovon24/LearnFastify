/**
 * PLAYER ENTITY
 *
 * Cada propiedad decorada con @Column() se convierte en una columna en Postgres.
 *
 * @ManyToMany con Match:
 * Un jugador puede participar en muchos partidos, y un partido
 * tiene muchos jugadores. Esta relación requiere una tabla intermedia
 * (player_matches) que TypeORM crea automáticamente con @JoinTable().
 * @JoinTable() va en el lado "dueño" de la relación (el que define la tabla pivot).
 *
 * nullable: true en algunas columnas → el jugador se puede crear sin
 * toda la info y completarla después (ej: si no sabés el club actual).
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum Position {
  GOALKEEPER = 'goalkeeper',
  DEFENDER = 'defender',
  MIDFIELDER = 'midfielder',
  FORWARD = 'forward',
}

@Entity('players')
export class Player {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: Position })
  position: Position;

  @Column({ nullable: true })
  club: string;

  @Column({ type: 'date', nullable: true })
  dateOfBirth: Date;

  @Column({ nullable: true })
  nationality: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
