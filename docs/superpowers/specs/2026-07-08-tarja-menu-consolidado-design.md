# Diseño: Contenedor TARJA — menú Nueva Tarja / Consolidado

**Fecha:** 2026-07-08
**Estado:** Aprobado, pendiente de plan de implementación

## Contexto

Hoy `/tarja` es directamente el formulario de "Nueva tarja" (selección de operación activa + VIN manual). No existe ninguna pantalla donde el tarjador pueda ver su propio historial de tarjas registradas. El dashboard general solo muestra un widget compartido de "Actividad reciente" (últimas 5 tarjas de todos), no una vista personal filtrable.

El usuario quiere que, al entrar a la sección TARJA, el personal tenga claro cómo iniciar el procedimiento y, por separado, pueda consultar sus propios registros (información importante, últimos registros) sin saturar la pantalla de KPIs.

## Objetivo

Reestructurar `/tarja` como un contenedor con dos subsecciones:

1. **Nueva Tarja** — el procedimiento actual para iniciar una tarja (sin cambios de lógica, solo de ruta).
2. **Consolidado** — tabla con el historial de tarjas del tarjador logueado, con filtro de fecha.

Fuera de alcance para esta entrega (explícitamente descartado por el usuario):

- Ranking de tarjadores por tarjas realizadas — se retoma cuando el tema de sesión/login esté más maduro (necesario para atribuir tarjas de forma confiable entre operaciones tipo desconsolidado/roro en el mismo día).
- KPIs / resumen numérico — se descarta para no saturar la pantalla; la tabla ya expone la mayoría de la información relevante.

## Arquitectura y rutas

- **`/tarja`** (nueva pantalla "menú"): dos tarjetas grandes — "Nueva Tarja" y "Consolidado" — cada una con ícono, breve descripción y link a su subruta. Reemplaza el contenido actual de `frontend/app/tarja/page.tsx`.
- **`/tarja/nueva`**: el formulario que hoy vive en `frontend/app/tarja/page.tsx` (select de operación `ACTIVA` + input VIN/chasis manual → `startTarja(operationId, vin)` → redirect a `/tarja/{report.id}`) se mueve tal cual a esta ruta nueva. Sin cambios de lógica ni de comportamiento.
- **`/tarja/consolidado`**: nueva pantalla con la tabla de historial de tarjas del tarjador logueado.
- El botón "Nueva tarja" del dashboard general (`frontend/app/dashboard/page.tsx`, visible solo para rol `TARJADOR`) se actualiza para apuntar directo a `/tarja/nueva` (no al menú), preservando el flujo actual de un clic. El menú (`/tarja`) y Consolidado quedan accesibles desde la navegación de la sección (ej. tabs o breadcrumb dentro de `/tarja/nueva` y `/tarja/consolidado`).

## Backend — nuevo endpoint

No existe hoy un endpoint que filtre `TarjaReport` por `tarjadorId`. `GET /reports` (en `backend/src/reports/reports.controller.ts` → `reports.service.ts::listReports`) solo filtra por `operationId`, sin paginación real (fixed `take: 200`) ni rango de fechas.

Se agrega:

- **Ruta:** `GET /reports/mine?from=&to=&skip=&take=` en `reports.controller.ts`, protegida por `JwtAuthGuard` (guard ya usado en el resto del controller).
- El `tarjadorId` se toma del JWT vía `@CurrentUser()`, **no** de un query param, para evitar que un tarjador consulte el historial de otro.
- **Service:** nuevo método `listMyReports(tarjadorId: number, { from, to, skip, take })` en `reports.service.ts`:
  ```
  prisma.tarjaReport.findMany({
    where: { tarjadorId, ...(from/to ? { startedAt: { gte: from, lte: to } } : {}) },
    orderBy: { startedAt: 'desc' },
    skip, take,
    include: { vehicle: true, operation: true },
  })
  ```
  más un `count` en paralelo (`prisma.tarjaReport.count(...)` con el mismo `where`) para soportar paginación en el frontend.
- **Frontend:** nueva función `listMyReports(params: { from?, to?, skip?, take? })` en `frontend/lib/api.ts`, siguiendo el mismo patrón que `listReports`.

## Frontend — pantalla Consolidado

- Reusa el patrón visual del widget "Actividad reciente" de `dashboard/page.tsx` para mantener consistencia con el sistema de diseño:
  - Card: `rounded-2xl border border-line bg-white`.
  - Header: título (`font-display text-[15px] font-bold tracking-tight text-navy-900`) + subtítulo mono uppercase.
  - Filas: `divide-y divide-line`, cada una `flex items-center gap-3 px-5 py-3.5 hover:bg-navy-50/50`.
  - Tags de estado: reusar los mapas `STATUS_TAG` / `TAG_STYLE` ya definidos en el dashboard (mover a un módulo compartido si no lo están ya, para no duplicar).
- **Filtro de fecha** arriba de la tabla: rango desde/hasta, con "Hoy" como preset por defecto al cargar la pantalla.
- **Columnas:**
  - Código (`reportCode`)
  - VIN/Chasis
  - Operación (nombre/contenedor)
  - Estado (tag, vía `STATUS_TAG`/`TAG_STYLE`)
  - Daño (sí/no)
  - Duración (formateada desde `durationSeconds`; "—" si el reporte sigue en `BORRADOR`)
  - Fecha/hora (`startedAt`)
- **Interacción de fila:** clic navega a `/tarja/{id}` (pantalla de reporte existente en `frontend/app/tarja/[id]/page.tsx`).
  - Si `status === BORRADOR`: continúa la edición normalmente (comportamiento actual de esa pantalla).
  - Si `status !== BORRADOR` (ya finalizado/con daño/anulado/reemplazado): debe abrirse en modo solo-lectura. **Nota para el plan de implementación:** verificar si `tarja/[id]/page.tsx` ya maneja este caso (p.ej. deshabilita el submit si el reporte no está en BORRADOR) o si hay que agregar ese guard explícitamente.
- **Paginación:** simple ("cargar más" o anterior/siguiente), usando `skip`/`take` del endpoint nuevo.
- **Estado vacío:** mensaje simple (`text-[12.5px] text-muted`) si no hay tarjas en el rango de fechas seleccionado, siguiendo el patrón del dashboard.

## Testing

- Backend: test del nuevo método de servicio (filtra correctamente por `tarjadorId`, respeta rango de fechas, pagina bien) y del guard de autorización del endpoint (un tarjador no puede ver reportes de otro tarjadorId aunque lo intente vía manipulación de query).
- Frontend: verificar navegación del menú `/tarja` a ambas subrutas, que el formulario en `/tarja/nueva` siga funcionando igual que antes (regresión), y que la tabla de Consolidado cargue, filtre por fecha y navegue correctamente al hacer clic en una fila.
- E2E (dado que ya existe un flujo de fases en el repo, ver `55ef29c`): agregar un paso que, tras finalizar una tarja, verifique que aparece en `/tarja/consolidado`.
