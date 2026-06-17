/**
 * JWT AUTH GUARD
 *
 * ¿Qué es un Guard?
 * Un Guard implementa CanActivate y retorna true/false para decidir
 * si un request puede continuar hacia el handler o no.
 *
 * AuthGuard('jwt') es el guard que viene con @nestjs/passport.
 * Internamente llama a JwtStrategy para validar el token.
 * Si el token es inválido o no existe, lanza automáticamente un 401.
 *
 * ¿Cómo se usa?
 * En un controller o método específico:
 *   @UseGuards(JwtAuthGuard)
 *   @Post()
 *   create(...) { ... }
 *
 * Si lo ponés a nivel de clase (@Controller + @UseGuards) protege
 * todos los endpoints de ese controller.
 *
 * En este proyecto lo aplicamos solo a los métodos de escritura
 * (POST, PUT, DELETE) de PlayersModule y MatchesModule.
 */

import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
