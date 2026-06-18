# Java + Spring Boot + Kafka — Guía de referencia rápida

---

## La idea central

Spring Boot aplica el mismo patrón que NestJS: **Dependency Injection** y **anotaciones** que definen el rol de cada clase. Si en NestJS usás decoradores TypeScript (`@Injectable()`, `@Controller()`), en Spring usás anotaciones Java (`@Service`, `@RestController`). El concepto es idéntico, cambia la sintaxis.

```
Request HTTP entrante
       ↓
  Tomcat (embebido)      → servidor HTTP incluido en el JAR, sin configurar nada
       ↓
  @RestController        → recibe el request, delega al Service
       ↓
  @Valid / Bean Validation → valida el body antes de que corra el handler
       ↓
  @Service               → lógica de negocio
       ↓
  @Repository / JPA      → acceso a la base de datos
       ↓
  PostgreSQL / H2
       ↓
  Response HTTP (Jackson serializa a JSON automáticamente)
```

---

## 1. Anotaciones de componentes — el corazón de Spring DI

**Qué es:** las anotaciones que registran una clase en el contenedor de DI de Spring. Equivalentes a `@Injectable()` de NestJS.

| Anotación | Equivalente NestJS | Cuándo usarla |
|---|---|---|
| `@Component` | `@Injectable()` | Componente genérico |
| `@Service` | `@Injectable()` en un Service | Lógica de negocio |
| `@Repository` | `@Injectable()` en un Repository | Acceso a datos (activa traducción de excepciones JPA) |
| `@RestController` | `@Controller()` | Maneja requests HTTP REST |
| `@Configuration` | `@Module()` | Define beans y configuración |

```java
// Equivalente exacto entre NestJS y Spring:

// NestJS:
@Injectable()
export class PlayersService { ... }

// Spring:
@Service
public class PlayerService { ... }
```

---

## 2. Controller — `@RestController`

**Qué es:** recibe requests HTTP y delega al Service. No tiene lógica de negocio. Equivalente al `@Controller()` de NestJS.

**`@RestController` = `@Controller` + `@ResponseBody`** — los métodos devuelven JSON automáticamente.

```java
// src/main/java/com/scout/ingestion/controller/MatchEventController.java
@RestController
@RequestMapping("/events")    // prefijo de ruta — equivalente a @Controller('events')
public class MatchEventController {

    private final MatchEventProducer producer;

    // Constructor injection (patrón recomendado)
    public MatchEventController(MatchEventProducer producer) {
        this.producer = producer;
    }

    @PostMapping            // POST /events — equivalente a @Post()
    public ResponseEntity<Map<String, Object>> receiveEvent(
            @Valid @RequestBody MatchEventRequest event) {   // @Valid activa Bean Validation
        producer.publishEvent(event);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("status", "accepted"));
    }
}
```

**Mapeo de rutas:**

| Spring | NestJS | HTTP |
|---|---|---|
| `@GetMapping` | `@Get()` | GET |
| `@PostMapping` | `@Post()` | POST |
| `@PatchMapping` | `@Patch()` | PATCH |
| `@PutMapping` | `@Put()` | PUT |
| `@DeleteMapping` | `@Delete()` | DELETE |

**Extracción de parámetros:**

| Spring | NestJS | Qué extrae |
|---|---|---|
| `@RequestBody` | `@Body()` | Body JSON |
| `@PathVariable` | `@Param('id')` | Parámetro de URL (`{id}`) |
| `@RequestParam` | `@Query('page')` | Query param (`?page=2`) |
| `@RequestHeader` | `@Headers('x')` | Header HTTP |

---

## 3. Bean Validation — DTOs con validaciones

**Qué es:** el sistema de validación estándar de Java. Equivalente a `class-validator` de NestJS. Las anotaciones se ponen en los campos del DTO, y `@Valid` en el controller activa la validación.

