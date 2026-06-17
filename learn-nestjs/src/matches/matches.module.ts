/**
 * MATCHES MODULE
 *
 * forFeature([Match, Player]) → necesitamos inyectar el repositorio de Player
 * también, porque MatchesService.addPlayerToMatch() lo usa para verificar
 * que el jugador existe. Registrarlo acá no crea conflicto con PlayersModule
 * porque TypeORM soporta múltiples repositorios de la misma entidad.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Match } from './entities/match.entity';
import { Player } from '../players/entities/player.entity';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Match, Player]),
    AuthModule,
  ],
  controllers: [MatchesController],
  providers: [MatchesService],
  exports: [MatchesService], // StatsModule lo necesita
})
export class MatchesModule {}
