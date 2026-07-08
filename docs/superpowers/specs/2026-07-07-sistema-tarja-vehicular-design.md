# Spec — Sistema de Tarja Vehicular (PWA) — CSPCP Chancay

**Fecha:** 2026-07-07
**Basado en:** `plan_tecnico_tarja_vehicular_v2.2.md` (documento técnico de referencia)
**Estado:** Diseño aprobado por el usuario. Pendiente de escribir plan de implementación.

Este spec **reconcilia** el plan técnico v2.2 con la ficha oficial real
(`REPORTE DE ESTADO DE UNIDADES - USR.pdf`) y con las decisiones tomadas en la
sesión de brainstorming. Donde este documento y el plan difieran, **manda este
documento**. Para el detalle exhaustivo de tablas, endpoints y flujos, el plan
v2.2 sigue siendo la referencia.

---

## 1. Objetivo

PWA instalable (móvil, tablet, escritorio) para registrar el estado/tarja de
unidades vehiculares en el Puerto de Chancay (CSPCP). Una sola base de código
para tres roles: **Administrador**, **Supervisor**, **Tarjador**.

Flujo núcleo: Admin carga Excel → Tarjador escanea/ingresa VIN y registra
accesorios y daños → Supervisor monitorea en tiempo real y anula si hay error →
se genera PDF idéntico a la ficha oficial.

---

## 2. Decisiones cerradas (sesión 2026-07-07)

| Tema | Decisión |
| --- | --- |
| **Stack** | Next.js + React (frontend/PWA), NestJS (backend), Prisma, PostgreSQL. TypeScript en ambos. |
| **Entorno de desarrollo** | Local en Windows: Node 24 + PostgreSQL 18 (ya corriendo). **Sin Docker** por ahora; Docker se suma para VPS/producción. WampServer no se usa. |
| **Autenticación** | Opción A: JWT interno con NestJS (refresh tokens, bcrypt, RBAC). Keycloak queda descartado para v1. |
| **Servidor productivo** | Se decide después (local del puerto vs VPS). No bloquea el desarrollo. |
| **Tiempo real** | `socket.io` en NestJS, **una sola instancia, sin Redis** por ahora. Redis se agrega solo al escalar a múltiples instancias. |
| **PDF** | Puppeteer (HTML→PDF). |
| **VIN no planificado** | Notificación = **alerta/bandera en el panel del Administrador** (sin correo). |
| **Iniciales del tarjador** | Se toman automáticamente del **usuario logueado**. |
| **Mapa de estados** | `OBSERVADO` = reporte `CON_DANO`; `TARJADO` = reporte `FINALIZADO` sin daño. |
| **Enums de BD** | Sin ñ ni acentos (`CON_DANO`, etc.). Etiquetas en español solo en la UI. |
| **Idioma UI** | Solo español. |
| **Escáner VIN** | Entrada manual como camino principal garantizado; escáner de cámara como módulo enchufable, se activa cuando llegue la foto de la etiqueta. |
| **Modelo de daños** | Estructurado (según ficha oficial) **+** líneas de detalle en texto libre. |
| **Recuperación de contraseña** | Omitida en v1; la gestiona el Administrador. |

---

## 3. Arquitectura del proyecto

Monorepo simple (sin Nx/Turborepo):

```txt
TARJA V.1/
├── backend/     NestJS + Prisma + PostgreSQL (API REST, WebSockets, PDF, auditoría, worker de candados)
├── frontend/    Next.js + React (PWA: Admin, Supervisor, Tarjador móvil)
├── docs/        plan técnico + este spec + plantillas
├── assets/      logo COSCO / marca de agua
└── storage/     excels cargados, pdfs generados, plantillas (runtime, ignorado por git)
```

Módulos del backend (NestJS): `auth`, `users`, `roles`, `operations`, `imports`,
`vehicles`, `tarja-reports`, `accessories`, `damages`, `annulments`, `pdf`,
`audit`, `realtime`.

### 3.1 Escaneo de VIN (de-risking del pendiente crítico)

La simbología real (Code 39 / Data Matrix / **PDF417**) aún no está confirmada.
Por eso:

- **Entrada manual** = camino principal, funciona desde el día 1.
- **Escáner de cámara** = componente enchufable con interfaz estable
  (`onScan(code)`); la librería concreta se elige/ajusta al recibir la foto de la
  etiqueta. El sistema funciona completo aunque el escáner se decida después.
- La cámara exige contexto seguro (HTTPS); en dev se contempla `localhost`
  (seguro) o certificado local.

---

## 4. Modelo de datos — cambios vs. plan v2.2

El modelo del plan v2.2 (sección 17–18) se mantiene, con estos cambios:

### 4.1 Daños estructurados (nuevo)

La ficha oficial captura clasificación de daño a nivel de **reporte** (no por
línea). Se agregan a `tarja_reports` (solo aplican si `has_damage = true`):

