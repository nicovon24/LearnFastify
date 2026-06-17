/**
 * MATCHES CONTROLLER — TESTS UNITARIOS
 *
 * MatchesController es el más complejo porque tiene 7 endpoints,
 * incluyendo las rutas anidadas para la relación Match ↔ Player:
 *   POST   /matches/:id/players/:playerId  → addPlayer()
 *   DELETE /matches/:id/players/:playerId  → removePlayer()
 *
 * Estos tests verifican:
 * 1. Que cada método del controller llame al método correcto del service
 * 2. Que los @Param('id') y @Param('playerId') se pasen correctamente
 * 3. Que los guards JWT estén en los 5 endpoints de escritura
 * 4. Que los 2 endpoints de lectura sean públicos
 * 5. Que los errores del service se propaguen sin ser modificados
 */

import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateMatchDto } from './dto/create-match.dto';
import { UpdateMatchDto } from './dto/update-match.dto';
import { Match } from './entities/match.entity';
import { Position } from '../players/entities/player.entity';

// ─── Factories de datos de test ───────────────────────────────────────────────

const mockMatch = (overrides: Partial<Match> = {}): Match => ({
  id: 'uuid-match-1',
  homeTeam: 'River Plate',
  awayTeam: 'Boca Juniors',
  date: new Date('2024-05-11T20:00:00Z'),
  homeScore: 2,
  awayScore: 1,
  competition: 'Liga Profesional',
  players: [],
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});

// ─── Mock del MatchesService ──────────────────────────────────────────────────

const mockMatchesService = {
  findAll: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  addPlayerToMatch: jest.fn(),
  removePlayerFromMatch: jest.fn(),
};

