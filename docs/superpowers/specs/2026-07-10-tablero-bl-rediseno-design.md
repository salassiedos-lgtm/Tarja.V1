# Rediseño de "Cuadro de Tareas" (tablero por B/L)

Fecha: 2026-07-10
Rama: feat/rediseno-movil-usr
Pantalla: `frontend/app/tablero/page.tsx` (título "Cuadro de Tareas", subtítulo por rol vía `Shell`)

## Contexto

El sistema legado (USR) muestra el tablero de B/L como una lista compacta de tarjetas con
badge de %, barra de avance delgada y stats en línea. Nuestra versión actual (`tablero/page.tsx`)
ya replica la estructura de datos (badge %, barra, `.bl-counts` con Chasis/Tarjados/Por tarjar,
botón "Ver chasis"), pero se ve plana y "vacía": tarjetas sin sombra ni jerarquía de color, y un
botón ancho "Buscar VIN / Nueva tarja" arriba de la lista que no tiene sentido en este punto del
flujo — la búsqueda/escaneo de VIN para "Nueva tarja" ya vive dentro de "Ver chasis" → detalle de
B/L (`tablero/[blId]/page.tsx`), que ya tiene tabs y buscador propio.

Con muchas operaciones abiertas (ej. 20), hoy no hay forma de filtrar la lista de B/L en el
tablero — hay que revisar tarjeta por tarjeta.

## Objetivo

1. Reemplazar el botón "Buscar VIN / Nueva tarja" del tablero por un buscador compacto que
   filtra la lista de B/L por número de B/L o nombre de nave.
2. Ordenar la lista automáticamente: B/L con más `pending` primero, completados (100%) al final.
3. Dar más jerarquía visual a las tarjetas de B/L (sombra, borde de color por estado, iconos en
   los stats) usando los tokens de paleta USR ya existentes en `globals.css` — sin introducir
   colores nuevos.
4. Reemplazar el texto de carga "Cargando tablero…" por un skeleton de tarjetas.

Fuera de alcance: cambios de backend/API (el endpoint `getBlBoard` ya trae todos los campos
necesarios: `blNumber`, `shipName`, `total`, `done`, `inProcess`, `pending`, `containers`,
`percent`); cambios al detalle `/tablero/[blId]`; cambios al flujo de "Nueva tarja" en sí.

## Diseño

### A. Buscador de B/L (reemplaza el botón actual)

- Se quita el `<button className="btn">Buscar VIN / Nueva tarja</button>` (línea 36-38 de
  `tablero/page.tsx`), que navegaba a `/tarja`.
- En su lugar, un input tipo `.searchrow` (mismo patrón visual que el buscador de VIN existente
  en otras pantallas, con icono `Search` de `lucide-react` a la izquierda dentro del input o como
  prefijo): placeholder "Buscar por B/L o nave…".
- Filtrado 100% cliente sobre `rows` ya cargado — comparación case-insensitive contra `blNumber`
  y `shipName`. No dispara nuevas requests.
- Orden: antes de renderizar, `rows` se ordena por `pending` descendente (más pendientes
  primero); en empate, `percent` ascendente. Los B/L al 100% (`percent === 100` o
  `pending === 0`) van al final independientemente del resto del orden.
- Si el filtro no encuentra resultados, mostrar el mismo patrón `.empty` con mensaje
  "No se encontraron B/L para "{query}"".

### B. Tarjetas de B/L — pulido visual

Sobre la clase `.card` existente se agrega una variante `.card.bl` (o modificador) en
`globals.css`:

- `box-shadow` sutil (ej. `0 1px 3px rgba(0,0,0,.06)`) en vez de solo `border`.
- `border-left: 4px solid <color-estado>`, reutilizando la misma lógica de `pctClass()`
  (0% → `--color-red` o `--color-line` si aún no hay ningún avance; en progreso →
  `--color-amber`; 100% → `--color-green`).
- `:active { transform: scale(0.98); }` con transición corta para feedback táctil (respeta
  `prefers-reduced-motion`, ya manejado globalmente en el bloque de animaciones del archivo).
- Los tres `.stat` (Chasis/Tarjados/Por tarjar) llevan un icono pequeño `lucide-react` junto al
  número: `Car` (o `Boxes`) para Chasis, `CheckCircle2` para Tarjados (color `--color-green`,
  ya usado en `.stat.ok`), `Clock` para Por tarjar (color `--color-amber`, ya usado en
  `.stat.warn`).
- El badge `.bl-pct` mantiene su esquema de color lo/mid/hi ya existente; solo se ajusta peso de
  fuente/contraste si hace falta legibilidad.

No se introducen tokens de color nuevos: todo sale de la paleta USR ya definida en
`globals.css` (`--color-blue`, `--color-green`, `--color-amber`, `--color-red`, `--color-line`,
`--color-track`).

### C. Estado de carga

- Mientras `rows === null`, en vez del texto "Cargando tablero…" se renderizan 3 tarjetas
  skeleton (mismo alto/padding aproximado que `.card.bl`) con un bloque pulsante
  (`animation: pulse` o reutilizando la clase de shimmer si ya existe algo similar en el
  proyecto; si no existe, se define `.skeleton` nueva con `background: var(--color-track)` y
  animación de opacidad).

## Componentes/archivos afectados

- `frontend/app/tablero/page.tsx`: quitar botón, agregar estado `query`, input de búsqueda,
  función de filtro+orden antes del `.map`, iconos en cada `.stat`, skeleton de carga.
- `frontend/app/globals.css`: nuevas reglas `.card.bl`, `.skeleton` (o reuso de una existente),
  ajustes menores de `.bl-pct`/`.stat` si se requiere contraste.

## Riesgos / decisiones abiertas

- El criterio "0% sin ningún avance" vs "en progreso pero bajo" para el color del borde
  izquierdo usa el mismo umbral que `pctClass()` (lo/mid/hi con cortes en 50% y 100%), para no
  introducir una segunda taxonomía de estados.
- Si en el futuro el listado de B/L crece mucho (paginación), el filtrado client-side seguirá
  funcionando igual siempre que `getBlBoard` siga trayendo todo el set en una sola llamada (hoy
  es el caso).
