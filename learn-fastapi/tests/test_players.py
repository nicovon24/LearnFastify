"""
test_players.py — Tests para los endpoints de jugadores.

Patrón AAA (Arrange, Act, Assert):
- Arrange: preparar los datos de test (insertar en DB).
- Act: hacer el request HTTP.
- Assert: verificar la respuesta.

Por qué usar AsyncClient en vez de TestClient:
TestClient de FastAPI usa un thread separado para correr la app de forma sync,
lo que puede causar problemas con código async. AsyncClient de httpx corre
todo en el mismo event loop, lo que es más correcto para apps async.
"""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Player, Club, Match


# pytest.mark.asyncio le dice a pytest que este test es async y debe
# correrse en el event loop. Con asyncio_mode="auto" en pytest.ini no hace falta.
@pytest.mark.asyncio
async def test_get_player_stats_success(client: AsyncClient, test_session: AsyncSession):
    """
    Test del happy path: jugador con partidos, devuelve stats correctas.
    """
    # --- Arrange ---
    club = Club(name="River Plate", country="Argentina", league="Liga Profesional")
    test_session.add(club)
    await test_session.commit()
    await test_session.refresh(club)

    player = Player(name="Marcelo Gallardo", position="MF", club_id=club.id)
    test_session.add(player)
    await test_session.commit()
    await test_session.refresh(player)

    # 3 partidos con distintas stats
    matches = [
        Match(player_id=player.id, match_date="2024-01-10", goals=2, assists=1, minutes_played=90),
        Match(player_id=player.id, match_date="2024-01-17", goals=0, assists=2, minutes_played=75),
        Match(player_id=player.id, match_date="2024-01-24", goals=1, assists=0, minutes_played=90),
    ]
    for match in matches:
        test_session.add(match)
    await test_session.commit()

    # --- Act ---
    response = await client.get(f"/players/{player.id}/stats")

    # --- Assert ---
    assert response.status_code == 200
    data = response.json()

    assert data["player_id"] == player.id
    assert data["player_name"] == "Marcelo Gallardo"
    assert data["club_name"] == "River Plate"
    assert data["matches_played"] == 3
    assert data["total_goals"] == 3       # 2 + 0 + 1
    assert data["total_assists"] == 3     # 1 + 2 + 0
    assert data["total_minutes"] == 255   # 90 + 75 + 90
    assert data["goal_average"] == 1.0    # 3 goles / 3 partidos


@pytest.mark.asyncio
async def test_get_player_stats_no_matches(client: AsyncClient, test_session: AsyncSession):
    """
    Test: jugador sin partidos devuelve zeros (no error).
    """
    # Arrange
    player = Player(name="Nuevo Jugador", position="GK")
    test_session.add(player)
    await test_session.commit()
    await test_session.refresh(player)

    # Act
    response = await client.get(f"/players/{player.id}/stats")

    # Assert
    assert response.status_code == 200
    data = response.json()
    assert data["matches_played"] == 0
    assert data["total_goals"] == 0
    assert data["goal_average"] == 0.0


@pytest.mark.asyncio
async def test_get_player_stats_not_found(client: AsyncClient, test_session: AsyncSession):
    """
    Test: ID que no existe devuelve 404.
    """
    response = await client.get("/players/99999/stats")
    assert response.status_code == 404
    assert "not found" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_get_top_scorers_ranking(client: AsyncClient, test_session: AsyncSession):
    """
    Test: el ranking devuelve jugadores ordenados por goles descendente.
    """
    # Arrange: 3 jugadores con distintos totales de goles
    players_data = [
        ("Carlos Tevez", 5),
        ("Juan Riquelme", 10),
        ("Sergio Aguero", 7),
    ]

    for name, goals in players_data:
        player = Player(name=name, position="FW")
        test_session.add(player)
        await test_session.commit()
        await test_session.refresh(player)

        match = Match(player_id=player.id, match_date="2024-01-10", goals=goals, assists=0, minutes_played=90)
        test_session.add(match)

    await test_session.commit()

    # Act
    response = await client.get("/players/top-scorers?page=1&page_size=10")

    # Assert
    assert response.status_code == 200
    data = response.json()

    assert data["total"] == 3
    assert data["page"] == 1
    assert len(data["items"]) == 3

    # El primero debe ser el de más goles (Riquelme con 10)
    assert data["items"][0]["player_name"] == "Juan Riquelme"
    assert data["items"][0]["total_goals"] == 10
    assert data["items"][0]["rank"] == 1

    # El segundo debe ser Aguero con 7
    assert data["items"][1]["player_name"] == "Sergio Aguero"
    assert data["items"][1]["total_goals"] == 7


@pytest.mark.asyncio
async def test_get_top_scorers_pagination(client: AsyncClient, test_session: AsyncSession):
    """
    Test: la paginación funciona correctamente (page_size limita resultados).
    """
    # Crear 5 jugadores
    for i in range(5):
        player = Player(name=f"Player {i}", position="FW")
        test_session.add(player)
        await test_session.commit()
        await test_session.refresh(player)
        match = Match(player_id=player.id, match_date="2024-01-10", goals=i, assists=0, minutes_played=90)
        test_session.add(match)

    await test_session.commit()

    # Page 1 con page_size=2 → 2 resultados
    response = await client.get("/players/top-scorers?page=1&page_size=2")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 2
    assert data["total"] == 5

    # Page 2 → otros 2
    response2 = await client.get("/players/top-scorers?page=2&page_size=2")
    data2 = response2.json()
    assert len(data2["items"]) == 2
    # Los primeros de page 1 y page 2 deben ser distintos
    assert data["items"][0]["player_id"] != data2["items"][0]["player_id"]
