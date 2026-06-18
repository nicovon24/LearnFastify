package com.scout.aggregator.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.scout.aggregator.entity.PlayerStats;
import com.scout.aggregator.repository.PlayerStatsRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.*;

/**
 * Tests unitarios del StatsService.
 *
 * ESTRATEGIA:
 *   - Mockeamos PlayerStatsRepository → no necesitamos Postgres ni H2
 *   - Usamos ObjectMapper real → Jackson no tiene side effects externos
 *   - Testeamos la lógica de agregación: ¿se incrementan bien los contadores?
 *   - Testeamos el patrón "find or create": ¿crea un registro nuevo si no existe?
 *
 * COMPARACIÓN CON JEST/NESTJS:
 *   Jest:    jest.spyOn(repository, 'findByPlayerId').mockResolvedValue(null)
 *   Mockito: when(repository.findByPlayerId(anyString())).thenReturn(Optional.empty())
 */
@ExtendWith(MockitoExtension.class)
class StatsServiceTest {

    @Mock
    private PlayerStatsRepository repository;

    private ObjectMapper objectMapper;
    private StatsService statsService;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        statsService = new StatsService(repository, objectMapper);
    }

    // ── Test 1: Evento GOAL para jugador nuevo ────────────────────────────────

    @Test
    void processEvent_goal_para_jugador_nuevo_deberia_crear_registro_con_un_gol() {
        // Arrange: el jugador NO existe en la DB
        when(repository.findByPlayerId("player-1")).thenReturn(Optional.empty());

        // save() devuelve la entidad guardada — mockeamos para que devuelva
        // lo que le pasamos (comportamiento típico de save())
        when(repository.save(any(PlayerStats.class))).thenAnswer(i -> i.getArgument(0));

        String eventJson = buildEventJson("GOAL", "player-1", "Rodrigo Espinoza", "team-1", "Atlético");

        // Act
        statsService.processEvent(eventJson);

        // Assert: verificamos qué se guardó en la DB
        ArgumentCaptor<PlayerStats> savedStats = ArgumentCaptor.forClass(PlayerStats.class);
        verify(repository).save(savedStats.capture());

        PlayerStats captured = savedStats.getValue();
        assertThat(captured.getPlayerId()).isEqualTo("player-1");
        assertThat(captured.getPlayerName()).isEqualTo("Rodrigo Espinoza");
        assertThat(captured.getGoals()).isEqualTo(1);       // Un gol
        assertThat(captured.getYellowCards()).isEqualTo(0); // Cero tarjetas
    }

    // ── Test 2: Evento GOAL para jugador existente ────────────────────────────

    @Test
    void processEvent_goal_para_jugador_existente_deberia_incrementar_contador() {
        // Arrange: el jugador ya tiene 5 goles en la DB
        PlayerStats existing = new PlayerStats("player-1", "Rodrigo Espinoza", "team-1", "Atlético");
        existing.setGoals(5);
        when(repository.findByPlayerId("player-1")).thenReturn(Optional.of(existing));
        when(repository.save(any(PlayerStats.class))).thenAnswer(i -> i.getArgument(0));

        String eventJson = buildEventJson("GOAL", "player-1", "Rodrigo Espinoza", "team-1", "Atlético");

        // Act
        statsService.processEvent(eventJson);

        // Assert: los goles deben ser 6 (5 + 1)
        ArgumentCaptor<PlayerStats> savedStats = ArgumentCaptor.forClass(PlayerStats.class);
        verify(repository).save(savedStats.capture());
        assertThat(savedStats.getValue().getGoals()).isEqualTo(6);
    }

    // ── Test 3: Evento CARD (tarjeta amarilla) ─────────────────────────────────

    @Test
    void processEvent_yellow_card_deberia_incrementar_contador_de_amarillas() {
        // Arrange
        when(repository.findByPlayerId("player-2")).thenReturn(Optional.empty());
        when(repository.save(any(PlayerStats.class))).thenAnswer(i -> i.getArgument(0));

        // JSON con campo cardType para especificar el tipo de tarjeta
        String eventJson = """
                {
                    "eventType": "CARD",
                    "cardType": "YELLOW",
                    "playerId": "player-2",
                    "playerName": "Marcos Villalba",
                    "teamId": "team-2",
                    "teamName": "Norteño",
                    "matchId": "match-1",
                    "minute": 55
                }
                """;
        // Nota: los Text Blocks (""") son una feature de Java 13+.
        // Son strings multilínea — equivalente a los template literals de JS.

        // Act
        statsService.processEvent(eventJson);

        // Assert
        ArgumentCaptor<PlayerStats> savedStats = ArgumentCaptor.forClass(PlayerStats.class);
        verify(repository).save(savedStats.capture());
        assertThat(savedStats.getValue().getYellowCards()).isEqualTo(1);
        assertThat(savedStats.getValue().getRedCards()).isEqualTo(0);
    }

    // ── Test 4: Evento con JSON malformado no debería explotar ────────────────

    @Test
    void processEvent_con_json_invalido_no_deberia_lanzar_excepcion() {
        // Arrange: JSON inválido
        String invalidJson = "{ esto no es json válido }";

        // Act + Assert: no debe lanzar excepción
        // assertThatCode(() -> ...).doesNotThrowAnyException() es de AssertJ
        // Equivalente a: expect(() => service.processEvent(invalid)).not.toThrow()
        org.assertj.core.api.Assertions.assertThatCode(
                () -> statsService.processEvent(invalidJson)
        ).doesNotThrowAnyException();

        // Y no debería haber guardado nada en la DB
        verify(repository, never()).save(any());
    }

    // ── Test 5: Evento SUBSTITUTION ────────────────────────────────────────────

    @Test
    void processEvent_substitution_deberia_incrementar_contador_de_sustituciones() {
        when(repository.findByPlayerId("player-3")).thenReturn(Optional.empty());
        when(repository.save(any(PlayerStats.class))).thenAnswer(i -> i.getArgument(0));

        String eventJson = buildEventJson("SUBSTITUTION", "player-3", "Lautaro Méndez", "team-3", "Sur");

        statsService.processEvent(eventJson);

        ArgumentCaptor<PlayerStats> savedStats = ArgumentCaptor.forClass(PlayerStats.class);
        verify(repository).save(savedStats.capture());
        assertThat(savedStats.getValue().getSubstitutionsIn()).isEqualTo(1);
        assertThat(savedStats.getValue().getGoals()).isEqualTo(0);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Construye un JSON de evento de partido para los tests.
     * Usar un helper centralizado evita duplicar JSON en cada test.
     * En Java 15+, los Text Blocks hacen esto más legible.
     */
    private String buildEventJson(String eventType, String playerId, String playerName,
                                   String teamId, String teamName) {
        return String.format("""
                {
                    "eventType": "%s",
                    "playerId": "%s",
                    "playerName": "%s",
                    "teamId": "%s",
                    "teamName": "%s",
                    "matchId": "match-1",
                    "minute": 32
                }
                """, eventType, playerId, playerName, teamId, teamName);
    }
}
