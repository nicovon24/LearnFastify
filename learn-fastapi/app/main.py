"""
main.py — Entry point de la aplicación FastAPI.

Aquí se crea la instancia principal de FastAPI y se registran los routers.
Es el equivalente al AppModule de NestJS: el módulo raíz que conecta todo.

Lifespan (startup/shutdown):
FastAPI usa el decorador @asynccontextmanager para manejar eventos del ciclo de vida.
En el startup creamos las tablas si no existen (útil en desarrollo).
En producción, las migraciones se harían con Alembic (equivalente a las migrations
de Django o TypeORM), no con create_all.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from sqlmodel import SQLModel

from app.database import engine
from app.routers import players, clubs


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Context manager que corre código al inicio y al cierre de la app.
    - ANTES del yield: startup (ej: crear tablas, conectar a servicios externos).
    - DESPUÉS del yield: shutdown (ej: cerrar conexiones).
    """
    # Crea todas las tablas definidas en models.py si no existen.
    # SQLModel.metadata contiene el registro de todos los modelos con table=True.
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    yield
    # Aquí iría código de cleanup si fuera necesario


app = FastAPI(
    title="Stats API",
    description=(
        "Microservicio de estadísticas de jugadores de fútbol. "
        "Lee datos del esquema compartido con el sistema Django Players Admin."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# Registro de routers — equivalente a app.use() de Express o forRoot() de NestJS.
# prefix agrupa todas las rutas bajo ese path base.
# tags agrupa los endpoints en la UI de /docs.
app.include_router(players.router, prefix="/players", tags=["players"])
app.include_router(clubs.router, prefix="/clubs", tags=["clubs"])


@app.get("/health", tags=["health"])
async def health_check():
    """Endpoint de health check — útil para docker-compose y load balancers."""
    return {"status": "ok"}
