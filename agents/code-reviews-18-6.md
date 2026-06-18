# Code Reviews — LearnTechs (completo)
**Herramienta:** Bugbot (Cursor AI)  
**Proyectos revisados:** learn-ai-engineering · learn-java · learn-aws · learn-nestjs · learn-fastapi

---

## Resumen ejecutivo

| Proyecto | BLOCKs | FLAGs | NOTEs | Estado |
|---|---|---|---|---|
| learn-ai-engineering | 1 | 1 | — | ✅ Corregido |
| learn-java | — | — | — | ✅ Sin hallazgos |
| learn-aws | — | — | — | ✅ Sin hallazgos |
| learn-nestjs | 4 | 6 | 2 | ⚠️ Pendiente de fix |
| learn-fastapi | 2 | 5 | 2 | ✅ Corregido |
| **Total** | **7** | **12** | **4** | |

---

## learn-ai-engineering — 2026-06-17

### BLOCK — Segundo LLM puede corromper la respuesta del agente ✅ corregido
**Archivo:** `scout-ai-copilot/app/api/chat/route.ts:72-100`

Después de que LangGraph produce la respuesta final con Sonnet, la ruta la enviaba a un segundo `streamText` en Haiku pidiéndole que la retransmitiera sin cambios. El frontend renderiza `PlayerCard` parseando un marcador `PLAYER_STATS_DATA` del stream, pero ese marcador se inyectaba en el prompt de Haiku — un relay no determinístico podía omitirlo o reescribirlo, haciendo que la Generative UI fallara silenciosamente.

**Fix aplicado:** Se eliminó el segundo LLM. El texto del agente se escribe directamente al `ReadableStream`, garantizando que el marcador siempre llega intacto.

---

### FLAG — Búsqueda parcial puede devolver el jugador equivocado ✅ corregido
**Archivo:** `scout-ai-copilot/lib/db/players.ts:26-31`

`getPlayerStats` resuelve jugadores con `ilike` + `limit(1)` pero sin `order by`. Cuando varios nombres coinciden con el substring, Postgres devuelve una fila arbitraria — el agente podía adjuntar las stats del jugador equivocado.

**Fix aplicado:** Se agregó `.order('name', { ascending: true })` para resultados determinísticos.

---

## learn-java — 2026-06-17

Sin hallazgos. Código sólido.

---

## learn-aws — 2026-06-17

Sin hallazgos. Código sólido.

---

## learn-nestjs — 2026-06-18

### BLOCKs — impiden el merge

#### 1. E2E test espera una ruta que no existe ⚠️ pendiente
**Archivo:** `test/app.e2e-spec.ts:19-23`

El spec assert que `GET /` devuelve 200 con `Hello World!`, pero la app no tiene ningún controller raíz. `npm run test:e2e` falla siempre y da falsa confianza de que la API funciona.

**Fix:** Actualizar el e2e spec para testear una ruta real (ej. `GET /players` → 200).

---

#### 2. TypeORM `synchronize: true` sin guardia de entorno ⚠️ pendiente
**Archivo:** `src/app.module.ts:46-55`

`TypeOrmModule.forRoot` tiene `synchronize: true` sin condición de entorno. Con credenciales de producción, TypeORM puede auto-alterar el schema y borrar columnas o datos sin migraciones.

**Fix:**
```typescript
synchronize: process.env.NODE_ENV !== 'production',
```

---

#### 3. JWT secret hardcodeado como fallback ⚠️ pendiente
**Archivo:** `src/auth/auth.module.ts:35-38`

`JwtModule.register` y `JwtStrategy` caen a `'super-secret-change-in-production'` cuando `JWT_SECRET` no está definido. Cualquiera que conozca el default puede forjar tokens válidos contra un deploy mal configurado.

**Fix:**
```typescript
if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET env var is required');
secret: process.env.JWT_SECRET,
```

---

#### 4. Delete de player rompe con matches relacionados ⚠️ pendiente
**Archivo:** `src/players/players.service.ts:56-59`

`remove` borra un `Player` sin limpiar las filas pivot de `match_players`. Una vez que un jugador está en un partido, `DELETE /players/:id` lanza una violación de FK y devuelve 500.

**Fix:** Limpiar la relación antes de borrar, o usar `cascade: true` en la entidad.

---

### FLAGs — hay que arreglarlo, no bloquea

#### 5. Registro duplicado devuelve 500
**Archivo:** `src/auth/auth.service.ts:41-59`

Calls concurrentes con el mismo email/username pueden pasar ambos el pre-check; el segundo `save` falla en el índice unique y devuelve 500 en vez de 409 Conflict.

**Fix:** Try/catch en el `save` detectando violación de unique → `ConflictException`.

---

#### 6. N+1 queries en `getAllPlayersStats`
**Archivo:** `src/stats/stats.service.ts:80-83`

`getAllPlayersStats` carga todos los jugadores y llama `getPlayerStats` por cada uno — una query de existencia + un QueryBuilder por jugador. `GET /stats` degrada linealmente, DoS trivial sin autenticación.

**Fix:** Un solo JOIN en vez de N queries separadas.

---

#### 7. JWT no revalida existencia del usuario
**Archivo:** `src/auth/strategies/jwt.strategy.ts:44-46`

`validate` confía en el payload del JWT sin consultar la DB. Los tokens siguen siendo válidos hasta 7 días después de borrar la cuenta o rotar credenciales.

