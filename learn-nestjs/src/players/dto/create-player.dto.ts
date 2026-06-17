/**
 * CREATE PLAYER DTO
 *
 * Los decoradores de class-validator hacen la validación automática:
 * el ValidationPipe global intercepta el request, instancia este DTO
 * y corre los validadores. Si algo falla, devuelve 400 antes de que
 * el controller siquiera se ejecute.
 *
 * @IsEnum(Position) → solo acepta los valores definidos en el enum.
 * @IsOptional() → el campo puede no venir en el body, y si no viene
 *                 no se valida. Sin este decorador, si el campo no viene,
 *                 el validador lo rechaza con "must not be empty".
 * @IsDateString() → valida formato ISO 8601 (ej: "1998-03-15").
 *
 * @ApiProperty() documenta el campo en Swagger con tipo, descripción y ejemplo.
 */

import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Position } from '../entities/player.entity';

export class CreatePlayerDto {
  @ApiProperty({ example: 'Lionel Messi', description: 'Nombre completo del jugador' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @ApiProperty({
    enum: Position,
    example: Position.FORWARD,
    description: 'Posición en el campo',
  })
  @IsEnum(Position, { message: `La posición debe ser uno de: ${Object.values(Position).join(', ')}` })
  position: Position;

  @ApiPropertyOptional({ example: 'Inter Miami CF' })
  @IsOptional()
  @IsString()
  club?: string;

  @ApiPropertyOptional({ example: '1987-06-24', description: 'Fecha en formato ISO 8601' })
  @IsOptional()
  @IsDateString()
  dateOfBirth?: string;

  @ApiPropertyOptional({ example: 'Argentina' })
  @IsOptional()
  @IsString()
  nationality?: string;
}
