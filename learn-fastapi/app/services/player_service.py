"""
player_service.py — Lógica de negocio para estadísticas de jugadores.

Por qué separar la lógica en un "service" y no escribirla directo en el router:
- El router es responsable de HTTP (recibir requests, devolver responses).
- El service es responsable de la lógica de datos (consultar DB, calcular stats).
- Esta separación (principio de responsabilidad única) hace el código testeable:
  podés testear el service sin levantar HTTP, y mockear el service en tests del router.
- Equivalente exacto a los @Injectable() services de NestJS.

SQLAlchemy async queries:
- select() construye la query (como un query builder).
- session.exec() la ejecuta de forma async (hay que hacer await).
- .all() devuelve todos los resultados, .first() devuelve el primero o None.
"""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select, func
from fastapi import HTTPException

from app.models import Player, Match, Club
from app.schemas import PlayerStatsResponse, TopScorerItem, TopScorersResponse


async def get_player_stats(player_id: int, session: AsyncSession) -> PlayerStatsResponse:
    """
    Calcula estadísticas agregadas de un jugador dado su ID.

    Pasos:
    1. Busca el jugador (con su club, usando join).
    2. Agrega sus partidos (SUM de goles, assists, minutos).
    3. Construye y devuelve el schema de respuesta.
    """
    # Paso 1: buscar el jugador.
    # select(Player) construye SELECT * FROM player WHERE player.id = ?
    # La sintaxis es más explícita que el ORM mágico de Django (Player.objects.get),
    # pero te da control total sobre la query.
    result = await session.exec(select(Player).where(Player.id == player_id))
    player = result.first()

    if not player:
        # HTTPException es la forma estándar de FastAPI para devolver errores HTTP.
        # FastAPI la captura y devuelve {"detail": "..."} con el status code correcto.
        raise HTTPException(status_code=404, detail=f"Player {player_id} not found")

    # Paso 2: obtener nombre del club si tiene uno.
    club_name = None
    if player.club_id:
        club_result = await session.exec(select(Club).where(Club.id == player.club_id))
        club = club_result.first()
        club_name = club.name if club else None

    # Paso 3: agregar stats de partidos.
    # func.sum() / func.count() son funciones de SQL que SQLAlchemy mapea.
    # coalesce(x, 0) devuelve 0 si x es NULL (cuando no hay partidos).
    stats_query = select(
        func.count(Match.id).label("matches_played"),
        func.coalesce(func.sum(Match.goals), 0).label("total_goals"),
        func.coalesce(func.sum(Match.assists), 0).label("total_assists"),
        func.coalesce(func.sum(Match.minutes_played), 0).label("total_minutes"),
    ).where(Match.player_id == player_id)

    stats_result = await session.exec(stats_query)
    stats = stats_result.first()

    return PlayerStatsResponse(
        player_id=player.id,
        player_name=player.name,
        club_name=club_name,
        matches_played=stats.matches_played if stats else 0,
        total_goals=stats.total_goals if stats else 0,
        total_assists=stats.total_assists if stats else 0,
        total_minutes=stats.total_minutes if stats else 0,
    )


async def get_top_scorers(
    session: AsyncSession,
    page: int = 1,
    page_size: int = 10,
) -> TopScorersResponse:
    """
    Devuelve el ranking de jugadores por total de goles, con paginación.

    Paginación con OFFSET/LIMIT:
    - LIMIT = page_size (cuántos resultados por página)
    - OFFSET = (page - 1) * page_size (cuántos resultados saltear)
    - Ej: page=2, page_size=10 → OFFSET 10, devuelve resultados 11-20.
    """
    # Subquery: suma de goles por jugador
    goals_subquery = (
        select(
            Match.player_id,
            func.coalesce(func.sum(Match.goals), 0).label("total_goals"),
            func.count(Match.id).label("matches_played"),
        )
        .group_by(Match.player_id)
        .subquery()
    )

    # Query principal: join con Player para obtener nombre y club
    main_query = (
        select(
            Player.id.label("player_id"),
            Player.name.label("player_name"),
            Player.club_id,
            goals_subquery.c.total_goals,
            goals_subquery.c.matches_played,
        )
        .join(goals_subquery, Player.id == goals_subquery.c.player_id)
        .order_by(goals_subquery.c.total_goals.desc())
    )

    # Contar total para metadata de paginación
    count_query = select(func.count()).select_from(main_query.subquery())
    total_result = await session.exec(count_query)
    total = total_result.first() or 0

    # Aplicar paginación
    offset = (page - 1) * page_size
    paginated_query = main_query.offset(offset).limit(page_size)
    rows_result = await session.exec(paginated_query)
    rows = rows_result.all()

    # Obtener nombres de club para los resultados
    club_ids = [row.club_id for row in rows if row.club_id]
    clubs_map: dict[int, str] = {}
    if club_ids:
        clubs_result = await session.exec(select(Club).where(Club.id.in_(club_ids)))
        for club in clubs_result.all():
            clubs_map[club.id] = club.name

    items = [
        TopScorerItem(
            rank=offset + idx + 1,
            player_id=row.player_id,
            player_name=row.player_name,
            club_name=clubs_map.get(row.club_id),
            total_goals=row.total_goals,
            matches_played=row.matches_played,
        )
        for idx, row in enumerate(rows)
    ]

    return TopScorersResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
    )
