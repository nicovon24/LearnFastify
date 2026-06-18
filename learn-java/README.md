# Match Events System — Java + Spring Boot + Kafka

Proyecto de aprendizaje que cubre Java 17, Spring Boot 3, Kafka y Docker Compose con un dominio de eventos de partidos de fútbol.

## Diagrama del flujo completo

```
Cliente (curl/Postman)
        │
        │  POST /events
        │  { "eventType": "GOAL", "playerId": "p1", "minute": 32, ... }
        ▼
┌─────────────────────────────────┐
│   match-ingestion-service       │  Puerto 8080
│                                 │
│  MatchEventController           │
│    ↓ @Valid valida el DTO        │
│    ↓ delega al producer         │
│  MatchEventProducer             │
│    ↓ serializa a JSON           │
│    ↓ KafkaTemplate.send()       │
└─────────────────────────────────┘
        │
        │  Topic: "match-events"
        │  Key: matchId (garantiza orden por partido)
        │  Value: {"eventType":"GOAL","playerId":"p1",...}
        ▼
┌─────────────────────────────────┐
│         KAFKA BROKER            │
│   Topic: match-events           │
│   Particiones: 3                │
│   Retención: 7 días             │
└─────────────────────────────────┘
        │
        │  Consumer Group: "stats-aggregator"
        │  at-least-once (manual acknowledgment)
        ▼
┌─────────────────────────────────┐
│   stats-aggregator-service      │  Puerto 8081
│                                 │
│  MatchEventConsumer             │
│    ↓ @KafkaListener             │
│    ↓ delega a StatsService      │
│  StatsService                   │
│    ↓ @Transactional             │
│    ↓ find or create PlayerStats │
│    ↓ incrementa contadores      │
│    ↓ repository.save()          │
│  PlayerStatsRepository          │
│    ↓ Spring Data JPA            │
└─────────────────────────────────┘
        │
        │  INSERT/UPDATE player_stats
        ▼
┌─────────────────────────────────┐
│   PostgreSQL (statsdb)          │
│   Tabla: player_stats           │
└─────────────────────────────────┘
        │
        │  GET /stats/player/{playerId}
        ▲
        │  200 OK con estadísticas agregadas
┌─────────────────────────────────┐
│   stats-aggregator-service      │
│   StatsController               │
│    ↓ @GetMapping                │
│    ↓ statsService.getPlayerStats│
└─────────────────────────────────┘
```

---

## Prerrequisitos

- **Java 17+**: `java -version`
- **Maven 3.8+**: `mvn -version`
- **Docker y Docker Compose**: `docker --version`

---

## Cómo levantar todo

### Opción A: Con Docker Compose (recomendada)

```bash
# 1. Compilar los JARs de ambos servicios
cd match-ingestion-service
mvn package -DskipTests
cd ../stats-aggregator-service
mvn package -DskipTests
cd ..

# 2. Levantar toda la infraestructura
docker-compose up --build

# Esto levanta:
#   - Zookeeper (coordinación de Kafka)
#   - Kafka (message broker)
#   - postgres-aggregator (DB del aggregator, puerto 5433)
#   - match-ingestion-service (puerto 8080)
#   - stats-aggregator-service (puerto 8081)
```

### Opción B: Levantar solo la infraestructura (Kafka + Postgres) y los servicios localmente

```bash
# Terminal 1: Levantar solo Kafka y Postgres
docker-compose up zookeeper kafka postgres-aggregator

# Terminal 2: match-ingestion-service
cd match-ingestion-service
KAFKA_BOOTSTRAP_SERVERS=localhost:9092 mvn spring-boot:run

# Terminal 3: stats-aggregator-service
cd stats-aggregator-service
KAFKA_BOOTSTRAP_SERVERS=localhost:9092 \
POSTGRES_HOST=localhost \
POSTGRES_DB=statsdb \
POSTGRES_USER=scout \
POSTGRES_PASSWORD=scout123 \
mvn spring-boot:run
```

---

## Correr los tests

```bash
# Tests del ingestion service
cd match-ingestion-service
mvn test

# Tests del aggregator
cd ../stats-aggregator-service
mvn test
```

Los tests unitarios usan Mockito para mockear dependencias — no necesitan Kafka ni Postgres corriendo.

---

## Probar el flujo completo

### 1. Publicar un evento de gol

```bash
curl -X POST http://localhost:8080/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "GOAL",
    "playerId": "player-rodrigo",
    "playerName": "Rodrigo Espinoza",
    "teamId": "team-sur",
    "teamName": "Club Deportivo Sur",
    "matchId": "match-2024-001",
    "minute": 32
  }'
```

Respuesta esperada (202 Accepted):
```json
{
  "status": "accepted",
  "message": "Evento recibido y publicado en Kafka",
  "eventType": "GOAL",
  "matchId": "match-2024-001",
  "timestamp": "2024-06-17T..."
}
```

