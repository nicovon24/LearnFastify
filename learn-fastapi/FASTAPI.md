# FastAPI + Python — Guía de referencia rápida

---

## La idea central

FastAPI convierte **funciones Python** en endpoints HTTP, usando los **type hints** del lenguaje para validar datos automáticamente. Si en NestJS usás decoradores (`@Get()`, `@Body()`), en FastAPI la información está en la firma de la función — el framework infiere todo del tipado.

```
Request HTTP entrante
       ↓
  ASGI (Uvicorn)         → servidor asíncrono que recibe el request
       ↓
  Middleware             → lógica global (CORS, logging, timing)
       ↓
  Router                 → enruta según path + método HTTP
       ↓
  Dependencies           → resuelve dependencias (DI de FastAPI)
       ↓
  Pydantic Validation    → valida y parsea el body/query/path
       ↓
  Handler (función)      → tu lógica de negocio
       ↓
  Pydantic Serialization → convierte la respuesta a JSON
       ↓
  Response HTTP
```

---

## 1. App y Router — `FastAPI()` y `APIRouter`

**Qué es:** `FastAPI()` es la aplicación principal. `APIRouter` es un mini-router para agrupar rutas por dominio (equivalente a `@Module()` + `@Controller()` en NestJS).

```python
# app/main.py — punto de entrada
from fastapi import FastAPI
from app.routers import players, clubs

app = FastAPI(title="Scouting API", version="1.0.0")

# include_router: registra un router con un prefijo
# equivalente a app.module.ts registrando PlayersModule
app.include_router(players.router, prefix="/players", tags=["players"])
app.include_router(clubs.router, prefix="/clubs", tags=["clubs"])
```

```python
# app/routers/players.py — router de jugadores
from fastapi import APIRouter

router = APIRouter()

@router.get("/")           # GET /players
def get_players(): ...

@router.get("/{player_id}") # GET /players/{player_id}
def get_player(player_id: int): ...
```

**Analogía:** `FastAPI()` es el edificio. Cada `APIRouter` es un piso con sus propias habitaciones (endpoints).

---

## 2. Path, Query y Body — parámetros de entrada

**Qué es:** FastAPI infiere de dónde viene cada parámetro según cómo lo declarás en la firma de la función.

```python
from fastapi import APIRouter, Query, Path, Body
from app.schemas import CreatePlayerSchema

router = APIRouter()

@router.get("/{player_id}")
def get_player(
    player_id: int,              # ← en el path: /players/42
    include_stats: bool = False, # ← query param: /players/42?include_stats=true
):
    ...

@router.post("/")
def create_player(
    player: CreatePlayerSchema,  # ← body JSON — Pydantic lo valida
):
    ...
```

**Regla:**
- `player_id: int` → coincide con `{player_id}` en el path → **path parameter**
- `include_stats: bool = False` → no está en el path → **query parameter**
- `player: CreatePlayerSchema` → es un modelo Pydantic → **request body**

---

## 3. Pydantic — Validación de datos

**Qué es:** la librería de validación de FastAPI. Define la forma de los datos de entrada y salida. Equivalente a los DTOs con `class-validator` en NestJS, pero más potente y pytónico.

```python
# app/schemas.py
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import datetime

class CreatePlayerSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    position: str = Field(..., description="Posición táctica del jugador")
    age: int = Field(..., ge=15, le=45)      # ge=mayor igual, le=menor igual
    email: Optional[EmailStr] = None         # opcional, validado como email si viene

class PlayerResponseSchema(BaseModel):
    id: int
    name: str
    position: str
    age: int
    created_at: datetime

    class Config:
        from_attributes = True  # permite crear desde un objeto ORM (SQLAlchemy)
```

Si el body no cumple las reglas, FastAPI devuelve automáticamente:

```json
{
  "detail": [
    { "loc": ["body", "age"], "msg": "ensure this value is greater than or equal to 15" }
  ]
}
```

**Comparación con NestJS:**

| NestJS (class-validator) | FastAPI (Pydantic) |
|---|---|
| `@IsString()` | `name: str` |
| `@IsNumber()` | `age: int` |
| `@IsEmail()` | `email: EmailStr` |
| `@IsOptional()` | `campo: Optional[str] = None` |
| `@Min(15)` | `age: int = Field(..., ge=15)` |
| `@MinLength(2)` | `name: str = Field(..., min_length=2)` |

