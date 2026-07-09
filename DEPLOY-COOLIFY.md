# Despliegue en producción (VPS + Coolify)

Infraestructura en 3 contenedores: **Postgres**, **backend** (NestJS/Prisma) y **frontend** (Next.js 16 standalone), orquestados por `docker-compose.yml`.

## Requisitos previos
- VPS con [Coolify](https://coolify.io) instalado.
- Repositorio conectado a Coolify (GitHub/GitLab) o accesible por Git.
- Dos dominios/subdominios apuntando al VPS, p. ej.:
  - `tarja.tudominio.com` → frontend
  - `api.tarja.tudominio.com` → backend

---

## Opción A — Deploy con Docker Compose en Coolify (recomendado)

1. **New Resource → Docker Compose** en el proyecto de Coolify.
2. Conecta el repositorio y rama (`feat/importacion-jerarquica-vin` o la que fusiones a `main`).
3. Build Pack: **Docker Compose**. Ruta del archivo: `docker-compose.yml`.
4. En **Environment Variables**, pega el contenido de `.env.production.example` con valores reales:
   - `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
   - `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`  → genera con `openssl rand -base64 48`
   - `FRONTEND_ORIGIN=https://tarja.tudominio.com`
   - `NEXT_PUBLIC_API_URL=https://api.tarja.tudominio.com`
   > `NEXT_PUBLIC_API_URL` es **build-time**: márcala como disponible en build. Si la cambias, redeploya el frontend.
5. **Dominios**: asigna `tarja.tudominio.com` al servicio `frontend` (puerto 3000) y `api.tarja.tudominio.com` al servicio `backend` (puerto 3000). Coolify (Traefik) genera el HTTPS con Let's Encrypt.
6. **Deploy**. En el primer arranque el backend corre `prisma migrate deploy` automáticamente.

### Sembrar datos iniciales (roles + usuario admin)
El arranque solo aplica migraciones, no siembra. Una sola vez, desde el terminal del contenedor backend en Coolify:
```bash
npx prisma db seed
```
> Requiere `ts-node` (devDependency). Si el contenedor de producción no lo trae, ejecuta el seed apuntando a la base con un checkout local:
> `DATABASE_URL="postgresql://user:pass@HOST:5432/tarja?schema=public" npm run --prefix backend prisma:seed`

---

## Opción B — Servicios separados
Crea dos "Applications" (Dockerfile) apuntando a `./backend` y `./frontend`, más una base de datos **Postgres** gestionada por Coolify. Pasa las mismas variables. Útil si quieres escalar frontend y backend por separado.

---

## Probar en local antes de subir
```bash
cp .env.production.example .env      # ajusta a valores localhost (ver comentarios del archivo)
docker compose up --build
```
- Frontend: http://localhost:3001
- API: http://localhost:3000
- Postgres: localhost:5432

`docker-compose.override.yml` publica los puertos al host solo en local; Coolify lo ignora.

---

## Notas técnicas
- **PDF**: el backend incluye Chromium del sistema para Puppeteer (`PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`), ya lanzado con `--no-sandbox`.
- **WebSocket**: el panel de supervisor usa socket.io contra `NEXT_PUBLIC_API_URL`; el proxy de Coolify soporta WS sobre el mismo dominio de la API.
- **Persistencia**: solo Postgres necesita volumen (`pgdata`). Excel y PDF se generan en memoria, no en disco.
- **Migraciones**: se aplican solas al arrancar el backend. Para crear nuevas en desarrollo usa `npx prisma migrate dev`.
