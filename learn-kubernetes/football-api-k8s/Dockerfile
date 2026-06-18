# ── Stage 1: build ────────────────────────────────────────────────────────────
#
# POR QUÉ multi-stage build:
# El stage de build necesita TypeScript, ts-node, y los tipos de desarrollo.
# La imagen final solo necesita el JS compilado y las dependencias de producción.
# Resultado: imagen final ~200MB en vez de ~500MB (sin devDependencies ni compiler).
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar manifests de dependencias primero para aprovechar el layer cache de Docker.
# Si solo cambia src/, esta capa no se re-ejecuta → builds más rápidos.
COPY package*.json tsconfig.json ./
RUN npm ci

COPY src/ ./src/
RUN npm run build


# ── Stage 2: producción ───────────────────────────────────────────────────────
FROM node:20-alpine AS production

WORKDIR /app

# Solo dependencias de producción (sin devDependencies)
COPY package*.json ./
RUN npm ci --only=production

# Solo el JS compilado del stage anterior
COPY --from=builder /app/dist ./dist

# Puerto que expone la app — documentativo, no funcional
# El Service de K8s apunta a este puerto
EXPOSE 3000

# Correr como usuario no-root (buena práctica de seguridad en containers)
USER node

CMD ["node", "dist/index.js"]
