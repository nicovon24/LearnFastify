/**
 * PLAYERS MODULE
 *
 * Este módulo importa AuthModule para poder usar JwtAuthGuard en el controller.
 * TypeOrmModule.forFeature([Player]) registra el repositorio de Player
 * para que @InjectRepository(Player) funcione en PlayersService.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Player } from './entities/player.entity';
import { PlayersService } from './players.service';
import { PlayersController } from './players.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Player]),
    AuthModule, // necesario para JwtAuthGuard
  ],
  controllers: [PlayersController],
  providers: [PlayersService],
  exports: [PlayersService], // StatsModule lo va a necesitar
})
export class PlayersModule {}
