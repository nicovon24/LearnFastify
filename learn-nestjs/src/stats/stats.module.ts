import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Player } from '../players/entities/player.entity';
import { Match } from '../matches/entities/match.entity';
import { StatsService } from './stats.service';
import { StatsController } from './stats.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Player, Match])],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
