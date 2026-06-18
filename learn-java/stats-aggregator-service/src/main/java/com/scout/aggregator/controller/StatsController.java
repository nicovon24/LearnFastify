package com.scout.aggregator.controller;

import com.scout.aggregator.entity.PlayerStats;
import com.scout.aggregator.service.StatsService;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * Controller REST para consultar estadísticas agregadas.
 *
 * Este controller es el lado "lectura" del servicio — un CQRS básico:
 * el consumer de Kafka escribe las stats (lado command/write),
 * y este controller las lee (lado query/read).
 */
@RestController
@RequestMapping("/stats")
public class StatsController {

    private final StatsService statsService;

    public StatsController(StatsService statsService) {
        this.statsService = statsService;
    }

    /**
     * GET /stats/player/{playerId} — Devuelve las estadísticas de un jugador.
     *
     * @PathVariable: extrae la variable del path URL.
     *   En NestJS: @Param('playerId') playerId: string
     *   En Spring: @PathVariable String playerId
     *
     * ResponseEntity<?> con Optional:
     *   Si el jugador existe: 200 OK con las stats
     *   Si no existe: 404 Not Found
     *
     *   map() en Optional transforma el valor si existe.
     *   orElse() devuelve el valor alternativo si el Optional está vacío.
     *   ResponseEntity.ok() = 200, ResponseEntity.notFound().build() = 404.
     */
    @GetMapping("/player/{playerId}")
    public ResponseEntity<PlayerStats> getPlayerStats(@PathVariable String playerId) {
        return statsService.getPlayerStats(playerId)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }
}
