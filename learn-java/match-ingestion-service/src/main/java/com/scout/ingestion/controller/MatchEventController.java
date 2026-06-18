package com.scout.ingestion.controller;

import com.scout.ingestion.dto.MatchEventRequest;
import com.scout.ingestion.kafka.MatchEventProducer;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.Map;

/**
 * Controller REST para recibir eventos de partido.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * COMPARACIÓN CON NESTJS:
 *
 *   NestJS:                              Spring:
 *   @Controller('events')                @RestController
 *                                        @RequestMapping("/events")
 *
 *   @Post()                              @PostMapping
 *   create(@Body() dto: CreateDto) {}    create(@Valid @RequestBody Dto dto) {}
 *
 *   La lógica es idéntica — cambia la sintaxis de las anotaciones.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @RestController = @Controller + @ResponseBody.
 *   - @Controller: registra esta clase como handler de requests HTTP en Spring.
 *   - @ResponseBody: los valores de retorno de los métodos se serializan a JSON
 *     automáticamente. Sin esto, Spring intentaría resolver el retorno como
 *     un nombre de vista (template HTML).
 *
 * @RequestMapping("/events"): define el path base para todos los endpoints
 *   de este controller. Equivalente a @Controller('events') en NestJS.
 */
@RestController
@RequestMapping("/events")
public class MatchEventController {

    private static final Logger log = LoggerFactory.getLogger(MatchEventController.class);

    /**
     * Inyectamos el producer por constructor (patrón recomendado).
     * Spring detecta el único constructor y lo usa para DI automáticamente.
     */
    private final MatchEventProducer producer;

    public MatchEventController(MatchEventProducer producer) {
        this.producer = producer;
    }

    /**
     * POST /events — Recibe un evento de partido y lo publica en Kafka.
     *
     * @PostMapping: equivalente a @Post() de NestJS, mapea POST /events.
     *
     * @RequestBody: deserializa el body JSON de la request a un objeto Java.
     *   Equivalente a @Body() en NestJS.
     *
     * @Valid: activa la validación de Bean Validation en el DTO.
     *   Sin @Valid, las anotaciones @NotNull, @Min, etc. del DTO son ignoradas.
     *   Si alguna validación falla, Spring devuelve 400 con los errores
     *   antes de que el código del método se ejecute.
     *   Equivalente a tener el ValidationPipe global en NestJS.
     *
     * ResponseEntity<Map<String, Object>>:
     *   ResponseEntity nos permite controlar el status code HTTP de la respuesta.
     *   Map<String, Object> es el cuerpo de la respuesta — una forma sencilla
     *   de devolver un JSON arbitrario sin definir una clase DTO de respuesta.
     *   En producción, crearíamos una clase MatchEventResponse.
     */
    @PostMapping
    public ResponseEntity<Map<String, Object>> receiveEvent(
            @Valid @RequestBody MatchEventRequest event) {

        log.info("Evento recibido: {}", event);

        // Delegamos la lógica de negocio al producer — el controller solo
        // maneja el request/response HTTP. Mismo principio que en NestJS:
        // el controller delega en el service.
        producer.publishEvent(event);

        // Devolvemos 202 ACCEPTED (no 200 OK) porque el procesamiento es asíncrono:
        // el evento fue aceptado y publicado en Kafka, pero el aggregator todavía
        // no lo procesó. 202 es más semánticamente correcto que 200 en este caso.
        Map<String, Object> response = Map.of(
                "status", "accepted",
                "message", "Evento recibido y publicado en Kafka",
                "eventType", event.getEventType().name(),
                "matchId", event.getMatchId(),
                "timestamp", Instant.now().toString()
        );

        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }
}
