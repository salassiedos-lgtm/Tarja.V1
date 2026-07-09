# syntax=docker/dockerfile:1

##########  Base  ##########
FROM node:22-bookworm-slim AS base
# Puppeteer NO debe descargar su propio Chromium: usamos el del sistema en el runner
ENV PUPPETEER_SKIP_DOWNLOAD=true
# Sin el binario `openssl`, Prisma no detecta la version de OpenSSL y genera el
# motor para debian-openssl-1.1.x, pero bookworm necesita 3.0.x -> fallo al arrancar.
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app

##########  Dependencias completas (para build)  ##########
FROM base AS deps
COPY package*.json ./
RUN npm ci

##########  Build (nest build + prisma generate)  ##########
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate && npm run build

##########  Dependencias de producción  ##########
FROM base AS prod-deps
COPY package*.json ./
RUN npm ci --omit=dev

##########  Runner  ##########
FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production \
    PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app

# Chromium + fuentes para la generación de PDF con Puppeteer.
# `openssl` es requisito del motor de Prisma (debian-openssl-3.0.x).
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-noto-color-emoji \
      openssl \
      ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# node_modules de producción + cliente Prisma generado + artefactos
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY prisma ./prisma
COPY assets ./assets

EXPOSE 3000
# Aplica migraciones pendientes y arranca la API
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main"]
