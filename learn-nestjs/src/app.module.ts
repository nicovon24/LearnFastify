/**
 * APP MODULE — Módulo raíz de la aplicación
 *
 * ¿Qué hace @Module()?
 * Es el decorador que convierte una clase TypeScript en un módulo de Nest.
 * El módulo raíz (AppModule) es el punto de entrada del grafo de dependencias:
 * registra la conexión a DB y luego importa todos los feature modules.
 *
 * Nest construye un grafo de dependencias a partir de estos imports y
 * resuelve automáticamente qué providers están disponibles en cada módulo.
 *
 * Estructura de imports:
 *  - TypeOrmModule.forRoot() → configura la conexión global a PostgreSQL.
 *    Cada feature module luego llama a TypeOrmModule.forFeature([Entity])
 *    para registrar sus propias entidades.
 *  - Los feature modules (Auth, Players, Matches, Stats) se importan acá
 *    para que Nest los conozca al arrancar.
 */

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { PlayersModule } from './players/players.module';
import { MatchesModule } from './matches/matches.module';
import { StatsModule } from './stats/stats.module';

@Module({
  imports: [
    /**
     * ConfigModule.forRoot() → carga variables de entorno desde .env
     * isGlobal: true → disponibles en toda la app sin importar el módulo
     */
    ConfigModule.forRoot({ isGlobal: true }),
    /**
     * TypeOrmModule.forRoot() — conexión global a PostgreSQL.
     *
     * synchronize: true → TypeORM crea/modifica las tablas automáticamente
     * a partir de las entidades. SOLO para desarrollo — en producción
     * usarías migraciones (TypeORM migrations o un tool externo).
     *
     * autoLoadEntities: true → en vez de listar todas las entidades acá,
     * Nest las registra automáticamente cuando cada módulo hace
     * TypeOrmModule.forFeature([SuEntidad]).
     */
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST ?? 'localhost',
      port: parseInt(process.env.DB_PORT ?? '5432'),
      username: process.env.DB_USER ?? 'postgres',
      password: process.env.DB_PASSWORD ?? 'postgres',
      database: process.env.DB_NAME ?? 'player_stats',
      autoLoadEntities: true,
      synchronize: true,
    }),

    // Feature modules — cada uno encapsula su propio dominio
    AuthModule,
    PlayersModule,
    MatchesModule,
    StatsModule,
  ],
})
export class AppModule {}
