"""
routers/clubs.py — Endpoints de estadísticas de clubes.

Mismo patrón que players.py: APIRouter + Depends(get_session) + service separado.
El objetivo es que todos los routers sean predecibles y uniformes.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_session
from app.schemas import ClubStatsResponse
from app.services import club_service

router = APIRouter()


@router.get("/{club_id}/stats", response_model=ClubStatsResponse)
async def get_club_stats(
    club_id: int,
    session: AsyncSession = Depends(get_session),
):
    """
    Estadísticas agregadas de un club:
    total de jugadores, partidos, goles y asistencias del plantel.

    club_id es un path parameter — FastAPI lo valida como int automáticamente.
    response_model=ClubStatsResponse hace que FastAPI:
    1. Valide que el objeto devuelto tenga esa forma.
    2. Serialice solo los campos definidos en el schema (no filtra datos extra).
    3. Muestre el schema en la documentación /docs.
    """
    return await club_service.get_club_stats(club_id=club_id, session=session)