```java
// src/.../dto/MatchEventRequest.java
public class MatchEventRequest {

    @NotNull(message = "El tipo de evento es requerido")
    private EventType eventType;

    @NotBlank(message = "El ID del jugador es requerido")  // no null, no "", no "   "
    private String playerId;

    @Min(value = 0, message = "El minuto no puede ser negativo")
    @Max(value = 120, message = "No puede superar los 120")
    private int minute;

    // Getters y setters...
}
```

**Comparación con NestJS:**

| NestJS (class-validator) | Spring (Bean Validation) |
|---|---|
| `@IsNotEmpty()` | `@NotEmpty` |
| `@IsString()` | `String` (el tipo ya lo garantiza) |
| `@IsEmail()` | `@Email` |
| `@Min(n)` | `@Min(n)` |
| `@Max(n)` | `@Max(n)` |
| `@IsOptional()` | No poner `@NotNull` |
| `@MinLength(n)` | `@Size(min = n)` |
| `@IsEnum(EventType)` | `@NotNull EventType eventType` (el enum ya valida) |

---

## 4. Service — `@Service` y `@Transactional`

**Qué es:** la capa de lógica de negocio. `@Transactional` envuelve el método en una transacción de DB — si algo falla, hace rollback automático.

```java
// src/.../service/StatsService.java
@Service
public class StatsService {

    private final PlayerStatsRepository repository;

    public StatsService(PlayerStatsRepository repository) {
        this.repository = repository;
    }

    @Transactional                    // si algo falla, todo el método hace rollback
    public void processEvent(String eventJson) {
        // busca o crea el registro
        PlayerStats stats = repository.findByPlayerId(playerId)
                .orElse(new PlayerStats(playerId, playerName));  // Optional.orElse()

        stats.setGoals(stats.getGoals() + 1);
        repository.save(stats);       // INSERT si es nuevo, UPDATE si ya existe
    }
}
```

**`@Transactional` en profundidad:**
- Sin `@Transactional`: cada `save()` es su propia transacción
- Con `@Transactional`: todos los `save()` del método son una sola transacción — o todos se guardan o ninguno

---

## 5. Spring Data JPA — Repositorios automáticos

**Qué es:** genera implementaciones de queries automáticamente a partir del nombre del método. Equivalente a Prisma en Node — declarás qué querés, no cómo.

```java
// src/.../repository/PlayerStatsRepository.java
@Repository
public interface PlayerStatsRepository extends JpaRepository<PlayerStats, Long> {
    // Spring genera: SELECT * FROM player_stats WHERE player_id = ?
    Optional<PlayerStats> findByPlayerId(String playerId);

    // Spring genera: SELECT * FROM player_stats WHERE team_id = ? AND goals > ?
    List<PlayerStats> findByTeamIdAndGoalsGreaterThan(String teamId, int goals);
}
```

**Métodos gratuitos de `JpaRepository`:**

| Método | Qué hace |
|---|---|
| `save(entity)` | INSERT si id es null, UPDATE si tiene id |
| `findById(id)` | SELECT WHERE id = ? → `Optional<T>` |
| `findAll()` | SELECT * |
| `delete(entity)` | DELETE |
| `count()` | SELECT COUNT(*) |
| `existsById(id)` | SELECT EXISTS |

**Convenciones de nombres para queries:**

| Nombre del método | SQL generado |
|---|---|
| `findByName(String name)` | `WHERE name = ?` |
| `findByNameAndAge(String, int)` | `WHERE name = ? AND age = ?` |
| `findByAgeGreaterThan(int age)` | `WHERE age > ?` |
| `findByNameContaining(String)` | `WHERE name LIKE %?%` |
| `findByNameOrderByCreatedAtDesc(String)` | `WHERE name = ? ORDER BY created_at DESC` |

---

## 6. Entidad JPA — mapeo a tabla

**Qué es:** clase Java que mapea a una tabla de la DB con anotaciones. Equivalente a las entities de TypeORM en NestJS.

```java
// src/.../entity/PlayerStats.java
@Entity
@Table(name = "player_stats")
public class PlayerStats {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)  // SERIAL en Postgres
    private Long id;

    @Column(name = "player_id", unique = true, nullable = false)
    private String playerId;

    @Column(name = "goals", nullable = false)
    private int goals = 0;

    // Constructor vacío OBLIGATORIO para JPA
    public PlayerStats() {}

    // Getters y setters...
}
```

