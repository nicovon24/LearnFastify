/**
 * STATS SERVICE — TEST UNITARIO
 *
 * ¿Por qué testear con un módulo de testing y no instanciar el service directo?
 * StatsService tiene dependencias inyectadas (playerRepository, matchRepository).
 * Si instanciás new StatsService() tenés que pasarlas manualmente, lo que
 * es frágil. Nest provee Test.createTestingModule() que simula el contenedor
 * de DI y permite inyectar mocks de forma limpia.
 *
 * ¿Qué es un mock de repositorio?
 * Un objeto JavaScript que tiene la MISMA interfaz que Repository<T> de TypeORM,
 * pero en vez de hablar con la DB, devuelve valores que vos controlás.
 * Esto hace los tests rápidos (sin DB) y deterministas (sin datos reales).
 *
 * getRepositoryToken(Entity) → el token que Nest usa internamente para
 * registrar los repositories. Lo usamos para sobreescribirlo con nuestro mock.
 *
 * jest.fn() → función mock de Jest que podés controlar con .mockResolvedValue()
 * (para simular async) o .mockReturnValue() (para sync).
 */

import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { StatsService } from './stats.service';
import { Player, Position } from '../players/entities/player.entity';
import { Match } from '../matches/entities/match.entity';

// ─── Factories de datos de test ───────────────────────────────────────────────

