# Player Stats API

API REST de estadísticas de jugadores de fútbol, construida con **NestJS + Fastify**.

Este proyecto existe para aprender NestJS desde cero, partiendo de una base de Express/Node. Cada archivo del proyecto tiene comentarios explicando el **qué** y el **por qué** de cada patrón — no es código limpio sin contexto, es código explicado.

---

## Qué hace esta API

Permite gestionar jugadores de fútbol, los partidos en que participaron, y consultar estadísticas agregadas por jugador. Tiene autenticación JWT: cualquiera puede leer datos, pero solo usuarios autenticados pueden crear, modificar o eliminar.

**Flujo completo de ejemplo:**
1. Registrás un usuario → obtenés un token JWT
2. Con ese token, creás jugadores (Messi, Ronaldo, etc.)
3. Creás partidos y asociás jugadores a cada uno
4. Consultás `/stats/player/:id` y ves cuántos partidos jugó, en qué competiciones, etc.

---

## Tecnologías usadas y por qué

| Tecnología | Para qué sirve | Por qué está acá |
|---|---|---|
| **NestJS** | Framework de arquitectura para Node | Organiza el código en módulos, controllers y services. Comparable a Angular pero para el backend. |
| **Fastify** | Servidor HTTP | Reemplaza a Express como capa de red. Más rápido, menos overhead. NestJS lo soporta nativo con una sola línea de cambio. |
| **TypeORM** | ORM (Object-Relational Mapper) | Traduce clases de TypeScript a tablas de PostgreSQL. En vez de escribir SQL a mano, trabajás con objetos. |
| **PostgreSQL** | Base de datos relacional | La DB real donde se guardan los datos. Se levanta con Docker en un comando. |
| **class-validator** | Validación de datos de entrada | Decoradores (`@IsString()`, `@IsEmail()`, etc.) que validan automáticamente el body de cada request antes de que llegue a tu lógica. |
| **@nestjs/jwt + Passport** | Autenticación | Genera y verifica tokens JWT. Passport es el middleware estándar de Node para auth. |
| **@nestjs/swagger** | Documentación de API | Genera automáticamente una interfaz web interactiva en `/api/docs` para probar todos los endpoints, sin Postman. |
| **Jest** | Testing | Framework de tests que ya viene configurado con NestJS. Usado para los tests unitarios del StatsService. |

---

## Conceptos de NestJS que vas a ver en el código

Antes de arrancar, estos son los patrones que vas a encontrar en cada archivo. Cada uno tiene comentarios explicando el concepto en detalle.

### Módulos (`@Module`)
La unidad básica de organización. Cada dominio del negocio (jugadores, partidos, auth, stats) vive en su propio módulo. Un módulo agrupa su controller, su service y sus entidades. El `AppModule` es el módulo raíz que conecta todo.

### Controllers
Reciben los requests HTTP. Definen las rutas con decoradores (`@Get()`, `@Post()`, `@Delete()`, etc.). **No tienen lógica de negocio** — solo reciben el request, llaman al service, y devuelven el resultado.

### Services (Providers)
Acá vive toda la lógica real: consultas a la base de datos, cálculos, validaciones de negocio. Se marcan con `@Injectable()` y NestJS los inyecta automáticamente en el constructor del controller que los necesite. Nunca instanciás `new PlayerService()` a mano.

### DTOs + ValidationPipe
Un DTO (Data Transfer Object) es una clase que define la forma esperada del body de un request. Con `class-validator` le ponés decoradores a cada campo. El `ValidationPipe` global intercepta cada request, valida el body contra el DTO, y si algo no cumple las reglas devuelve un error 400 automáticamente — sin que escribas ningún `if` manual.

### Guards
Deciden si un request puede pasar al handler o no. El `JwtAuthGuard` verifica que el token JWT en el header `Authorization: Bearer <token>` sea válido. Si no lo es, devuelve 401 automáticamente. Se aplica con `@UseGuards(JwtAuthGuard)` en los métodos que querés proteger.

### Interceptors
Envuelven la ejecución de un handler. Corren lógica **antes y después** del method. El `LoggingInterceptor` de este proyecto mide cuánto tarda cada request y lo imprime en la consola.

### Exception Filters
Capturan errores no manejados y formatean la respuesta. El `AllExceptionsFilter` asegura que cualquier error, venga de donde venga, devuelva siempre el mismo JSON con `statusCode`, `timestamp`, `path` y `message`.