---

## 4. SQLAlchemy + ORM — Base de datos

**Qué es:** SQLAlchemy es el ORM de Python. Define tablas como clases Python. Equivalente a TypeORM/entidades de NestJS.

```python
# app/models.py
from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from app.database import Base

class Player(Base):
    __tablename__ = "players"          # nombre de la tabla

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    position = Column(String(50), nullable=False)
    age = Column(Integer, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
```

```python
# app/database.py
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:pass@localhost/db")

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Dependency: función que provee una sesión de DB y la cierra al terminar
def get_db():
    db = SessionLocal()
    try:
        yield db        # yield: FastAPI usa el valor y después ejecuta el finally
    finally:
        db.close()      # siempre se cierra, aunque haya una excepción
```

**Comparación con NestJS/TypeORM:**

| TypeORM (NestJS) | SQLAlchemy (FastAPI) |
|---|---|
| `@Entity('players')` | `__tablename__ = "players"` |
| `@Column()` | `Column(String)` |
| `@PrimaryGeneratedColumn()` | `Column(Integer, primary_key=True)` |
| `@CreateDateColumn()` | `Column(DateTime, server_default=func.now())` |
| `Repository<Player>` | `Session` con métodos CRUD manuales |

---

## 5. Dependency Injection — `Depends()`

**Qué es:** el sistema de DI de FastAPI. `Depends()` inyecta el resultado de una función en el handler. Equivalente a `@Inject()` / `@InjectRepository()` de NestJS, pero como argumento de función.

```python
from fastapi import Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Player

@router.get("/{player_id}")
def get_player(
    player_id: int,
    db: Session = Depends(get_db),   # ← inyecta la sesión de DB
):
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Jugador no encontrado")
    return player
```

**Por qué `Depends()` es poderoso:**
- Las dependencias pueden tener sus propias dependencias (cadena de DI)
- Se reutilizan sin repetir código (auth, DB sessions, paginación...)
- FastAPI los resuelve en el orden correcto automáticamente

```python
# Dependencia de autenticación reutilizable
from fastapi.security import OAuth2PasswordBearer
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
):
    # validar token, buscar usuario...
    return user

# Usarla en cualquier endpoint:
@router.post("/")
def create_player(
    player_data: CreatePlayerSchema,
    current_user = Depends(get_current_user),  # ← protegido
    db: Session = Depends(get_db),
):
    ...
```

---

## 6. Service layer — separar lógica de negocio

**Qué es:** aunque FastAPI no obliga a tener services, es buena práctica separar la lógica del router. Equivalente a los Services de NestJS.

```python
# app/services/player_service.py
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models import Player
from app.schemas import CreatePlayerSchema

def get_player_by_id(db: Session, player_id: int) -> Player:
    player = db.query(Player).filter(Player.id == player_id).first()
    if not player:
        raise HTTPException(status_code=404, detail="Jugador no encontrado")
    return player

def create_player(db: Session, data: CreatePlayerSchema) -> Player:
    player = Player(**data.model_dump())  # model_dump() = dict de Pydantic
    db.add(player)
    db.commit()
    db.refresh(player)   # actualiza el objeto con los datos de DB (id, created_at)
    return player
```

```python
# app/routers/players.py — el router solo coordina
from app.services.player_service import get_player_by_id, create_player

@router.get("/{player_id}", response_model=PlayerResponseSchema)
def get_player(player_id: int, db: Session = Depends(get_db)):
    return get_player_by_id(db, player_id)
```

---

## 7. Async/Await — cuándo usarlo

**Qué es:** FastAPI soporta handlers síncronos y asíncronos. La diferencia importa para operaciones de I/O.

```python
# Síncrono — OK para operaciones rápidas o cuando usás drivers síncronos
@router.get("/sync")
def get_sync(db: Session = Depends(get_db)):
    return db.query(Player).all()

# Asíncrono — para I/O concurrente (requests HTTP externos, websockets)
@router.get("/async")
async def get_async():
    async with httpx.AsyncClient() as client:
        response = await client.get("https://api-externa.com/data")
    return response.json()
```

