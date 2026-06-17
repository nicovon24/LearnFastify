"""
conftest.py — Configuración compartida de pytest (fixtures globales).

Este archivo es cargado automáticamente por pytest antes de correr los tests.
Las fixtures definidas aquí están disponibles en todos los archivos de test
sin necesidad de importarlas explícitamente.

Conceptos clave:

1. Dependency Override (app.dependency_overrides):
   FastAPI tiene un mecanismo para reemplazar dependencias en tiempo de test.
   app.dependency_overrides[get_session] = get_test_session
   → cada vez que un endpoint pida Depends(get_session), recibirá get_test_session.
   Esto es MUCHO más limpio que mockear: el endpoint corre REAL, pero contra una DB de test.
   Equivalente a sobreescribir un provider en el TestingModule de NestJS.

2. SQLite en memoria para tests:
   Usamos SQLite (aiosqlite) en vez de Postgres en los tests para no necesitar
   una DB real corriendo. Es suficiente para testear la lógica de queries.
   En tests de integración reales sí conviene usar Postgres (via docker o testcontainers).

3. pytest fixtures con yield:
   Similar al contexto de database.py — el código antes del yield es setup,
   el código después es teardown. pytest garantiza que el teardown corre
   aunque el test falle.

4. @pytest.mark.asyncio:
   pytest no sabe correr tests async por defecto. pytest-asyncio agrega este soporte.
   asyncio_mode = "auto" en pytest.ini evita tener que decorar cada test.
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel

from app.main import app
from app.database import get_session

# Base de datos SQLite en memoria para tests.
# "check_same_thread": False es necesario para SQLite async.
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"


@pytest_asyncio.fixture(scope="function")
async def test_session():
    """
    Crea una sesión de DB limpia para cada test.
    scope="function" significa que se crea y destruye por cada función de test,
    garantizando aislamiento total entre tests.
    """
    engine = create_async_engine(
        TEST_DATABASE_URL,
        connect_args={"check_same_thread": False},
    )

    async with engine.begin() as conn:
        # Crear todas las tablas en la DB de test
        await conn.run_sync(SQLModel.metadata.create_all)

    AsyncTestSession = sessionmaker(
        bind=engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with AsyncTestSession() as session:
        yield session

    # Teardown: eliminar todas las tablas después del test
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.drop_all)

    await engine.dispose()


@pytest_asyncio.fixture(scope="function")
async def client(test_session: AsyncSession):
    """
    Cliente HTTP async para hacer requests a la app en tests.

    app.dependency_overrides es el mecanismo de FastAPI para reemplazar
    dependencias en tests. Acá reemplazamos get_session con una función
    que devuelve nuestra sesión de test.

    ASGITransport: httpx puede hablar con una app ASGI directamente,
    sin necesitar que la app esté corriendo en un puerto real.
    Equivalente al supertest de NestJS.
    """

    async def get_test_session():
        yield test_session

    # Registrar el override ANTES de crear el cliente
    app.dependency_overrides[get_session] = get_test_session

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    # Limpiar el override después del test para no afectar otros tests
    app.dependency_overrides.clear()
