package com.scout.aggregator.repository;

import com.scout.aggregator.entity.PlayerStats;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Repositorio JPA para acceder a la tabla player_stats.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SPRING DATA JPA — El ORM "magic" de Spring
 *
 *   JpaRepository<PlayerStats, Long>:
 *     - PlayerStats: la entidad que maneja este repositorio
 *     - Long: el tipo del ID (@Id) de esa entidad
 *
 *   Al extender JpaRepository, obtenemos GRATIS sin escribir código:
 *     - save(entity): INSERT o UPDATE (decide según si el ID es null)
 *     - findById(id): SELECT WHERE id = ?
 *     - findAll(): SELECT * FROM player_stats
 *     - delete(entity): DELETE
 *     - count(): SELECT COUNT(*)
 *     - ... y más de 20 métodos más
 *
 *   COMPARACIÓN CON PRISMA/NODE:
 *     Prisma:  prisma.playerStats.findUnique({ where: { playerId } })
 *     Spring:  repository.findByPlayerId(playerId)
 *
 *   Con Spring Data JPA, solo declarás la interfaz — nunca implementás nada.
 *   Spring genera la implementación en runtime usando proxies de Java.
 *   El nombre del método ES la query: findByPlayerId → WHERE player_id = ?
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @Repository: marca esta interfaz como componente de acceso a datos.
 *   Spring crea un proxy que implementa esta interfaz con Hibernate debajo.
 *   También activa la traducción de excepciones de JPA/Hibernate a
 *   DataAccessException de Spring (más fáciles de manejar).
 *
 *   Técnicamente no es necesario (JpaRepository ya lo implica), pero
 *   es buena práctica para claridad.
 */
@Repository
public interface PlayerStatsRepository extends JpaRepository<PlayerStats, Long> {

    /**
     * Busca las estadísticas de un jugador por su playerId.
     *
     * POR QUÉ Optional<PlayerStats> en vez de PlayerStats:
     *   Optional es una clase de Java 8+ que representa "puede existir o no".
     *   Es la forma idiomática de indicar que el resultado puede ser null.
     *   Obliga al caller a manejar el caso "no encontrado" explícitamente.
     *
     *   COMPARACIÓN:
     *     TypeScript:  PlayerStats | null
     *     Java:        Optional<PlayerStats>
     *
     *   Optional tiene métodos como:
     *     - isPresent(): ¿tiene valor?
     *     - get(): obtener el valor (lanza excepción si está vacío)
     *     - orElse(default): obtener el valor o un default
     *     - orElseThrow(() -> new Exception()): lanzar excepción si está vacío
     *
     * CÓMO SABE SPRING QUÉ SQL GENERAR:
     *   Analiza el nombre del método: "findBy" + "PlayerId".
     *   "PlayerId" coincide con el campo playerId de PlayerStats.
     *   Genera: SELECT * FROM player_stats WHERE player_id = ?
     *   Mágico pero real.
     */
    Optional<PlayerStats> findByPlayerId(String playerId);
}