describe('MatchesController', () => {
  let controller: MatchesController;
  let service: typeof mockMatchesService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MatchesController],
      providers: [
        { provide: MatchesService, useValue: mockMatchesService },
        {
          provide: JwtAuthGuard,
          useValue: { canActivate: jest.fn().mockReturnValue(true) },
        },
      ],
    }).compile();

    controller = module.get<MatchesController>(MatchesController);
    service = module.get(MatchesService);
  });

  afterEach(() => jest.clearAllMocks());

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  // ─── findAll() ────────────────────────────────────────────────────────────

  describe('findAll()', () => {
    it('debería retornar todos los partidos', async () => {
      const matches = [mockMatch(), mockMatch({ id: 'uuid-match-2' })];
      service.findAll.mockResolvedValue(matches);

      const result = await controller.findAll();

      expect(service.findAll).toHaveBeenCalledTimes(1);
      expect(result).toEqual(matches);
    });
  });

  // ─── findOne() ────────────────────────────────────────────────────────────

  describe('findOne()', () => {
    it('debería llamar al service con el id y retornar el partido', async () => {
      const match = mockMatch();
      service.findOne.mockResolvedValue(match);

      const result = await controller.findOne('uuid-match-1');

      expect(service.findOne).toHaveBeenCalledWith('uuid-match-1');
      expect(result).toEqual(match);
    });

    it('debería propagar el NotFoundException del service', async () => {
      service.findOne.mockRejectedValue(
        new NotFoundException('Partido con id "uuid-x" no encontrado'),
      );

      await expect(controller.findOne('uuid-x')).rejects.toThrow(NotFoundException);
    });
  });

  // ─── create() ─────────────────────────────────────────────────────────────

  describe('create()', () => {
    const createDto: CreateMatchDto = {
      homeTeam: 'River Plate',
      awayTeam: 'Boca Juniors',
      date: '2024-05-11T20:00:00Z',
      competition: 'Liga Profesional',
    };

    it('debería llamar al service con el DTO y retornar el partido creado', async () => {
      const createdMatch = mockMatch();
      service.create.mockResolvedValue(createdMatch);

      const result = await controller.create(createDto);

      expect(service.create).toHaveBeenCalledWith(createDto);
      expect(result).toEqual(createdMatch);
    });

    it('debería tener JwtAuthGuard aplicado', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MatchesController.prototype.create,
      );
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  // ─── update() ─────────────────────────────────────────────────────────────

  describe('update()', () => {
    const updateDto: UpdateMatchDto = { homeScore: 3, awayScore: 0 };

    it('debería llamar al service con id y DTO, retornar el partido actualizado', async () => {
      const updatedMatch = mockMatch({ homeScore: 3, awayScore: 0 });
      service.update.mockResolvedValue(updatedMatch);

      const result = await controller.update('uuid-match-1', updateDto);

      expect(service.update).toHaveBeenCalledWith('uuid-match-1', updateDto);
      expect(result).toEqual(updatedMatch);
    });

    it('debería tener JwtAuthGuard aplicado', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MatchesController.prototype.update,
      );
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  // ─── remove() ─────────────────────────────────────────────────────────────

  describe('remove()', () => {
    it('debería llamar al service con el id y retornar mensaje de confirmación', async () => {
      const expectedResult = { message: 'Partido eliminado' };
      service.remove.mockResolvedValue(expectedResult);

      const result = await controller.remove('uuid-match-1');

      expect(service.remove).toHaveBeenCalledWith('uuid-match-1');
      expect(result).toEqual(expectedResult);
    });

    it('debería tener JwtAuthGuard aplicado', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MatchesController.prototype.remove,
      );
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  // ─── addPlayer() — ruta anidada POST /matches/:id/players/:playerId ────────

  describe('addPlayer()', () => {
    it('debería llamar a addPlayerToMatch con matchId y playerId correctos', async () => {
      const matchConJugador = mockMatch({
        players: [
          {
            id: 'uuid-player-1',
            name: 'Messi',
            position: Position.FORWARD,
            club: 'Inter Miami CF',
            dateOfBirth: new Date(),
            nationality: 'Argentina',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });
      service.addPlayerToMatch.mockResolvedValue(matchConJugador);

      const result = await controller.addPlayer('uuid-match-1', 'uuid-player-1');

      /**
       * Verificamos que los dos @Param() se pasen como argumentos separados
       * en el orden correcto (matchId primero, playerId segundo).
       */
      expect(service.addPlayerToMatch).toHaveBeenCalledWith(
        'uuid-match-1',
        'uuid-player-1',
      );
      expect(result).toEqual(matchConJugador);
    });

    it('debería propagar BadRequestException si el jugador ya está en el partido', async () => {
      service.addPlayerToMatch.mockRejectedValue(
        new BadRequestException('El jugador ya está en este partido'),
      );

      await expect(
        controller.addPlayer('uuid-match-1', 'uuid-player-1'),
      ).rejects.toThrow(BadRequestException);
    });

    it('debería propagar NotFoundException si el partido no existe', async () => {
      service.addPlayerToMatch.mockRejectedValue(
        new NotFoundException('Partido con id "uuid-x" no encontrado'),
      );

      await expect(
        controller.addPlayer('uuid-x', 'uuid-player-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('debería tener JwtAuthGuard aplicado', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MatchesController.prototype.addPlayer,
      );
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  // ─── removePlayer() — ruta anidada DELETE /matches/:id/players/:playerId ──

  describe('removePlayer()', () => {
    it('debería llamar a removePlayerFromMatch con matchId y playerId correctos', async () => {
      const matchSinJugador = mockMatch({ players: [] });
      service.removePlayerFromMatch.mockResolvedValue(matchSinJugador);

      const result = await controller.removePlayer('uuid-match-1', 'uuid-player-1');

      expect(service.removePlayerFromMatch).toHaveBeenCalledWith(
        'uuid-match-1',
        'uuid-player-1',
      );
      expect(result).toEqual(matchSinJugador);
    });

    it('debería tener JwtAuthGuard aplicado', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MatchesController.prototype.removePlayer,
      );
      expect(guards).toContain(JwtAuthGuard);
    });
  });

  // ─── Verificación de endpoints públicos ───────────────────────────────────

  describe('Endpoints públicos — sin JwtAuthGuard', () => {
    it('findAll no debería tener JwtAuthGuard', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MatchesController.prototype.findAll,
      );
      const hasJwtGuard = guards?.includes(JwtAuthGuard) ?? false;
      expect(hasJwtGuard).toBe(false);
    });

    it('findOne no debería tener JwtAuthGuard', () => {
      const guards = Reflect.getMetadata(
        '__guards__',
        MatchesController.prototype.findOne,
      );
      const hasJwtGuard = guards?.includes(JwtAuthGuard) ?? false;
      expect(hasJwtGuard).toBe(false);
    });
  });
});
