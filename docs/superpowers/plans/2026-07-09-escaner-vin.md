# Escáner de cámara para VIN (QR + Code 128) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un botón de escaneo de cámara en `/tarja` que decodifica el código de barras Code 128 o el QR de la etiqueta del vehículo, ubica el VIN dentro del payload buscando el campo con forma de VIN (no una posición fija), y llena el campo de búsqueda existente — saltando directo a la tarjeta de confirmación cuando el VIN resuelve a una sola fila tarjable.

**Architecture:** Todo el trabajo es frontend. `BarcodeDetector` nativo (Android/Chrome, sin librerías) decodifica `qr_code` y `code_128` en la misma sesión de cámara. Una función pura (`extractVinFromScan`) separa el payload por comas y se queda con el campo cuyo contenido normalizado mide 17 caracteres — funciona igual si el VIN viene solo (código de barras de hoy) o acompañado de más campos (QR de hoy, código de barras de mañana). El resultado alimenta el mismo `useVinSearch` / `searchVehicles` / `startTarja` que ya usa la búsqueda manual: el escáner es un atajo para llenar el campo, no un camino de datos nuevo.

**Tech Stack:** Next.js (App Router) + React 19, TypeScript, `BarcodeDetector` Web API, Tailwind (clases utilitarias ya usadas en el proyecto).

**Spec:** `docs/superpowers/specs/2026-07-09-escaner-vin-design.md`

---

## Contexto para quien implemente

- `frontend/lib/use-vin-search.ts` ya exporta `normalizeVinQuery(raw: string): string` (mayúsculas,
  quita todo lo que no sea `A-HJ-NPR-Z0-9` — el charset ISO 3779 sin `I`/`O`/`Q`) y `MIN_QUERY = 4`.
  Reutilízalo, no lo dupliques.
- `frontend/lib/api.ts:237-238` ya expone `searchVehicles(q: string, signal?: AbortSignal)` →
  `Promise<VehicleSearchRow[]>`, y `VehicleSearchRow` (línea 224) tiene `{ vehicleId, vin,
  blNumber, shipName, operationCode, brand, model, containerNumber, blocked, blockedReason }`.
- `frontend/app/tarja/page.tsx` es la única pantalla que se toca. Ya tiene el estado `picked`
  (fila elegida → muestra tarjeta de confirmación) y `startError`. El campo de búsqueda vive en la
  sección "búsqueda" (línea ~141), con un comentario `{/* Anclaje del futuro botón de escáner de
  cámara. */}` en la línea 156 — ese comentario se reemplaza por el botón real.
- No hay runner de tests en `frontend/` (ni jest ni vitest). La verificación de las funciones
  puras se hace con un script suelto ejecutado con `node` (Node 24 corre `.ts` directo sin
  transpilar) y **no se commitea** — es solo para confirmar el algoritmo antes de integrarlo. La
  verificación real es en el navegador (Task 5).
- Componentes UI existentes a reusar: `IconClose`, `IconAlert` (`components/icons.tsx`).
  `IconCamera` no existe — se agrega en la Task 1.

---

### Task 1: Ícono de cámara

**Files:**
- Modify: `frontend/components/icons.tsx`

- [ ] **Step 1: Agregar `IconCamera` siguiendo el patrón de los íconos existentes**

Abre `frontend/components/icons.tsx` y agrega, después de `IconSearch` (línea ~61-67), un ícono
nuevo con el mismo estilo (`{...base} {...p}`, trazos redondeados):

```tsx
export const IconCamera = (p: P) => (
  <svg {...base} {...p}>
    <path d="M4 8.2A1.7 1.7 0 0 1 5.7 6.5h2.1l1-1.6a1.2 1.2 0 0 1 1-.55h4.4a1.2 1.2 0 0 1 1 .55l1 1.6h2.1A1.7 1.7 0 0 1 20 8.2v9.1a1.7 1.7 0 0 1-1.7 1.7H5.7A1.7 1.7 0 0 1 4 17.3Z" />
    <circle cx="12" cy="12.6" r="3.4" />
  </svg>
);
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `icons.tsx` (el proyecto puede tener otros errores
preexistentes; confirma que no aparece ninguno con `icons.tsx` en el mensaje).

- [ ] **Step 3: Commit**

```bash
git add frontend/components/icons.tsx
git commit -m "feat(ui): agrega IconCamera para el boton de escaneo de VIN"
```

---

### Task 2: Funciones puras de escaneo (`lib/vin-scan.ts`)

**Files:**
- Create: `frontend/lib/vin-scan.ts`

- [ ] **Step 1: Escribir el módulo**

```ts
import { normalizeVinQuery } from './use-vin-search';

