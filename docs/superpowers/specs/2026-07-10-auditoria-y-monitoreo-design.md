# Auditoría (refuerzo) y Monitoreo (nuevo) — Diseño

Fecha: 2026-07-10 · Rama: `feat/rediseno-movil-usr`

El usuario pidió dos módulos: **Auditoría** (bitácora de todos los movimientos:
logueos, quién tarjó, quién editó, etc.) y **Monitoreo** (avance en tiempo real
del personal: VIN, tarjador, hora inicio/fin, con semáforo verde <5 min / ámbar
5–10 min / rojo >10 min). Otorgó autonomía total para implementar.

## Hallazgo clave

La **auditoría ya existe** y está cableada en todo el sistema:

- Modelo `AuditLog` (usuario, rol, módulo, acción, descripción, `oldValue`/`newValue`,
  IP, dispositivo, `createdAt`).
- `AuditService.record()` fire-and-forget instrumentado en auth (LOGIN/LOGIN_FAILED),
  tarja (START/FINISH/REOPEN/AUTO_RELEASE/VIN_NO_ENCONTRADO…), operations, vehicles,
  reports (ANNUL/REOPEN), imports y users (CREATE/UPDATE/STATUS/PASSWORD_RESET).
- Página `/audit` (solo ADMIN) con KPIs, filtros por módulo, búsqueda y "solo alertas".

El **monitoreo no existe** como vista dedicada. La página `/supervisor` ya trae el
semáforo exacto (`durTone`: <300s verde, ≤600s ámbar, >600s rojo) y columnas
VIN/tarjador/inicio→término/duración, pero está orientada a reportes/anulaciones y
**no** muestra el panel "en vivo" de quién está tarjando ahora mismo con cronómetro
corriendo, ni el resumen por persona.

## Decisiones (confirmadas con el usuario)

- **Auditoría:** completar/reforzar la existente (no rehacer).
- **Monitoreo:** vista nueva; muestra **en vivo + finalizadas del turno**.
- **Acceso Monitoreo:** ADMIN + SUPERVISOR.
- **Tiempo real:** WebSocket (reusa `RealtimeService`/`socket.io-client` ya presentes).

## Módulo 1 — Monitoreo (nuevo)

### Backend `backend/src/monitoring/`
- `GET /monitoring/live` (guard `JwtAuthGuard` + `RolesGuard`, `@Roles('ADMIN','SUPERVISOR')`).
- Turno actual vía `limaShift(now)`.
- Respuesta:
  - `inProgress[]`: tarjas en curso (`status BORRADOR`, `finishedAt null`): reportId,
    reportCode, vin, brand/model, `startedAt`, tarjadorId, tarjador, initials,
    operationCode, vessel.
  - `finished[]`: finalizadas del turno (`reportDate`+`workShift`, estado
    FINALIZADO/CON_DANO): + `finishedAt`, `durationSeconds`, status, hasDamage.
  - `byTarjador[]`: por persona → inProgress, done, damaged, avgSeconds, buckets
    fast/mid/slow, `currentStartedAt`.
  - `stats`: activeTarjadores, inProgressCount, finishedCount, damagedCount,
    avgSeconds, fast/mid/slow, shift, date.
- Umbrales compartidos: `FAST_MAX=300`, `MID_MAX=600` (segundos).

### Frontend `frontend/app/monitoreo/page.tsx`
- Estilo del sistema (Command Deck navy + KPIs + tarjetas), como `/supervisor`.
- Socket a `API_URL`; refresca en `report.started/finished/reopened/annulled`,
  `vehicle.released/auto_released`.
- **Panel En vivo:** una tarjeta por tarja en curso con cronómetro que corre en el
  navegador (setInterval 1s) y cambia de color por tiempo transcurrido.
- **Resumen por tarjador:** ritmo de cada persona (hechas, prom., semáforo).
- **Finalizadas del turno:** tabla VIN · tarjador · inicio→fin · duración (semáforo).
- Link "Monitoreo" en `/dashboard` (visible a supervisor/admin).

## Módulo 2 — Auditoría (refuerzo)

### Backend `backend/src/audit/`
- `AuditService.query({ module, action, userId, from, to, q, limit, offset })`
  → `{ rows, total }`.
- `AuditService.exportCsv(filtros)` → CSV (cap de seguridad).
- Controlador: `GET /audit` ahora devuelve `{ rows, total }` con filtros y paginación;
  `GET /audit/export` devuelve CSV (`text/csv`, attachment).
- **Mejor captura de ediciones:** `users.update` registra los campos que cambiaron con
  `oldValue`/`newValue` (JSON) y descripción legible (quién editó qué: valor anterior→nuevo).

### Frontend `frontend/app/audit/page.tsx`
- Barra de filtros: **rango de fechas** (server-side), botón **Exportar CSV**,
  botón **Cargar más** (paginación por offset).
- Mantiene los filtros cliente actuales (módulo, búsqueda, solo alertas) sobre la
  ventana cargada. Muestra `oldValue→newValue` cuando existan.
- `listAuditLogs` pasa a `{ rows, total }`; nuevos helpers `queryAuditLogs`,
  `auditExportUrl`.

## Riesgos / no-objetivos
- No se rehace la auditoría ni se toca el flujo de tarja.
- Umbrales de semáforo hardcodeados (constantes), sin pantalla de configuración (YAGNI).
- El cronómetro "en vivo" corre en el cliente; el backend solo entrega `startedAt`.