---

## Estructura del proyecto

```
src/
│
├── main.ts                         ← Punto de entrada. Configura Fastify, ValidationPipe, Swagger
├── app.module.ts                   ← Módulo raíz. Conecta TypeORM y registra todos los módulos
│
├── auth/                           ← Todo lo relacionado a autenticación
│   ├── dto/
│   │   ├── register.dto.ts         ← Validación del body de /auth/register
│   │   └── login.dto.ts            ← Validación del body de /auth/login
│   ├── entities/
│   │   └── user.entity.ts          ← Tabla "users" en la DB
│   ├── guards/
│   │   └── jwt-auth.guard.ts       ← El guard que protege endpoints con JWT
│   ├── strategies/
│   │   └── jwt.strategy.ts         ← Cómo Passport valida un token JWT entrante
│   ├── auth.controller.ts          ← Rutas: POST /auth/register y POST /auth/login
│   ├── auth.service.ts             ← Lógica: hashear passwords, generar tokens
│   └── auth.module.ts              ← Módulo que conecta todo lo de auth
│
├── players/                        ← CRUD de jugadores
│   ├── dto/
│   │   ├── create-player.dto.ts    ← Campos requeridos para crear un jugador
│   │   └── update-player.dto.ts    ← Igual pero todos opcionales (para PATCH)
│   ├── entities/
│   │   └── player.entity.ts        ← Tabla "players" en la DB
│   ├── players.controller.ts       ← Rutas: GET/POST/PATCH/DELETE /players
│   ├── players.service.ts          ← Lógica: CRUD con TypeORM
│   └── players.module.ts
│
├── matches/                        ← Partidos y su relación con jugadores
│   ├── dto/
│   │   ├── create-match.dto.ts
│   │   └── update-match.dto.ts
│   ├── entities/
│   │   └── match.entity.ts         ← Tabla "matches" + tabla pivot "match_players"
│   ├── matches.controller.ts       ← Incluye POST /matches/:id/players/:playerId
│   ├── matches.service.ts          ← Lógica de relaciones ManyToMany en TypeORM
│   └── matches.module.ts
│
├── stats/                          ← Estadísticas agregadas (la parte con lógica real)
│   ├── interfaces/
│   │   └── player-stats.interface.ts  ← Tipo de retorno de las stats
│   ├── stats.controller.ts         ← Rutas: GET /stats y GET /stats/player/:id
│   ├── stats.service.ts            ← Cálculos: partidos jugados, competiciones, etc.
│   ├── stats.service.spec.ts       ← Tests unitarios con repositorios mockeados
│   └── stats.module.ts
│
└── common/                         ← Piezas globales que aplican a toda la app
    ├── filters/
    │   └── all-exceptions.filter.ts   ← Formatea todos los errores igual
    └── interceptors/
        └── logging.interceptor.ts     ← Loguea el tiempo de cada request
```

---

## Cómo levantar el proyecto paso a paso

### Requisitos previos

