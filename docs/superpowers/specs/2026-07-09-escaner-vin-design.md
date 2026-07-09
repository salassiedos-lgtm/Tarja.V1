# Escáner de cámara para VIN (QR + código de barras)

**Fecha:** 2026-07-09
**Estado:** aprobado, pendiente de plan de implementación

## Problema

El spec `2026-07-09-busqueda-vin-nueva-tarja` dejó el escáner de cámara fuera de alcance porque
faltaba responder una pregunta de campo, no de código: **cuál es la simbología real de la
etiqueta VIN**. La respuesta llegó fotografiando etiquetas reales de vehículos en el patio:

1. **Etiqueta VIN**: código de barras lineal **Code 128**, vertical, junto a marca/modelo/número
   de chasis/país. Hoy codifica el VIN solo (`LVTDB11B2VD024641`), pero puede traer datos
   adicionales en el futuro.
2. **Etiqueta QR** (en un vehículo distinto, mismo tipo de unidad logística): CSV con el VIN como
   uno de sus campos, acompañado de otros datos —
   `LEFEDDE16VTP04794,0002575292,,,,,30921001,BBDNFSCDDY00PMMFLS,`.

Con la simbología confirmada, el punto de anclaje que ya existe en `/tarja` (el campo de
búsqueda) puede activarse.

## Decisiones tomadas

| Decisión | Elegido | Descartado |
|---|---|---|
| Dispositivos objetivo | Solo Android/Chrome (confirmado por el usuario) | Soporte iOS |
| Tecnología de decodificación | `BarcodeDetector` nativo del navegador | Librería JS (zxing, quagga) — innecesaria sin iOS |
| Formatos a detectar | `qr_code` y `code_128` en la misma sesión de cámara | Botones separados por formato |
| Cómo se ubica el VIN dentro del payload decodificado | Se busca el campo cuyo contenido tiene forma de VIN (17 car., charset ISO 3779), sin asumir posición fija | Asumir que el VIN es siempre el primer campo antes de la coma |
| Al decodificar un VIN de 17 caracteres con match único y tarjable | Salta directo a la tarjeta de confirmación | Solo llenar el campo y dejar que el tarjador toque la fila |
| Botón de escaneo | Uno solo, detecta ambos formatos | Uno por formato |
| Backend | Sin cambios | — |

**Por qué se busca el VIN por forma y no por posición.** El QR de ejemplo trae el VIN en el
primer campo, pero es un CSV con siete campos más — nada garantiza que esa posición se mantenga
en otra nave o en una versión futura de la etiqueta, y el propio código de barras hoy es un VIN
puro pero el usuario indica que en algún momento traerá datos adicionales igual que el QR. La
regla no puede ser "campo 0": tiene que ser "el campo que tiene forma de VIN", igual que el
importador de Excel (`base.importer.ts`) no asume que la columna VIN esté en una posición fija
del archivo, sino que la identifica por su encabezado. Aquí no hay encabezado — la "cabecera" es
la forma del dato: 17 caracteres del charset ISO 3779 (sin `I`, `O`, `Q`).

**Por qué no se verifica el dígito verificador para identificar el campo.** `hasValidCheckDigit`
(`backend/src/common/vin.util.ts:34`) implementa el checksum de la norma, pero ese dígito solo es
obligatorio en Norteamérica. Exigirlo para reconocer el campo VIN rechazaría VINs legítimos del
mercado peruano/chino (como los de las fotos). Se usa solo la forma: longitud 17 y charset válido.

**Por qué `BarcodeDetector` nativo y no una librería.** Confirmado que el equipo usa solo
Android/Chrome, donde `BarcodeDetector` con `code_128` y `qr_code` está soportado de fábrica. Una
librería (zxing, quagga) solo se justifica si apareciera un iPhone, que hoy no es el caso — se
deja como decisión futura si cambia el parque de dispositivos.

**Por qué un solo botón para ambos formatos.** El tarjador no necesita saber si está mirando el
código de barras o el QR: aprieta un botón, apunta la cámara a cualquiera de las dos etiquetas, y
`BarcodeDetector({ formats: ['qr_code', 'code_128'] })` decodifica lo que sea que vea primero.

**Por qué el auto-avance a confirmación.** Un VIN escaneado de 17 caracteres que resuelve a una
sola fila tarjable ya pasó la verificación que la búsqueda por sufijo existe para dar: no hay
ambigüedad que resolver mostrando una lista de una sola fila. Si está bloqueado, no tiene match, o
hay error de red, se cae al mismo camino que escribir el VIN a mano — nunca se fuerza un avance
sobre algo que no se puede tarjar.

## Diseño

### `frontend/lib/vin-scan.ts` (funciones puras, sin JSX)

