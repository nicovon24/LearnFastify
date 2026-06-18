package com.scout.ingestion.dto;

import com.scout.ingestion.model.EventType;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/**
 * DTO (Data Transfer Object) para recibir eventos de partido por REST.
 *
 * POR QUÉ un DTO separado del modelo de dominio:
 *   Igual que en NestJS, el DTO representa la forma del REQUEST, no el modelo
 *   interno. Te permite agregar validaciones, documentación y transformaciones
 *   sin contaminar el modelo de dominio con concerns de la API.
 *
 * SOBRE Bean Validation (JSR-380):
 *   Las anotaciones @NotNull, @NotBlank, @Min, etc. son estándares de Java EE/Jakarta.
 *   Spring los procesa cuando el controller tiene @Valid en el parámetro del método.
 *   Si alguna validación falla, Spring devuelve automáticamente un 400 Bad Request
 *   con los errores — sin que vos tengas que escribir ningún código de validación.
 *
 *   COMPARACIÓN CON NESTJS:
 *     NestJS:  class CreateEventDto { @IsNotEmpty() playerName: string; }
 *     Spring:  class MatchEventRequest { @NotBlank String playerName; }
 *   El patrón es idéntico, cambia solo la sintaxis y el framework de validación.
 *
 * SOBRE RECORDS vs CLASES en Java 17:
 *   Usamos una clase normal con getters/setters para que Jackson pueda
 *   deserializar sin configuración adicional. Java 17 tiene Records (más
 *   concisos), pero necesitan configuración extra con Jackson para funcionar
 *   con Spring — una clase normal es más simple para empezar.
 */
public class MatchEventRequest {

    /**
     * @NotNull: el campo no puede ser null (el JSON debe incluirlo).
     * Nota: para Strings, @NotNull no previene strings vacíos — para eso existe @NotBlank.
     */
    @NotNull(message = "El tipo de evento es requerido")
    private EventType eventType;

    /**
     * @NotBlank: no null, no vacío (""), no solo espacios (" ").
     * Es más estricto que @NotNull para Strings.
     */
    @NotBlank(message = "El ID del jugador es requerido")
    private String playerId;

    @NotBlank(message = "El nombre del jugador es requerido")
    private String playerName;

    @NotBlank(message = "El ID del equipo es requerido")
    private String teamId;

    @NotBlank(message = "El nombre del equipo es requerido")
    private String teamName;

    @NotBlank(message = "El ID del partido es requerido")
    private String matchId;

    /**
     * @Min y @Max: rango válido para el minuto del partido.
     * 0 = pre-partido, 120 = tiempo extra.
     * Si el JSON manda minute: 150, Spring devuelve 400 automáticamente.
     */
    @Min(value = 0, message = "El minuto no puede ser negativo")
    @Max(value = 120, message = "El minuto no puede superar los 120 (tiempo extra)")
    private int minute;

    // ── Getters y Setters ────────────────────────────────────────────────────
    //
    // En Java estándar necesitamos getters y setters para encapsulamiento.
    // Jackson los usa para serializar/deserializar.
    //
    // ALTERNATIVA MODERNA: usar Lombok (@Data) para generarlos automáticamente.
    // Para aprender, los escribimos a mano para ver qué genera Lombok después.

    public EventType getEventType() { return eventType; }
    public void setEventType(EventType eventType) { this.eventType = eventType; }

    public String getPlayerId() { return playerId; }
    public void setPlayerId(String playerId) { this.playerId = playerId; }

    public String getPlayerName() { return playerName; }
    public void setPlayerName(String playerName) { this.playerName = playerName; }

    public String getTeamId() { return teamId; }
    public void setTeamId(String teamId) { this.teamId = teamId; }

    public String getTeamName() { return teamName; }
    public void setTeamName(String teamName) { this.teamName = teamName; }

    public String getMatchId() { return matchId; }
    public void setMatchId(String matchId) { this.matchId = matchId; }

    public int getMinute() { return minute; }
    public void setMinute(int minute) { this.minute = minute; }

    @Override
    public String toString() {
        return "MatchEventRequest{" +
                "eventType=" + eventType +
                ", playerId='" + playerId + '\'' +
                ", playerName='" + playerName + '\'' +
                ", teamId='" + teamId + '\'' +
                ", matchId='" + matchId + '\'' +
                ", minute=" + minute +
                '}';
    }
}
