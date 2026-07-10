# Edición de tarjas realizadas con autorización — Diseño

Fecha: 2026-07-10
Rama: feat/rediseno-movil-usr
Estado: aprobado por el usuario (pendiente de plan de implementación)

## 1. Contexto y objetivo

En el **Cuadro de tareas** de una operación ([frontend/app/tablero/[opId]/page.tsx](../../../frontend/app/tablero/[opId]/page.tsx),
título "Cuadro de tareas", pestañas *por hacer* / *Realizados*) el tarjador ve los chasis de la
nave/lote. Hoy la pestaña **Realizados** muestra los tarjados de **toda** la operación, sin distinguir
quién los hizo, y no hay forma de corregir una tarja recién cerrada desde ese cuadro.

Se quiere:

1. Que en **Realizados** el tarjador vea **solo las tarjas que él realizó**.
2. Un botón **Editar** por tarja: el dueño puede corregirla **libremente durante 10 minutos**.
3. Pasados los 10 minutos, editar **solo si un supervisor o administrador lo autoriza**
   (flujo **solicitud → aprobación**).
4. Que la **auditoría** muestre que la tarja fue editada, con el **antes/después** de lo que cambió.
5. Mantener/surfacer **Reabrir** (rehacer desde cero) para supervisor/admin.

## 2. Estado actual relevante (lo que ya existe)

- `backend/src/tarja/tarja.service.ts`:
  - `reopen(reportId, userId)` — **ventana de edición de 10 min del dueño**: valida que sea el
    tarjador dueño y que `reopenSecondsLeft > 0`; pasa el reporte a `BORRADOR`, bloquea el vehículo
    (`EN_PROCESO`) y conserva `finishedAt`/`durationSeconds`. Audita `REOPEN`. Vencida la ventana lanza
    error pidiendo anulación al supervisor.
  - `finish(reportId, dto)` — cierra un `BORRADOR` a `FINALIZADO`/`CON_DANO`; si ya tenía `finishedAt`
    (re-finish de una reapertura) **conserva la duración original**.
  - `autoRelease()` (cron `@Cron('0 * * * * *')`): (1) borra borradores nuevos abandonados > 15 min;
    (2) **revierte** reaperturas abandonadas > 10 min (`REOPEN_EXPIRED`) al estado finalizado, sin borrar.
  - `reopenSecondsLeft(report)` — segundos restantes de la ventana de 10 min desde `finishedAt`.
- `backend/src/reports/reports.service.ts`:
  - `reopen(reportId, userId)` — **"Reabrir" del admin**: pasa el reporte a `REEMPLAZADO` y el vehículo a
    `REABIERTO` (rehacer desde cero). Endpoint `POST /reports/:id/reopen` (roles `SUPERVISOR`,`ADMIN`).
  - `annul(...)` — anulación con motivo (`SUPERVISOR`,`ADMIN`).
- `backend/src/tarja/tarja.controller.ts` — endpoints de tarja con `@Roles('TARJADOR')` para
  start/accessories/damages/finish/reopen; `@Roles('SUPERVISOR','ADMIN')` para `vehicles/:id/release`.
- `frontend/app/tablero/[opId]/page.tsx` — carga el board con `getNaveVehicles(opId)`; usa `v.done` y
  `v.status` para pintar Realizados. Pantalla de edición reusable: `frontend/app/tarja/[id]/page.tsx`.
