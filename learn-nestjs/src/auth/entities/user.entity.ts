/**
 * USER ENTITY
 *
 * ¿Qué es una Entity en TypeORM?
 * Una clase decorada con @Entity() que TypeORM mapea a una tabla de la DB.
 * Cada propiedad decorada con @Column() se convierte en una columna.
 *
 * @PrimaryGeneratedColumn('uuid') → clave primaria UUID autogenerada.
 * @CreateDateColumn() / @UpdateDateColumn() → TypeORM las llena automáticamente.
 *
 * La propiedad `password` tiene select: false → TypeORM NO la incluye en
 * los queries por defecto. Hay que pedirla explícitamente con
 * .addSelect('user.password') cuando necesitás validarla (ej: en login).
 * Esto evita exponer el hash accidentalmente en respuestas de API.
 */

import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column({ unique: true })
  username: string;

  /**
   * select: false → este campo NO viene en los queries por defecto.
   * Evita exponer el hash del password en las respuestas de la API.
   */
  @Column({ select: false })
  password: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
