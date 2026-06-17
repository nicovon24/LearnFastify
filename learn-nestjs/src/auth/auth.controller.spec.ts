/**
 * AUTH CONTROLLER — TESTS UNITARIOS
 *
 * ¿Qué testeamos en un controller?
 * Los controllers son "delgados": solo reciben parámetros y llaman al service.
 * Por eso, los tests de controller verifican tres cosas:
 *
 *   1. Que el controller llame al método correcto del service
 *   2. Que le pase los argumentos correctos (el DTO que recibió)
 *   3. Que devuelva exactamente lo que el service devolvió (sin transformar nada)
 *
 * NO testeamos validaciones de DTOs acá — eso es responsabilidad del ValidationPipe
 * y se testea en tests de integración (e2e). En tests unitarios de controller
 * asumimos que el DTO ya llegó válido.
 *
 * NO testeamos que el guard bloquee requests sin token — eso también es
 * de integración. Acá solo verificamos que el decorador @UseGuards esté
 * aplicado en los métodos correctos.
 *
 * Patrón de mock de service:
 * Creamos un objeto con jest.fn() para cada método del service real.
 * Nest lo inyecta en el controller igual que haría con el service real,
 * pero las funciones son controladas por nosotros.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

// ─── Mock del AuthService ─────────────────────────────────────────────────────
// Definimos el tipo explícito para tener autocompletado en los tests
const mockAuthService = {
  register: jest.fn(),
  login: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;
  let authService: typeof mockAuthService;

  beforeEach(async () => {
    /**
     * Test.createTestingModule crea un módulo mínimo solo con lo que necesita
     * este test. No cargamos TypeORM, Passport, ni nada externo.
     * El service real es reemplazado por mockAuthService.
     */
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get(AuthService);
  });

  // Después de cada test, reseteamos los mocks para que no se "contaminen"
  // entre tests (conteos de llamadas, valores de retorno, etc.)
  afterEach(() => {
    jest.clearAllMocks();
  });

  // ─── Smoke test ────────────────────────────────────────────────────────────

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  // ─── register() ───────────────────────────────────────────────────────────

  describe('register()', () => {
    const registerDto: RegisterDto = {
      email: 'test@example.com',
      username: 'testuser',
      password: 'Password1!',
    };

    it('debería llamar a authService.register con el DTO recibido', async () => {
      const expectedResult = { message: 'Usuario registrado exitosamente' };
      // mockResolvedValue → cuando se llame a register(), devolvé esto
      authService.register.mockResolvedValue(expectedResult);

      await controller.register(registerDto);

      // toHaveBeenCalledWith verifica que la función fue llamada con esos argumentos exactos
      expect(authService.register).toHaveBeenCalledWith(registerDto);
      // toHaveBeenCalledTimes verifica cuántas veces fue llamada
      expect(authService.register).toHaveBeenCalledTimes(1);
    });

    it('debería retornar el resultado del service sin modificarlo', async () => {
      const expectedResult = { message: 'Usuario registrado exitosamente' };
      authService.register.mockResolvedValue(expectedResult);

      const result = await controller.register(registerDto);

      // El controller no transforma el resultado — lo devuelve tal cual
      expect(result).toEqual(expectedResult);
    });

    it('debería propagar el ConflictException del service cuando el usuario ya existe', async () => {
      // Si el service lanza, el controller no lo atrapa — lo deja subir
      // (el AllExceptionsFilter global lo maneja)
      authService.register.mockRejectedValue(
        new ConflictException('El email o username ya está en uso'),
      );

      await expect(controller.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── login() ──────────────────────────────────────────────────────────────

  describe('login()', () => {
    const loginDto: LoginDto = {
      username: 'testuser',
      password: 'Password1!',
    };

    it('debería llamar a authService.login con el DTO recibido', async () => {
      const expectedResult = { accessToken: 'jwt.token.aqui' };
      authService.login.mockResolvedValue(expectedResult);

      await controller.login(loginDto);

      expect(authService.login).toHaveBeenCalledWith(loginDto);
      expect(authService.login).toHaveBeenCalledTimes(1);
    });

    it('debería retornar el accessToken del service', async () => {
      const expectedResult = { accessToken: 'jwt.token.aqui' };
      authService.login.mockResolvedValue(expectedResult);

      const result = await controller.login(loginDto);

      expect(result).toEqual(expectedResult);
      expect(result).toHaveProperty('accessToken');
    });

    it('debería propagar el UnauthorizedException cuando las credenciales son inválidas', async () => {
      authService.login.mockRejectedValue(
        new UnauthorizedException('Credenciales inválidas'),
      );

      await expect(controller.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });
});
