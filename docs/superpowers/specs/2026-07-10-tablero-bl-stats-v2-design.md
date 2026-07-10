# Tablero por B/L — v2: chips de stats + barra de progreso protagonista

Fecha: 2026-07-10
Rama: feat/rediseno-movil-usr
Pantalla: `frontend/app/tablero/page.tsx`
Depende de/extiende: `docs/superpowers/specs/2026-07-10-tablero-bl-rediseno-design.md` (ya implementado:
commits `9127907`, `0c7bd1d`, `58a9e02`)

## Contexto

Tras implementar el spec anterior, el usuario revisó el resultado y lo sigue viendo "peor" que
el modelo original, específicamente por los 3 recuadros grises con etiqueta de texto
("Chasis"/"Tarjados"/"Por tarjar") bajo cada número — los ve innecesarios y poco pulidos. Pide
además una mejora visual notable, no solo igualar el legado.

## Objetivo

1. Quitar las etiquetas de texto de los stats; el icono (ya agregado en v1: `Car`/`CheckCircle2`/
   `Clock`) ya comunica el significado.
2. Reemplazar los 3 recuadros grises (`.stat`/`.bl-counts`) por chips compactos en una sola fila:
   píldora con icono + número, fondo tintado según tipo (neutro/verde/ámbar), sin fondo gris ni
   borde de caja.
3. Dar más protagonismo a la barra de progreso: de 6px a ~10px de alto, quitando el badge de `%`
   aparte (arriba a la derecha de la tarjeta) y mostrando el porcentaje como texto en negrita
   junto a la barra (mismo renglón, alineado a la derecha), coloreado según el mismo criterio de
   `pctClass()` (lo/mid/hi) que ya se usa para el borde izquierdo de la tarjeta.

Fuera de alcance: cualquier otro cambio a `/tablero/[blId]`, buscador, orden, borde/sombra de
tarjeta o skeleton (ya resueltos en v1, no se tocan).

## Diseño

### A. Chips de stats (reemplaza `.bl-counts`/`.stat` en esta pantalla)

Nueva clase `.bl-chips` (contenedor flex, `gap: 8px`, `flex-wrap: wrap`, `margin-top: 12px`) con
3 `.chip` (píldora `border-radius: 20px`, `padding: 6px 10px`, `display: inline-flex`, icono +
número, sin texto de etiqueta):
- Chip neutro (Chasis/total): fondo `var(--color-track)`, texto `var(--color-text)`.
- Chip `.ok` (Tarjados): fondo `var(--color-green-50)`, texto/icono `var(--color-green)`.
- Chip `.warn` (Por tarjar): fondo `var(--color-amber-50)`, texto/icono `var(--color-amber)`.

Las clases `.stat`/`.bl-counts`/`.l` (etiqueta) existentes en `globals.css` **no se tocan** —
siguen en uso en `frontend/app/reportes/turno/page.tsx`. Los chips son clases nuevas, paralelas.

### B. Barra de progreso protagonista

- Se quita el `<span className="bl-pct ...">{percent}%</span>` del header de la tarjeta (deja de
  mostrarse ahí).
- Nuevo contenedor `.bl-progress` (flex row, `align-items: center`, `gap: 10px`, mismo margen
  vertical que tenía `.bar`) que envuelve la barra existente (ahora a `height: 10px` dentro de
  este contenedor, vía `.bl-progress .bar`) y un `<span>` de texto con el porcentaje
  (`font-weight: 700`, `font-size: 13px`, `white-space: nowrap`), coloreado con las mismas clases
  `bl-pct lo/mid/hi` — pero la definición de `.bl-pct` en CSS se simplifica: dado que ya no es un
  badge con fondo, se le quita `background`/`padding`/`border-radius`, quedando solo el color de
  texto por estado. Es la única reutilización de esa clase en el código (no se usa en ningún otro
  archivo — verificado), así que no hay riesgo de romper otro badge.

## Archivos afectados

- `frontend/app/tablero/page.tsx`: quitar el badge del header, envolver `.bar` en `.bl-progress`
  + texto de %, reemplazar el bloque `.bl-counts`/`.stat` por `.bl-chips`/`.chip`.
- `frontend/app/globals.css`: agregar `.bl-chips`/`.chip`/`.chip.ok`/`.chip.warn`; agregar
  `.bl-progress`/`.bl-progress .bar`; simplificar `.bl-pct` (quitar background/padding, dejar
  color de texto).

No hay cambios de backend. No se introducen tokens de color nuevos (reutiliza
`--color-track`, `--color-green`, `--color-green-50`, `--color-amber`, `--color-amber-50`,
`--color-text`, `--color-muted` ya existentes).
