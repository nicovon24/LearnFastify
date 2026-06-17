/**
 * AUTH MODULE
 *
 * ¿Qué hace @Module()?
 * Agrupa todo lo relacionado a autenticación:
 *  - imports: módulos externos que este módulo necesita (TypeORM, JWT, Passport)
 *  - controllers: los controllers de este dominio (rutas)
 *  - providers: services, strategies — el contenedor de DI de este módulo
 *  - exports: lo que otros módulos pueden usar (JwtAuthGuard necesita ser
 *    exportado para que PlayersModule y MatchesModule lo puedan importar/usar)
 *
 * TypeOrmModule.forFeature([User]) → registra la entidad User en este módulo.
 * Esto hace que @InjectRepository(User) funcione en AuthService.
 *
 * JwtModule.register() → configura el servicio de JWT con el secret y expiración.
 * PassportModule → necesario para que AuthGuard('jwt') funcione.
 */

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { User } from './entities/user.entity';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@Module({
  imports: [
    // Registra la entidad User para que @InjectRepository(User) funcione en AuthService
    TypeOrmModule.forFeature([User]),
    // PassportModule es el adaptador de Nest para Passport.js
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'super-secret-change-in-production',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy, // la estrategia se registra como provider para que Passport la encuentre
    JwtAuthGuard,
  ],
  exports: [
    JwtAuthGuard, // exportamos el guard para que otros módulos lo usen
    JwtModule,    // exportamos JwtModule por si otro módulo necesita JwtService
  ],
})
export class AuthModule {}
