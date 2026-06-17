/**
 * JWT STRATEGY
 *
 * ¿Qué es una Strategy en Passport?
 * Passport es un middleware de autenticación que trabaja con "estrategias".
 * JwtStrategy le dice a Passport:
 *   1. De dónde extraer el token (del header Authorization: Bearer ...)
 *   2. Cómo verificar que es válido (con el secret JWT)
 *   3. Qué hacer con el payload una vez verificado (validate())
 *
 * PassportStrategy(Strategy) es la forma que NestJS tiene de integrar
 * las estrategias de Passport en el sistema de DI.
 *
 * validate() corre DESPUÉS de que Passport verificó la firma del JWT.
 * Su retorno se guarda en request.user — lo podés inyectar en el
 * controller con @Request() o con un decorator custom.
 */

import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;     // user id
  username: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      // Extrae el token del header: Authorization: Bearer <token>
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      // Si el token expiró, rechaza automáticamente el request
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET ?? 'super-secret-change-in-production',
    });
  }

  /**
   * validate() se llama con el payload decodificado del JWT.
   * Lo que retornés acá se asigna a request.user en el controller.
   */
  validate(payload: JwtPayload): JwtPayload {
    return { sub: payload.sub, username: payload.username };
  }
}
