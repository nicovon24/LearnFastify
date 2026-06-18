package com.scout.aggregator.entity;

import jakarta.persistence.*;

/**
 * Entidad JPA — mapea a la tabla "player_stats" en Postgres.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * JPA (Jakarta Persistence API) + Hibernate: el ORM de Java
 *
 *   En Node usás Prisma con un schema.prisma separado. En Spring/JPA, el schema
 *   está definido directamente en la clase Java con anotaciones.
 *   Hibernate (la implementación de JPA) genera el DDL SQL a partir de estas
 *   anotaciones — si hibernate.ddl-auto=update, crea la tabla automáticamente.
 *
 *   COMPARACIÓN:
 *     Prisma:  model PlayerStats { id String @id, playerId String @unique, ... }
 *     JPA:     class PlayerStats { @Id Long id; @Column(unique=true) String playerId; }
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @Entity: le dice a JPA que esta clase es una entidad persistible.
 *   Equivalente al model de Prisma o el decorator @Entity de TypeORM.
 *
 * @Table(name = "player_stats"): especifica el nombre de la tabla.
 *   Sin esto, JPA usa el nombre de la clase en snake_case: "player_stats".
 *   Es buena práctica ser explícito.
 */
@Entity
@Table(name = "player_stats")
public class PlayerStats {

    /**
     * @Id: este campo es la clave primaria de la tabla.
     *
     * @GeneratedValue(strategy = GenerationType.IDENTITY): la DB genera el valor
     *   automáticamente con SERIAL/BIGSERIAL en Postgres (AUTO_INCREMENT en MySQL).
     *   Equivalente a @id @default(autoincrement()) en Prisma.
     *
     * POR QUÉ Long en vez de int:
     *   Long es el tipo "wrapper" de long — puede ser null (los primitivos no pueden).
     *   JPA necesita que los IDs puedan ser null antes de persistir (para distinguir
     *   objetos nuevos de objetos ya guardados en DB).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * @Column(unique = true, nullable = false):
     *   - unique: el player_id debe ser único en la tabla (constraint de DB)
     *   - nullable: false → NOT NULL en SQL
     */
    @Column(name = "player_id", unique = true, nullable = false)
    private String playerId;

    @Column(name = "player_name", nullable = false)
    private String playerName;

    @Column(name = "team_id", nullable = false)
    private String teamId;

    @Column(name = "team_name", nullable = false)
    private String teamName;

    // Estadísticas agregadas — van incrementando con cada evento
    @Column(name = "goals", nullable = false)
    private int goals = 0;

    @Column(name = "yellow_cards", nullable = false)
    private int yellowCards = 0;

    @Column(name = "red_cards", nullable = false)
    private int redCards = 0;

    @Column(name = "substitutions_in", nullable = false)
    private int substitutionsIn = 0;

    @Column(name = "last_updated")
    private java.time.Instant lastUpdated;

    // ── Constructor vacío requerido por JPA ──────────────────────────────────
    //
    // JPA necesita un constructor sin argumentos para poder instanciar la clase
    // cuando lee registros de la DB (usa reflection). Sin esto, Hibernate lanza
    // una excepción. Es una de las "reglas" de JPA que podría sorprenderte.
    public PlayerStats() {}

    // Constructor de conveniencia para crear objetos nuevos
    public PlayerStats(String playerId, String playerName, String teamId, String teamName) {
        this.playerId = playerId;
        this.playerName = playerName;
        this.teamId = teamId;
        this.teamName = teamName;
        this.lastUpdated = java.time.Instant.now();
    }

    // ── Getters y Setters ────────────────────────────────────────────────────
    public Long getId() { return id; }

    public String getPlayerId() { return playerId; }
    public void setPlayerId(String playerId) { this.playerId = playerId; }

    public String getPlayerName() { return playerName; }
    public void setPlayerName(String playerName) { this.playerName = playerName; }

    public String getTeamId() { return teamId; }
    public void setTeamId(String teamId) { this.teamId = teamId; }

    public String getTeamName() { return teamName; }
    public void setTeamName(String teamName) { this.teamName = teamName; }

    public int getGoals() { return goals; }
    public void setGoals(int goals) { this.goals = goals; }

    public int getYellowCards() { return yellowCards; }
    public void setYellowCards(int yellowCards) { this.yellowCards = yellowCards; }

    public int getRedCards() { return redCards; }
    public void setRedCards(int redCards) { this.redCards = redCards; }

    public int getSubstitutionsIn() { return substitutionsIn; }
    public void setSubstitutionsIn(int substitutionsIn) { this.substitutionsIn = substitutionsIn; }

    public java.time.Instant getLastUpdated() { return lastUpdated; }
    public void setLastUpdated(java.time.Instant lastUpdated) { this.lastUpdated = lastUpdated; }
}