- `frontend/app/audit/page.tsx` — mapa `ACTION_META` con ícono/color por acción; muestra
  Momento/Usuario/Módulo/Acción/**Detalle** (`description`). No muestra `oldValue`/`newValue` hoy.

**Observación clave:** el motor de "editar dentro de 10 min" ya existe (`tarja.service.reopen`). Lo nuevo
es: filtro por persona, la cola de autorización post-10min, el **diff** en auditoría, y surfacear los
botones **Editar/Reabrir** en el cuadro.

## 3. Alcance

**Incluye:** filtro Realizados por persona; botón Editar (ventana libre 10 min); solicitud → aprobación
para editar post-10min; edición autorizada sin cronómetro; cancelación de edición autorizada por
supervisor; diff antes/después en auditoría; surfacear Reabrir (supervisor/admin).

**No incluye (para después):** rediseño de otras vistas; arreglo del WebSocket (realtime queda opcional).

## 4. Decisiones (confirmadas con el usuario)

| Tema | Decisión |
|---|---|
| Filtro Realizados | Tarjador: solo las suyas. Supervisor/Admin: todas. |
| Autorización post-10min | Solicitud (con motivo) → aprobación de supervisor/admin. |
| Ventana tras aprobar | **Sin cronómetro**: editable hasta que el tarjador la vuelva a finalizar. |
| Auditoría | **Diff antes/después** en toda edición (libre y autorizada). |
| Reabrir | Incluido: botón para supervisor/admin (rehacer desde cero). |
| Bandeja de solicitudes | **Módulo propio en /inicio** (MODS), con su página de bandeja. |
| Enfoque técnico | Opción A: tabla dedicada `TarjaEditRequest` + `editSnapshot` para el diff. |

## 5. Modelo de datos

### 5.1 Nueva tabla `TarjaEditRequest`

```prisma
enum EditRequestStatus {
  PENDIENTE
  APROBADA
  RECHAZADA
  COMPLETADA
}

model TarjaEditRequest {
  id             Int               @id @default(autoincrement())
  reportId       Int               @map("report_id")
  report         TarjaReport       @relation(fields: [reportId], references: [id])
  requestedById  Int               @map("requested_by")
  requestedBy    User              @relation("EditReqRequester", fields: [requestedById], references: [id])
  reason         String
  status         EditRequestStatus @default(PENDIENTE)
  resolvedById   Int?              @map("resolved_by")
  resolvedBy     User?             @relation("EditReqResolver", fields: [resolvedById], references: [id])
  resolvedAt     DateTime?         @map("resolved_at")
  resolveComment String?           @map("resolve_comment")
  createdAt      DateTime          @default(now()) @map("created_at")
  updatedAt      DateTime          @updatedAt @map("updated_at")

  @@index([status])
  @@index([reportId])
  @@map("tarja_edit_requests")
}
```

### 5.2 Cambios en modelos existentes

- `TarjaReport`: `editSnapshot Json?  @map("edit_snapshot")` — estado del reporte capturado al **entrar** a
  editar (daño + accesorios + daños + detalles + iniciales). Se usa para computar el diff al re-finalizar y
  luego se limpia (`null`). Además la relación inversa `editRequests TarjaEditRequest[]`.
- `User`: relaciones inversas `editRequestsMade` (`EditReqRequester`) y `editRequestsResolved`
  (`EditReqResolver`).

### 5.3 Migración

Migración Prisma nueva (tabla + enum + columna). **Aplicar a la BD que usa el frontend**: el Postgres de
Docker (`tarjav1-postgres-1`, host `:5433`, db `tarja`). Ver [[api-wiring / dos Postgres]]: hay una BD
nativa en `:5432/tarja_dev` (dev, casi siempre inactiva) y la BD real de Docker en `:5433/tarja`. Correr
`prisma migrate deploy` dentro del contenedor backend (o rebuild) para la BD de Docker; y `migrate dev`
para la BD local de dev.

## 6. Máquina de estados

```
FINALIZADO / CON_DANO ──"Editar"──► BORRADOR (editando) ──"Finalizar"──► FINALIZADO / CON_DANO
                                        │                                 (+ auditoría EDITADA con diff,
                                        │                                    solicitud → COMPLETADA)
   dos caminos para ENTRAR a editar:    │
   1) dueño, dentro de 10 min ──────────┤  ventana libre; el cron auto-revierte si se abandona > 10 min
   2) dueño, con solicitud APROBADA ────┘  sin cronómetro; el cron NO la toca

   "Reabrir" (supervisor/admin) ─────► REEMPLAZADO + vehículo REABIERTO (rehacer desde cero)
```

Distinción para `autoRelease`: una edición autorizada se reconoce porque el reporte tiene una
`TarjaEditRequest` en estado `APROBADA` (no `COMPLETADA`). El cron la **exime** del auto-revert de 10 min.
Al re-finalizar, la solicitud pasa a `COMPLETADA` (deja de eximir).

## 7. Backend — servicios y endpoints

Todos bajo `JwtAuthGuard` + `RolesGuard`.

| Método | Ruta | Rol | Comportamiento |
|---|---|---|---|
| `POST` | `/tarja/:id/edit` | dueño `TARJADOR` | Entrar a editar. Valida: reporte `FINALIZADO`/`CON_DANO`, es el dueño, y operación `ACTIVA`. Autorizado si `reopenSecondsLeft>0` **o** existe solicitud `APROBADA` no completada. Si no → `409` con código `REQUIERE_AUTORIZACION`. Al entrar: captura `editSnapshot`, reporte→`BORRADOR`, bloquea vehículo `EN_PROCESO` al dueño (conserva `finishedAt`). |
| `POST` | `/tarja/:id/edit-request` | dueño `TARJADOR` | `{ reason }`. Solo si la ventana venció y no hay ya una `PENDIENTE`/`APROBADA` activa. Crea `TarjaEditRequest` `PENDIENTE`. Audita `EDIT_REQUEST`. |
| `GET` | `/tarja/edit-requests` | `SUPERVISOR`,`ADMIN` | Lista solicitudes (por defecto `PENDIENTE`), con reporte, vehículo, solicitante. Es la bandeja. |
| `POST` | `/tarja/edit-requests/:id/resolve` | `SUPERVISOR`,`ADMIN` | `{ approve: boolean, comment? }` → `APROBADA`/`RECHAZADA` + `resolvedById/At`. Audita `EDIT_APPROVED`/`EDIT_REJECTED`. Emite realtime (opcional). |
| `POST` | `/tarja/edit-requests/:id/cancel` | `SUPERVISOR`,`ADMIN` | Cancela una edición **autorizada en curso**: revierte el reporte a finalizado (reusa `revertReopen`), marca la solicitud `RECHAZADA`/cerrada, limpia `editSnapshot`. Audita `EDIT_CANCELED`. |
| `POST` | `/tarja/:id/finish` | dueño `TARJADOR` | (existente, extendido) Si el reporte trae `editSnapshot`: computa diff, audita `EDITADA`, marca la solicitud `APROBADA`→`COMPLETADA`, limpia `editSnapshot`. Conserva la duración. |
| `POST` | `/reports/:id/reopen` | `SUPERVISOR`,`ADMIN` | (existente) **Reabrir**: REEMPLAZADO + vehículo REABIERTO. Solo se surface el botón en el cuadro. |

Notas de implementación:
- `POST /tarja/:id/edit` reemplaza/renombra el uso actual de `POST /tarja/:id/reopen` para la edición del
  dueño (o se mantiene `reopen` como alias). Debe **añadir la captura del snapshot** que hoy no existe.
- `autoRelease()`: la consulta de "reaperturas abandonadas" debe excluir reportes con solicitud `APROBADA`
  activa: `where: { status: 'BORRADOR', finishedAt: { lt: reopenThreshold }, NOT: { editRequests: { some: { status: 'APROBADA' } } } }`.
- El board (`getNaveVehicles`/`vehicles.service`) debe: (a) incluir en los ítems *done* el `tarjadorId`
  (y opcionalmente `reopenSecondsLeft` y el estado de solicitud de edición); (b) **scope por rol**: si el
  llamador es `TARJADOR`, devolver en *done* solo los de su `tarjadorId`; supervisor/admin, todos.

## 8. Diff de auditoría

Al finalizar una edición se compara `editSnapshot` (antes) contra el estado nuevo. Campos comparados:

- `hasDamage` (Sí/No) y, si aplica, `damageSource`, `damageOperation`, `damageAffects`, `damageMoment`,
  `damageMomentOther`.
- `details`, `tarjadorInitials`.
- Accesorios: por accesorio, `hasAccessory` (Sí/No) y `quantity`.
- Daños: conjunto de descripciones (añadidas / quitadas).

Se escribe un `AuditLog` con:
- `action: 'EDITADA'`, `module: 'tarja'`, `userId` = dueño.
- `description` legible (se ve en la columna Detalle). Ej:
  `"Editó 000123 · Daño No→Sí (ENCONTRADO); Radio Sí→No; Llaves ×1→×2; +daño 'Rayón puerta'; detalles modificados"`.
- `oldValue`/`newValue` con el JSON antes/después (para un detalle expandible futuro).

Nuevas acciones a añadir en `ACTION_META` de [frontend/app/audit/page.tsx](../../../frontend/app/audit/page.tsx)
con ícono/label/tono: `EDIT_REQUEST` (info), `EDIT_APPROVED` (pos), `EDIT_REJECTED` (neg), `EDITADA`
(info), `EDIT_CANCELED` (warn). Así queda trazada toda la cadena: quién pidió, quién autorizó, qué cambió.

## 9. Frontend

### 9.1 Cuadro de tareas — pestaña Realizados ([tablero/[opId]/page.tsx](../../../frontend/app/tablero/[opId]/page.tsx))

- **Filtro**: para `TARJADOR`, Realizados muestra solo sus tarjas (scope en el servidor; ver §7).
  Supervisor/admin ven todas.
- **Acciones por tarja realizada, según rol:**
  - **Dueño tarjador** → botón **Editar** con estado dinámico:
    - dentro de 10 min → `Editar (m:ss)` con cuenta regresiva
    - vencida, sin solicitud → `Solicitar edición` (abre modal de motivo)
    - solicitud `PENDIENTE` → chip *Solicitud pendiente* (deshabilitado)
    - solicitud `APROBADA` → `Editar` habilitado (sin cronómetro)
    - solicitud `RECHAZADA` → chip *Rechazada* + comentario del supervisor
  - **Supervisor/Admin** → botón **Reabrir** (rehacer desde cero).
- Al pulsar **Editar** se entra vía `POST /tarja/:id/edit` y se navega a la pantalla de edición existente
  ([tarja/[id]/page.tsx](../../../frontend/app/tarja/[id]/page.tsx)), que ya opera sobre `BORRADOR`.

### 9.2 Módulo "Solicitudes de edición" en /inicio

- Nuevo acceso (MOD) en [frontend/app/inicio/page.tsx](../../../frontend/app/inicio/page.tsx) visible para
  `SUPERVISOR`/`ADMIN`, con contador de solicitudes `PENDIENTE`.
- Nueva página de bandeja (p.ej. `frontend/app/solicitudes-edicion/page.tsx`): lista de solicitudes con
  tarja (código, VIN, nave/lote), solicitante, motivo, fecha; acciones **Aprobar** / **Rechazar**
  (con comentario opcional). Al resolver, refresca la lista.

### 9.3 Cliente API

Añadir en [frontend/lib/api.ts](../../../frontend/lib/api.ts): `startEditTarja(id)`, `requestTarjaEdit(id, reason)`,
`listEditRequests(status?)`, `resolveEditRequest(id, approve, comment?)`, `cancelEditRequest(id)`, y tipos
asociados. Extender el tipo del board (`NaveVehicle`) con `tarjadorId`, `reopenSecondsLeft`, y estado de
solicitud de edición.

## 10. Reglas y casos borde

- **Dueño**: solo el tarjador que hizo la tarja edita/solicita (validado en backend).
- **Lote cerrado**: no se edita si la operación no está `ACTIVA` (misma regla que tarjar). Para editar en un
  lote cerrado, primero se reabre el lote.
- **Edición autorizada abandonada**: no auto-revierte; el supervisor/admin la **cancela** (`/cancel`).
- **Reabrir vs Editar**: excluyentes por rol en la UI. Una tarja `REEMPLAZADO`/`ANULADO` no se edita.
- **Duración**: la edición no altera la duración registrada (ya se conserva en `finish`).
- **Solicitud duplicada**: no se crean dos solicitudes activas (`PENDIENTE`/`APROBADA`) para la misma tarja.
- **Reingreso**: tras `APROBADA`, el dueño puede entrar/salir de la edición varias veces hasta finalizar
  (la exención se mantiene mientras la solicitud no esté `COMPLETADA`).

## 11. Notificaciones

Al resolver una solicitud se emite un evento realtime (`edit_request.resolved`) — **opcional**: el
WebSocket hoy está mal configurado, así que el flujo no depende de él. Sin WS, el estado se refleja al
refrescar y con el contador del MOD en /inicio.

## 12. Pruebas (TDD)

Tests de servicio en `tarja.service` (jest, siguiendo TDD; correr e2e con `--runInBand`, ver [[e2e-flake]]):

- Entrar a editar dentro de la ventana de 10 min → OK (snapshot capturado, reporte `BORRADOR`).
- Entrar a editar vencido sin aprobación → `409 REQUIERE_AUTORIZACION`.
- Crear solicitud (vencida) → `PENDIENTE`; no permite duplicar activa.
- Aprobar / rechazar solicitud → estados y auditoría correctos.
- Entrar a editar con solicitud `APROBADA` → OK, exento del auto-revert (simular cron: no revierte).
- `finish` tras editar → diff correcto + `AuditLog` `EDITADA` (old/new) + solicitud `COMPLETADA`.
- Cancelar edición autorizada → revierte a finalizada.
- No-dueño intenta editar/solicitar → `403`.

## 13. Archivos afectados (estimado)

- `backend/prisma/schema.prisma` (+ migración) — tabla, enum, `editSnapshot`, relaciones.
- `backend/src/tarja/tarja.service.ts` — `startEdit`, snapshot, `finish` con diff, exención en `autoRelease`,
  helpers de diff.
- `backend/src/tarja/edit-requests.service.ts` (nuevo) + integración — crear/listar/resolver/cancelar.
- `backend/src/tarja/tarja.controller.ts` (+ controller de edit-requests) — endpoints y roles.
- `backend/src/tarja/dto/*.ts` — DTOs (`EditRequestDto`, `ResolveEditRequestDto`).
- `backend/src/vehicles/vehicles.service.ts` — board con `tarjadorId` y scope por rol.
- `frontend/app/tablero/[opId]/page.tsx` — filtro + botones Editar/Reabrir + estados.
- `frontend/app/inicio/page.tsx` + `frontend/app/solicitudes-edicion/page.tsx` (nuevo) — MOD + bandeja.
- `frontend/app/audit/page.tsx` — nuevas acciones en `ACTION_META`.
- `frontend/lib/api.ts` — funciones y tipos.
- Tests: `backend/src/tarja/*.spec.ts`.
