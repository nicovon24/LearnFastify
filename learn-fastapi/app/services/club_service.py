"""
club_service.py — Lógica de negocio para estadísticas de clubes.

Este service muestra cómo hacer agregaciones con JOINs de múltiples tablas:
Club → Player → Match. Es una query más compleja que las de player_service,
pero sigue el mismo patrón: select() + joins + group_by + func.sum().

Concepto de "subquery" vs "join directo":
Aquí usamos join directo porque la relación es lineal:
Match JOIN Player JOIN Club. SQLAlchemy puede hacer este join declarativamente
usando los foreign keys que ya definimos en los modelos.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, func
from fastapi import HTTPException

from app.models import Club, Player, Match
from app.schemas import ClubStatsResponse


async def get_club_stats(club_id: int, session: AsyncSession) -> ClubStatsResponse:
    """
    Calcula estadísticas agregadas de un club:
    - Total de jugadores en el plantel.
    - Total de partidos (suma de apariciones de todos los jugadores).
    - Total de goles y asistencias del equipo.
    """
    # Paso 1: verificar que el club existe
    result = await session.exec(select(Club).where(Club.id == club_id))
    club = result.first()

    if not club:
        raise HTTPException(status_code=404, detail=f"Club {club_id} not found")

    # Paso 2: contar jugadores del club
    players_count_result = await session.exec(
        select(func.count(Player.id)).where(Player.club_id == club_id)
    )
    total_players = players_count_result.first() or 0

    # Paso 3: agregar stats de partidos de todos los jugadores del club.
    # Necesitamos hacer JOIN entre Match y Player para filtrar por club_id.
    # SQLAlchemy usa .join() especificando la condición del join.
    stats_query = (
        select(
            func.count(Match.id).label("total_matches"),
            func.coalesce(func.sum(Match.goals), 0).label("total_goals"),
            func.coalesce(func.sum(Match.assists), 0).label("total_assists"),
        )
        .join(Player, Match.player_id == Player.id)
        .where(Player.club_id == club_id)
    )

    stats_result = await session.exec(stats_query)
    stats = stats_result.first()

    return ClubStatsResponse(
        club_id=club.id,
        club_name=club.name,
        country=club.country,
        league=club.league,
        total_players=total_players,
        total_matches=stats.total_matches if stats else 0,
        total_goals=stats.total_goals if stats else 0,
        total_assists=stats.total_assists if stats else 0,
    )
