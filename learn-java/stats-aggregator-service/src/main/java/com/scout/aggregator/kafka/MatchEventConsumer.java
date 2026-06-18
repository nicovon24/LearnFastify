package com.scout.aggregator.kafka;

import com.scout.aggregator.service.StatsService;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.kafka.support.Acknowledgment;
import org.springframework.kafka.support.KafkaHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Component;

/**
 * Consumer de Kafka: escucha el topic "match-events" y delega al StatsService.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CONCEPTOS DE KAFKA QUE APARECEN ACÁ:
 *
 *  CONSUMER GROUP (groupId = "stats-aggregator"):
 *    Kafka usa grupos de consumidores para escalar el procesamiento.
 *    Todos los consumers con el mismo groupId comparten la carga: si el topic
 *    tiene 3 particiones y hay 3 instancias del aggregator corriendo, cada
 *    instancia lee de UNA partición — procesamiento paralelo automático.
 *    Si hay una sola instancia, lee de todas las particiones.
 *
 *    Si otro servicio (ej: un servicio de notificaciones) también quisiera
 *    leer los mismos eventos, usaría un groupId diferente (ej: "notifications").
 *    Kafka les entrega los mismos mensajes a los dos grupos independientemente.
 *
 *  OFFSET:
 *    Kafka guarda un "offset" (índice) por consumer group y partición.
 *    Es el puntero al último mensaje que el consumer confirmó haber procesado.
 *    Si el consumer se reinicia, retoma desde el último offset confirmado —
 *    no pierde mensajes, no los reprocesa (a menos que haya falla antes del ack).
 *
 *  ORDEN DE MENSAJES:
 *    Kafka garantiza orden DENTRO de una partición.
 *    Si el producer usa el matchId como key, todos los eventos del mismo partido
 *    van a la misma partición → llegan en orden al consumer.
 *    Entre particiones distintas NO hay garantía de orden.
 *    En nuestro caso: los goles del partido-123 llegan en orden, pero pueden
 *    intercalarse con eventos del partido-456.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @Component: registra esta clase como componente de Spring.
 *   @Component es la anotación genérica — @Service y @Repository son alias
 *   semánticos para capas específicas. Para un listener de Kafka, @Component
 *   es más apropiado que @Service.
 */
@Component
public class MatchEventConsumer {

    private static final Logger log = LoggerFactory.getLogger(MatchEventConsumer.class);

    private final StatsService statsService;

    public MatchEventConsumer(StatsService statsService) {
        this.statsService = statsService;
    }

    /**
     * @KafkaListener: el equivalente de kafkaConsumer.on('message', handler) pero
     *   declarativo — Spring conecta este método al broker automáticamente.
     *
     * topics = {"match-events"}: el topic a escuchar.
     *   Puede ser un array para escuchar múltiples topics.
     *
     * groupId = "stats-aggregator": el consumer group.
     *   IMPORTANTE: si corremos múltiples instancias de este servicio,
     *   todas tendrán el mismo groupId y Kafka distribuirá las particiones
     *   entre ellas. Eso es escala horizontal sin código adicional.
     *
     * containerFactory = "kafkaListenerContainerFactory":
     *   La fábrica de containers de Kafka. Spring Boot la auto-configura.
     *   Definimos containerFactory explícitamente en KafkaConfig para tener
     *   control sobre el modo de acknowledgment.
     *
     * SOBRE ConsumerRecord<String, String>:
     *   En vez de recibir solo el value (String), recibimos el record completo.
     *   Esto nos da acceso a key(), partition(), offset() y timestamp() del mensaje —
     *   útil para logging y debugging.
     */
    @KafkaListener(
            topics = {"match-events"},
            groupId = "stats-aggregator",
            containerFactory = "kafkaListenerContainerFactory"
    )
    public void consume(
            ConsumerRecord<String, String> record,
            Acknowledgment acknowledgment,
            @Header(KafkaHeaders.RECEIVED_PARTITION) int partition,
            @Header(KafkaHeaders.OFFSET) long offset) {

        log.info("Evento recibido | topic: {} | partition: {} | offset: {} | key: {}",
                record.topic(), partition, offset, record.key());

        try {
            // Delegamos el procesamiento al StatsService.
            // El listener solo maneja el "protocolo" de Kafka (cómo llega el mensaje),
            // el StatsService maneja la lógica de negocio (qué hacer con él).
            statsService.processEvent(record.value());

            // ACKNOWLEDGMENT MANUAL:
            // acknowledgment.acknowledge() le dice a Kafka que el mensaje fue
            // procesado exitosamente. Kafka actualiza el offset de este consumer group.
            //
            // POR QUÉ acknowledgment manual en vez de auto-commit:
            //   Con auto-commit, Kafka confirma el mensaje ANTES de que se procese
            //   (o después de un timeout). Si el servicio falla en el medio del
            //   procesamiento, el mensaje ya está "confirmado" y se pierde.
            //   Con manual ack, si falla antes del acknowledge(), Kafka lo reenvía
            //   al reiniciar — garantía de "at-least-once processing".
            acknowledgment.acknowledge();

        } catch (Exception e) {
            // Si hay una excepción no esperada, logueamos pero NO hacemos ack.
            // Kafka reintentará el mensaje según la configuración de retry.
            // En producción: implementar dead letter topic para mensajes que
            // fallan repetidamente.
            log.error("Error procesando evento de Kafka. El mensaje será reintentado. Error: {}",
                    e.getMessage());
        }
    }
}
