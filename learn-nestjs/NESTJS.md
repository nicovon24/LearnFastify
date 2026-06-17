# NestJS — Guía de referencia rápida

---

## La idea central

NestJS no inventa rutas nuevas para hacer requests HTTP. Lo que hace es **organizar** el código que ya harías en Express/Node en piezas con responsabilidades bien definidas. Cada pieza tiene un nombre y un decorador que la identifica.

```
Request HTTP entrante
       ↓
  Middleware          → corre antes de todo (como en Express)
       ↓
  Guard               → ¿tiene permiso de pasar? (auth)
       ↓
  Interceptor (antes) → lógica antes del handler
       ↓
  Pipe / ValidationPipe → validar y transformar el body
       ↓
  Controller (Handler) → recibe el request, llama al service
       ↓
  Service             → lógica de negocio, habla con la DB
       ↓
  Interceptor (después) → lógica después del handler
       ↓
  Exception Filter    → si algo explotó, formatea el error
       ↓
  Response HTTP
```

---

## 1. Módulo — `@Module()`

**Qué es:** la unidad de organización. Todo el código se agrupa por dominio en módulos. El `AppModule` es el módulo raíz que conecta todo.

**Analogía:** es como una carpeta con superpoderes — no solo agrupa archivos sino que le dice a NestJS qué depende de qué.

```typescript
// src/players/players.module.ts
@Module({
  imports: [TypeOrmModule.forFeature([Player]), AuthModule],
  controllers: [PlayersController],  // las rutas de este dominio
  providers: [PlayersService],       // los services de este dominio
  exports: [PlayersService],         // lo que otros módulos pueden usar
})
export class PlayersModule {}
```

**Lo que tenés que saber:**
- `imports` → módulos externos que este necesita
- `controllers` → definen las rutas HTTP
- `providers` → services, strategies, guards — cualquier clase inyectable
- `exports` → lo que "sale" del módulo para que otros lo usen

---

## 2. Controller — `@Controller()`

**Qué es:** recibe requests HTTP y los delega al service. **No tiene lógica de negocio.** Solo mapea rutas a métodos.

**Analogía:** el mozo del restaurante. Toma el pedido (request), lo lleva a la cocina (service), y trae la respuesta. No cocina.

```typescript
// src/players/players.controller.ts
@Controller('players')        // prefijo de ruta: /players
export class PlayersController {
  constructor(private readonly playersService: PlayersService) {}

  @Get()                      // GET /players
  findAll() {
    return this.playersService.findAll();
  }

  @Get(':id')                 // GET /players/:id
  findOne(@Param('id') id: string) {
    return this.playersService.findOne(id);
  }

  @Post()                     // POST /players
  @UseGuards(JwtAuthGuard)    // requiere JWT
  create(@Body() dto: CreatePlayerDto) {
    return this.playersService.create(dto);
  }
}
```

**Decoradores de rutas:**

| Decorador | Método HTTP |
|---|---|
| `@Get()` | GET |
| `@Post()` | POST |
| `@Patch()` | PATCH |
| `@Put()` | PUT |
| `@Delete()` | DELETE |

**Decoradores de parámetros:**

| Decorador | Qué extrae |
|---|---|
| `@Body()` | El body del request |
| `@Param('id')` | El parámetro de la URL (`:id`) |
| `@Query('page')` | Un query param (`?page=2`) |
| `@Headers('x-token')` | Un header específico |
| `@Request()` | El objeto request completo |

---

## 3. Service / Provider — `@Injectable()`

**Qué es:** donde vive toda la lógica de negocio. Habla con la base de datos, hace cálculos, valida reglas. El controller lo llama, nunca al revés.

**Analogía:** la cocina del restaurante. Sabe cómo preparar cada plato (lógica). El mozo (controller) le pasa el pedido y espera el resultado.

```typescript
// src/players/players.service.ts
@Injectable()
export class PlayersService {
  constructor(
    @InjectRepository(Player)
    private readonly playerRepository: Repository<Player>,
  ) {}

  async findOne(id: string): Promise<Player> {
    const player = await this.playerRepository.findOneBy({ id });
    if (!player) {
      throw new NotFoundException(`Jugador con id "${id}" no encontrado`);
    }
    return player;
  }
}
```

**Lo más importante:** nunca instanciás `new PlayersService()`. NestJS lo hace por vos — eso es la Dependency Injection.

---

## 4. Dependency Injection (DI)

**Qué es:** NestJS construye automáticamente las dependencias que cada clase necesita y las "inyecta" en el constructor.

**Analogía:** no vas al supermercado a buscar los ingredientes — el sistema los trae solos cuando los pedís en el constructor.

```typescript
// Esto NO hacés nunca en NestJS:
const service = new PlayersService(new Repository());  // ❌

// Esto hacés — Nest resuelve las dependencias solo:
constructor(private readonly playersService: PlayersService) {}  // ✅
```

