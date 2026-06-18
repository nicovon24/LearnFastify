package com.scout.aggregator;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * Punto de entrada del stats-aggregator-service.
 * Consume eventos de Kafka y agrega estadísticas en Postgres.
 *
 * La estructura es idéntica al ingestion service —
 * @SpringBootApplication hace el mismo trabajo en ambos.
 */
@SpringBootApplication
public class StatsAggregatorApplication {

    public static void main(String[] args) {
        SpringApplication.run(StatsAggregatorApplication.class, args);
    }
}
