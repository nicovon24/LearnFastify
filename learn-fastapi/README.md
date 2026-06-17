# Stats API

Microservicio **FastAPI async** de estadísticas de jugadores de fútbol. Forma parte de una arquitectura de dos servicios junto con un sistema Django de administración:

```
[Django Players Admin]  ──writes──▶  [PostgreSQL]  ◀──reads──  [FastAPI Stats API]
   CRUD + Admin panel                  (shared DB)               Solo lectura, async
```

---

## Stack

| Capa | Tecnología |
|------|-----------|
| Framework | FastAPI 0.111 |
| ORM | SQLModel (Pydantic + SQLAlchemy async) |
| Base de datos | PostgreSQL 16 |
| Validación | Pydantic v2 |
| Tests | pytest + httpx AsyncClient |
| Servidor | Uvicorn (ASGI) |

---

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| `GET` | `/players/{id}/stats` | Estadísticas de un jugador: partidos, goles, asistencias y promedio de goles |
| `GET` | `/players/top-scorers` | Ranking de goleadores con paginación (`?page=1&page_size=10`) |
| `GET` | `/clubs/{id}/stats` | Stats agregadas de un club: plantel, goles totales, goles por partido |
| `GET` | `/health` | Health check |
| `GET` | `/docs` | Swagger UI (autogenerado desde type hints) |
| `GET` | `/redoc` | ReDoc (autogenerado) |

Ejemplo de respuesta de `/players/10/stats`:

```json
{
  "player_id": 10,
  "player_name": "Marcelo Gallardo",
  "club_name": "River Plate",
  "matches_played": 3,
  "total_goals": 3,
  "total_assists": 3,
  "total_minutes": 255,
  "goal_average": 1.0
}
```

---

## Cómo levantar el proyecto

### Con Docker (recomendado)

```bash
cp .env.example .env
docker-compose up --build
```

La API queda en `http://localhost:8000` — el Swagger en `http://localhost:8000/docs`.

### Local sin Docker

```bash
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Linux/Mac

pip install -r requirements.txt

cp .env.example .env
# Editar .env con tu DATABASE_URL local

uvicorn app.main:app --reload
```

### Tests

Los tests usan SQLite en memoria — no hace falta Postgres corriendo.

```bash
pytest -v
```

---

## Estructura del proyecto

```
learn-fastapi/
├── app/
│   ├── main.py               # Entry point: crea la app, registra routers, lifespan
│   ├── config.py             # Settings desde .env con pydantic-settings
│   ├── database.py           # Engine async + get_session (inyectada con Depends)
│   ├── models.py             # Tablas: Club, Player, Match (SQLModel table=True)
│   ├── schemas.py            # DTOs de respuesta Pydantic (sin table=True)
│   ├── routers/
│   │   ├── players.py        # GET /players/top-scorers, GET /players/{id}/stats
│   │   └── clubs.py          # GET /clubs/{id}/stats
│   └── services/
│       ├── player_service.py # Lógica SQL: stats individuales y ranking
│       └── club_service.py   # Lógica SQL: stats agregadas por club
├── tests/
│   ├── conftest.py           # Fixtures: DB en memoria + AsyncClient
│   ├── test_players.py       # 5 tests: happy path, zeros, 404, ranking, paginación
│   └── test_clubs.py         # 3 tests: happy path, plantel vacío, 404
├── docker-compose.yml
├── Dockerfile
├── requirements.txt
└── pytest.ini
```

---

## Relación con Django Players Admin

Este servicio comparte el esquema de base de datos con el proyecto `players-admin` (Django + DRF). La división de responsabilidades:

- **Django Players Admin** — escrituras, auth de usuarios, admin panel visual para staff.
- **FastAPI Stats API** — lecturas optimizadas, cálculos agregados, async para alta concurrencia.

Ventajas de esta separación:
- Stats API puede escalar independientemente si tiene más tráfico de lectura.
- Si Stats API cae, el sistema de admin sigue operando.
- Cada servicio puede cambiar su stack sin afectar al otro.

---

## Conceptos clave

### Type hints → validación + docs automáticos

FastAPI usa los type hints de Python en runtime para tres cosas a la vez, sin decoradores extra:

```python
@router.get("/{player_id}/stats", response_model=PlayerStatsResponse)
async def get_player_stats(player_id: int, session: AsyncSession = Depends(get_session)):
    ...
```

- `player_id: int` → FastAPI valida que sea entero. Si llega `"abc"` → 422 automático.
- `response_model=PlayerStatsResponse` → valida la respuesta y la documenta en `/docs`.
- `Depends(get_session)` → inyecta la sesión de DB (ver más abajo).

Equivalente NestJS: `@Param() @IsInt()` + `@ApiResponse()` + todo el boilerplate de Swagger, pero en una sola línea.

### Depends() — Dependency Injection

El sistema de DI de FastAPI. Cualquier función puede ser una dependencia:

```python
# Se declara una vez
async def get_session():
    async with AsyncSessionLocal() as session:
        yield session   # setup antes del yield, teardown después

# Se inyecta en cualquier endpoint
async def get_stats(session: AsyncSession = Depends(get_session)):
    ...
```

El `yield` convierte `get_session` en un context manager: FastAPI abre la sesión antes del endpoint y la cierra automáticamente al terminar, incluso si hubo error. No hay que escribir `try/finally` en cada handler.

Las dependencias pueden encadenarse (una dependencia puede depender de otra). FastAPI resuelve el grafo automáticamente.

### Pydantic v2 — validación y schemas de respuesta

Los schemas de respuesta son clases Pydantic puras (sin `table=True`). Permiten exponer campos calculados que no existen en la DB:

```python
class PlayerStatsResponse(BaseModel):
    total_goals: int
    matches_played: int

    @computed_field
    @property
    def goal_average(self) -> float:
        if self.matches_played == 0:
            return 0.0
        return round(self.total_goals / self.matches_played, 2)
```

`goal_average` aparece en el JSON de respuesta y en la documentación de `/docs` sin ninguna configuración extra.

### SQLModel — un modelo = tabla + schema

SQLModel combina SQLAlchemy y Pydantic. La misma clase sirve como tabla de DB y como modelo de validación:

```python
class Player(SQLModel, table=True):   # table=True → crea la tabla en Postgres
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    club_id: Optional[int] = Field(default=None, foreign_key="club.id")
```

Sin `table=True` → solo Pydantic (para schemas de respuesta). Elimina la duplicación de tener `PlayerEntity` + `PlayerDTO` como en TypeORM/NestJS.

### async/await — concurrencia sin threads

FastAPI corre sobre un event loop (Uvicorn + asyncio). Un solo proceso puede manejar miles de requests concurrentes porque mientras espera la DB no bloquea el hilo:

```python
# Mientras este await espera a Postgres,
# el servidor atiende otros requests en el mismo hilo
result = await session.exec(select(Player).where(Player.id == player_id))
```

Cuándo usar `async def` vs `def`: si el endpoint hace I/O (DB, HTTP, archivos) → `async def`. Si es cómputo puro (CPU) → `def` (FastAPI lo corre en un thread pool para no bloquear el loop).

### Dependency Override en tests

El mecanismo más potente de FastAPI para tests: reemplazar la dependencia de DB de producción (Postgres) con una de test (SQLite en memoria), sin modificar nada del código de producción:

```python
# conftest.py
async def get_test_session():
    yield session_sqlite_en_memoria

app.dependency_overrides[get_session] = get_test_session
```

Los endpoints se testean con el código real, contra una DB ligera. No hay mocks frágiles que se desincronicen del código. Equivalente a sobreescribir un provider en el `TestingModule` de NestJS.

### Orden de rutas en FastAPI (gotcha frecuente)

FastAPI matchea rutas en orden de registro. Por eso `/top-scorers` debe registrarse **antes** de `/{player_id}`:

```python
# ✅ Correcto: /top-scorers matchea primero
@router.get("/top-scorers", ...)
@router.get("/{player_id}/stats", ...)

# ❌ Incorrecto: FastAPI trataría "top-scorers" como un player_id
@router.get("/{player_id}/stats", ...)
@router.get("/top-scorers", ...)
```

---

## Variables de entorno

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `DATABASE_URL` | Conexión a Postgres (driver async) | `postgresql+asyncpg://user:pass@localhost:5432/statsdb` |