Para que funcione necesitás dos cosas:
1. Que la clase tenga `@Injectable()`
2. Que esté registrada como `provider` en algún módulo

---

## 5. Entity — TypeORM

**Qué es:** una clase de TypeScript que TypeORM mapea a una tabla de la base de datos. Cada propiedad decorada con `@Column()` es una columna.

**Analogía:** es el esquema de una tabla, pero escrito como clase de TypeScript.

```typescript
// src/players/entities/player.entity.ts
@Entity('players')              // nombre de la tabla en la DB
export class Player {
  @PrimaryGeneratedColumn('uuid')
  id: string;                   // columna id, UUID autogenerado

  @Column()
  name: string;                 // columna name, NOT NULL

  @Column({ nullable: true })
  club: string;                 // columna club, puede ser null

  @CreateDateColumn()
  createdAt: Date;              // TypeORM la llena automáticamente
}
```

**Decoradores comunes de TypeORM:**

| Decorador | Qué hace |
|---|---|
| `@Entity('tabla')` | Declara que la clase es una tabla |
| `@PrimaryGeneratedColumn('uuid')` | Clave primaria UUID autogenerada |
| `@Column()` | Columna simple |
| `@Column({ nullable: true })` | Columna que puede ser null |
| `@Column({ unique: true })` | Columna con constraint unique |
| `@Column({ select: false })` | No se incluye en queries por defecto (ej: password) |
| `@CreateDateColumn()` | Se llena sola al crear el registro |
| `@UpdateDateColumn()` | Se actualiza sola al modificar |
| `@ManyToMany()` | Relación muchos a muchos |
| `@JoinTable()` | Crea la tabla pivot para ManyToMany |

---

## 6. DTO — Data Transfer Object

**Qué es:** una clase que define la forma esperada del body de un request. Con `class-validator` le ponés reglas a cada campo. El `ValidationPipe` las valida automáticamente.

**Analogía:** el formulario de registro de un sitio web. Define qué campos son obligatorios, qué formato tienen que tener, y rechaza el envío si algo está mal — antes de que el backend haga nada.

```typescript
// src/auth/dto/register.dto.ts
export class RegisterDto {
  @IsEmail()
  email: string;               // debe ser un email válido

  @IsString()
  @MinLength(3)
  username: string;            // string, mínimo 3 caracteres

  @IsString()
  @MinLength(8)
  @Matches(/(?=.*[A-Z])(?=.*\d)/)
  password: string;            // mínimo 8 chars, una mayúscula y un número
}
```

Si el body llega sin cumplir estas reglas, Nest devuelve automáticamente:

```json
{
  "statusCode": 400,
  "message": ["email must be an email", "password is too short"],
  "error": "Bad Request"
}
```

**Decoradores útiles de class-validator:**

| Decorador | Valida |
|---|---|
| `@IsString()` | Es un string |
| `@IsNumber()` | Es un número |
| `@IsEmail()` | Es un email válido |
| `@IsEnum(MiEnum)` | Es uno de los valores del enum |
| `@IsOptional()` | Puede no venir en el body |
| `@MinLength(n)` | Mínimo n caracteres |
| `@MaxLength(n)` | Máximo n caracteres |
| `@IsDateString()` | Formato fecha ISO 8601 |
| `@Matches(/regex/)` | Cumple la expresión regular |
| `@Min(n)` | Número mínimo (para números) |

**`PartialType`** — para el DTO de update, en lugar de repetir todos los campos marcándolos opcionales:

```typescript
// src/players/dto/update-player.dto.ts
export class UpdatePlayerDto extends PartialType(CreatePlayerDto) {}
// Todos los campos de CreatePlayerDto quedan opcionales automáticamente
```

---

## 7. Guard — `@UseGuards()`

**Qué es:** decide si un request puede pasar al handler o no. Retorna `true` (pasa) o `false` / lanza excepción (bloqueado con 401/403).

**Analogía:** el portero del boliche. Antes de que entres revisa si tenés el ticket (token JWT). Si no tenés, no entrás.

```typescript
// src/auth/guards/jwt-auth.guard.ts
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
// AuthGuard('jwt') de @nestjs/passport ya sabe cómo verificar el token

// Cómo se usa en el controller:
@Post()
@UseGuards(JwtAuthGuard)   // ← este método requiere JWT
create(@Body() dto: CreatePlayerDto) { ... }
```

**Niveles de aplicación:**

```typescript
// A nivel clase — todos los métodos del controller requieren JWT
@UseGuards(JwtAuthGuard)
@Controller('admin')
export class AdminController { ... }

// A nivel método — solo ese endpoint requiere JWT
@UseGuards(JwtAuthGuard)
@Post()
create() { ... }

// Global — todos los endpoints de la app (en main.ts)
app.useGlobalGuards(new JwtAuthGuard());
```

---

## 8. Interceptor — `implements NestInterceptor`

**Qué es:** envuelve la ejecución de un handler. Corre lógica **antes y después** del método. Usa RxJS para el "después".

