/**
 * UPDATE PLAYER DTO
 *
 * PartialType(CreatePlayerDto) → utilidad de @nestjs/swagger que genera
 * un tipo nuevo donde TODOS los campos de CreatePlayerDto son opcionales.
 *
 * ¿Por qué es valioso?
 * Para el endpoint PATCH (actualización parcial), no querés repetir
 * toda la definición del DTO pero marcando cada campo con @IsOptional().
 * PartialType lo hace por vos automáticamente, y además preserva los
 * decoradores de Swagger para que /api/docs lo muestre correctamente.
 *
 * Si usaras @nestjs/mapped-types (sin swagger), usarías PartialType de ahí.
 * Con @nestjs/swagger, usás el de swagger para que la documentación funcione.
 */

import { PartialType } from '@nestjs/swagger';
import { CreatePlayerDto } from './create-player.dto';

export class UpdatePlayerDto extends PartialType(CreatePlayerDto) {}
