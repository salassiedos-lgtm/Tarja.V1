# Rediseño móvil estilo MODULO USR + paridad funcional — Diseño

**Fecha:** 2026-07-09
**Estado:** Aprobado (pendiente de plan de implementación)

## Contexto

TARJA V.1 (Next.js + NestJS + Prisma + Postgres) es una PWA de tarja vehicular para
COSCO Shipping Ports Chancay. Existe un sistema de referencia, **MODULO USR** (React+Vite
+ PHP/MySQL, fuente completa en `modulousr.zip`), cuyo enfoque **mobile-first** el cliente
quiere adoptar como el estilo del sistema. TARJA hoy está más orientado a web (sidebar,
dashboard denso, tipografía IBM Plex, paleta navy).

TARJA ya implementa la mayor parte de la funcionalidad de USR y en varias áreas es más
avanzado (daños estructurados, realtime, auditoría, anulaciones, import server-side robusto,
bloqueo de login, PDF bilingüe "Units State Report" con 3 firmas). MODULO USR es el sistema
más simple; su valor está en (a) su **lenguaje visual mobile-first** y (b) unas piezas
funcionales que a TARJA le faltan.

## Objetivo

1. **Reemplazar el sistema visual de TARJA por el de USR**, mobile-first, sin perder el
   backend superior que ya existe.
2. **Portar el escáner completo** (código de barras + QR con html5-qrcode, y OCR de VIN con
   tesseract.js) al stack Next.
3. **Cerrar las brechas funcionales** frente a USR, mejorándolas: turno + avance por turno,
   lotes open/close/eliminar, ventana de edición de 10 min, tablero por B/L.

## Enfoque elegido

**Re-skin en sitio + cerrar brechas.** Se mantiene el backend Nest/Prisma y las pantallas
existentes, pero se reescribe el frontend al lenguaje visual de USR y se agregan las
funcionalidades faltantes mediante migraciones Prisma y endpoints Nest. Alternativas
descartadas: front móvil paralelo (duplicación) y port total de USR (descarta lo que TARJA
hace mejor).

## Fuera de alcance (decisión explícita del cliente)

- Columnas Excel extra de USR: `license_plate`, `goods_name`, `volume_m3`, `cargo_code`. **No** se agregan.
- Login por **N° de empleado**. Se conserva el login por `username` de TARJA.

---

## 1. Sistema visual

Adoptar los tokens de USR en el `@theme` de Tailwind v4 de TARJA (`frontend/app/globals.css`),
reemplazando la paleta navy/IBM Plex:

| Token | Valor |
|---|---|
| `--blue` / primario | `#1565d8` |
| `--blue-dark` | `#0f4bab` |
| `--bg` | `#f2f4f8` |
| `--card` | `#ffffff` |
| `--text` | `#1c2430` |
| `--muted` | `#6b7684` |
| `--border` | `#e2e6ec` |
| `--green` (ok) | `#1a9d5a` |
| `--amber` (warn) | `#e08a00` |
| `--red` (error) | `#d23b3b` |
| radius | `12px` |
| fuente | `system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` |

**Shell móvil** (reemplaza el sidebar web):
- `.app` centrado a `max-width: 640px`; en escritorio solo se ensancha el lienzo.
- `.topbar` azul sticky: botón atrás/ícono, título, subtítulo (rol), acción (Salir).
- Contenido en `.content` (padding 16px) con `.card`.
- Tablas densas de admin: scroll horizontal dentro de su contenedor (no romper el ancho móvil).

**Componentes a reproducir** (portados desde `styles.css` de USR, 252 líneas, como base del
nuevo design system): `.card`, `.btn`(primary/secondary/ghost/small), `.tabs`/`.tab.active`,
`.badge`(pending/in_progress/completed), `.task` (fila con VIN monoespaciado + meta + badge),
`.inv-item` (accesorio: switch Sí + cantidad), `.searchrow`+`.scanbtn`, `.bar`/`.bar-fill`,
`.bl-head`/`.bl-counts`, `.stat`, `.mod`/`.modgrid`, `.timer` (cronómetro), `.countdown`,
`.cam-wrap`/`.cam-guide`/`.scan-box`, `.donut`. La hoja imprimible (`.sheet`, `@media print`)
ya tiene equivalente en el PDF Puppeteer de TARJA.