| Campo | Valores |
| --- | --- |
| `damage_source` | `CAUSADO` \| `ENCONTRADO` (Daño infligido / encontrado) |
| `damage_operation` | `DESCARGA` \| `EMBARQUE` \| `TRANSITO` \| `REESTIBA` |
| `damage_affects` | `CARGA_CHANCAY` \| `CARGA_TRANSITO` |
| `damage_moment` | `ANTES_DESCARGA` \| `DURANTE_DESCARGA` \| `POSTERIOR_DESCARGA` \| `ANTES_EMBARQUE` \| `DURANTE_EMBARQUE` \| `OTROS` |
| `damage_moment_other` | texto (solo cuando `damage_moment = OTROS`) |

Cada campo es de selección única y **nullable** (se llenan solo cuando hay daño).
La tabla `tarja_report_damages` (líneas de detalle en texto libre) se mantiene y
mapea a la sección "DAMAGE DETAILS" de la ficha.

### 4.2 Enums sin ñ/acentos

Estados de reporte: `BORRADOR`, `FINALIZADO`, `CON_DANO`, `ANULADO`,
`REEMPLAZADO`. El índice único parcial usa exactamente estos valores:

```sql
CREATE UNIQUE INDEX uniq_valid_tarja_per_vehicle
ON tarja_reports (vehicle_id)
WHERE status IN ('BORRADOR', 'FINALIZADO', 'CON_DANO');
```

Este índice parcial **no** se declara en `schema.prisma`; se agrega con migración
SQL manual.

### 4.3 Seed de accesorios (16, orden de la ficha)

`accessories` se siembra con los 16 ítems en el orden exacto de las dos columnas
de la ficha (vía `sort_order`):

Columna izquierda: Radio, Reloj, Encendedor, Ceniceros, Espejos interiores,
Espejos laterales, Antena, Pisos adicionales.
Columna derecha: Plumillas, Tapa de llanta, Llanta de repuesto, Gata,
Herramientas, Llaves del vehículo, Catálogos, Relays.

Cada accesorio en el reporte guarda `has_accessory` (Y/N) y `quantity`
(CANT/QTY), igual que la ficha.

### 4.4 Sin cambios respecto al plan

Relación 1:1 vehículo–tarja válida (índice parcial), `replaced_by_report_id`,
FK circular `vehicles.current_report_id` ↔ `tarja_reports.vehicle_id` (relación
Prisma con nombre explícito y campo nullable), candado `locked_by`/`locked_at`,
auto-liberación a 15 min, auditoría en `audit_logs`.

---

## 5. Reporte PDF

Reproduce fielmente la ficha oficial `REPORTE DE ESTADO DE UNIDADES` (bilingüe
EN/ES), incluyendo:

- Encabezado con **logo COSCO** (`images.png`).
- Datos generales: Vessel/Nave, Date/Fecha, Bill of lading or Booking, Port of
  discharge/loading, Chasis number.
- Inventario de 16 accesorios en dos columnas (Y/N + Cant).
- Bloque de daños: ¿existen daños? (Y/N) + clasificación estructurada (origen,
  operación, carga afectada, momento) + detalle en texto libre.
- **Firmas**: Ship's representative / Customs Agent-Consignee / Port.

> Pendiente menor: la ficha identifica la unidad por "Chasis number", no por
> "VIN". Confirmar con la foto de la etiqueta si coinciden (habitual en autos
> importados). El modelo ya tiene `vin` y `chassis_number`.

---

## 6. Orden de construcción (fases del plan v2.2)

1. **Base técnica**: monorepo, NestJS, Next.js, Prisma, PostgreSQL, auth JWT +
   roles (ADMIN / SUPERVISOR / TARJADOR).
2. **Operaciones + Importación Excel** + catálogo de accesorios (seed 16).
3. **Tarja móvil PWA**: VIN (manual + slot escáner), flujo no planificado,
   accesorios, daños (estructurados + texto), finalización + duración.
4. **Supervisor**: dashboard en tiempo real, anulación con motivo,
   auto-liberación 15 min + liberación manual.
5. **PDF**: plantilla HTML idéntica a la ficha (logo + firmas) → Puppeteer.
6. **Auditoría, backups, rate limiting, permisos finos.**

---

## 7. Insumos pendientes del usuario (no bloquean el arranque)

- Contraseña del usuario `postgres` (para crear la BD) — antes de la Fase 1.
- **Excel real** con encabezados exactos (idealmente RO-RO y DESCONSOLIDADO) —
  antes de la Fase 2.
- **Foto de la etiqueta VIN** — para activar/ajustar el escáner en la Fase 3.
- Confirmar si la **marca de agua** va como fondo tenue de página o solo en el
  encabezado del PDF (como la ficha actual).

---

## 8. Fuera de alcance (v1)

- App móvil nativa (se usa PWA).
- Evidencia fotográfica de la unidad (decisión del proyecto).
- Operación 100% offline (enfoque online-first, red 5G del puerto).
- Keycloak / SSO / MFA (se puede migrar después).
- Redis y Docker (se agregan al escalar / desplegar).
