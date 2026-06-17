/**
 * STATS CONTROLLER — TESTS UNITARIOS
 *
 * StatsController es el más simple: solo 2 endpoints, ambos públicos,
 * sin guards ni DTOs de entrada.
 *
 * Igual que los otros controllers, verificamos:
 * 1. Que cada método llame al service correcto con los argumentos correctos
 * 2. Que devuelva el resultado del service sin modificarlo
 * 3. Que los errores (ej: jugador no encontrado) se propaguen
 *
 * Este spec también sirve como ejemplo de cómo testear un controller
 * cuando el service tiene lógica de negocio compleja (el service
 * en sí ya tiene su propio spec con los tests de esa lógica).
 * La separación es clara: stats.service.spec.ts testea los cálculos,
 * stats.controller.spec.ts testea que el controller delega correctamente.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { PlayerStats } from './interfaces/player-stats.interface';
import { Position } from '../players/entities/player.entity';

// ─── Factories de datos de test ───────────────────────────────────────────────

const mockPlayerStats = (overrides: Partial<PlayerStats> = {}): PlayerStats => ({
  playerId: 'uuid-player-1',
  playerName: 'Lionel Messi',
  playerPosition: Position.FORWARD,
  playerClub: 'Inter Miami CF',
  matchesPlayed: 10,
  competitions: ['MLS', 'Copa América'],
  lastMatchDate: new Date('2024-06-01'),
  ...overrides,
});

// ─── Mock del StatsService ────────────────────────────────────────────────────

const mockStatsService = {
  getAllPlayersStats: jest.fn(),
  getPlayerStats: jest.fn(),
};

describe('StatsController', () => {
  let controller: StatsController;
  let service: typeof mockStatsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StatsController],
      providers: [
        { provide: StatsService, useValue: mockStatsService },
      ],
    }).compile();

    controller = module.get<StatsController>(StatsController);
    service = module.get(StatsService);
  });

  afterEach(() => jest.clearAllMocks());

  it('debería estar definido', () => {
    expect(controller).toBeDefined();
  });

  // ─── getAllStats() → GET /stats ────────────────────────────────────────────

  describe('getAllStats()', () => {
    it('debería llamar a statsService.getAllPlayersStats y retornar el resultado', async () => {
      const allStats = [
        mockPlayerStats(),
        mockPlayerStats({ playerId: 'uuid-2', playerName: 'Cristiano Ronaldo', matchesPlayed: 8 }),
      ];
      service.getAllPlayersStats.mockResolvedValue(allStats);

      const result = await controller.getAllStats();

      expect(service.getAllPlayersStats).toHaveBeenCalledTimes(1);
      // getAllPlayersStats no recibe argumentos
      expect(service.getAllPlayersStats).toHaveBeenCalledWith();
      expect(result).toEqual(allStats);
      expect(result).toHaveLength(2);
    });

    it('debería retornar array vacío si no hay jugadores', async () => {
      service.getAllPlayersStats.mockResolvedValue([]);

      const result = await controller.getAllStats();

      expect(result).toEqual([]);
    });

    it('debería retornar stats con la estructura correcta', async () => {
      const stats = mockPlayerStats();
      service.getAllPlayersStats.mockResolvedValue([stats]);

      const result = await controller.getAllStats() as PlayerStats[];

      expect(result[0]).toHaveProperty('playerId');
      expect(result[0]).toHaveProperty('playerName');
      expect(result[0]).toHaveProperty('matchesPlayed');
      expect(result[0]).toHaveProperty('competitions');
      expect(result[0]).toHaveProperty('lastMatchDate');
    });
  });

  // ─── getPlayerStats() → GET /stats/player/:id ─────────────────────────────

  describe('getPlayerStats()', () => {
    it('debería llamar a statsService.getPlayerStats con el id y retornar las stats', async () => {
      const stats = mockPlayerStats();
      service.getPlayerStats.mockResolvedValue(stats);

      const result = await controller.getPlayerStats('uuid-player-1');

      expect(service.getPlayerStats).toHaveBeenCalledWith('uuid-player-1');
      expect(service.getPlayerStats).toHaveBeenCalledTimes(1);
      expect(result).toEqual(stats);
    });

    it('debería propagar el NotFoundException cuando el jugador no existe', async () => {
      service.getPlayerStats.mockRejectedValue(
        new NotFoundException('Jugador con id "uuid-x" no encontrado'),
      );

      await expect(controller.getPlayerStats('uuid-x')).rejects.toThrow(
        NotFoundException,
      );
      // Verificamos que el id incorrecto fue el que se pasó al service
      expect(service.getPlayerStats).toHaveBeenCalledWith('uuid-x');
    });

    it('debería retornar matchesPlayed correcto para jugador sin partidos', async () => {
      const statsConCero = mockPlayerStats({
        matchesPlayed: 0,
        competitions: [],
        lastMatchDate: null,
      });
      service.getPlayerStats.mockResolvedValue(statsConCero);

      const result = await controller.getPlayerStats('uuid-player-sin-partidos') as PlayerStats;

      expect(result.matchesPlayed).toBe(0);
      expect(result.competitions).toEqual([]);
      expect(result.lastMatchDate).toBeNull();
    });

    it('debería retornar las competiciones correctas', async () => {
      const stats = mockPlayerStats({ competitions: ['MLS', 'Copa América', 'Leagues Cup'] });
      service.getPlayerStats.mockResolvedValue(stats);

      const result = await controller.getPlayerStats('uuid-player-1') as PlayerStats;

      expect(result.competitions).toHaveLength(3);
      expect(result.competitions).toContain('MLS');
      expect(result.competitions).toContain('Copa América');
    });
  });
});