**Regla práctica:**
- Usás SQLAlchemy síncrono → `def` (sin async)
- Hacés requests HTTP externos / websockets → `async def`
- No sabés → `def` funciona siempre (FastAPI lo corre en un threadpool)

**Nota importante:** SQLAlchemy síncrono no libera el event loop aunque uses `async def`. Para async real con DB necesitarías `asyncpg` + `SQLAlchemy async`.

---

## 8. Manejo de errores — `HTTPException`

```python
from fastapi import HTTPException

@router.get("/{player_id}")
def get_player(player_id: int, db: Session = Depends(get_db)):
    player = db.query(Player).filter(Player.id == player_id).first()

    if not player:
        raise HTTPException(
            status_code=404,
            detail="Jugador no encontrado"
        )
    return player
```

**Excepciones HTTP comunes:**

| status_code | Cuándo usarlo |
|---|---|
| 400 | Bad Request — datos de entrada inválidos |
| 401 | Unauthorized — no autenticado |
| 403 | Forbidden — autenticado pero sin permiso |
| 404 | Not Found — recurso no existe |
| 409 | Conflict — duplicado o estado inválido |
| 422 | Unprocessable Entity — Pydantic lo devuelve automáticamente |
| 500 | Internal Server Error — error inesperado |

---

## 9. Response Model — controlar lo que se devuelve

```python
# response_model filtra campos y aplica la serialización de Pydantic
@router.get("/{player_id}", response_model=PlayerResponseSchema)
def get_player(player_id: int, db: Session = Depends(get_db)):
    return get_player_by_id(db, player_id)

# Sin response_model, FastAPI devuelve todo el objeto (incluyendo campos sensibles)
# Con response_model, solo devuelve los campos definidos en PlayerResponseSchema
```

**Patrón común:** tener schemas separados para entrada y salida:
- `CreatePlayerSchema` → lo que recibís (sin id, sin created_at)
- `PlayerResponseSchema` → lo que devolvés (con id, con created_at)

---

## 10. Autenticación JWT

```python
# app/routers/auth.py
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
import jwt
from datetime import datetime, timedelta

router = APIRouter()

SECRET_KEY = "tu-secret-key"
ALGORITHM = "HS256"

def create_access_token(user_id: int) -> str:
    payload = {
        "sub": str(user_id),
        "exp": datetime.utcnow() + timedelta(hours=24)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = authenticate_user(db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Credenciales inválidas")

    token = create_access_token(user.id)
    return {"access_token": token, "token_type": "bearer"}
```

---

## Resumen visual: qué archivo hace qué

```
app/
├── main.py              → Crea FastAPI(), registra routers, configura CORS
├── database.py          → Engine de SQLAlchemy, SessionLocal, get_db dependency
├── models.py            → Clases ORM (tablas de la DB) — equivalente a entities
├── schemas.py           → Modelos Pydantic para validación — equivalente a DTOs
├── config.py            → Variables de entorno con Pydantic Settings
│
├── routers/
│   ├── players.py       → Rutas GET/POST/PATCH/DELETE /players
│   └── clubs.py         → Rutas GET/POST/PATCH/DELETE /clubs
│
└── services/
    ├── player_service.py → Lógica CRUD de jugadores — equivalente a PlayersService
    └── club_service.py   → Lógica CRUD de clubs
```

---

## El ciclo completo de un request

Ejemplo: `POST /players` con body `{ "name": "Messi", "position": "forward", "age": 36 }`:

1. **Uvicorn** recibe el request HTTP
2. **FastAPI** matchea la ruta con `@router.post("/")`
3. **Pydantic** deserializa y valida el body contra `CreatePlayerSchema` — si `age` es negativo, devuelve 422
4. **`Depends(get_db)`** abre una sesión de SQLAlchemy
5. **`create_player()`** del service crea la entidad, hace `db.add()` + `db.commit()`
6. **`response_model=PlayerResponseSchema`** filtra y serializa la respuesta a JSON
7. FastAPI devuelve 201 (o 200 si no configuraste `status_code`)
