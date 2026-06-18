package com.scout.ingestion.kafka;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.scout.ingestion.dto.MatchEventRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

import java.util.concurrent.CompletableFuture;

/**
 * Producer de Kafka: publica eventos de partido en el topic "match-events".
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONCEPTOS DE KAFKA QUE APARECEN ACÁ:
 *
 *  TOPIC: canal lógico con nombre ("match-events"). Los producers publican
 *         mensajes en topics, los consumers los leen. Un topic puede tener
 *         múltiples particiones para paralelismo.
 *
 *  MENSAJE: cada mensaje en Kafka tiene una KEY (opcional) y un VALUE.
 *         - KEY: usada para garantizar que mensajes del mismo partido vayan
 *           a la misma partición (preserva el orden por partido).
 *         - VALUE: el contenido del evento, serializado a JSON string.
 *
 *  SERIALIZACIÓN: Kafka trabaja con bytes — no sabe nada de JSON.
 *         Necesitamos convertir nuestro objeto Java a String/bytes antes de
 *         publicar, y hacer el proceso inverso al consumir.
 *         Usamos Jackson (ObjectMapper) para Java → JSON string.
 *
 *  ASINCRÓNICO: KafkaTemplate.send() devuelve un CompletableFuture —
 *         el mensaje se encola internamente y se envía en background.
 *         No bloquea el thread del HTTP request mientras Kafka confirma.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @Service es equivalente a @Injectable() de NestJS.
 * Registra esta clase en el contenedor de DI de Spring.
 * Cuando el controller declare un campo de tipo MatchEventProducer,
 * Spring lo inyecta automáticamente.
 */
@Service
public class MatchEventProducer {

    private static final Logger log = LoggerFactory.getLogger(MatchEventProducer.class);

    /**
     * KafkaTemplate es el bean principal para PRODUCIR mensajes.
     * Spring Boot lo auto-configura leyendo las propiedades spring.kafka.*
     * del application.yml. No necesitamos instanciarlo ni configurarlo aquí.
     *
     * <String, String>: el primer tipo es el tipo de la KEY del mensaje,
     * el segundo es el tipo del VALUE. Ambos son String porque vamos a
     * serializar el evento como JSON string.
     *
     * @Autowired: le dice a Spring "inyectá este bean acá".
     * En constructores de una sola dependencia, @Autowired es opcional
     * (Spring lo detecta automáticamente), pero es buena práctica para claridad.
     */
    private final KafkaTemplate<String, String> kafkaTemplate;
    private final ObjectMapper objectMapper;

    /**
     * @Value("${kafka.topic.match-events}"): inyecta el valor de la propiedad
     * "kafka.topic.match-events" del application.yml en esta variable.
     *
     * POR QUÉ no hardcodear el nombre del topic:
     *   En distintos entornos (dev, staging, prod) el topic puede tener nombres
     *   distintos. Con @Value lo controlás por configuración sin recompilar.
     *   Equivalente a process.env.KAFKA_TOPIC en Node.
     */
    @Value("${kafka.topic.match-events:match-events}")
    private String topic;

    /**
     * Inyección por constructor — el patrón recomendado en Spring.
     *
     * POR QUÉ constructor injection en vez de field injection (@Autowired directo):
     *   1. Hace las dependencias explícitas y requeridas (no podés crear la clase sin ellas)
     *   2. Facilita el testing — podés crear instancias con mocks en los tests
     *      sin necesitar el contexto de Spring
     *   3. Es el patrón que recomienda el equipo de Spring oficialmente
     */
    public MatchEventProducer(KafkaTemplate<String, String> kafkaTemplate,
                               ObjectMapper objectMapper) {
        this.kafkaTemplate = kafkaTemplate;
        this.objectMapper = objectMapper;
    }

    /**
     * Serializa el evento a JSON y lo publica en el topic de Kafka.
     *
     * @param event el evento de partido recibido por el controller
     * @throws RuntimeException si la serialización falla (no debería pasar)
     */
    public void publishEvent(MatchEventRequest event) {
        try {
            // Convertimos el objeto Java a un String JSON.
            // Por ejemplo: {"eventType":"GOAL","playerId":"p123","matchId":"m456","minute":32,...}
            String eventJson = objectMapper.writeValueAsString(event);

            // send(topic, key, value):
            //   - topic: el canal de Kafka donde publicamos
            //   - key: matchId — garantiza que todos los eventos del mismo partido
            //          vayan a la misma partición (orden garantizado por partido)
            //   - value: el JSON del evento
            CompletableFuture<SendResult<String, String>> future =
                    kafkaTemplate.send(topic, event.getMatchId(), eventJson);

            // whenComplete: callback que se ejecuta cuando Kafka confirma
            // el mensaje (o cuando ocurre un error). No bloquea el thread actual.
            future.whenComplete((result, ex) -> {
                if (ex != null) {
                    // El mensaje no llegó a Kafka — loguear y potencialmente
                    // reintentar o guardar en un dead letter topic
                    log.error("Error publicando evento en Kafka: {}", ex.getMessage());
                } else {
                    // Confirmación de Kafka: partición y offset donde quedó el mensaje.
                    // El "offset" es como un índice secuencial por partición —
                    // permite al consumer saber hasta dónde leyó.
                    log.info("Evento publicado en topic '{}' | partition: {} | offset: {}",
                            topic,
                            result.getRecordMetadata().partition(),
                            result.getRecordMetadata().offset());
                }
            });

        } catch (JsonProcessingException e) {
            // JsonProcessingException es una checked exception — Java te obliga
            // a manejarla (o declararla con throws). La envolvemos en una
            // RuntimeException (unchecked) para simplificar la firma del método.
            // En producción, acá iría lógica de retry o dead letter queue.
            log.error("Error serializando evento: {}", e.getMessage());
            throw new RuntimeException("Error al serializar el evento de partido", e);
        }
    }
}