**Comparación TypeORM vs JPA:**

| TypeORM (NestJS) | JPA (Spring) |
|---|---|
| `@Entity('tabla')` | `@Entity` + `@Table(name = "tabla")` |
| `@Column()` | `@Column()` |
| `@PrimaryGeneratedColumn('uuid')` | `@Id @GeneratedValue(IDENTITY)` |
| `@Column({ nullable: true })` | `@Column(nullable = true)` |
| `@Column({ unique: true })` | `@Column(unique = true)` |
| `@CreateDateColumn()` | `@CreationTimestamp` (Hibernate) |
| `new Repository()` — Nest lo inyecta | Interfaz que extiende `JpaRepository` |

---

## 7. Kafka con Spring

**Qué es:** Spring Kafka provee `KafkaTemplate` (producer) y `@KafkaListener` (consumer) sobre la API nativa de Kafka.

### Producer — `KafkaTemplate`

```java
// Publicar un mensaje en un topic
@Service
public class MatchEventProducer {

    private final KafkaTemplate<String, String> kafkaTemplate;

    public void publishEvent(MatchEventRequest event) throws JsonProcessingException {
        String json = objectMapper.writeValueAsString(event);

        // send(topic, key, value)
        // key = matchId garantiza que mensajes del mismo partido van a la misma partición
        kafkaTemplate.send("match-events", event.getMatchId(), json)
            .whenComplete((result, ex) -> {
                if (ex != null) log.error("Error: {}", ex.getMessage());
                else log.info("Enviado a partición {}", result.getRecordMetadata().partition());
            });
    }
}
```

### Consumer — `@KafkaListener`

```java
// Consumir mensajes del topic
@Component
public class MatchEventConsumer {

    @KafkaListener(
        topics = {"match-events"},
        groupId = "stats-aggregator",           // consumer group
        containerFactory = "kafkaListenerContainerFactory"
    )
    public void consume(
            ConsumerRecord<String, String> record,
            Acknowledgment acknowledgment) {   // ack manual

        statsService.processEvent(record.value());
        acknowledgment.acknowledge();          // confirma a Kafka que fue procesado
    }
}
```

**Conceptos clave de Kafka:**

| Concepto | Qué es |
|---|---|
| **Topic** | Canal con nombre donde se publican mensajes |
| **Partición** | División del topic para paralelismo |
| **Key** | Determina a qué partición va el mensaje (garantiza orden) |
| **Offset** | Índice del último mensaje procesado por un consumer |
| **Consumer Group** | Grupo que comparte la carga de un topic |
| **Ack manual** | El consumer confirma el mensaje explícitamente (at-least-once) |

---

## 8. Configuración — `application.yml`

```yaml
# Equivalente a las variables de entorno en NestJS
server:
  port: 8080

spring:
  datasource:
    url: jdbc:postgresql://localhost:5432/statsdb
    username: ${POSTGRES_USER:scout}    # ${VAR:default} — equivalente a process.env.VAR || 'default'
    password: ${POSTGRES_PASSWORD:scout123}

  jpa:
    hibernate:
      ddl-auto: update      # crea/actualiza tablas automáticamente (solo dev)
    show-sql: true          # muestra el SQL generado (muy útil para aprender)

  kafka:
    bootstrap-servers: ${KAFKA_BOOTSTRAP_SERVERS:localhost:9092}
    producer:
      key-serializer: org.apache.kafka.common.serialization.StringSerializer
      value-serializer: org.apache.kafka.common.serialization.StringSerializer
```

---

## 9. Tests con JUnit 5 + Mockito

**Qué es:** JUnit 5 es el framework de testing de Java. Mockito es la librería de mocks. Equivalente a Jest + jest.fn() en NestJS/Node.