- **Node.js >= 18** — si no lo tenés, bajalo de [nodejs.org](https://nodejs.org)
- **Docker Desktop** — para levantar PostgreSQL sin instalarlo manualmente. Bajalo de [docker.com](https://www.docker.com/products/docker-desktop)

### Paso 1 — Clonar o abrir el proyecto

Si ya estás en la carpeta del proyecto, salteá este paso. Si lo clonaste:

```bash
cd learn-nestjs
```

### Paso 2 — Instalar dependencias

```bash
npm install
```

Esto lee el `package.json` y descarga todas las librerías del proyecto a `node_modules/`.

### Paso 3 — Crear el archivo de variables de entorno

```bash
# En Windows PowerShell:
Copy-Item .env.example .env

# En Mac/Linux:
cp .env.example .env
```

El archivo `.env` contiene la configuración de la base de datos y el secreto del JWT. Los valores por defecto ya funcionan con el `docker-compose.yml` del proyecto, no tenés que cambiar nada para desarrollo local.

### Paso 4 — Levantar PostgreSQL con Docker

```bash
docker-compose up -d postgres
```

Esto descarga la imagen de PostgreSQL y levanta el contenedor en segundo plano (`-d`). La base de datos queda disponible en `localhost:5432`.

Si querés también levantar **pgAdmin** (interfaz web para ver la DB desde el browser en `http://localhost:5050`):

```bash
docker-compose up -d
```

> **pgAdmin:** usuario `admin@admin.com`, contraseña `admin`. Para conectarte a la DB desde pgAdmin: host `postgres`, puerto `5432`, user `postgres`, password `postgres`.

### Paso 5 — Levantar la API en modo desarrollo

```bash
npm run start:dev
```

Deberías ver algo así en la consola:

```
🚀 Application running on: http://localhost:3000
📚 Swagger docs at: http://localhost:3000/api/docs
```

El modo `start:dev` tiene **hot reload**: cada vez que guardás un archivo, la app se reinicia automáticamente. No hay que parar y volver a correr el comando.

> **Importante:** TypeORM con `synchronize: true` crea automáticamente las tablas en la DB al iniciar. No hay que correr migraciones manualmente. Esto es solo para desarrollo — en producción se usarían migraciones.

---

## Cómo probar la API

### Opción A — Swagger (recomendado, sin instalar nada)

Abrí `http://localhost:3000/api/docs` en el browser.

Vas a ver una interfaz como esta con todos los endpoints agrupados por módulo (auth, players, matches, stats). Podés expandir cada endpoint, ver qué campos acepta, y ejecutarlo directamente.

**Para probar endpoints que requieren autenticación:**

1. Expandí `POST /auth/register`, hacé click en "Try it out", completá el body y ejecutá
2. Expandí `POST /auth/login`, ejecutá con las mismas credenciales
3. Copiá el valor de `accessToken` de la respuesta
4. Hacé click en el botón **Authorize** (arriba a la derecha, ícono de candado)
5. Pegá el token en el campo y hacé click en "Authorize"
6. A partir de ahora, todos los requests desde Swagger van a incluir el token automáticamente

### Opción B — Con curl (desde la terminal)

```bash
# Registrar usuario
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"yo@example.com","username":"nicolasvon","password":"Password1!"}'

# Login (guardá el accessToken de la respuesta)
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"nicolasvon","password":"Password1!"}'

# Crear jugador (con el token en el header)
curl -X POST http://localhost:3000/players \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TU_TOKEN_ACÁ" \
  -d '{"name":"Lionel Messi","position":"forward","club":"Inter Miami CF","nationality":"Argentina"}'

# Ver todos los jugadores (sin token)
curl http://localhost:3000/players

# Ver estadísticas de un jugador
curl http://localhost:3000/stats/player/ID_DEL_JUGADOR
```

---

## Todos los endpoints

### Auth — sin token requerido

| Método | URL | Descripción | Body requerido |
|---|---|---|---|
| POST | `/auth/register` | Crear cuenta | `email`, `username`, `password` |
| POST | `/auth/login` | Iniciar sesión → devuelve JWT | `username`, `password` |

**Reglas del password:** mínimo 8 caracteres, al menos una mayúscula y un número. Ejemplo válido: `Password1!`

### Players — lectura pública, escritura requiere JWT

| Método | URL | Token | Descripción |
|---|---|---|---|
| GET | `/players` | No | Listar todos los jugadores |
| GET | `/players/:id` | No | Ver un jugador por su UUID |
| POST | `/players` | Sí | Crear jugador |
| PATCH | `/players/:id` | Sí | Actualizar campos (todos opcionales) |
| DELETE | `/players/:id` | Sí | Eliminar jugador |

**Campos de un jugador:**
- `name` (requerido) — nombre completo
- `position` (requerido) — debe ser uno de: `goalkeeper`, `defender`, `midfielder`, `forward`
- `club` (opcional)
- `dateOfBirth` (opcional) — formato `"YYYY-MM-DD"`, ej: `"1987-06-24"`
- `nationality` (opcional)

### Matches — lectura pública, escritura requiere JWT

| Método | URL | Token | Descripción |
|---|---|---|---|
| GET | `/matches` | No | Listar partidos (incluye jugadores de cada uno) |
| GET | `/matches/:id` | No | Ver un partido |
| POST | `/matches` | Sí | Crear partido |
| PATCH | `/matches/:id` | Sí | Actualizar partido |
| DELETE | `/matches/:id` | Sí | Eliminar partido |
| POST | `/matches/:id/players/:playerId` | Sí | Agregar jugador a un partido |
| DELETE | `/matches/:id/players/:playerId` | Sí | Quitar jugador de un partido |

**Campos de un partido:**
- `homeTeam` (requerido) — nombre equipo local
- `awayTeam` (requerido) — nombre equipo visitante
- `date` (requerido) — formato ISO 8601, ej: `"2024-05-11T20:00:00Z"`
- `homeScore` (opcional) — goles equipo local
- `awayScore` (opcional) — goles equipo visitante
- `competition` (opcional) — nombre de la competición

### Stats — siempre públicas

| Método | URL | Descripción |
|---|---|---|
| GET | `/stats` | Estadísticas de todos los jugadores |
| GET | `/stats/player/:id` | Estadísticas de un jugador específico |

**Respuesta de stats por jugador:**
```json
{
  "playerId": "uuid",
  "playerName": "Lionel Messi",
  "playerPosition": "forward",
  "playerClub": "Inter Miami CF",
  "matchesPlayed": 3,
  "competitions": ["MLS", "Copa América"],
  "lastMatchDate": "2024-06-01T00:00:00.000Z"
}
```

---

## Tests

El proyecto tiene **53 tests unitarios** repartidos en 5 archivos. Ninguno necesita base de datos ni servidor corriendo — todo se mockea en memoria.

```bash
# Correr todos los tests
npx jest

# Correr un archivo específico
npx jest src/stats/stats.service.spec.ts
npx jest src/players/players.controller.spec.ts

# Modo watch — se vuelven a correr cada vez que guardás un archivo
npx jest --watch

# Ver qué porcentaje del código está cubierto por tests
npx jest --coverage
```

### Qué testea cada archivo

#### `src/stats/stats.service.spec.ts` — 5 tests (lógica de negocio)

Testea los **cálculos de estadísticas**, que es donde vive la lógica real. Mockea los repositorios de TypeORM usando `getRepositoryToken()` y `Test.createTestingModule()`.

| Test | Qué verifica |
|---|---|
| Jugador no existe | Debe lanzar `NotFoundException` (404) |
| Jugador sin partidos | `matchesPlayed` = 0, `lastMatchDate` = null |
| Jugador con múltiples partidos | Conteos y fechas correctos |
| Competiciones duplicadas | Se deduplicen con `Set` |
| Todos los jugadores | `getAllPlayersStats()` itera correctamente |

#### `src/auth/auth.controller.spec.ts` — 7 tests

Testea que el controller de auth delegue correctamente al service y propague los errores.

| Test | Qué verifica |
|---|---|
| `register()` llama al service | El DTO llega intacto al service |
| `register()` retorna el resultado | Sin transformaciones |
| `register()` propaga `ConflictException` | Si el user ya existe, el error sube |
| `login()` llama al service | Con las credenciales correctas |
| `login()` retorna el `accessToken` | La respuesta tiene la propiedad `accessToken` |
| `login()` propaga `UnauthorizedException` | Si las credenciales son inválidas |
| Controller está definido | Smoke test básico |

#### `src/players/players.controller.spec.ts` — 15 tests

El más completo. Además de verificar el comportamiento normal, **verifica los metadatos de los decoradores** para asegurarse de que los guards JWT estén aplicados en los endpoints correctos.

| Grupo | Qué verifica |
|---|---|
| `findAll()` | Retorna lista del service; retorna vacío si no hay jugadores |
| `findOne()` | Pasa el id correcto; propaga `NotFoundException` |
| `create()` | Pasa el DTO; **tiene `JwtAuthGuard` aplicado** |
| `update()` | Pasa id + DTO; propaga 404; **tiene `JwtAuthGuard`** |
| `remove()` | Retorna mensaje; propaga 404; **tiene `JwtAuthGuard`** |
| Endpoints públicos | `findAll` y `findOne` **no tienen** `JwtAuthGuard` |

> **Por qué testear que los guards están aplicados:** si alguien borra el `@UseGuards(JwtAuthGuard)` de un endpoint de escritura por accidente, el endpoint queda desprotegido sin que nadie lo note hasta producción. Estos tests lo detectan automáticamente.

#### `src/matches/matches.controller.spec.ts` — 16 tests

Igual que PlayersController, más los tests de las rutas anidadas de la relación Match ↔ Player.

| Grupo | Qué verifica |
|---|---|
| `findAll()` / `findOne()` | Comportamiento básico + propagación de errores |
| `create()` / `update()` / `remove()` | Delegación + guards JWT |
| `addPlayer()` | Pasa `matchId` y `playerId` en orden correcto; propaga `BadRequestException` si el jugador ya está; propaga `NotFoundException` si el partido no existe; **tiene JWT guard** |
| `removePlayer()` | Delegación + guard JWT |
| Endpoints públicos | `findAll` y `findOne` sin guard |

#### `src/stats/stats.controller.spec.ts` — 10 tests

Testea el controller más simple: 2 endpoints, ambos públicos.

| Test | Qué verifica |
|---|---|
| `getAllStats()` | Retorna todas las stats; retorna vacío; estructura del objeto correcto |
| `getPlayerStats()` | Pasa el id; propaga `NotFoundException`; `matchesPlayed` = 0 para jugadores nuevos; competiciones correctas |

### Concepto clave: mock de services

Todos los tests de controllers usan el mismo patrón:

```typescript
// En lugar del service real, Nest inyecta este objeto mock
const mockPlayersService = {
  findAll: jest.fn(),   // función controlada por Jest
  findOne: jest.fn(),
  // ...
};

// En cada test configuramos qué devuelve cada función
service.findAll.mockResolvedValue([jugador1, jugador2]);

// Verificamos que fue llamada con los argumentos correctos
expect(service.findAll).toHaveBeenCalledTimes(1);
```

Y el patrón para verificar guards sin hacer requests HTTP reales:

```typescript
// Reflect.getMetadata lee los decoradores aplicados a un método
const guards = Reflect.getMetadata('__guards__', PlayersController.prototype.create);
expect(guards).toContain(JwtAuthGuard);  // debe estar en POST
```

---

## Flujo de aprendizaje recomendado

Si querés entender el código de menor a mayor complejidad, leé los archivos en este orden:

1. **`src/main.ts`** — el punto de entrada. Muestra cómo se cambia Express por Fastify, cómo se configura el `ValidationPipe` global y Swagger.

2. **`src/app.module.ts`** — el módulo raíz. Muestra cómo se conecta TypeORM a la DB y cómo se registran los feature modules.

3. **`src/common/interceptors/logging.interceptor.ts`** — el Interceptor más simple posible: loguea tiempo de respuesta.

4. **`src/common/filters/all-exceptions.filter.ts`** — cómo capturar y formatear errores globalmente.

5. **`src/players/`** (leer en este orden: `entity → dto → service → controller → module`) — el CRUD más completo y limpio. Muestra el patrón estándar de Nest.

6. **`src/auth/`** — guards, JWT strategy, hashing de passwords. La parte que más cambia respecto a Express puro.

7. **`src/matches/entities/match.entity.ts`** — relaciones ManyToMany en TypeORM (tabla pivot automática).

8. **`src/stats/stats.service.ts`** + **`stats.service.spec.ts`** — QueryBuilder de TypeORM y cómo testear services con repositorios mockeados.

---

## Solución a problemas comunes

**`Error: connect ECONNREFUSED 127.0.0.1:5432`**
La base de datos no está corriendo. Ejecutá `docker-compose up -d postgres` y esperá unos segundos.

**`Error: database "player_stats" does not exist`**
El contenedor de Docker no creó la DB. Pará el contenedor (`docker-compose down`), borrá el volumen (`docker volume prune`) y volvé a levantarlo.

**`401 Unauthorized` en endpoints protegidos**
El token JWT expiró (dura 7 días) o no lo estás enviando bien. Hacé login de nuevo y usá el nuevo token.

**`400 Bad Request` con mensaje de validación**
El body del request no cumple las reglas del DTO. El mensaje de error te dice exactamente qué campo falló y por qué.

**La app no compila / errores de TypeScript**
Corré `npx tsc --noEmit` para ver los errores. Generalmente es un import mal escrito o un tipo incorrecto.

---

## Scripts disponibles

```bash
npm run start:dev    # Desarrollo con hot reload
npm run start:prod   # Producción (requiere npm run build primero)
npm run build        # Compila TypeScript a JavaScript en /dist
npm run lint         # Revisa el código con ESLint
npm run format       # Formatea el código con Prettier
npx jest             # Corre los tests
```