**Fix:**
```typescript
async validate(payload: JwtPayload) {
  const user = await this.userRepository.findOneBy({ id: payload.sub });
  if (!user) throw new UnauthorizedException();
  return user;
}
```

---

#### 8. UUIDs inválidos en params causan 500
**Archivo:** `src/players/players.controller.ts:61-62`

Parámetros `:id` sin `ParseUUIDPipe`. UUIDs mal formados llegan a PostgreSQL, disparan error de query → 500 en vez de 400.

**Fix:**
```typescript
@Get(':id')
findOne(@Param('id', ParseUUIDPipe) id: string) { ... }
```

---

#### 9. E2E bootstrap omite el stack de producción
**Archivo:** `test/app.e2e-spec.ts:15-16`

El e2e usa `createNestApplication()` sin `FastifyAdapter`, `ValidationPipe` global, `LoggingInterceptor`, ni `AllExceptionsFilter`. Un e2e que pase no prueba el stack HTTP real.

**Fix:** Replicar exactamente el setup de `main.ts` en el e2e bootstrap.

---

#### 10. Auth endpoints sin rate limiting
**Archivo:** `src/auth/auth.controller.ts:35-52`

`POST /auth/register` y `POST /auth/login` sin throttling ni lockout. Brute-force de passwords o flood de registros sin restricción.

**Fix:** `@nestjs/throttler` con límite de ~5 requests/minuto por IP en endpoints de auth.

---

### NOTEs — sugerencias opcionales

#### 11. `removePlayerFromMatch` silencioso cuando el jugador no estaba
**Archivo:** `src/matches/matches.service.ts:107-110`

Filtra y guarda aunque el jugador nunca estuvo en el partido, devolviendo 200. Los callers no distinguen éxito de no-op.

---

#### 12. `LoggingInterceptor` no loguea requests fallidos
**Archivo:** `src/common/interceptors/logging.interceptor.ts:40-44`

El timing se loguea solo en el path de éxito (`tap()`). El tráfico 4xx/5xx es invisible en el log de acceso global.

---

## learn-fastapi — 2026-06-18

### BLOCKs — impiden el merge

#### 1. `AsyncSession` incorrecta rompe todas las queries ✅ corregido
**Archivo:** `app/database.py:23-40`

`sessionmaker` usaba `AsyncSession` de `sqlalchemy.ext.asyncio`, pero los services llaman `await session.exec(...)` — método que solo existe en el `AsyncSession` de SQLModel. Cada endpoint lanzaba `AttributeError` en la primera query.

**Fix aplicado:** Import cambiado a `from sqlmodel.ext.asyncio.session import AsyncSession`.

---

#### 2. Dependencia `greenlet` faltante ✅ corregido
**Archivo:** `requirements.txt`

Sin `greenlet` ni `sqlalchemy[asyncio]`, el `session.exec()` async fallaba en runtime con `"the greenlet library is required to use this function"` en una instalación limpia.

**Fix aplicado:** Agregado `sqlalchemy[asyncio]` y `greenlet` a `requirements.txt`.

---

### FLAGs — hay que arreglarlo, no bloquea

#### 3. Paginación sin validación causa 500 ✅ corregido
**Archivo:** `app/routers/players.py:34-36`

`page=0` o negativos producían `OFFSET` negativo en PostgreSQL → 500 en vez de 422.

**Fix aplicado:** `page: int = Query(default=1, ge=1)` y `page_size: int = Query(default=10, ge=1, le=100)`.

---

#### 4. `.env.example` con `localhost` dentro del container ✅ corregido
**Archivo:** `.env.example:4`

`localhost` dentro del container `api` no alcanza el servicio `db` de Docker Compose.

**Fix aplicado:** Cambiado a `@db:5432` con nota explicativa para desarrollo local.

---

#### 5. `echo=True` incondicional en el engine ✅ corregido
**Archivo:** `app/database.py:29`

Loguea cada SQL statement en producción, agregando I/O overhead y potencialmente filtrando datos en logs centralizados.

**Fix aplicado:** `echo=settings.DEBUG` — solo activo cuando `DEBUG=true`.

---

#### 6. `page_size` sin límite superior ✅ corregido
**Archivo:** `app/routers/players.py:36`

Sin upper bound, un cliente podía pedir una página enorme y forzar una query masiva — DoS trivial.

**Fix aplicado:** Resuelto junto con el fix #3 (`le=100`).

---

#### 7. Nombres de tablas implícitos pueden no coincidir con el schema ✅ corregido
**Archivo:** `app/models.py:21-60`

SQLModel usaba `"club"`, `"player"`, `"match"` por default, pero el schema real (gestionado por Django) puede usar nombres plurales (`clubs`, `players`, `matches`).

**Fix aplicado:** `__tablename__` declarado explícitamente en los tres modelos.

---

### NOTEs — sugerencias opcionales

#### 8. Tests requieren `DATABASE_URL` aunque no deberían
**Archivo:** `app/config.py:31`

Importar `app.main` instancia `Settings()` que requiere `DATABASE_URL` aunque los tests usen SQLite. La collection falla sin un `.env` o URL dummy.

---

#### 9. `create_all` en startup contra DB compartida con Django
**Archivo:** `app/main.py:29-32`

El lifespan siempre corre `SQLModel.metadata.create_all`. Si la DB la gestiona Django con migraciones, este startup puede mutar el schema inesperadamente.