**Analogía:** un cronómetro que arrancás antes de la carrera y parás al terminar. La carrera (handler) corre en el medio.

```typescript
// src/common/interceptors/logging.interceptor.ts
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const start = Date.now();

    return next.handle().pipe(     // next.handle() = ejecuta el handler
      tap(() => {                  // tap() corre DESPUÉS, sin modificar el resultado
        console.log(`Tardó ${Date.now() - start}ms`);
      }),
    );
  }
}
```

**Usos típicos:** logging, medir performance, transformar la respuesta, caché, rate limiting.

---

## 9. Exception Filter — `@Catch()`

**Qué es:** captura errores no manejados y formatea la respuesta de error de forma consistente. Sin esto, cada error luce diferente.

**Analogía:** el seguro del auto. No evita el accidente, pero asegura que cuando algo falla la respuesta siempre tenga la misma estructura.

```typescript
// src/common/filters/all-exceptions.filter.ts
@Catch()                          // sin argumento = captura CUALQUIER error
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const status = exception instanceof HttpException
      ? exception.getStatus()
      : 500;

    reply.code(status).send({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: '...',
    });
  }
}
```

**Excepciones HTTP que ya vienen con Nest:**

| Clase | Status HTTP |
|---|---|
| `NotFoundException` | 404 |
| `BadRequestException` | 400 |
| `UnauthorizedException` | 401 |
| `ForbiddenException` | 403 |
| `ConflictException` | 409 |
| `InternalServerErrorException` | 500 |

---

## 10. Pipe — `ValidationPipe`

**Qué es:** transforma y/o valida los datos de entrada antes de que lleguen al handler. El más usado es `ValidationPipe` que valida los DTOs.

**Dónde se configura en este proyecto:**

```typescript
// src/main.ts — se aplica globalmente a todos los endpoints
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,             // elimina campos que no están en el DTO
  forbidNonWhitelisted: true,  // devuelve 400 si llegan campos extras
  transform: true,             // convierte "42" → 42 si el DTO dice @IsNumber()
}));
```

---

## 11. JWT Strategy — Passport

**Qué es:** le dice a Passport cómo validar un token JWT entrante. Se ejecuta automáticamente cuando el `JwtAuthGuard` intercepta un request.

```typescript
// src/auth/strategies/jwt.strategy.ts
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(), // busca el token en: Authorization: Bearer ...
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  validate(payload: JwtPayload) {
    // Lo que retornés acá queda disponible como request.user en el controller
    return { sub: payload.sub, username: payload.username };
  }
}
```

---

## Resumen visual: qué archivo hace qué

```
src/
├── main.ts              → Configura Fastify, ValidationPipe, Swagger, arranca el server
├── app.module.ts        → Módulo raíz: conecta TypeORM y registra todos los módulos
│
├── auth/
│   ├── auth.controller.ts      → Rutas: POST /auth/register, POST /auth/login
│   ├── auth.service.ts         → Lógica: hashear password, generar JWT
│   ├── auth.module.ts          → Conecta todo lo de auth
│   ├── dto/register.dto.ts     → Validación del body de registro
│   ├── dto/login.dto.ts        → Validación del body de login
│   ├── entities/user.entity.ts       → Tabla "users" en Postgres
│   ├── guards/jwt-auth.guard.ts      → El portero que verifica el JWT
│   └── strategies/jwt.strategy.ts   → Cómo Passport extrae y valida el token
│
├── players/
│   ├── players.controller.ts   → Rutas: GET/POST/PATCH/DELETE /players
│   ├── players.service.ts      → CRUD con TypeORM
│   ├── players.module.ts
│   ├── dto/create-player.dto.ts    → Campos requeridos para crear
│   ├── dto/update-player.dto.ts    → Todos opcionales (PartialType)
│   └── entities/player.entity.ts   → Tabla "players"
│
└── common/
    ├── interceptors/logging.interceptor.ts  → Mide tiempo de respuesta
    └── filters/all-exceptions.filter.ts     → Formatea todos los errores igual
```

---

## El ciclo completo de un request

Ejemplo: `POST /players` con body `{ "name": "Messi", "position": "forward" }` y header `Authorization: Bearer <token>`:

1. **Fastify** recibe el request y lo pasa a NestJS
2. **LoggingInterceptor** anota la hora de entrada
3. **JwtAuthGuard** extrae el token del header, llama a `JwtStrategy.validate()`, verifica la firma con el secret — si es inválido devuelve 401
4. **ValidationPipe** toma el body, lo valida contra `CreatePlayerDto` — si falta `name` o `position` tiene un valor inválido, devuelve 400
5. **PlayersController.create()** recibe el DTO ya validado, llama a `playersService.create(dto)`
6. **PlayersService.create()** instancia la entidad, la guarda en Postgres con TypeORM, retorna el jugador creado
7. **LoggingInterceptor** calcula el tiempo transcurrido y lo loguea
8. NestJS serializa el objeto retornado a JSON y envía la respuesta 201
