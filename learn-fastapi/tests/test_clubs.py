"""
test_clubs.py — Tests para el endpoint de estadísticas de clubes.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Club, Player, Match


@pytest.mark.asyncio
async def test_get_club_stats_success(client: AsyncClient, test_session: AsyncSession):
    """
    Test del happy path: club con jugadores y partidos.
    """
    # Arrange
    club = Club(name="Boca Juniors", country="Argentina", league="Liga Profesional")
    test_session.add(club)
    await test_session.commit()
    await test_session.refresh(club)

    # 2 jugadores en el club
    player1 = Player(name="Jugador Uno", position="FW", club_id=club.id)
    player2 = Player(name="Jugador Dos", position="MF", club_id=club.id)
    test_session.add(player1)
    test_session.add(player2)
    await test_session.commit()
    await test_session.refresh(player1)
    await test_session.refresh(player2)

    # Partidos de player1: 3 goles, 1 asistencia
    test_session.add(Match(player_id=player1.id, match_date="2024-01-10", goals=2, assists=1, minutes_played=90))
    test_session.add(Match(player_id=player1.id, match_date="2024-01-17", goals=1, assists=0, minutes_played=90))
    # Partidos de player2: 1 gol, 3 asistencias
    test_session.add(Match(player_id=player2.id, match_date="2024-01-10", goals=1, assists=3, minutes_played=90))
    await test_session.commit()

    # Act
    response = await client.get(f"/clubs/{club.id}/stats")

    # Assert
    assert response.status_code == 200
    data = response.json()

    assert data["club_id"] == club.id
    assert data["club_name"] == "Boca Juniors"
    assert data["country"] == "Argentina"
    assert data["total_players"] == 2
    assert data["total_matches"] == 3         # 2 de player1 + 1 de player2
    assert data["total_goals"] == 4           # 2 + 1 + 1
    assert data["total_assists"] == 4         # 1 + 0 + 3
    # goals_per_match = 4 goles / 3 partidos = 1.33
    assert data["goals_per_match"] == round(4 / 3, 2)


@pytest.mark.asyncio
async def test_get_club_stats_empty_squad(client: AsyncClient, test_session: AsyncSession):
    """
    Test: club sin jugadores devuelve zeros (no error).
    """
    club = Club(name="Club Vacío", country="AR", league="Liga X")
    test_session.add(club)
    await test_session.commit()
    await test_session.refresh(club)

    response = await client.get(f"/clubs/{club.id}/stats")

    assert response.status_code == 200
    data = response.json()
    assert data["total_players"] == 0
    assert data["total_matches"] == 0
    assert data["goals_per_match"] == 0.0


@pytest.mark.asyncio
async def test_get_club_stats_not_found(client: AsyncClient, test_session: AsyncSession):
    """
    Test: club inexistente devuelve 404.
    """
    response = await client.get("/clubs/99999/stats")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()
