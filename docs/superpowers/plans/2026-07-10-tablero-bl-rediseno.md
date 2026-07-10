# Rediseño del tablero por B/L ("Cuadro de Tareas") — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar `frontend/app/tablero/page.tsx` (pantalla "Cuadro de Tareas"): reemplazar el
botón "Buscar VIN / Nueva tarja" por un buscador compacto que filtra B/L por número/nave con
orden automático por pendientes, y dar más jerarquía visual a las tarjetas (sombra, borde de
color por estado, iconos en stats, skeleton de carga).

**Architecture:** Cambio 100% frontend, sin tocar backend/API (`getBlBoard` ya trae todos los
campos necesarios). Filtro y orden se calculan client-side sobre el array `rows` ya cargado.
Estilos nuevos se agregan como reglas CSS puras en `frontend/app/globals.css` (`@layer
components`), siguiendo el patrón existente del archivo (sin Tailwind utility classes para estos
elementos, igual que el resto de la pantalla).

**Tech Stack:** Next.js 16 (App Router) + React 19, CSS puro con custom properties (`@theme` /
`@layer components` en `globals.css`), iconos `lucide-react`.

**Nota sobre pruebas:** este proyecto no tiene framework de test para el frontend (no hay
Jest/Vitest/RTL configurado en `frontend/package.json`, solo `eslint`). El backend sí usa Jest
pero este cambio no toca backend. Por eso cada tarea de UI se verifica manualmente arrancando
`npm run dev` y revisando en el navegador, en vez de un paso de test automatizado — es el patrón
ya usado en este repo para cambios de frontend puro.

---

### Task 1: Filtro y orden client-side de la lista de B/L

**Files:**
- Modify: `frontend/app/tablero/page.tsx`

- [ ] **Step 1: Agregar estado de búsqueda y función de filtro/orden**

En `frontend/app/tablero/page.tsx`, agregar un estado `query` y una función pura
`filterAndSortRows` que se aplica antes del `.map()`. Reemplazar el bloque de imports y el
cuerpo del componente:

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Car, CheckCircle2, Clock } from 'lucide-react';
import Shell from '@/components/shell';
import { getBlBoard, type BlBoardRow } from '@/lib/api';

function pctClass(p: number): string {
  if (p >= 100) return 'hi';
  if (p >= 50) return 'mid';
  return 'lo';
}

function filterAndSortRows(rows: BlBoardRow[], query: string): BlBoardRow[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) => r.blNumber.toLowerCase().includes(q) || r.shipName.toLowerCase().includes(q),
      )
    : rows;

  return [...filtered].sort((a, b) => {
    const aDone = a.pending === 0;
    const bDone = b.pending === 0;
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (b.pending !== a.pending) return b.pending - a.pending;
    return a.percent - b.percent;
  });
}
```

- [ ] **Step 2: Reemplazar el botón "Buscar VIN / Nueva tarja" por el input de búsqueda**

Reemplazar el `<button className="btn" ...>Buscar VIN / Nueva tarja</button>` (líneas 36-38 del
archivo original) por el estado `query` y un input de búsqueda:

```tsx
export default function TableroPage() {
  const router = useRouter();
  const [rows, setRows] = useState<BlBoardRow[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setRows(await getBlBoard());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el tablero');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleRows = useMemo(
    () => (rows ? filterAndSortRows(rows, query) : null),
    [rows, query],
  );

  return (
    <Shell title="Cuadro de Tareas" onBack={() => router.push('/inicio')}>
      <div className="searchrow" style={{ marginBottom: 14 }}>
        <input
          className="input"
          placeholder="Buscar por B/L o nave…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <span className="scanbtn" aria-hidden="true">
          <Search className="h-4 w-4" />
        </span>
      </div>

      {error && <div className="error">{error}</div>}
```

- [ ] **Step 3: Usar `visibleRows` en el render y ajustar el mensaje vacío**

Reemplazar el bloque de render de la lista (líneas 42-91 del archivo original) por:

```tsx
      {rows === null ? (
        <TableroSkeleton />
      ) : visibleRows && visibleRows.length === 0 ? (
        <div className="empty">
          {query
            ? `No se encontraron B/L para "${query}".`
            : 'No hay B/L en lotes abiertos. Pídele al administrador que abra un lote.'}
        </div>
      ) : (
        visibleRows!.map((bl) => (
          <div key={bl.billOfLadingId} className={`card bl bl-${pctClass(bl.percent)}`}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, wordBreak: 'break-all' }}>
                  {bl.blNumber}
                </div>
                <div className="muted" style={{ marginTop: 2 }}>
                  {bl.shipName} · {bl.containers} {bl.containers === 1 ? 'contenedor' : 'contenedores'}
                </div>
              </div>
              <span className={`bl-pct ${pctClass(bl.percent)}`}>{bl.percent}%</span>
            </div>

            <div className="bar">
              <div className="bar-fill" style={{ width: `${bl.percent}%` }} />
            </div>

            <div className="bl-counts">
              <div className="stat">
                <Car className="h-4 w-4" aria-hidden="true" />
                <span className="n tnum">{bl.total}</span>
                <span className="l">Chasis</span>
              </div>
              <div className="stat ok">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <span className="n tnum">{bl.done}</span>
                <span className="l">Tarjados</span>
              </div>
              <div className="stat warn">
                <Clock className="h-4 w-4" aria-hidden="true" />
                <span className="n tnum">{bl.pending}</span>
                <span className="l">Por tarjar</span>
              </div>
            </div>

            <button
              className="btn secondary"
              style={{ marginTop: 12 }}
              onClick={() => router.push(`/tablero/${bl.billOfLadingId}`)}
            >
              Ver chasis
            </button>
          </div>
        ))
      )}
    </Shell>
  );
}

function TableroSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card bl skeleton-card" aria-hidden="true">
          <div className="skeleton" style={{ width: '60%', height: 15 }} />
          <div className="skeleton" style={{ width: '40%', height: 12, marginTop: 8 }} />
          <div className="skeleton" style={{ width: '100%', height: 6, marginTop: 16 }} />
          <div className="skeleton" style={{ width: '100%', height: 46, marginTop: 12 }} />
        </div>
      ))}
    </>
  );
}
```

- [ ] **Step 4: Verificar tipos y lint**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `tablero/page.tsx`.

Run: `cd frontend && npm run lint`
Expected: sin errores nuevos relacionados a `tablero/page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add frontend/app/tablero/page.tsx
git commit -m "feat(tablero): buscador de B/L/nave, orden por pendientes y skeleton de carga"
```

---

### Task 2: Estilos — tarjeta con borde de estado, sombra, iconos y skeleton

**Files:**
- Modify: `frontend/app/globals.css`

- [ ] **Step 1: Agregar variante `.card.bl` con sombra y borde de color por estado**

En `frontend/app/globals.css`, dentro del bloque `@layer components` (después de la regla
`.card` existente, alrededor de la línea 328), agregar:

```css
  .card.bl {
    box-shadow: 0 1px 3px rgba(16, 24, 40, .06), 0 1px 2px rgba(16, 24, 40, .04);
    border-left-width: 4px;
    transition: transform .12s ease;
  }
  .card.bl:active { transform: scale(0.98); }
  .card.bl.bl-lo { border-left-color: var(--color-line); }
  .card.bl.bl-mid { border-left-color: var(--color-amber); }
  .card.bl.bl-hi { border-left-color: var(--color-green); }
```

- [ ] **Step 2: Agregar iconos a `.stat` (ajuste de layout, sin nuevos colores)**

Modificar la regla `.stat` existente (línea ~383-390) para acomodar el icono agregado en el
JSX del Task 1, agregando `align-items: center` (ya tiene `flex-direction: column`, los iconos
quedan centrados por defecto — no requiere cambio de propiedades, solo confirmar que el icono
hereda `color: currentColor` del `.stat`/`.stat.ok`/`.stat.warn` ya definidos):

```css
  .stat svg { color: var(--color-muted); }
  .stat.ok svg { color: var(--color-green); }
  .stat.warn svg { color: var(--color-amber); }
```

Agregar estas 3 líneas justo después de la regla `.bl-counts` existente (línea ~392).

- [ ] **Step 3: Agregar clases de skeleton**

Agregar después del bloque de `@keyframes pulse-dot` (línea ~137-141):

```css
@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .45; }
}

.skeleton {
  background: var(--color-track);
  border-radius: 6px;
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}
.card.skeleton-card { pointer-events: none; }
```

- [ ] **Step 4: Incluir `.skeleton`/`.skeleton-card` en la regla de `prefers-reduced-motion`**

Modificar el primer bloque `@media (prefers-reduced-motion: reduce)` (línea ~143-148) para
incluir la nueva animación:

```css
@media (prefers-reduced-motion: reduce) {
  .rise,
  .sweep,
  .pulse-dot,
  .skeleton {
    animation: none;
  }
}
```

(Ajustar el selector exacto a la lista real presente en ese bloque — agregar `.skeleton` a la
lista existente de selectores, sin duplicar el `@media` query.)

- [ ] **Step 5: Verificar visualmente con el dev server**

Run: `cd frontend && npm run dev`

Abrir `http://localhost:3001/tablero` (o el puerto configurado) logueado como TARJADOR/ADMIN,
confirmar:
- El botón "Buscar VIN / Nueva tarja" ya no aparece; hay un input "Buscar por B/L o nave…".
- Escribir parte de un número de B/L o nave filtra la lista en vivo.
- Las tarjetas con `pending > 0` aparecen antes que las de `pending === 0`.
- Cada tarjeta tiene sombra sutil, borde izquierdo de color (gris/ámbar/verde según %) e iconos
  junto a Chasis/Tarjados/Por tarjar.
- Al recargar, se ven 3 tarjetas skeleton pulsando antes de que carguen los datos reales.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/globals.css
git commit -m "style(tablero): sombra, borde por estado, iconos en stats y skeleton de carga"
```

---

## Self-Review Notes

- Cobertura del spec: sección A (buscador+orden) → Task 1; sección B (pulido de tarjetas) →
  Task 1 (JSX: clases `card bl bl-*`, iconos) + Task 2 (CSS); sección C (skeleton) → Task 1
  (`TableroSkeleton`) + Task 2 (`.skeleton`).
- Sin cambios de backend ni de `/tablero/[blId]`, conforme al "fuera de alcance" del spec.
- Los nombres de clase (`card bl`, `bl-lo/mid/hi`, `skeleton`, `skeleton-card`) se usan de forma
  consistente entre Task 1 (JSX) y Task 2 (CSS).
