# Búsqueda de VIN en Nueva Tarja

**Fecha:** 2026-07-09
**Estado:** aprobado, pendiente de plan de implementación

## Problema

Hoy `/tarja` obliga al tarjador a seleccionar una "operación activa" antes de escribir el VIN
completo de memoria o copiándolo de la etiqueta, sin ninguna verificación previa. Tres defectos:

1. **La selección de operación es decorativa.** `POST /tarja/start` ignora el `operationId` que
   recibe: el VIN es único global y resuelve su propia operación desde
   `vehicle.operationId` (`backend/src/tarja/tarja.service.ts:65`). El frontend manda un dato
   que el backend descarta.
2. **No hay verificación antes de iniciar.** El tarjador escribe 17 caracteres y solo al enviar
   descubre si el VIN existe, si ya fue tarjado o si lo tomó otro tarjador. Cada error cuesta un
   viaje completo al servidor y no distingue "escribí mal" de "ya está tarjado".
3. **El campo dice "VIN / Chasis" pero solo acepta VIN.** `start()` valida con `validateVin()`
   y busca `findUnique({ where: { vin } })`. Un número de chasis puro nunca funciona.

## Solución

Reemplazar el formulario por una **búsqueda incremental de VIN**. El tarjador escribe al menos
los últimos 4 caracteres del VIN; obtiene una lista de coincidencias con su BL y nave; los VINs
no tarjables aparecen en gris con el motivo; al elegir uno tarjable ve una tarjeta de
confirmación y desde ahí inicia la tarja.

La selección de operación desaparece por completo.

## Decisiones tomadas

| Decisión | Elegido | Descartado |
|---|---|---|
| VINs bloqueados | Visibles, en gris, no clickeables, con motivo | Ocultarlos; abrirlos en modo lectura |
| Universo de búsqueda | Solo operaciones con `status = ACTIVA` | Toda la base; toda la base con "operación cerrada" como motivo de bloqueo |
| Modo de match | Híbrido: 17 caracteres → exacto; 4–16 → sufijo | Sufijo siempre; `contains` en cualquier posición |
| Mínimo para buscar | 4 caracteres | 3 o menos |
| Al elegir un VIN | Tarjeta de confirmación, luego "Iniciar tarja" | Iniciar de inmediato al tocar la fila |
| Escáner de cámara | Fuera de alcance; solo se deja el punto de anclaje | Elegir librería ahora |
| Origen de la lista | Endpoint nuevo `GET /vehicles/search` | Reusar `GET /operations/:id/vehicles`; reusar `GET /vehicles/lookup` |

**Por qué los bloqueados se muestran:** si el VIN desapareciera de la lista, el tarjador no puede
distinguir tres situaciones que exigen acciones opuestas — el VIN no existe, ya fue tarjado, o
escribió mal los dígitos. Mostrarlo en gris con el motivo responde eso en un vistazo.

**Por qué hay confirmación:** `start()` hace un compare-and-swap que pone el vehículo en
`EN_PROCESO` y lo bloquea a nombre del tarjador (`tarja.service.ts:72-82`). Deshacerlo requiere
un supervisor (`POST /vehicles/:id/release`). Un toque errado en una lista apretada, con guantes y
el celular en una mano, cuesta una llamada al supervisor. Un toque de más no cuesta nada.

**Por qué el match híbrido:** cuando llegue el escáner de cámara, decodificará los 17 caracteres
de golpe. El modo exacto hace que eso resuelva a una única fila sin obligar al tarjador a elegir
de una lista mientras sostiene el celular contra la etiqueta.

## Diseño

### Backend: `GET /vehicles/search?q=`

Endpoint nuevo en `VehiclesController`. Hereda `JwtAuthGuard`; sin `@Roles` adicional.

**Normalización de `q`.** Mayúsculas, sin espacios, descartando los caracteres que el estándar
VIN prohíbe (`I`, `O`, `Q`). No pasa por `validateVin()`: esa función exige 17 caracteres y
dígito verificador, y un fragmento no los tiene. La búsqueda necesita su propia normalización
laxa.

**Selección de modo, sobre la longitud ya normalizada:**

| Longitud | Comportamiento |
|---|---|
| 0–3 | Devuelve `[]` (el usuario está escribiendo, no es un error) |
| 4–16 | Sufijo: `endsWith`, insensible a mayúsculas |
| 17 | Match exacto sobre `vin` |
| 18+ | Devuelve `[]` |

**Filtro:** `operation.status = 'ACTIVA'`. Límite de 20 filas, ordenadas por `vin` ascendente.

**Regla de bloqueo compartida.** La definición de "tarjable" hoy vive embebida en tres `if`
dentro de `start()` (`tarja.service.ts:53-63`). Se extrae a una función pura en `common/`:

```ts
// getVehicleBlock(status): null si es tarjable, o el motivo si no lo es.
```

| `VehicleStatus` | Resultado |
|---|---|
| `PENDIENTE` | `null` — tarjable |
| `REABIERTO` | `null` — tarjable |
| `NO_PLANIFICADO` | `null` — tarjable |
| `EN_PROCESO` | En proceso por otro tarjador |
| `TARJADO` | Ya tarjado |
| `OBSERVADO` | Ya tarjado (con observaciones) |
| `BLOQUEADO` | Bloqueado por revisión operativa |

**Hallazgo durante la implementación.** El enum tiene **siete** estados, no cinco. `REABIERTO` y
`NO_PLANIFICADO` no aparecían en ninguno de los `if` de `start()`, así que caían por defecto en
"tarjable" sin que nadie lo hubiera decidido explícitamente. Se preserva ese comportamiento, ahora
declarado: `REABIERTO` lo deja un reporte anulado (`reports.service.ts:65`), y anular es justamente
lo que habilita re-tarjar; `NO_PLANIFICADO` está en el schema pero ningún servicio lo asigna. El
test de exhaustividad sobre `Object.values(VehicleStatus)` es lo que sacó esto a la luz, y es lo
que impedirá que un octavo estado se cuele sin decisión.

`start()` la consulta para lanzar sus `ConflictException` y `search()` la consulta para marcar la
fila. Una sola definición: si mañana se agrega un `VehicleStatus`, no puede divergir entre la
lista y el inicio de tarja. Esto es lo único que justifica un endpoint nuevo en vez de calcular
el bloqueo en el frontend.

**Forma de cada fila de la respuesta:**

```
vehicleId, vin, blNumber, shipName, operationCode,
brand, model, containerNumber,
blocked: boolean, blockedReason: string | null
```

Es casi la forma que ya devuelve `lookup()` (`vehicles.service.ts:57-70`); reusa el mismo
`select` con `billOfLading` y `operation.ship`.

**Rendimiento.** El sufijo se traduce a `LIKE '%00123'`. El comodín inicial impide usar el índice
`vehicles_vin_key`, así que Postgres hace un escaneo secuencial. Con una nave de unos miles de
unidades esto es sub-milisegundo, y el filtro por operación activa ya acota el conjunto. **No se
optimiza ahora.** Si el universo crece a cientos de miles de VINs, la solución es un índice sobre
el VIN invertido (`reverse(vin) text_pattern_ops`) o un índice trigram.

### Frontend: `/tarja`

Desaparece la sección "Operación activa" (`frontend/app/tarja/page.tsx:71-133`) y con ella la
llamada a `listOperations()`. La pantalla queda con un solo protagonista: el campo de búsqueda,
enfocado al montar.

**Estados debajo del campo:**

- **< 4 caracteres:** línea de ayuda — *"Ingresa al menos los últimos 4 dígitos del VIN"*.
- **≥ 4, buscando:** esqueleto de 2–3 filas.
- **Con resultados:** la lista.
- **Sin resultados:** *"Ningún VIN de las naves en operación termina en `00123`. Verifica los
  dígitos o avisa al supervisor."* Nombra el fragmento buscado y nombra la acción. Nunca un
  "sin resultados" genérico: el tarjador está frente a un auto real y necesita saber qué hacer.

**La lista.** Cada fila muestra el VIN con el fragmento coincidente resaltado en negrita —lo que
confirma visualmente que buscó lo que creía— y debajo el BL y la nave. Las filas tarjables son
`<button>`. Las bloqueadas son `<div>` con opacidad reducida, `aria-disabled`, y una insignia a
la derecha con el `blockedReason` que envió el backend. El frontend nunca interpreta un
`VehicleStatus`.

**La confirmación.** Al tocar una fila tarjable, la lista se reemplaza por una tarjeta con el VIN
completo en grande y monoespaciado y, debajo, BL, nave, marca, modelo y contenedor. Un botón
primario "Iniciar tarja" y uno secundario para volver a la lista. `startTarja()` se llama desde
aquí. La tarjeta es también donde el tarjador verifica contra el auto que tiene enfrente que la
marca y el modelo cuadran — la comprobación que evita tarjar la unidad de al lado.

**`startTarja()` cambia de firma.** De `startTarja(operationId, vin)` (`frontend/lib/api.ts:228`)
a `startTarja(vin)`. El `operationId` que hoy se envía es descartado por el backend.

