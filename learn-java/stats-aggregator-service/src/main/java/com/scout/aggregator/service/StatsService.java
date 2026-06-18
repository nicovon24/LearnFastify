package com.scout.aggregator.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.scout.aggregator.entity.PlayerStats;
import com.scout.aggregator.repository.PlayerStatsRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Optional;

/**
 * Lógica de negocio para agregar estadísticas de eventos de partido.
 *
 * Separamos la lógica del listener de Kafka (cómo llega el mensaje)
 * de la lógica de negocio (qué hacer con él). Así el StatsService
 * es testeable sin Kafka, y el listener puede centrarse en el protocolo.
 *
 * @Service: equivalente a @Injectable() de NestJS.
 *   Registra esta clase en el contenedor de DI de Spring como un "service".
 *   La diferencia entre @Service, @Repository y @Component es solo semántica
 *   (documentación de intención) — los tres registran el bean igualmente.
 */
@Service
public class StatsService {

    private static final Logger log = LoggerFactory.getLogger(StatsService.class);

    private final PlayerStatsRepository repository;
    private final ObjectMapper objectMapper;

    public StatsService(PlayerStatsRepository repository, ObjectMapper objectMapper) {
        this.repository = repository;
        this.objectMapper = objectMapper;
    }

    /**
     * Procesa un evento de partido (como JSON string) y actualiza las estadísticas.
     *
     * @Transactional: envuelve el método en una transacción de base de datos.
     *
     *   POR QUÉ @Transactional:
     *     Si el evento es GOAL y guardamos el incremento, pero después hay un error,
     *     queremos que el cambio se revierta (rollback) — no quedarnos con datos
     *     inconsistentes. @Transactional garantiza atomicidad: o todo se guarda o nada.
     *
     *     Hibernate en modo managed (dentro de una transacción) trackea los cambios
     *     en las entidades automáticamente. Si modificás un campo de una entidad
     *     que leíste de la DB, Hibernate la guarda sola al hacer commit.
     *     Por eso no siempre necesitás llamar repository.save() explícitamente
     *     cuando modificás una entidad existente.
     *
     *   COMPARACIÓN CON NODE:
     *     En Node usarías: await prisma.$transaction([...]) o con Sequelize beginTransaction()
     *     En Spring: @Transactional hace todo eso automáticamente como AOP (Aspect-Oriented)
     */
    @Transactional
    public void processEvent(String eventJson) {
        try {
            // Parseamos el JSON a un árbol de nodos para no necesitar
            // una clase DTO separada en este servicio
            JsonNode event = objectMapper.readTree(eventJson);

            String eventType = event.get("eventType").asText();
            String playerId = event.get("playerId").asText();
            String playerName = event.get("playerName").asText();
            String teamId = event.get("teamId").asText();
            String teamName = event.get("teamName").asText();

            log.info("Procesando evento: {} para jugador: {} ({})", eventType, playerName, playerId);

            // Buscamos las estadísticas existentes del jugador, o creamos un
            // registro nuevo si es la primera vez que vemos a este jugador.
            // Patrón "find or create" — muy común en agregaciones.
            PlayerStats stats = repository.findByPlayerId(playerId)
                    .orElse(new PlayerStats(playerId, playerName, teamId, teamName));
            // orElse(): si el Optional está vacío (jugador no existe en DB),
            // creamos un nuevo PlayerStats con valores en cero.

            // Actualizamos las estadísticas según el tipo de evento
            switch (eventType) {
                case "GOAL":
                    stats.setGoals(stats.getGoals() + 1);
                    break;

                case "CARD":
                    // Un evento CARD puede ser amarilla o roja.
                    // Leemos el subtipo del evento si está presente.
                    JsonNode cardTypeNode = event.get("cardType");
                    String cardType = cardTypeNode != null ? cardTypeNode.asText("YELLOW") : "YELLOW";
                    if ("RED".equals(cardType)) {
                        stats.setRedCards(stats.getRedCards() + 1);
                    } else {
                        stats.setYellowCards(stats.getYellowCards() + 1);
                    }
                    break;

                case "SUBSTITUTION":
                    // Contamos las veces que el jugador entró (sustitución entrante)
                    stats.setSubstitutionsIn(stats.getSubstitutionsIn() + 1);
                    break;

                default:
                    log.warn("Tipo de evento desconocido: {}. El evento se ignora.", eventType);
                    return;  // No guardamos nada si el tipo es desconocido
            }

            stats.setLastUpdated(Instant.now());

            // save(): si stats.id es null (objeto nuevo), hace INSERT.
            //         si stats.id tiene valor (objeto existente), hace UPDATE.
            // JPA/Hibernate sabe distinguir entre objetos nuevos y existentes
            // por el valor del @Id.
            repository.save(stats);

            log.info("Estadísticas actualizadas para jugador: {} | goles: {}, amarillas: {}",
                    playerName, stats.getGoals(), stats.getYellowCards());

        } catch (JsonProcessingException e) {
            // Si el JSON está malformado, lo logueamos pero NO relanzamos la excepción.
            //
            // POR QUÉ no relanzar:
            //   Si relanzamos, el @KafkaListener consideraría que el mensaje "falló"
            //   y lo reintentaría según la configuración. Pero si el JSON está
            //   malformado, reintentarlo N veces no lo va a arreglar.
            //   Lo correcto es loguearlo y seguir adelante (o mandarlo a un dead letter topic).
            log.error("Error parseando JSON del evento de Kafka: {}", e.getMessage());
        }
    }

    /**
     * Devuelve las estadísticas de un jugador, o null si no existe.
     * El controller maneja el 404 cuando recibe null.
     */
    public Optional<PlayerStats> getPlayerStats(String playerId) {
        return repository.findByPlayerId(playerId);
    }
}
