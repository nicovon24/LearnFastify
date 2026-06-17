/**
 * AUTH CONTROLLER
 *
 * ¿Qué hace un Controller?
 * Recibe requests HTTP y delega a los services. Nada más.
 * No hay lógica de negocio acá — solo "qué ruta, qué método, qué DTO".
 *
 * @Controller('auth') → todas las rutas de este controller tienen el prefijo /auth
 * @ApiTags('auth') → agrupa los endpoints en la UI de Swagger
 *
 * Los controllers deben ser "delgados":
 *   - Reciben el DTO ya validado (el ValidationPipe lo hizo antes)
 *   - Llaman a authService.método(dto)
 *   - Devuelven el resultado
 *
 * Si empezás a escribir lógica de negocio en el controller (ifs, queries a DB,
 * transformaciones), es una señal de que debería ir en el service.
 */

import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  /**
   * Constructor injection — Nest inyecta AuthService automáticamente
   * porque está registrado como provider en AuthModule.
   */
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Registrar un nuevo usuario' })
  @ApiResponse({ status: 201, description: 'Usuario registrado exitosamente' })
  @ApiResponse({ status: 409, description: 'Email o username ya existe' })
  register(@Body() dto: RegisterDto) {
    // @Body() dto → Nest extrae el body del request y lo castea al DTO.
    // El ValidationPipe ya validó que cumple las reglas antes de llegar acá.
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK) // login exitoso → 200, no 201
  @ApiOperation({ summary: 'Login y obtención de JWT' })
  @ApiResponse({ status: 200, description: 'Retorna el accessToken JWT' })
  @ApiResponse({ status: 401, description: 'Credenciales inválidas' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