const VIN_LENGTH = 17;

/** BarcodeDetector solo existe en Android/Chrome; en el resto, el boton de escaneo no se muestra. */
export function isScannerSupported(): boolean {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window;
}

/**
 * Busca, entre los campos separados por coma del payload decodificado, el
 * que tiene forma de VIN (17 caracteres tras normalizar). Cubre tanto el QR
 * (CSV con el VIN en cualquier posicion) como el codigo de barras (hoy un
 * solo campo = el VIN; manana, varios campos igual que el QR).
 */
export function extractVinFromScan(raw: string): string | null {
  for (const field of raw.split(',')) {
    const normalized = normalizeVinQuery(field);
    if (normalized.length === VIN_LENGTH) return normalized;
  }
  return null;
}
```

- [ ] **Step 2: Verificar el algoritmo con un script suelto (no se commitea)**

```bash
cd frontend && cat > /tmp/vin-scan-check.mjs <<'EOF'
const VIN_LENGTH = 17;
const NON_VIN = /[^A-HJ-NPR-Z0-9]/g;
const normalize = (s) => s.toUpperCase().replace(NON_VIN, '');
function extractVinFromScan(raw) {
  for (const field of raw.split(',')) {
    const n = normalize(field);
    if (n.length === VIN_LENGTH) return n;
  }
  return null;
}

const cases = [
  ['LVTDB11B2VD024641', 'LVTDB11B2VD024641'],
  ['LVDB11B6VE036051', null], // 16 caracteres reales de una foto borrosa: no debe matchear
  ['LEFEDDE16VTP04794,0002575292,,,,,30921001,BBDNFSCDDY00PMMFLS,', 'LEFEDDE16VTP04794'],
  [',,LEFEDDE16VTP04794,extra', 'LEFEDDE16VTP04794'], // el VIN no siempre esta en el campo 0
  ['', null],
];

let failed = 0;
for (const [input, expected] of cases) {
  const got = extractVinFromScan(input);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(ok ? 'OK  ' : 'FAIL', JSON.stringify(input), '->', got, ok ? '' : `(esperado ${expected})`);
}
process.exit(failed > 0 ? 1 : 0);
EOF
node /tmp/vin-scan-check.mjs
rm /tmp/vin-scan-check.mjs
```

Expected: las 5 líneas imprimen `OK` y el proceso termina en 0. Este script reimplementa la
lógica en JS plano solo para confirmar el algoritmo (no importa `vin-scan.ts` directamente porque
`use-vin-search.ts` importa `@/lib/api` con un alias de path que `node` no resuelve fuera de
Next.js) — la integración real se verifica en la Task 5 corriendo la app.

- [ ] **Step 3: Verificar que el archivo real compila dentro del proyecto**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos con `vin-scan.ts` en el mensaje.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/vin-scan.ts
git commit -m "feat(tarja): extrae el VIN de un payload de QR o codigo de barras por forma, no por posicion"
```

---

### Task 3: Modal de cámara (`components/vin-scanner-modal.tsx`)

**Files:**
- Create: `frontend/components/vin-scanner-modal.tsx`

- [ ] **Step 1: Escribir el componente**

```tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { IconAlert, IconClose } from '@/components/icons';

const DETECT_INTERVAL_MS = 200;

type ScanStatus = 'starting' | 'scanning' | 'denied' | 'unavailable';

interface DetectedBarcode {
  rawValue: string;
}

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}

/** BarcodeDetector no tiene tipos oficiales en lib.dom todavia. */
function createDetector(): BarcodeDetectorLike {
  const Ctor = (
    window as unknown as {
      BarcodeDetector: new (opts: { formats: string[] }) => BarcodeDetectorLike;
    }
  ).BarcodeDetector;
  return new Ctor({ formats: ['qr_code', 'code_128'] });
}

export function VinScannerModal({
  onDecode,
  onClose,
}: {
  onDecode: (raw: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<ScanStatus>('starting');

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function start() {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
        });
      } catch (err) {
        if (!cancelled) {
          setStatus(
            err instanceof DOMException && err.name === 'NotAllowedError'
              ? 'denied'
              : 'unavailable',
          );
        }
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();
      setStatus('scanning');

      const detector = createDetector();
      intervalId = setInterval(() => {
        detector
          .detect(video)
          .then((results) => {
            const hit = results.find((r) => r.rawValue.trim().length > 0);
            if (hit) {
              clearInterval(intervalId);
              onDecode(hit.rawValue.trim());
            }
          })
          .catch(() => {
            // Un frame ilegible no es un error: se reintenta en el proximo tick.
          });
      }, DETECT_INTERVAL_MS);
    }

    start();

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, [onDecode]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black" role="dialog" aria-modal="true">
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
      >
        <p className="text-[13px] font-medium text-white/80">Escanear VIN</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="tap ring-focus grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white"
        >
          <IconClose className="h-5 w-5" />
        </button>
      </div>

      <div className="relative flex-1">
        <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />

        {status === 'scanning' && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="h-56 w-56 rounded-2xl border-2 border-white/70" />
          </div>
        )}

        {status === 'starting' && (
          <p className="absolute inset-x-0 top-1/2 -translate-y-1/2 text-center text-[13px] text-white/70">
            Solicitando permiso de cámara…
          </p>
        )}

        {(status === 'denied' || status === 'unavailable') && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <IconAlert className="h-8 w-8 text-white/70" />
            <p className="text-[13px] leading-relaxed text-white/80">
              {status === 'denied'
                ? 'No se pudo acceder a la cámara. Revisa los permisos del navegador.'
                : 'No se pudo iniciar la cámara en este dispositivo.'}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="tap ring-focus rounded-xl bg-white/10 px-5 py-2.5 text-[13px] font-medium text-white"
            >
              Cerrar
            </button>
          </div>
        )}
      </div>

      <p className="safe-b px-4 py-4 text-center text-[12px] text-white/60">
        Apunta al código de barras o al QR del VIN
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos con `vin-scanner-modal.tsx` en el mensaje.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/vin-scanner-modal.tsx
git commit -m "feat(tarja): modal de camara que decodifica QR y Code 128"
```

---

### Task 4: Wire-up en `/tarja`

**Files:**
- Modify: `frontend/app/tarja/page.tsx`

- [ ] **Step 1: Agregar imports**

En la cabecera de imports (líneas 1-9), agrega:

```tsx
import { useEffect, useState } from 'react';
```

(reemplaza el `import { useState } from 'react';` de la línea 3 — ahora hace falta `useEffect`
también para la detección de soporte del escáner post-montaje).

```tsx
import { VinScannerModal } from '@/components/vin-scanner-modal';
import { IconArrow, IconCamera, IconSearch, IconShip } from '@/components/icons';
import { searchVehicles, startTarja, type VehicleSearchRow } from '@/lib/api';
import { extractVinFromScan, isScannerSupported } from '@/lib/vin-scan';
```

(la línea de `IconArrow, IconSearch, IconShip` y la de `startTarja, type VehicleSearchRow` ya
existen — amplíalas con `IconCamera` y `searchVehicles` respectivamente, no las dupliques).

- [ ] **Step 2: Agregar estado de escaneo**

Dentro de `TarjaStartPage`, junto a los `useState` existentes (línea ~37-39):

```tsx
const [scanning, setScanning] = useState(false);
const [scannerSupported, setScannerSupported] = useState(false);

useEffect(() => {
  setScannerSupported(isScannerSupported());
}, []);
```

`isScannerSupported()` depende de `window`, que no existe durante el render en el servidor. Si se
llamara directo en el `return` (no en un efecto), el primer render en el cliente no coincidiría
con el HTML del servidor y React marcaría un hydration mismatch. El `useEffect` corre después del
montaje, cuando ya no importa que el árbol cambie.

- [ ] **Step 3: Agregar el handler de decodificación**

Después de `confirm()` (línea ~41-57), agrega:

```tsx
async function handleScan(raw: string) {
  setScanning(false);
  const vin = extractVinFromScan(raw);
  if (!vin) {
    setQuery(raw);
    return;
  }
  try {
    const found = await searchVehicles(vin);
    if (found.length === 1 && !found[0].blocked) {
      setStartError('');
      setPicked(found[0]);
      return;
    }
  } catch {
    // Sin conexion: se cae al mismo camino que escribir a mano, que reintenta
    // la busqueda con debounce y muestra su propio error.
  }
  setQuery(vin);
}
```

- [ ] **Step 4: Agregar el botón junto al campo VIN**

Reemplaza el comentario `{/* Anclaje del futuro botón de escáner de cámara. */}` (línea 156) y
ajusta el `<input>` para dejarle espacio al botón a la derecha:

```tsx
<input
  id="vin"
  value={query}
  onChange={(e) => setQuery(e.target.value)}
  autoFocus
  autoComplete="off"
  autoCapitalize="characters"
  spellCheck={false}
  inputMode="text"
  placeholder="Últimos dígitos, ej. 00123"
  className="field pl-11 pr-12 font-mono text-[17px] font-semibold tracking-[0.06em]"
/>
{scannerSupported && (
  <button
    type="button"
    onClick={() => setScanning(true)}
    aria-label="Escanear VIN"
    className="tap ring-focus absolute right-2.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:bg-navy-50 hover:text-navy-800"
  >
    <IconCamera className="h-[18px] w-[18px]" />
  </button>
)}
```

(la única diferencia del `<input>` respecto al original es `pl-11 pr-12` en vez de `pl-11` — el
`pr-12` deja espacio para el botón sin que el texto del VIN quede debajo).

- [ ] **Step 5: Renderizar el modal**

Justo antes del `</Shell>` de cierre (línea ~236), agrega:

```tsx
{scanning && <VinScannerModal onDecode={handleScan} onClose={() => setScanning(false)} />}
```

- [ ] **Step 6: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos con `app/tarja/page.tsx` en el mensaje.

Run: `cd frontend && npx eslint app/tarja/page.tsx components/vin-scanner-modal.tsx lib/vin-scan.ts`
Expected: sin errores (el proyecto tiene la regla `react-hooks/set-state-in-effect`; el
`useEffect` de `scannerSupported` es un chequeo de soporte tras el montaje, no un valor derivado
de otro estado, así que no debería dispararla — si el lint la marca igual, resuélvela moviendo la
detección a un `useState(() => isScannerSupported())` con inicializador perezoso en vez de efecto,
ya que la primera renderización en el cliente ya tiene `window` disponible fuera de SSR puro).

- [ ] **Step 7: Commit**

```bash
git add frontend/app/tarja/page.tsx
git commit -m "feat(tarja): boton de escaneo de camara en la busqueda de VIN"
```

---

### Task 5: Verificación manual en dispositivo real

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Levantar backend y frontend**

Run: `cd backend && npm run start:dev`
Run: `cd frontend && npm run dev`

Verifica que un tarjador de prueba pueda entrar a `/tarja` desde un Android real en la misma red
(usa la IP de la máquina, no `localhost`, para que el celular pueda acceder).

- [ ] **Step 2: Escanear el código de barras**

Apunta la cámara al código de barras Code 128 de un VIN que esté en una operación `ACTIVA` y
tarjable (`PENDIENTE`, `REABIERTO` o `NO_PLANIFICADO`).

Expected: la cámara se cierra sola y aparece directo la tarjeta de confirmación con el VIN
correcto.

- [ ] **Step 3: Escanear el QR**

Apunta la cámara al QR (formato CSV, VIN en cualquier posición del payload).

Expected: mismo resultado que el Step 2 — confirma que la ubicación por forma funciona sin
importar en qué campo viene el VIN.

- [ ] **Step 4: Escanear un VIN bloqueado**

Escanea un VIN que ya esté `EN_PROCESO` por otro tarjador (o `TARJADO`).

Expected: la cámara se cierra, el campo de búsqueda queda con ese VIN, y la lista muestra la fila
en gris con su motivo — no aparece un error rojo genérico ni una tarjeta de confirmación.

- [ ] **Step 5: Denegar el permiso de cámara**

Toca el botón de escaneo y deniega el permiso cuando el navegador lo pida.

Expected: mensaje "No se pudo acceder a la cámara..." con botón de cerrar funcional, sin que la
página quede en un estado roto.

- [ ] **Step 6: Confirmar que la cámara se apaga**

Abre el escáner y ciérralo con la `X` antes de que detecte nada.

Expected: el indicador de cámara activa del sistema operativo (el punto/ícono verde de Android)
desaparece inmediatamente al cerrar.

- [ ] **Step 7: Confirmar el flujo manual sigue intacto**

Escribe a mano los últimos 4 dígitos de un VIN tarjable, sin usar el escáner.

Expected: comportamiento sin cambios respecto a antes de este plan — lista con sufijo resaltado,
selección manual, tarjeta de confirmación, `Iniciar tarja`.

---

## Consecuencia conocida (heredada del spec)

`extractVinFromScan` no verifica el dígito verificador ISO 3779 — solo la forma (17 caracteres
del charset). Un campo de 17 caracteres del charset correcto que no sea un VIN real (poco
probable en un CSV de logística automotriz, pero posible) se enviaría a `searchVehicles`, que
simplemente no lo encontraría y caería al estado vacío normal — no hay riesgo de tarjar el
vehículo equivocado, porque `searchVehicles` sigue siendo la única fuente de verdad sobre qué VIN
existe y es tarjable.