**El campo dice "VIN", no "VIN / Chasis".** La etiqueta actual promete algo que el backend no
soporta. Buscar también por `chassisNumber` queda fuera de alcance: son campos de origen distinto
que pueden colisionar en el mismo sufijo, y entonces una fila deja de significar "este VIN" y pasa
a significar "algo coincidió, mira cuál".

**Debounce de 250 ms** sobre el input. Las respuestas obsoletas se descartan con `AbortController`
sobre el fetch anterior: si el usuario escribe rápido, la respuesta de `0012` puede llegar después
de la de `00123` y pintar la lista vieja sobre la nueva.

**Punto de anclaje del escáner.** El campo reserva un contenedor a su derecha para el futuro botón
de cámara. La lógica se escribe de modo que *escribir en el campo es la única entrada*: cuando el
escáner llegue, decodifica y hace `setQuery(codigo)`; con 17 caracteres válidos el modo exacto
devuelve una fila única. Queda como decisión futura si con resultado único se autoselecciona y se
salta a la confirmación.

### Errores y carreras

**La carrera que importa.** Entre que la lista pinta un VIN como tarjable y que el tarjador toca
"Iniciar tarja", otro tarjador pudo tomarlo. El backend ya lo cubre: el compare-and-swap devuelve
`count === 0` y lanza `ConflictException` (`tarja.service.ts:80-82`).

Lo que falta es el lado del frontend. Ese 409 **no se muestra como error rojo genérico**: se
vuelve a la lista, se relanza la búsqueda, y el VIN aparece ahora en gris con su motivo. El
tarjador ve *por qué* falló, no solo que falló.

**VIN inexistente.** Con la búsqueda por delante, casi no se puede llegar a `start()` con un VIN
desconocido. La ruta sigue viva como red de seguridad: 404, auditoría `VIN_NO_ENCONTRADO` y
websocket `vin.unknown` (`tarja.service.ts:39-51`). Se deja intacta.

### Pruebas

**Backend — `search()`:**

- El sufijo encuentra un VIN que termina en el fragmento.
- El sufijo **no** encuentra un VIN que solo *contiene* el fragmento en otra posición.
- 17 caracteres producen match exacto.
- Menos de 4 caracteres devuelven `[]`.
- Un VIN de una operación no `ACTIVA` no aparece.
- Cada `VehicleStatus` produce el `blocked` / `blockedReason` correcto, y la lista está cubierta
  de forma exhaustiva contra el enum de Prisma.

**Backend — el refactor:** un test que verifique que `start()` y `search()` coinciden sobre qué
estados son tarjables. Es el test que protege `getVehicleBlock` de divergir.

**Frontend:** no hay runner de tests en `frontend/` (ni jest, ni vitest, ni testing-library), y
montarlo es una decisión de infraestructura fuera de este alcance. El debounce y el descarte de
respuestas obsoletas viven aislados en el hook `useVinSearch`, y se verifican **ejecutando la app**
con un navegador: se cuenta que teclear `0,00,001,0012,00123` produzca **una sola** petición a
`/vehicles/search`, y se fuerza la carrera del 409 cambiando el estado del vehículo en la base con
la tarjeta de confirmación ya abierta.

## Consecuencia conocida

El aviso `vin.unknown` al supervisor **deja de dispararse en la práctica**. Hoy se emite cuando un
tarjador intenta iniciar una tarja con un VIN que no existe en ninguna operación; con la búsqueda
por delante, el tarjador se queda en el estado vacío de la lista y nunca llega a `start()`.

Si el negocio depende de esa alerta, el estado vacío necesita un botón "Reportar VIN no
encontrado" que llame a un endpoint dedicado. **No se incluye en este alcance** hasta que se
decida. Queda registrado aquí para que la pérdida sea deliberada y no un descubrimiento posterior.

## Fuera de alcance

- El escáner de cámara. Sigue diferido, y sigue bloqueado por la misma pregunta sin responder:
  cuál es la simbología real de la etiqueta VIN (Code 39 / Data Matrix / PDF417). Se responde
  fotografiando una etiqueta real, no diseñando más. Si es Code 39, `BarcodeDetector` nativo
  alcanza y no hace falta ninguna librería. Si es PDF417, ninguna opción de navegador es
  confiable. Ver `plan_tecnico_tarja_vehicular_v2.2.md:386`.
- El índice para acelerar `LIKE '%...'`.
- La búsqueda por `chassisNumber`.
- El botón "Reportar VIN no encontrado".
- El menú `/tarja/nueva` + `/tarja/consolidado`
  (`docs/superpowers/specs/2026-07-08-tarja-menu-consolidado-design.md`), que sigue pendiente de
  implementación. Cuando se ejecute, el formulario que este spec rediseña será el que se mueva a
  `/tarja/nueva`; ambos specs tendrán que reconciliarse en ese momento.