```java
@ExtendWith(MockitoExtension.class)   // activa las anotaciones de Mockito
class StatsServiceTest {

    @Mock                               // equivalente a jest.fn() / jest.spyOn()
    private PlayerStatsRepository repository;

    private StatsService statsService;

    @BeforeEach                         // equivalente a beforeEach() de Jest
    void setUp() {
        statsService = new StatsService(repository, new ObjectMapper());
    }

    @Test
    void processEvent_goal_deberia_incrementar_contador() {
        // Arrange — configurar mocks
        when(repository.findByPlayerId("p1")).thenReturn(Optional.empty());
        when(repository.save(any())).thenAnswer(i -> i.getArgument(0));

        // Act
        statsService.processEvent(buildGoalEventJson());

        // Assert
        ArgumentCaptor<PlayerStats> captor = ArgumentCaptor.forClass(PlayerStats.class);
        verify(repository).save(captor.capture());
        assertThat(captor.getValue().getGoals()).isEqualTo(1);
    }
}
```

**Comparación Jest vs JUnit + Mockito:**

| Jest (NestJS) | JUnit + Mockito (Spring) |
|---|---|
| `jest.fn()` | `@Mock` |
| `mockFn.mockReturnValue(x)` | `when(mock.method()).thenReturn(x)` |
| `expect(fn).toHaveBeenCalledWith(x)` | `verify(mock).method(eq(x))` |
| `beforeEach()` | `@BeforeEach` |
| `describe()` | Nombre de la clase de test |
| `it()` / `test()` | `@Test` |
| `expect(x).toBe(y)` | `assertThat(x).isEqualTo(y)` (AssertJ) |

---

## Resumen visual: qué archivo hace qué

```
match-ingestion-service/
└── src/main/java/com/scout/ingestion/
    ├── MatchIngestionApplication.java  → @SpringBootApplication — punto de entrada
    ├── controller/
    │   └── MatchEventController.java   → @RestController — rutas HTTP
    ├── dto/
    │   └── MatchEventRequest.java      → DTO con Bean Validation — equivalente a DTOs de NestJS
    ├── kafka/
    │   └── MatchEventProducer.java     → @Service que usa KafkaTemplate.send()
    └── model/
        └── EventType.java              → Enum: GOAL / CARD / SUBSTITUTION

stats-aggregator-service/
└── src/main/java/com/scout/aggregator/
    ├── StatsAggregatorApplication.java
    ├── controller/StatsController.java  → @RestController — GET /stats/player/{id}
    ├── entity/PlayerStats.java          → @Entity — mapea a tabla player_stats
    ├── repository/PlayerStatsRepository → Interface JpaRepository — queries automáticas
    ├── service/StatsService.java        → @Service @Transactional — lógica de agregación
    └── kafka/
        ├── MatchEventConsumer.java      → @KafkaListener — consume del topic
        └── KafkaConfig.java            → @Configuration — configura AckMode manual
```

---

## El ciclo completo de un evento

`POST /events` → Kafka → Aggregator → `GET /stats/player/{id}`:

1. Cliente envía `POST /events` con `{ eventType: "GOAL", playerId: "p1", matchId: "m1", minute: 32 }`
2. **`@Valid`** en el controller valida que todos los campos requeridos estén presentes y sean válidos
3. **`MatchEventController`** delega a `MatchEventProducer`
4. **`MatchEventProducer`** serializa a JSON y llama `KafkaTemplate.send("match-events", "m1", json)`
5. **Kafka** guarda el mensaje en la partición correspondiente a la key "m1"
6. **`@KafkaListener`** del `MatchEventConsumer` recibe el mensaje
7. **`StatsService.processEvent()`** dentro de `@Transactional`: busca o crea `PlayerStats`, incrementa `goals`, llama `repository.save()`
8. **Spring Data JPA** genera `INSERT INTO player_stats ...` o `UPDATE player_stats SET goals = 1 ...`
9. **`acknowledgment.acknowledge()`** confirma a Kafka que el mensaje fue procesado
10. Cliente consulta `GET /stats/player/p1` → **`StatsController`** → **`StatsService.getPlayerStats()`** → **`repository.findByPlayerId("p1")`** → respuesta 200