### 2. Publicar una tarjeta amarilla

```bash
curl -X POST http://localhost:8080/events \
  -H "Content-Type: application/json" \
  -d '{
    "eventType": "CARD",
    "playerId": "player-rodrigo",
    "playerName": "Rodrigo Espinoza",
    "teamId": "team-sur",
    "teamName": "Club Deportivo Sur",
    "matchId": "match-2024-001",
    "minute": 67
  }'
```

### 3. Consultar las estadísticas (esperar ~1 segundo que Kafka procese)

```bash
curl http://localhost:8081/stats/player/player-rodrigo
```

Respuesta esperada (200 OK):
```json
{
  "id": 1,
  "playerId": "player-rodrigo",
  "playerName": "Rodrigo Espinoza",
  "teamId": "team-sur",
  "teamName": "Club Deportivo Sur",
  "goals": 1,
  "yellowCards": 1,
  "redCards": 0,
  "substitutionsIn": 0,
  "lastUpdated": "2024-06-17T..."
}
```

### 4. Probar validaciones (esperar 400 Bad Request)

```bash
# Evento sin playerId (campo requerido)
curl -X POST http://localhost:8080/events \
  -H "Content-Type: application/json" \
  -d '{"eventType": "GOAL", "minute": 200}'
```

---

## Estructura del proyecto

```
learn-java/
├── docker-compose.yml                         ← Toda la infraestructura
├── README.md
│
├── match-ingestion-service/
│   ├── Dockerfile
│   ├── pom.xml                                ← Dependencias Maven
│   └── src/
│       ├── main/java/com/scout/ingestion/
│       │   ├── MatchIngestionApplication.java ← Punto de entrada (@SpringBootApplication)
│       │   ├── controller/
│       │   │   └── MatchEventController.java  ← POST /events con @Valid
│       │   ├── dto/
│       │   │   └── MatchEventRequest.java     ← DTO con Bean Validation
│       │   ├── kafka/
│       │   │   └── MatchEventProducer.java    ← KafkaTemplate.send()
│       │   └── model/
│       │       └── EventType.java             ← Enum: GOAL/CARD/SUBSTITUTION
│       ├── main/resources/
│       │   └── application.yml
│       └── test/java/com/scout/ingestion/
│           └── kafka/MatchEventProducerTest.java  ← Mockito: mockea KafkaTemplate
│
└── stats-aggregator-service/
    ├── Dockerfile
    ├── pom.xml
    └── src/
        ├── main/java/com/scout/aggregator/
        │   ├── StatsAggregatorApplication.java
        │   ├── controller/
        │   │   └── StatsController.java       ← GET /stats/player/{id}
        │   ├── entity/
        │   │   └── PlayerStats.java           ← Entidad JPA con anotaciones
        │   ├── repository/
        │   │   └── PlayerStatsRepository.java ← Spring Data JPA (queries automáticas)
        │   ├── service/
        │   │   └── StatsService.java          ← @Transactional, lógica de agregación
        │   └── kafka/
        │       ├── MatchEventConsumer.java    ← @KafkaListener (manual ack)
        │       └── KafkaConfig.java           ← ConsumerFactory + ContainerFactory
        ├── main/resources/
        │   └── application.yml
        └── test/java/com/scout/aggregator/
            └── service/StatsServiceTest.java  ← Mockito: mockea PlayerStatsRepository
```

---

## Conceptos clave — comparación con NestJS

| Concepto | NestJS | Spring Boot |
|---|---|---|
| Punto de entrada | `@Module` principal | `@SpringBootApplication` |
| DI / Injectable | `@Injectable()` | `@Service`, `@Component`, `@Repository` |
| Controller | `@Controller()` + `@Get()` | `@RestController` + `@GetMapping` |
| Validación de body | `class-validator` + `ValidationPipe` | `Bean Validation` + `@Valid` |
| Path variable | `@Param('id')` | `@PathVariable` |
| Request body | `@Body()` | `@RequestBody` |
| ORM/DB | Prisma, TypeORM | Spring Data JPA + Hibernate |
| Config/env | `process.env.VAR` | `${VAR:default}` en `application.yml` |
| Tests unitarios | Jest + `jest.fn()` | JUnit 5 + Mockito (`@Mock`, `when()`) |
| Mensajería | `@nestjs/microservices` | Spring Kafka (`KafkaTemplate`, `@KafkaListener`) |

---

## Próximos pasos

- [ ] **Spring Security**: agregar autenticación JWT al ingestion service
- [ ] **Testcontainers**: integration tests con Kafka y Postgres reales en contenedores
- [ ] **Dead Letter Topic**: manejar mensajes que fallan repetidamente
- [ ] **Flyway**: migrations versionadas en vez de `ddl-auto=update`
- [ ] **Actuator**: endpoints de health check y métricas (`/actuator/health`)
