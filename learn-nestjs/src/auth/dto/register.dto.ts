/**
 * REGISTER DTO
 *
 * ¿Qué es un DTO (Data Transfer Object)?
 * Una clase que define la forma ESPERADA del body de un request.
 * class-validator provee decoradores como @IsEmail(), @IsString(), etc.
 * que el ValidationPipe global usa para validar automáticamente.
 *
 * Si el body no cumple estas reglas, Nest devuelve un 400 Bad Request
 * con el mensaje de error correspondiente — sin que escribas
 * ningún if manual en el controller o service.
 *
 * @ApiProperty() es de @nestjs/swagger — hace que el DTO aparezca
 * documentado en la UI de /api/docs con ejemplos y tipos.
 */

import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsString,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'juan@example.com', description: 'Email del usuario' })
  @IsEmail({}, { message: 'El email no tiene un formato válido' })
  email: string;

  @ApiProperty({ example: 'juancrack', description: 'Nombre de usuario' })
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  username: string;

  @ApiProperty({
    example: 'Password1!',
    description: 'Mínimo 8 caracteres, al menos una mayúscula y un número',
  })
  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Z])(?=.*\d)/, {
    message: 'El password debe tener al menos una mayúscula y un número',
  })
  password: string;
}
