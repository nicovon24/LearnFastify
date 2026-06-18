# Dockerfile para match-ingestion-service
#
# MULTI-STAGE BUILD: buena práctica para imágenes de Java
#
# Por qué multi-stage:
#   Stage 1 (build): imagen con JDK completo + Maven para compilar → genera el JAR
#   Stage 2 (runtime): imagen con solo JRE (más liviana) para correr el JAR
#   La imagen final no incluye el JDK ni Maven — solo el JAR compilado.
#   Resultado: imagen de ~200MB en vez de ~600MB.

# ── Stage 1: Compilar ─────────────────────────────────────────────────────────
FROM eclipse-temurin:17-jdk-alpine AS build

WORKDIR /app

# Copiamos primero el pom.xml y descargamos las dependencias.
# POR QUÉ por separado: Docker cachea capas. Si solo cambiamos código fuente
# (no el pom.xml), Docker reutiliza la capa de dependencias cacheada →
# build mucho más rápido en la segunda compilación.
COPY pom.xml .

# Descargamos dependencias sin compilar (-q: quiet, -f: specify pom file)
# El flag dependency:go-offline descarga todo para compilar offline
RUN apk add --no-cache maven && \
    mvn dependency:go-offline -q

# Copiamos el código fuente y compilamos
COPY src ./src

# package: compila, corre los tests, y genera el fat JAR en target/
# -DskipTests: saltear tests en el build de imagen (los tests se corren por separado)
RUN mvn package -DskipTests -q

# ── Stage 2: Imagen de runtime ─────────────────────────────────────────────────
FROM eclipse-temurin:17-jre-alpine

WORKDIR /app

# Copiamos solo el JAR compilado del stage anterior
COPY --from=build /app/target/*.jar app.jar

EXPOSE 8080

# El entrypoint usa el JAR como ejecutable
# -Djava.security.egd: acelera el arranque de Spring Boot en entornos Linux
ENTRYPOINT ["java", "-Djava.security.egd=file:/dev/./urandom", "-jar", "app.jar"]
