"""
schemas.py — Modelos Pydantic de respuesta (response schemas).

Estos son los "DTOs de salida" de la API. Son clases Pydantic puras
(sin table=True), lo que significa que NO crean tablas en la DB.
Su único rol es definir la forma del JSON que devuelve cada endpoint.

Por qué tener schemas separados de los modelos de DB:
1. No querés exponer todos los campos de la tabla (ej: campos internos, IDs de FK).
2. Los schemas de respuesta pueden incluir campos calculados (ej: goal_average)
   que no existen como columnas en la DB.
3. Principio de separación: el modelo de DB define CÓMO se almacena,
   el schema define CÓMO se comunica hacia afuera.

FastAPI usa estos schemas para:
- Validar que la respuesta tiene la forma correcta.
- Generar la documentación OpenAPI en /docs automáticamente.
- Serializar la respuesta a JSON.
"""

from pydantic import BaseModel, computed_field


class PlayerStatsResponse(BaseModel):
    """
    Respuesta del endpoint GET /players/{id}/stats.
    Estadísticas agregadas de un jugador a lo largo de su carrera (o temporada).
    """

    player_id: int
    player_name: str
    club_name: str | None  # Puede ser None si el jugador no tiene club asignado

    # Estadísticas calculadas — no columnas de DB
    matches_played: int
    total_goals: int
    total_assists: int
    total_minutes: int

    @computed_field  # type: ignore[misc]
    @property
    def goal_average(self) -> float:
        """
        computed_field de Pydantic v2: un campo calculado en Python que aparece
        en el JSON de respuesta y en la documentación OpenAPI.
        Equivalente a un getter en una clase TypeScript.
        """
        if self.matches_played == 0:
            return 0.0
        return round(self.total_goals / self.matches_played, 2)


class TopScorerItem(BaseModel):
    """
    Un ítem del ranking de goleadores.
    """

    rank: int
    player_id: int
    player_name: str
    club_name: str | None
    total_goals: int
    matches_played: int


class TopScorersResponse(BaseModel):
    """
    Respuesta del endpoint GET /players/top-scorers.
    Incluye metadatos de paginación junto con los resultados.

    Por qué envolver en un objeto en vez de devolver lista directa:
    - Permite agregar metadata (total, page, etc.) sin romper el contrato de la API.
    - Es una práctica estándar en APIs REST (la lista va en una key "items" o "data").
    """

    items: list[TopScorerItem]
    total: int
    page: int
    page_size: int


class ClubStatsResponse(BaseModel):
    """
    Respuesta del endpoint GET /clubs/{id}/stats.
    """

    club_id: int
    club_name: str
    country: str
    league: str

    # Estadísticas del plantel
    total_players: int
    total_matches: int
    total_goals: int
    total_assists: int

    @computed_field  # type: ignore[misc]
    @property
    def goals_per_match(self) -> float:
        if self.total_matches == 0:
            return 0.0
        return round(self.total_goals / self.total_matches, 2)