## 2. Navegación

- **Home = grid de módulos** (`.modgrid`) filtrado por rol, en vez del dashboard actual:
  - "Cuadro de Tareas" (→ tablero por B/L) — todos.
  - "Administrador" — ADMIN.
  - "Usuarios" — ADMIN (y SUPERVISOR con alcance limitado, como ya lo hace TARJA).
- El dashboard rico actual y la pantalla de supervisión se conservan, restyleados, accesibles
  desde "Administrador"/rol correspondiente.
- Se mantiene la matriz de roles de TARJA (ADMIN/SUPERVISOR/TARJADOR). `TARJADOR` = tallyman
  (equivale a `inspector` en USR).

## 3. Escáner (barras + QR + OCR)

Portar como client components de Next (`'use client'`), reutilizando el marcado/clases de USR:

- **`OcrScanner`** (tesseract.js): cámara trasera (`facingMode: environment`), worker `eng`,
  `tessedit_char_whitelist = A-Z0-9`, recorte de banda central (86% ancho × 30% alto) dibujado
  a canvas, `recognize` cada ~1200 ms, acepta cuando dos ciclos coinciden. Normalizador: token
  alfanumérico **más largo de ≥10 caracteres**. Overlay `.cam-guide`.
- **`BarcodeScanner`** (html5-qrcode): barras + QR, `fps 10`, `qrbox 260×130`.

**Cableado:** en la búsqueda de VIN de "Nueva tarja" (donde TARJA ya tiene botón de cámara),
dos botones — barras y cámara/OCR. El resultado se limpia (`toUpperCase`, `[^A-Z0-9]`→'') y
alimenta la búsqueda. Reemplaza al `BarcodeDetector` nativo actual (solo Android/Chrome) por
estas librerías (más dispositivos + OCR). Dependencias nuevas del frontend: `tesseract.js`,
`html5-qrcode`.

## 4. Turno + avance por turno

- **Pantalla de turno** como gate previo a las pantallas de trabajo (patrón `needsShift` de USR):
  fecha (default hoy) + turno **Día 07:00–19:00 / Noche 19:00–07:00**, sugerido por hora
  (`h>=7 && h<19 → día`). Se guarda en sesión del cliente y se estampa en cada tarja.
- **Modelo:** `TarjaReport` gana `workShift` (`DIA`|`NOCHE`) y `reportDate` (date). El avance por
  turno se calcula por la **fecha/turno de la tarja**, no por la hora del servidor (una tarja de
  turno noche cuenta en su turno aunque se guarde tras medianoche).
- **Reporte de avance de turno** (nuevo PDF/vista imprimible): cabecera + tabla general (Nave/
  "Todas", Fecha, Turno, Chasis tarjados = total (dañados · sin daño), Tiempo promedio por tarja,
  Reporte emitido, Actividad creada/aperturada/cerrada), tabla detalle (N°, Chasis/VIN, Contenedor,
  Marca/Modelo, Tallyman, Daños, Duración) y 3 firmas: Supervisor / Jefe de turno / Port.

## 5. Lotes (open/closed/eliminar)

Promover el import a **lote de primera clase** con ciclo de vida:
- Estado `open`/`closed` (+ `openedAt`/`closedAt`); nace `closed`.
- **El tallyman solo ve lotes `open`**; trabajar tareas requiere lote abierto (gate en backend).
- ADMIN abre/cierra/elimina; cerrar no destruye trabajo. Eliminar borra tarjas de sus tareas y
  el lote (con cascada a tareas), como en USR.
- Reconciliación con TARJA: el import actual (`OperationImport`, hoy log de solo lectura) se
  eleva a este lote, o se introduce una entidad `Batch` asociada a la Operación/B/L. **Decisión
  de modelado a fijar en el plan** (ver Riesgos).

## 6. Ventana de edición de 10 minutos