const mockPlayer = (overrides: Partial<Player> = {}): Player => ({
  id: 'player-uuid-1',
  name: 'Lionel Messi',
  position: Position.FORWARD,
  club: 'Inter Miami CF',
  dateOfBirth: new Date('1987-06-24'),
  nationality: 'Argentina',
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const mockMatch = (overrides: Partial<Match> = {}): Match => ({
  id: 'match-uuid-1',
  homeTeam: 'Inter Miami CF',
  awayTeam: 'LA Galaxy',
  date: new Date('2024-05-11'),
  homeScore: 3,
  awayScore: 1,
  competition: 'MLS',
  players: [],
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ─── Mock del QueryBuilder ─────────────────────────────────────────────────────
// TypeORM usa un QueryBuilder encadenado. Tenemos que mockear cada método.
const createQueryBuilderMock = (matches: Match[]) => ({
  innerJoin: jest.fn().mockReturnThis(),  // .mockReturnThis() → retorna el mismo objeto
  where: jest.fn().mockReturnThis(),      // así el encadenamiento funciona
  orderBy: jest.fn().mockReturnThis(),
  getMany: jest.fn().mockResolvedValue(matches),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('StatsService', () => {
  let service: StatsService;

  // Guardamos referencias a los mocks para poder configurarlos en cada test
  let playerRepositoryMock: {
    findOneBy: jest.Mock;
    find: jest.Mock;
  };
  let matchRepositoryMock: {
    createQueryBuilder: jest.Mock;
  };

  beforeEach(async () => {
    playerRepositoryMock = {
      findOneBy: jest.fn(),
      find: jest.fn(),
    };

    matchRepositoryMock = {
      createQueryBuilder: jest.fn(),
    };

    /**
     * Test.createTestingModule() → crea un módulo de Nest para testing.
     * providers → registramos:
     *   1. El service que queremos testear (StatsService)
     *   2. Los mocks de sus dependencias, usando getRepositoryToken()
     *      para que Nest los inyecte en lugar de los repositorios reales.
     */
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StatsService,
        {
          provide: getRepositoryToken(Player),
          useValue: playerRepositoryMock,
        },
        {
          provide: getRepositoryToken(Match),
          useValue: matchRepositoryMock,
        },
      ],
    }).compile();

    // module.get() extrae el service ya instanciado con las dependencias mockeadas
    service = module.get<StatsService>(StatsService);
  });

  // ─── Test: jugador no encontrado ──────────────────────────────────────────

  describe('getPlayerStats', () => {
    it('debería lanzar NotFoundException si el jugador no existe', async () => {
      // Configuramos el mock para que devuelva null (jugador no existe)
      playerRepositoryMock.findOneBy.mockResolvedValue(null);

      // expect(...).rejects → el método async debe lanzar una excepción
      await expect(service.getPlayerStats('id-inexistente')).rejects.toThrow(
        NotFoundException,
      );

      expect(playerRepositoryMock.findOneBy).toHaveBeenCalledWith({
        id: 'id-inexistente',
      });
    });

    // ─── Test: jugador sin partidos ──────────────────────────────────────────

    it('debería retornar stats con matchesPlayed=0 si el jugador no tiene partidos', async () => {
      const player = mockPlayer();
      playerRepositoryMock.findOneBy.mockResolvedValue(player);

      // QB que devuelve array vacío
      matchRepositoryMock.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock([]),
      );

      const stats = await service.getPlayerStats(player.id);

      expect(stats.matchesPlayed).toBe(0);
      expect(stats.lastMatchDate).toBeNull();
      expect(stats.competitions).toEqual([]);
      expect(stats.playerName).toBe(player.name);
    });

    // ─── Test: jugador con partidos ──────────────────────────────────────────

    it('debería calcular correctamente las stats con múltiples partidos', async () => {
      const player = mockPlayer();
      const matches = [
        mockMatch({ date: new Date('2024-06-01'), competition: 'MLS' }),
        mockMatch({ id: 'match-uuid-2', date: new Date('2024-05-15'), competition: 'MLS' }),
        mockMatch({ id: 'match-uuid-3', date: new Date('2024-04-20'), competition: 'Copa América' }),
      ];

      playerRepositoryMock.findOneBy.mockResolvedValue(player);
      matchRepositoryMock.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock(matches),
      );

      const stats = await service.getPlayerStats(player.id);

      expect(stats.matchesPlayed).toBe(3);
      // Competiciones únicas (MLS aparece 2 veces pero solo cuenta 1)
      expect(stats.competitions).toHaveLength(2);
      expect(stats.competitions).toContain('MLS');
      expect(stats.competitions).toContain('Copa América');
      // lastMatchDate es el más reciente (los matches vienen orderBy DESC)
      expect(stats.lastMatchDate).toEqual(new Date('2024-06-01'));
    });

    // ─── Test: competiciones únicas ──────────────────────────────────────────

    it('debería deduplicar las competiciones', async () => {
      const player = mockPlayer();
      const matches = [
        mockMatch({ competition: 'MLS' }),
        mockMatch({ id: 'match-uuid-2', competition: 'MLS' }),
        mockMatch({ id: 'match-uuid-3', competition: 'MLS' }),
      ];

      playerRepositoryMock.findOneBy.mockResolvedValue(player);
      matchRepositoryMock.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock(matches),
      );

      const stats = await service.getPlayerStats(player.id);

      // Aunque hay 3 partidos de MLS, solo aparece una vez
      expect(stats.competitions).toEqual(['MLS']);
    });

    // ─── Test: getAllPlayersStats ─────────────────────────────────────────────

    it('getAllPlayersStats debería retornar stats para cada jugador', async () => {
      const players = [
        mockPlayer({ id: 'p1', name: 'Messi' }),
        mockPlayer({ id: 'p2', name: 'Ronaldo' }),
      ];

      playerRepositoryMock.find.mockResolvedValue(players);
      // findOneBy se llama para cada jugador en getPlayerStats
      playerRepositoryMock.findOneBy
        .mockResolvedValueOnce(players[0])
        .mockResolvedValueOnce(players[1]);

      matchRepositoryMock.createQueryBuilder.mockReturnValue(
        createQueryBuilderMock([]),
      );

      const allStats = await service.getAllPlayersStats();

      expect(allStats).toHaveLength(2);
      expect(allStats[0].playerName).toBe('Messi');
      expect(allStats[1].playerName).toBe('Ronaldo');
    });
  });
});
