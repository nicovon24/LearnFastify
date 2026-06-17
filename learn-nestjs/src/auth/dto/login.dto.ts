import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'juancrack', description: 'Nombre de usuario' })
  @IsString()
  username: string;

  @ApiProperty({ example: 'Password1!' })
  @IsString()
  @MinLength(8)
  password: string;
}
