/**
 * PLAYERS CONTROLLER — TESTS UNITARIOS
 *
 * Este es el spec más completo del proyecto porque Players tiene 5 endpoints
 * con dos niveles de acceso (público y protegido por JWT).
 *
 * ¿Cómo testeamos los Guards?
 * En tests unitarios NO simulamos el proceso completo de autenticación HTTP.
 * En cambio, inspeccionamos los metadatos de los decoradores usando Reflect.
 * NestJS usa el sistema de metadata de TypeScript para guardar la info de
 * @UseGuards(), @Get(), etc. en la clase.
 *
 * Reflect.getMetadata('__guards__', Controller.prototype.method)
 * nos devuelve el array de guards registrados en ese método.
 * Así podemos verificar que @UseGuards(JwtAuthGuard) está en POST/PATCH/DELETE
 * sin necesitar levantar un servidor HTTP real.
 *
 * ¿Por qué es importante testear que los guards están aplicados?
 * Si alguien borra el @UseGuards(JwtAuthGuard) de un método de escritura
 * por accidente, el endpoint queda desprotegido. Este test lo detectaría
 * inmediatamente aunque no haya un e2e corriendo.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePlayerDto } from './dto/update-player.dto';
import { Player, Position } from './entities/player.entity';

// ─── Factories de datos de test ───────────────────────────────────────────────

const mockPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: 'uuid-player-1',
  name: 'Lionel Messi',
  position: Position.FORWARD,
  club: 'Inter Miami CF',
  dateOfBirth: new Date('1987-06-24'),
  nationality: 'Argentina',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

// ─── Mock del PlayersService ──────────────────────────────────────────────────

const mockPlayersService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
};

describe('PlayersController', () => {
  let controller: PlayersController;
  let service: typeof mockPlayersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PlayersController],
      providers: [
        { provide: PlayersService, useValue: mockPlayersService },
        /**
         * Sobreescribimos JwtAuthGuard para que en tests unitarios
         * siempre permita pasar (canActivate: true).
         * Así podemos testear la lógica del controller sin preocuparnos
         * por el token JWT — eso lo testea el guard en su propio spec.
         */
        {
          provide: JwtAuthGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
      ],
    }).compile();

    controller = module.get<PlayersController>(PlayersController);
    service = module.get(PlayersService);
  });

  afterEach(() => jest.clearAllMocks());

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  // ─── findAll() ────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('debería retornar la lista de jugadores del service', async () => {
      const players = [mockPlayer(), mockPlayer({ id: 'uuid-2', name: 'Cristiano Ronaldo' })];
      service.findAll.mockResolvedValue(players);

      const result = await controller.findAll();

      expect(service.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual(players);
      expect(result).toHaveLength(2);
    });

    it('debería retornar array vacío si no hay jugadores', async () => {
      service.findAll.mockResolvedValue([]);

      const result = await controller.findAll();

      expect(result).toEqual([]);
    });
  });

  // ─── findOne() ────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('debería llamar al service con el id correcto y retornar el jugador', async () => {
      const player = mockPlayer();
      service.findOne.mockResolvedValue(player);

      const result = await controller.findOne('uuid-player-1');

      expect(service.findOne).toHaveBeenCalledWith('uuid-player-1');
      expect(result).toEqual(player);
    });

    it('debería propagar el NotFoundException cuando el jugador no existe', async () => {
      service.findOne.mockRejectedValue(
        new NotFoundException('Jugador con id "uuid-inexistente" no encontrado'),
      );

      await expect(controller.findOne('uuid-inexistente')).rejects.toThrow(
        NotFoundException,
      );
      expect(service.findOne).toHaveBeenCalledWith('uuid-inexistente');
    });
  });

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    const createDto: CreatePlayerDto = {
      name: 'Lionel Messi',
      position: Position.FORWARD,
      club: 'Inter Miami CF',
      nationality: 'Argentina',
    };

    it('debería llamar al service con el DTO y retornar el jugador creado', async () => {
      const createdPlayer = mockPlayer();
      service.create.mockResolvedValue(createdPlayer);

      const result = await controller.create(createDto);

      expect(service.create).toHaveBeenCalledWith(createDto);
      expect(result).toEqual(createdPlayer);
    });

    it('debería tener JwtAuthGuard aplicado (verificación de metadatos)', () => {
      /**
       * Reflect.getMetadata extrae los guards registrados en el método create.
       * Esto verifica en compile-time que @UseGuards(JwtAuthGuard) está ahí.
       * Si alguien lo borra por accidente, este test falla.
       */
      const guards = Reflect.getMetadata(
        '__guards__',
        PlayersController.prototype.create,
      );
      expect(guards).toBeDefined();
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  // ─── update() ─────────────────────────────────────────────────────────────

  describe('update()', () => {
    const updateDto: UpdatePlayerDto = { club: 'Al-Nassr' };

    it('debería llamar al service con id y DTO, y retornar el jugador actualizado', async () => {
      const updatedPlayer = mockPlayer({ club: 'Al-Nassr' });
      service.update.mockResolvedValue(updatedPlayer);

      const result = await controller.update('uuid-player-1', updateDto);

      expect(service.update).toHaveBeenCalledWith('uuid-player-1', updateDto);
      expect(result).toEqual(updatedPlayer);
    });

    it('debería propagar el NotFoundException si el jugador no existe', async () => {
      service.update.mockRejectedValue(
        new NotFoundException('Jugador con id "uuid-x" no encontrado'),
      );

      await expect(controller.update('uuid-x', updateDto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('debería tener JwtAuthGuard aplicado', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        PlayersController.prototype.update,
      );
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  // ─── remove() ─────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('debería llamar al service con el id y retornar el mensaje de confirmación', async () => {
      const expectedResult = { message: 'Jugador "Lionel Messi" eliminado' };
      service.remove.mockResolvedValue(expectedResult);

      const result = await controller.remove('uuid-player-1');

      expect(service.remove).toHaveBeenCalledWith('uuid-player-1');
      expect(result).toEqual(expectedResult);
    });

    it('debería propagar el NotFoundException si el jugador no existe', async () => {
      service.remove.mockRejectedValue(
        new NotFoundException('Jugador con id "uuid-x" no encontrado'),
      );

      await expect(controller.remove('uuid-x')).rejects.toThrow(NotFoundException);
    });

    it('debería tener JwtAuthGuard aplicado', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        PlayersController.prototype.remove,
      );
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  // ─── Verificación de endpoints PÚBLICOS (sin guard) ───────────────────────

  describe('Endpoints públicos — sin JwtAuthGuard', () => {
    it('findAll no debería tener JwtAuthGuard', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        PlayersController.prototype.findAll,
      );
      // El método público no tiene guards aplicados → undefined o array vacío
      const hasJwtGuard = guards?.includes(JwtAuthGuard) ?? false;
      expect(hasJwtGuard).toBe(false);
    });

    it('findOne no debería tener JwtAuthGuard', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        PlayersController.prototype.findOne,
      );
      const hasJwtGuard = guards?.includes(JwtAuthGuard) ?? false;
      expect(hasJwtGuard).toBe(false);
    });
  });
});
