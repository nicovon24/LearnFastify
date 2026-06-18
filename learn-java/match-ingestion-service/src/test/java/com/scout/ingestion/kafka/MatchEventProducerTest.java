package com.scout.ingestion.kafka;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.scout.ingestion.dto.MatchEventRequest;
import com.scout.ingestion.model.EventType;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;

import java.util.concurrent.CompletableFuture;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

/**
 * Test unitario de MatchEventProducer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ESTRATEGIA DE TESTING:
 *
 *   Queremos testear la LÓGICA del producer (serializa bien, llama KafkaTemplate
 *   con los parámetros correctos) SIN necesitar un broker de Kafka real.
 *
 *   Para eso, "mockeamos" KafkaTemplate — reemplazamos la implementación real
 *   por un objeto falso controlado por nosotros (Mockito).
 *
 *   COMPARACIÓN CON JEST/NESTJS:
 *     Jest:     jest.fn() o jest.spyOn()
 *     Mockito:  @Mock y when(...).thenReturn(...)
 *   El concepto es idéntico, cambia la sintaxis.
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * @ExtendWith(MockitoExtension.class): le dice a JUnit 5 que use la extensión
 *   de Mockito. Esto activa el procesamiento de @Mock, @InjectMocks, etc.
 *   Sin esto, las anotaciones @Mock no funcionan.
 *   Equivalente a llamar MockitoAnnotations.openMocks(this) en el @BeforeEach.
 */
@ExtendWith(MockitoExtension.class)
class MatchEventProducerTest {

    /**
     * @Mock: crea un objeto falso (mock) de KafkaTemplate.
     * El mock no hace nada por defecto — no llama a Kafka, no lanza excepciones.
     * Nosotros definimos qué devuelve con when(...).thenReturn(...).
     *
     * COMPARACIÓN CON JEST:
     *   Jest:    const kafkaTemplate = { send: jest.fn().mockReturnValue(...) }
     *   Mockito: @Mock KafkaTemplate<String, String> kafkaTemplate;
     */
    @Mock
    private KafkaTemplate<String, String> kafkaTemplate;

    // ObjectMapper real — no tiene side effects externos, no necesita mock
    private ObjectMapper objectMapper;

    // La clase bajo test (SUT — System Under Test)
    private MatchEventProducer producer;

    /**
     * @BeforeEach: se ejecuta ANTES de cada test, equivalente a beforeEach() de Jest.
     * Recreamos el producer con el mock en cada test para que no haya estado
     * compartido entre tests (test isolation).
     */
    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        // Inyectamos el mock de KafkaTemplate en el producer.
        // Como usamos constructor injection, podemos hacerlo directamente
        // sin necesidad de Spring — eso es exactamente la ventaja de constructor injection.
        producer = new MatchEventProducer(kafkaTemplate, objectMapper);

        // Usamos reflection para setear el topic directamente en el test.
        // Alternativa: exponer un setter o un constructor con el topic.
        try {
            var topicField = MatchEventProducer.class.getDeclaredField("topic");
            topicField.setAccessible(true);
            topicField.set(producer, "match-events");
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    /**
     * Test: publishEvent serializa el evento y llama a KafkaTemplate con los
     * parámetros correctos.
     *
     * PATRÓN: Arrange / Act / Assert (AAA)
     *   - Arrange: preparar los datos y configurar los mocks
     *   - Act: ejecutar el método bajo test
     *   - Assert: verificar que el resultado es el esperado
     *
     *   Es el mismo patrón que Given/When/Then de BDD, solo con otros nombres.
     */
    @Test
    void publishEvent_deberia_llamar_kafkaTemplate_con_matchId_como_key() {
        // ── Arrange ──────────────────────────────────────────────────────────
        MatchEventRequest event = buildTestEvent();

        // Configuramos el mock: cuando se llame kafkaTemplate.send con cualquier
        // String como parámetros, devolvemos un CompletableFuture completado.
        // Sin esto, kafkaTemplate.send() devolvería null y el whenComplete() fallaría.
        //
        // COMPARACIÓN CON JEST:
        //   Jest:    kafkaTemplate.send.mockReturnValue(Promise.resolve({...}))
        //   Mockito: when(kafkaTemplate.send(anyString(), anyString(), anyString()))
        //               .thenReturn(CompletableFuture.completedFuture(mock(SendResult.class)))
        @SuppressWarnings("unchecked")
        SendResult<String, String> mockResult = mock(SendResult.class);
        when(kafkaTemplate.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.completedFuture(mockResult));

        // ── Act ───────────────────────────────────────────────────────────────
        producer.publishEvent(event);

        // ── Assert ────────────────────────────────────────────────────────────
        // ArgumentCaptor: captura los argumentos con los que se llamó el mock.
        // Nos permite verificar no solo QUE se llamó, sino CON QUÉ argumentos.
        //
        // COMPARACIÓN CON JEST:
        //   Jest:    expect(kafkaTemplate.send).toHaveBeenCalledWith('match-events', 'match-1', ...)
        //   Mockito: verify(kafkaTemplate).send(eq("match-events"), eq("match-1"), captor.capture())
        ArgumentCaptor<String> valueCaptor = ArgumentCaptor.forClass(String.class);

        verify(kafkaTemplate).send(
                eq("match-events"),     // topic correcto
                eq("match-1"),          // key = matchId (garantiza orden en Kafka)
                valueCaptor.capture()   // capturamos el value (JSON) para inspeccionarlo
        );

        // Verificamos que el JSON contiene los datos correctos
        String capturedJson = valueCaptor.getValue();
        assertThat(capturedJson).contains("\"playerId\":\"player-1\"");
        assertThat(capturedJson).contains("\"matchId\":\"match-1\"");
        assertThat(capturedJson).contains("\"eventType\":\"GOAL\"");
    }

    @Test
    void publishEvent_con_evento_gol_deberia_incluir_minuto_en_json() {
        // Arrange
        MatchEventRequest event = buildTestEvent();
        event.setMinute(45);

        @SuppressWarnings("unchecked")
        SendResult<String, String> mockResult = mock(SendResult.class);
        when(kafkaTemplate.send(anyString(), anyString(), anyString()))
                .thenReturn(CompletableFuture.completedFuture(mockResult));

        // Act
        producer.publishEvent(event);

        // Assert: verificamos que el JSON incluye el minuto
        ArgumentCaptor<String> valueCaptor = ArgumentCaptor.forClass(String.class);
        verify(kafkaTemplate).send(anyString(), anyString(), valueCaptor.capture());
        assertThat(valueCaptor.getValue()).contains("\"minute\":45");
    }

    // ── Helper para construir eventos de test ────────────────────────────────
    //
    // Método privado que centraliza la construcción de datos de prueba.
    // En proyectos más grandes, usaríamos un "Builder" o una librería como
    // Faker para generar datos realistas.
    private MatchEventRequest buildTestEvent() {
        MatchEventRequest event = new MatchEventRequest();
        event.setEventType(EventType.GOAL);
        event.setPlayerId("player-1");
        event.setPlayerName("Rodrigo Espinoza");
        event.setTeamId("team-1");
        event.setTeamName("Atlético Norteño");
        event.setMatchId("match-1");
        event.setMinute(32);
        return event;
    }
}