- Tras "Completar tarja", el **dueño** (tarjador asignado) puede **reabrir** durante **10 min**
  (`TASK_EDIT_WINDOW = 10*60`). Pasado ese tiempo, solo supervisor/admin (vía el flujo de
  anulación existente de TARJA).
- Backend expone `canReopen` + `reopenSecondsLeft` por tarea; el front muestra "Editable m:ss" y
  el botón Reabrir/Ver según corresponda.
- Convive con el auto-release de borradores a 15 min ya existente (protege borradores abandonados,
  distinto de la ventana post-completado).

## 7. Tablero por B/L

Vista móvil (`Bls`) que agrupa por `BillOfLading` (ya existe en TARJA) — un `.card.bl` por B/L:
`blNumber`, badge de %, contenedores, barra de avance, contadores **Chasis** (total) / **Tarjados**
(completados) / **Por tarjar** (pendientes+en proceso), botón "Ver chasis" → lista de tareas
filtrada por ese B/L. La lista de tareas mantiene tabs **Vista actual / Realizados** y la búsqueda
por VIN con escáner. Sumado (no reemplaza) a la búsqueda por VIN de "Nueva tarja".

## 8. Reportes / inventario / daños

- El **PDF "Units State Report"** de TARJA (Puppeteer, bilingüe, 3 firmas) ya coincide con USR;
  solo se alinean los 16 accesorios y las opciones de daños.
- **Inventario (16 ítems, orden fijo):** radio, reloj, encendedor, ceniceros, espejos interiores,
  espejos laterales, antena, pisos adicionales, plumillas, tapa de llanta, llanta de repuesto,
  gata, herramientas, llaves del vehículo, catálogos, relays. TARJA ya siembra estos 16 en el
  catálogo `Accessory` (editable por admin) — se conserva ese modelo, solo se verifica orden/labels.
- **Daños:** TARJA tiene un modelo más rico (source/operation/affects/moment/otros + líneas de
  texto). Se conserva; la UI móvil lo presenta al estilo USR (switch "¿Existen daños?" + selects
  "¿Cuándo ocurrió?" y "¿A qué carga afecta?" + detalle libre). Equivalencias USR→TARJA:
  moment (before/during/after_discharge, before/during_loading) ya cubierto por `DamageMoment`;
  affect (chancay/transit/restow): chancay/transit → `DamageAffects`, restow → `DamageOperation.REESTIBA`.

## Cambios de modelo de datos (Prisma) — resumen

- `TarjaReport`: + `workShift` (enum DIA|NOCHE), + `reportDate` (date).
- Lote: entidad con `status` (OPEN|CLOSED), `openedAt`, `closedAt` (modelado exacto en el plan).
- Tarea/vehículo: campos de temporización ya existen parcialmente (`lockedAt`, etc.); se define
  `completedAt` + lógica de ventana de 10 min y `reopenSecondsLeft` derivado.
- Sin nuevos campos de vehículo por columnas Excel (fuera de alcance).

## Fases (cada una deja la app usable)

1. **Sistema visual + shell móvil + grid home** (tokens, topbar, cards, componentes base).
2. **Escáner** (OcrScanner + BarcodeScanner) cableado a la búsqueda de VIN.
3. **Turno** + reporte de avance por turno.
4. **Lotes** open/close/eliminar + **ventana de edición 10 min**.
5. **Tablero por B/L**.

## Riesgos / decisiones a fijar en el plan

- **Modelado del lote:** ¿`OperationImport` promovido a `Batch` con estado, o `Batch` nuevo ligado
  a Operación+B/L? Impacta el gate de visibilidad del tallyman. A decidir al inicio del plan.
- **Alcance del re-skin en admin/supervisor:** mobile-first con tablas scrollables (acordado) vs.
  layout ancho en escritorio. Default: mobile-first con ensanche en desktop.
- **Escáner y HTTPS:** la cámara requiere HTTPS en móvil; validar en el entorno de despliegue.
- **`report_no` / correlativo:** TARJA ya tiene su propio correlativo de 6 dígitos por secuencia
  Postgres; se conserva (no se adopta el de USR).
