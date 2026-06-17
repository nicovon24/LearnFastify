import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateMatchDto {
  @ApiProperty({ example: 'River Plate' })
  @IsString()
  homeTeam: string;

  @ApiProperty({ example: 'Boca Juniors' })
  @IsString()
  awayTeam: string;

  @ApiProperty({ example: '2024-05-11T20:00:00Z', description: 'Fecha y hora del partido' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ example: 2, description: 'Goles del equipo local' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  homeScore?: number;

  @ApiPropertyOptional({ example: 1, description: 'Goles del equipo visitante' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  awayScore?: number;

  @ApiPropertyOptional({ example: 'Liga Profesional' })
  @IsOptional()
  @IsString()
  competition?: string;
}