```ts
export function isScannerSupported(): boolean; // 'BarcodeDetector' in window

/**
 * Busca, entre los campos separados por coma del payload decodificado, el que
 * tiene forma de VIN (17 caracteres del charset ISO 3779 tras normalizar).
 * Cubre tanto el QR (CSV con el VIN en cualquier posición) como el código de
 * barras (hoy un solo campo = el VIN; mañana, varios campos igual que el QR).
 * Devuelve null si ningún campo tiene forma de VIN.
 */
export function extractVinFromScan(raw: string): string | null;
```

`extractVinFromScan` reutiliza `normalizeVinQuery` (ya exportado desde `use-vin-search.ts`) sobre
cada campo separado por `,` y se queda con el primero cuyo resultado normalizado mide 17
caracteres. Si `raw` no tiene comas, el único "campo" es `raw` completo — así el caso actual del
código de barras (VIN puro) funciona con la misma función que el caso del QR (CSV).

### `frontend/components/vin-scanner-modal.tsx`

Modal de pantalla completa:

- Pide cámara trasera: `getUserMedia({ video: { facingMode: { ideal: 'environment' } } })`.
- `new BarcodeDetector({ formats: ['qr_code', 'code_128'] })`, con un loop que llama
  `detect(videoEl)` cada ~200 ms sobre el `<video>` en vivo (no hace falta `<canvas>` intermedio:
  `detect()` acepta `HTMLVideoElement` directamente).
- Al primer resultado con `rawValue` no vacío: detiene el loop, detiene todos los tracks de la
  cámara, y llama `onDecode(rawValue)`.
- Estados de la UI: pidiendo permiso → cámara activa con guía visual ("Apunta al VIN o al QR") →
  error (permiso denegado / sin cámara / `BarcodeDetector` lanza) con mensaje y botón de cerrar.
- Limpieza: los tracks de la cámara se detienen al cerrar el modal o desmontar el componente, se
  monte como se monte (éxito, cancelación, error) — no debe quedar la cámara encendida en segundo
  plano.

### `frontend/app/tarja/page.tsx`

- El botón de cámara ocupa el contenedor ya reservado junto al campo VIN
  (`{/* Anclaje del futuro botón de escáner de cámara. */}`, línea 156). Solo se renderiza si
  `isScannerSupported()`.
- Al tocar el botón se abre `VinScannerModal`. Su `onDecode(raw)`:
  1. `extractVinFromScan(raw)`.
     - Si devuelve `null` (ningún campo con forma de VIN): `setQuery(normalizeVinQuery(raw))` —
       mismo camino que si el tarjador lo hubiera tecleado; ve la lista de sufijo o el estado
       vacío normal con lo que se pudo leer.
     - Si devuelve un VIN de 17 caracteres: se llama `searchVehicles(vin)` **directo** (import de
       `lib/api`, sin pasar por el debounce del hook — ya es un match exacto, no hace falta
       esperar):
       - Una sola fila y no bloqueada → `setStartError(''); setPicked(fila)` — salta a la tarjeta
         de confirmación.
       - Bloqueada, sin resultados, o error de red → `setQuery(vin)` y se deja ver el estado
         normal (fila gris con motivo, o el mensaje de "ningún VIN termina en…").
  2. Cierra el modal en cualquier caso.

Esto reutiliza toda la lógica de bloqueo/carrera/409 que ya existe en la página — el escáner es
un atajo para llenar el campo más rápido, no un camino de datos nuevo.

## Fuera de alcance

- Soporte iOS / librería de decodificación por software (zxing, quagga). Se reconsidera si cambia
  el parque de dispositivos.
- Cambios de backend: `/vehicles/search` ya cubre el caso de 17 caracteres exactos.
- Verificación del dígito verificador del VIN como parte de `extractVinFromScan` (ver "por qué no
  se verifica" arriba).
- Tests automatizados de frontend: no hay runner montado en `frontend/` (mismo estado que el spec
  anterior). Se verifica ejecutando la PWA en un Android real contra las etiquetas fotografiadas.
- Separadores distintos a la coma dentro del payload. Si aparece un formato con `;` o `|`, se
  decide cuando se vea el caso real, igual que se hizo aquí con la coma.

## Pruebas (manuales, en dispositivo real)

- Apuntar al código de barras `LVTDB11B2VD024641` (o cualquier VIN de una unidad en operación
  activa) → salta a confirmación si es tarjable.
- Apuntar al QR CSV con el VIN en una posición interna (no la 0) → mismo resultado: se ubica por
  forma, no por posición.
- Apuntar a un VIN ya `EN_PROCESO` por otro tarjador → se queda en la lista con la fila en gris y
  el motivo, no un error genérico.
- Denegar el permiso de cámara → mensaje claro, sin crash, botón de cerrar funcional.
- Cerrar el modal a mitad de escaneo → la cámara se apaga (verificar con el indicador de cámara
  activa del sistema operativo).
