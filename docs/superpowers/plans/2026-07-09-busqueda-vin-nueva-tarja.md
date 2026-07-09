# Búsqueda de VIN en Nueva Tarja — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar la selección de operación activa en `/tarja` por una búsqueda incremental de VIN por sufijo, que muestra las coincidencias con su BL, bloquea las no tarjables con el motivo, y exige una confirmación antes de iniciar la tarja.

**Architecture:** La regla de "qué VIN es tarjable" se extrae de `tarja.service.ts` a una función pura compartida (`getVehicleBlock`), consumida tanto por `start()` (para lanzar `ConflictException`) como por un endpoint nuevo `GET /vehicles/search` (para marcar filas en gris). El frontend nunca interpreta un `VehicleStatus`: recibe `blocked` y `blockedReason` ya calculados. La búsqueda usa sufijo (`endsWith`) para 4–16 caracteres y match exacto para 17, lo que deja el enganche listo para el futuro escáner de cámara.

**Tech Stack:** NestJS + Prisma + Postgres (backend), Next.js 16 + React 19 + Tailwind 4 (frontend), Jest + supertest (tests).

**Spec:** `docs/superpowers/specs/2026-07-09-busqueda-vin-nueva-tarja-design.md`

---

## Decisión sobre tests de frontend

El spec pedía probar el debounce y el descarte de respuestas obsoletas en el frontend. **No hay runner de tests en `frontend/`**: `package.json` no tiene jest, vitest ni testing-library, y sus únicos scripts son `dev`, `build`, `start`, `lint`. Montar un harness de testing de React es una decisión de infraestructura con costo propio y queda **fuera de este plan**.

Cobertura real de este plan:

- La lógica de selección de modo y de bloqueo vive en el **backend** y se prueba con Jest unitario (Tasks 1–3).
- El endpoint completo se prueba **end-to-end** contra Postgres real (Task 4).
- El debounce y el `AbortController` viven en un hook aislado (`useVinSearch`) y se **verifican ejecutando la app** (Task 7).

Si más adelante se monta vitest + testing-library, `useVinSearch` ya está aislado para probarlo sin renderizar la página.

---

## File Structure

**Backend**

| Archivo | Responsabilidad |
|---|---|
| `backend/src/common/vehicle-block.ts` (crear) | Función pura: dado un `VehicleStatus`, ¿es tarjable? Si no, ¿por qué? Única fuente de verdad. |
| `backend/src/common/vehicle-block.spec.ts` (crear) | Tests de la función, incluida la exhaustividad sobre el enum. |
| `backend/src/common/vin-search.util.ts` (crear) | Normalización laxa del fragmento y selección de modo (vacío / sufijo / exacto). |
| `backend/src/common/vin-search.util.spec.ts` (crear) | Tests de normalización y modo. |
| `backend/src/vehicles/vehicles.service.ts` (modificar) | Nuevo método `search(q)`. |
| `backend/src/vehicles/vehicles.service.spec.ts` (crear) | Tests de `search()` con Prisma mockeado. |
| `backend/src/vehicles/vehicles.controller.ts` (modificar) | Nueva ruta `GET vehicles/search`, **antes** de `vehicles/:id`. |
| `backend/src/tarja/tarja.service.ts` (modificar, líneas 53-63) | Los tres `if` pasan a consultar `getVehicleBlock`. |
| `backend/test/vin-search.e2e-spec.ts` (crear) | E2E del endpoint contra Postgres real. |

**Frontend**

| Archivo | Responsabilidad |
|---|---|
| `frontend/lib/api.ts` (modificar) | `searchVehicles(q)` nuevo; `startTarja` cambia de firma. |
| `frontend/lib/use-vin-search.ts` (crear) | Hook: estado del query, debounce 250 ms, `AbortController`, resultados. Sin JSX. |
| `frontend/app/tarja/page.tsx` (reescribir) | Búsqueda + lista + tarjeta de confirmación. Sin selector de operación. |

**Nota sobre Next.js:** `frontend/AGENTS.md` advierte que esta versión de Next tiene cambios de ruptura respecto a lo conocido. Nada de este plan toca routing, server actions ni data fetching de Next: la página sigue siendo `'use client'` con `fetch` manual, igual que hoy. No hace falta consultar `node_modules/next/dist/docs/`.

---

### Task 1: `getVehicleBlock` — la regla única de "tarjable"

**Files:**
- Create: `backend/src/common/vehicle-block.ts`
- Test: `backend/src/common/vehicle-block.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/common/vehicle-block.spec.ts`:

```ts
import { VehicleStatus } from '@prisma/client';
import { getVehicleBlock } from './vehicle-block';

describe('getVehicleBlock', () => {
  it('PENDIENTE es tarjable', () => {
    expect(getVehicleBlock('PENDIENTE')).toBeNull();
  });

  it.each([
    ['EN_PROCESO', 'En proceso por otro tarjador'],
    ['TARJADO', 'Ya tarjado'],
    ['OBSERVADO', 'Ya tarjado (con observaciones)'],
    ['BLOQUEADO', 'Bloqueado por revision operativa'],
  ] as const)('%s esta bloqueado con label %j', (status, label) => {
    const block = getVehicleBlock(status);
    expect(block).not.toBeNull();
    expect(block!.label).toBe(label);
    expect(block!.message.length).toBeGreaterThan(0);
  });

  // Este es el test que protege el refactor: si alguien agrega un VehicleStatus
  // al schema de Prisma y no lo contempla aqui, esto falla. Sin el, la lista de
  // busqueda y start() pueden divergir en silencio.
  it('cubre todos los VehicleStatus del enum de Prisma', () => {
    for (const status of Object.values(VehicleStatus)) {
      expect(() => getVehicleBlock(status)).not.toThrow();
    }
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd backend && npx jest src/common/vehicle-block.spec.ts
```

Esperado: FAIL — `Cannot find module './vehicle-block'`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `backend/src/common/vehicle-block.ts`:

```ts
import { VehicleStatus } from '@prisma/client';

/**
 * Unica definicion de "que vehiculo se puede tarjar".
 *
 * La consultan tanto TarjaService.start() (para rechazar con ConflictException)
 * como VehiclesService.search() (para pintar la fila en gris). Si se agrega un
 * VehicleStatus al schema, agregarlo aqui: el spec de exhaustividad lo exige.
 */
export interface VehicleBlock {
  /** Texto corto para la insignia de la lista de busqueda. */
  label: string;
  /** Texto largo para la excepcion que ve el tarjador al iniciar. */
  message: string;
}

const BLOCKS: Record<VehicleStatus, VehicleBlock | null> = {
  PENDIENTE: null,
  EN_PROCESO: {
    label: 'En proceso por otro tarjador',
    message: 'Este vehiculo esta siendo procesado por otro usuario',
  },
  TARJADO: {
    label: 'Ya tarjado',
    message: 'Este vehiculo ya tiene una tarja valida. Anule antes de re-tarjar.',
  },
  OBSERVADO: {
    label: 'Ya tarjado (con observaciones)',
    message: 'Este vehiculo ya tiene una tarja valida. Anule antes de re-tarjar.',
  },
  BLOQUEADO: {
    label: 'Bloqueado por revision operativa',
    message: 'Este vehiculo esta bloqueado por revision operativa',
  },
};

export function getVehicleBlock(status: VehicleStatus): VehicleBlock | null {
  return BLOCKS[status];
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
cd backend && npx jest src/common/vehicle-block.spec.ts
```

Esperado: PASS, 3 tests (el `it.each` cuenta como 4 casos → 6 en total).

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/vehicle-block.ts backend/src/common/vehicle-block.spec.ts
git commit -m "feat(vehicles): regla unica de vehiculo tarjable en getVehicleBlock"
```

---

### Task 2: `start()` consume `getVehicleBlock`

Refactor puro: mismo comportamiento externo, una sola definición de la regla.

**Files:**
- Modify: `backend/src/tarja/tarja.service.ts:53-63`

- [ ] **Step 1: Verificar que los e2e de tarja pasan ANTES de tocar nada**

Los e2e necesitan Postgres. Levantarlo si no está corriendo:

```bash
docker compose up -d db
cd backend && npx jest --config ./test/jest-e2e.json test/phase3.e2e-spec.ts
```

Esperado: PASS. Si falla antes del refactor, **detenerse y arreglar eso primero** — no se puede distinguir un refactor roto de un test ya roto.

- [ ] **Step 2: Reemplazar los tres `if` por la consulta a la función**

En `backend/src/tarja/tarja.service.ts`, agregar el import junto a los existentes:

```ts
import { getVehicleBlock } from '../common/vehicle-block';
```

Reemplazar las líneas 53-63, que hoy son:

```ts
    if (vehicle.status === 'EN_PROCESO') {
      throw new ConflictException('Este vehiculo esta siendo procesado por otro usuario');
    }
    if (vehicle.status === 'TARJADO' || vehicle.status === 'OBSERVADO') {
      throw new ConflictException(
        'Este vehiculo ya tiene una tarja valida. Anule antes de re-tarjar.',
      );
    }
    if (vehicle.status === 'BLOQUEADO') {
      throw new ConflictException('Este vehiculo esta bloqueado por revision operativa');
    }
```

por:

```ts
    // La misma regla que usa GET /vehicles/search para pintar la fila en gris.
    const block = getVehicleBlock(vehicle.status);
    if (block) throw new ConflictException(block.message);
```

- [ ] **Step 3: Correr los e2e para verificar que nada cambió**

```bash
cd backend && npx jest --config ./test/jest-e2e.json test/phase3.e2e-spec.ts test/phase7.e2e-spec.ts
```

Esperado: PASS, exactamente como en el Step 1. Los mensajes de `ConflictException` son idénticos a los anteriores, así que ningún assert sobre texto se rompe.

- [ ] **Step 4: Commit**

```bash
git add backend/src/tarja/tarja.service.ts
git commit -m "refactor(tarja): start() consume getVehicleBlock en vez de duplicar la regla"
```

---

### Task 3: Normalización y selección de modo de búsqueda

Un fragmento de VIN **no puede pasar por `validateVin()`**: esa función exige 17 caracteres y dígito verificador. La búsqueda necesita su propia normalización laxa.

**Files:**
- Create: `backend/src/common/vin-search.util.ts`
- Test: `backend/src/common/vin-search.util.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/common/vin-search.util.spec.ts`:

```ts
import { parseVinQuery } from './vin-search.util';

describe('parseVinQuery', () => {
  it('normaliza a mayusculas y descarta separadores', () => {
    expect(parseVinQuery(' ab-12 3d ')).toEqual({ mode: 'suffix', vin: 'AB123D' });
  });

  it('descarta I, O y Q, que el charset VIN prohibe', () => {
    // 'OQ' se cae entero; queda '00123' (5 caracteres, sigue siendo sufijo valido)
    expect(parseVinQuery('OQ00123')).toEqual({ mode: 'suffix', vin: '00123' });
  });

  it.each(['', '   ', '1', '12', '123', '--12--'])(
    'menos de 4 caracteres utiles (%j) no dispara busqueda',
    (q) => {
      expect(parseVinQuery(q)).toEqual({ mode: 'none' });
    },
  );

  it('4 caracteres es el minimo que dispara el sufijo', () => {
    expect(parseVinQuery('0123')).toEqual({ mode: 'suffix', vin: '0123' });
  });

  it('16 caracteres sigue siendo sufijo', () => {
    const q = 'A'.repeat(16);
    expect(parseVinQuery(q)).toEqual({ mode: 'suffix', vin: q });
  });

  it('17 caracteres es match exacto: es lo que entregara el escaner', () => {
    const vin = 'LSGKB54E9DL000123';
    expect(parseVinQuery(vin)).toEqual({ mode: 'exact', vin });
  });

  it('mas de 17 caracteres no puede ser ningun VIN', () => {
    expect(parseVinQuery('A'.repeat(18))).toEqual({ mode: 'none' });
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd backend && npx jest src/common/vin-search.util.spec.ts
```

Esperado: FAIL — `Cannot find module './vin-search.util'`.

- [ ] **Step 3: Escribir la implementación mínima**

Crear `backend/src/common/vin-search.util.ts`:

```ts
/**
 * Normalizacion laxa para busqueda parcial de VIN.
 *
 * No usa validateVin() de vin.util.ts: esa exige 17 caracteres y digito
 * verificador, y un fragmento no tiene ninguno de los dos.
 */
const MIN_QUERY = 4;
const VIN_LENGTH = 17;

/** Charset ISO 3779: sin I, O ni Q. */
const NON_VIN_CHARS = /[^A-HJ-NPR-Z0-9]/g;

export type VinQuery =
  | { mode: 'none' }
  | { mode: 'suffix'; vin: string }
  | { mode: 'exact'; vin: string };

export function parseVinQuery(raw: string): VinQuery {
  const vin = (raw ?? '').toUpperCase().replace(NON_VIN_CHARS, '');
  if (vin.length < MIN_QUERY || vin.length > VIN_LENGTH) return { mode: 'none' };
  if (vin.length === VIN_LENGTH) return { mode: 'exact', vin };
  return { mode: 'suffix', vin };
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
cd backend && npx jest src/common/vin-search.util.spec.ts
```

Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/vin-search.util.ts backend/src/common/vin-search.util.spec.ts
git commit -m "feat(vehicles): parseVinQuery para busqueda parcial de VIN"
```

---

### Task 4: `VehiclesService.search()`

**Files:**
- Modify: `backend/src/vehicles/vehicles.service.ts`
- Test: `backend/src/vehicles/vehicles.service.spec.ts` (crear)

- [ ] **Step 1: Escribir el test que falla**

Crear `backend/src/vehicles/vehicles.service.spec.ts`. Sigue el patrón de `ships.service.spec.ts`: Prisma mockeado, sin base de datos.

```ts
import { VehiclesService } from './vehicles.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

const findMany = jest.fn();
const prisma = { vehicle: { findMany } } as unknown as PrismaService;
const audit = { record: jest.fn() } as unknown as AuditService;
const service = new VehiclesService(prisma, audit);

/** Fila cruda tal como la devuelve Prisma con el include del service. */
function row(vin: string, status: string) {
  return {
    id: 7,
    vin,
    brand: 'JMC',
    model: 'Grand Vigus',
    containerNumber: 'COSU1234567',
    status,
    billOfLading: { blNumber: 'COSU6502185840' },
    operation: { id: 3, code: 'OP-01', ship: { name: 'GUANG HE KOU' } },
  };
}

describe('VehiclesService.search', () => {
  beforeEach(() => findMany.mockReset());

  it('menos de 4 caracteres devuelve [] sin tocar la base', async () => {
    expect(await service.search('123')).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('4-16 caracteres busca por sufijo y solo en operaciones ACTIVA', async () => {
    findMany.mockResolvedValue([]);
    await service.search('00123');

    const arg = findMany.mock.calls[0][0];
    expect(arg.where.vin).toEqual({ endsWith: '00123', mode: 'insensitive' });
    expect(arg.where.operation).toEqual({ status: 'ACTIVA' });
    expect(arg.take).toBe(20);
  });

  it('17 caracteres busca por VIN exacto, no por sufijo', async () => {
    findMany.mockResolvedValue([]);
    await service.search('LSGKB54E9DL000123');

    const arg = findMany.mock.calls[0][0];
    expect(arg.where.vin).toBe('LSGKB54E9DL000123');
  });

  it('un vehiculo PENDIENTE sale tarjable y aplanado', async () => {
    findMany.mockResolvedValue([row('LSGKB54E9DL000123', 'PENDIENTE')]);
    const [r] = await service.search('00123');

    expect(r).toEqual({
      vehicleId: 7,
      vin: 'LSGKB54E9DL000123',
      blNumber: 'COSU6502185840',
      shipName: 'GUANG HE KOU',
      operationCode: 'OP-01',
      brand: 'JMC',
      model: 'Grand Vigus',
      containerNumber: 'COSU1234567',
      blocked: false,
      blockedReason: null,
    });
  });

  it.each([
    ['EN_PROCESO', 'En proceso por otro tarjador'],
    ['TARJADO', 'Ya tarjado'],
    ['OBSERVADO', 'Ya tarjado (con observaciones)'],
    ['BLOQUEADO', 'Bloqueado por revision operativa'],
  ])('un vehiculo %s sale bloqueado con su motivo', async (status, reason) => {
    findMany.mockResolvedValue([row('LSGKB54E9DL000123', status)]);
    const [r] = await service.search('00123');

    expect(r.blocked).toBe(true);
    expect(r.blockedReason).toBe(reason);
  });

  it('un vehiculo sin BL devuelve blNumber null, no revienta', async () => {
    const noBl = { ...row('LSGKB54E9DL000123', 'PENDIENTE'), billOfLading: null };
    findMany.mockResolvedValue([noBl]);
    const [r] = await service.search('00123');

    expect(r.blNumber).toBeNull();
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd backend && npx jest src/vehicles/vehicles.service.spec.ts
```

Esperado: FAIL — `service.search is not a function`.

- [ ] **Step 3: Escribir la implementación**

En `backend/src/vehicles/vehicles.service.ts`, agregar los imports junto a los existentes:

```ts
import { getVehicleBlock } from '../common/vehicle-block';
import { parseVinQuery } from '../common/vin-search.util';
```

Y agregar el método después de `lookup()` (que termina en la línea 71):

```ts
  /**
   * Busqueda incremental para el tarjador. Sufijo con 4-16 caracteres, exacta
   * con 17 (lo que entregara el escaner de camara). Solo operaciones ACTIVA.
   *
   * El sufijo se traduce a LIKE '%...', cuyo comodin inicial impide usar el
   * indice vehicles_vin_key: Postgres hace scan secuencial. Con una nave de
   * unos miles de unidades es irrelevante. Si el universo crece, la salida es
   * un indice sobre reverse(vin) o uno trigram.
   */
  async search(rawQuery: string): Promise<VehicleSearchRow[]> {
    const q = parseVinQuery(rawQuery);
    if (q.mode === 'none') return [];

    const rows = await this.prisma.vehicle.findMany({
      where: {
        vin: q.mode === 'exact' ? q.vin : { endsWith: q.vin, mode: 'insensitive' },
        operation: { status: 'ACTIVA' },
      },
      orderBy: { vin: 'asc' },
      take: 20,
      include: {
        billOfLading: { select: { blNumber: true } },
        operation: { select: { id: true, code: true, ship: { select: { name: true } } } },
      },
    });

    return rows.map((v) => {
      const block = getVehicleBlock(v.status);
      return {
        vehicleId: v.id,
        vin: v.vin,
        blNumber: v.billOfLading?.blNumber ?? null,
        shipName: v.operation.ship.name,
        operationCode: v.operation.code,
        brand: v.brand,
        model: v.model,
        containerNumber: v.containerNumber,
        blocked: block !== null,
        blockedReason: block?.label ?? null,
      };
    });
  }
```

Y declarar la interfaz de la fila arriba del `@Injectable()`, después de los imports:

```ts
export interface VehicleSearchRow {
  vehicleId: number;
  vin: string;
  blNumber: string | null;
  shipName: string;
  operationCode: string;
  brand: string | null;
  model: string | null;
  containerNumber: string | null;
  blocked: boolean;
  blockedReason: string | null;
}
```

- [ ] **Step 4: Correr el test para verificar que pasa**

```bash
cd backend && npx jest src/vehicles/vehicles.service.spec.ts
```

Esperado: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/vehicles/vehicles.service.ts backend/src/vehicles/vehicles.service.spec.ts
git commit -m "feat(vehicles): VehiclesService.search por sufijo de VIN"
```

---

### Task 5: Ruta `GET /vehicles/search` + e2e

**El orden de declaración importa.** Nest empareja rutas en orden de declaración. Si `vehicles/search` se declara después de `vehicles/:id`, la segunda captura la petición, `ParseIntPipe` recibe la cadena `"search"` y responde 400. La ruta nueva va **antes** de `vehicles/:id`.

**Files:**
- Modify: `backend/src/vehicles/vehicles.controller.ts`
- Test: `backend/test/vin-search.e2e-spec.ts` (crear)

- [ ] **Step 1: Escribir el e2e que falla**

Crear `backend/test/vin-search.e2e-spec.ts`. Usa el mismo generador de VIN válido que `phase7.e2e-spec.ts` para que los VINs pasen la validación ISO 3779, y sufijos únicos por corrida porque `vin` es único global.

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

function makeVin(serial5: string): string {
  const base = `LEFEDDE10VTP${serial5}`;
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += TRANSLITERATION[base[i]] * WEIGHTS[i];
  const r = sum % 11;
  return base.slice(0, 8) + (r === 10 ? 'X' : String(r)) + base.slice(9);
}

const RUN = Date.now().toString().slice(-8);
const SUFFIX = RUN.slice(-5);
const bump = (n: number) => String((Number(SUFFIX) + n) % 100000).padStart(5, '0');

const VIN_PENDIENTE = makeVin(SUFFIX);
const VIN_TARJADO = makeVin(bump(1));
const VIN_CERRADA = makeVin(bump(2));

describe('GET /vehicles/search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const ids: number[] = [];
  let activaId: number;
  let cerradaId: number;
  let shipId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'tarjador', password: 'tarjador123' })
      .expect(201);
    token = login.body.accessToken;

    const ship = await prisma.ship.upsert({
      where: { name: 'NAVE SEARCH E2E' },
      update: {},
      create: { name: 'NAVE SEARCH E2E' },
    });
    shipId = ship.id;

    const activa = await prisma.operation.create({
      data: { code: `SRCH-A-${RUN}`, shipId, operationType: 'ROLL_ON_ROLL_OFF', status: 'ACTIVA' },
    });
    const cerrada = await prisma.operation.create({
      data: { code: `SRCH-C-${RUN}`, shipId, operationType: 'ROLL_ON_ROLL_OFF', status: 'CERRADA' },
    });
    activaId = activa.id;
    cerradaId = cerrada.id;

    for (const [vin, operationId, status] of [
      [VIN_PENDIENTE, activaId, 'PENDIENTE'],
      [VIN_TARJADO, activaId, 'TARJADO'],
      [VIN_CERRADA, cerradaId, 'PENDIENTE'],
    ] as const) {
      const v = await prisma.vehicle.create({ data: { vin, operationId, status } });
      ids.push(v.id);
    }
  });

  afterAll(async () => {
    await prisma.vehicle.deleteMany({ where: { id: { in: ids } } });
    await prisma.operation.deleteMany({ where: { id: { in: [activaId, cerradaId] } } });
    await app.close();
  });

  const search = (q: string) =>
    request(app.getHttpServer())
      .get(`/vehicles/search?q=${encodeURIComponent(q)}`)
      .set('Authorization', `Bearer ${token}`);

  it('exige autenticacion', async () => {
    await request(app.getHttpServer()).get('/vehicles/search?q=00123').expect(401);
  });

  it('el sufijo encuentra el VIN pendiente y lo marca tarjable', async () => {
    const res = await search(VIN_PENDIENTE.slice(-5)).expect(200);
    const hit = res.body.find((r: any) => r.vin === VIN_PENDIENTE);
    expect(hit).toBeDefined();
    expect(hit.blocked).toBe(false);
    expect(hit.blockedReason).toBeNull();
    expect(hit.shipName).toBe('NAVE SEARCH E2E');
  });

  it('un VIN ya tarjado aparece bloqueado, no oculto', async () => {
    const res = await search(VIN_TARJADO.slice(-5)).expect(200);
    const hit = res.body.find((r: any) => r.vin === VIN_TARJADO);
    expect(hit).toBeDefined();
    expect(hit.blocked).toBe(true);
    expect(hit.blockedReason).toBe('Ya tarjado');
  });

  it('un VIN de operacion no ACTIVA no aparece', async () => {
    const res = await search(VIN_CERRADA.slice(-5)).expect(200);
    expect(res.body.find((r: any) => r.vin === VIN_CERRADA)).toBeUndefined();
  });

  it('17 caracteres resuelven a una fila unica (el caso del escaner)', async () => {
    const res = await search(VIN_PENDIENTE).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].vin).toBe(VIN_PENDIENTE);
  });

  it('menos de 4 caracteres devuelve lista vacia, no error', async () => {
    const res = await search('123').expect(200);
    expect(res.body).toEqual([]);
  });

  it('la ruta search no la captura vehicles/:id', async () => {
    // Si 'search' se declara despues de ':id', ParseIntPipe responde 400.
    await search('00123').expect(200);
  });
});
```

- [ ] **Step 2: Correr el e2e para verificar que falla**

```bash
docker compose up -d db
cd backend && npx jest --config ./test/jest-e2e.json test/vin-search.e2e-spec.ts
```

Esperado: FAIL — las peticiones a `/vehicles/search` responden 400 (capturadas por `vehicles/:id` + `ParseIntPipe`), no 200.

Si el login falla, revisar las credenciales del seed en `backend/prisma/` y ajustar `username`/`password` en el test.

- [ ] **Step 3: Agregar la ruta, antes de `vehicles/:id`**

En `backend/src/vehicles/vehicles.controller.ts`, insertar entre `lookup()` (termina en la línea 34) y `findOne()` (empieza en la 36):

```ts
  // Debe declararse ANTES de 'vehicles/:id': Nest empareja en orden y ':id'
  // capturaria la cadena 'search', reventando en ParseIntPipe con un 400.
  @Get('vehicles/search')
  search(@Query('q') q?: string) {
    return this.service.search(q ?? '');
  }
```

- [ ] **Step 4: Correr el e2e para verificar que pasa**

```bash
cd backend && npx jest --config ./test/jest-e2e.json test/vin-search.e2e-spec.ts
```

Esperado: PASS, 6 tests.

- [ ] **Step 5: Correr toda la suite unitaria de backend**

```bash
cd backend && npm test
```

Esperado: PASS. Nada de lo anterior debería haberse roto.

- [ ] **Step 6: Commit**

```bash
git add backend/src/vehicles/vehicles.controller.ts backend/test/vin-search.e2e-spec.ts
git commit -m "feat(vehicles): endpoint GET /vehicles/search con e2e"
```

---

### Task 6: Cliente de API del frontend

**Files:**
- Modify: `frontend/lib/api.ts:189-192` (sección vehículos) y `frontend/lib/api.ts:228-229` (`startTarja`)

- [ ] **Step 1: Agregar el tipo y la función de búsqueda**

En `frontend/lib/api.ts`, en la sección `// ---------------- vehículos ----------------` (línea 188), después de `listVehicles`:

```ts
/** Fila de GET /vehicles/search. `blocked` y `blockedReason` los calcula el backend. */
export interface VehicleSearchRow {
  vehicleId: number;
  vin: string;
  blNumber: string | null;
  shipName: string;
  operationCode: string;
  brand: string | null;
  model: string | null;
  containerNumber: string | null;
  blocked: boolean;
  blockedReason: string | null;
}

export const searchVehicles = (q: string, signal?: AbortSignal) =>
  apiGet<VehicleSearchRow[]>(`/vehicles/search?q=${encodeURIComponent(q)}`, signal);
```

- [ ] **Step 2: Hacer que `apiGet` acepte un `AbortSignal`**

El descarte de respuestas obsoletas necesita abortar el fetch anterior. Leer la definición actual de `apiGet` (está cerca de la línea 130) y agregarle el parámetro opcional. Debe quedar equivalente a:

```ts
async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return handle<T>(await fetch(`${API}${path}`, { headers: authHeaders(), signal }));
}
```

Conservar exactamente los headers y el `handle<T>` que ya usa. El parámetro es opcional: ninguna de las llamadas existentes cambia.

- [ ] **Step 3: Cambiar la firma de `startTarja`**

Reemplazar las líneas 228-229:

```ts
export const startTarja = (operationId: number, vin: string) =>
  apiJson<TarjaReport>('/tarja/start', 'POST', { operationId, vin });
```

por:

```ts
// El backend resuelve la operacion desde el VIN (unico global): no recibe operationId.
export const startTarja = (vin: string) =>
  apiJson<TarjaReport>('/tarja/start', 'POST', { vin });
```

- [ ] **Step 4: Verificar que TypeScript señala el único llamador roto**

```bash
cd frontend && npx tsc --noEmit
```

Esperado: un solo error, en `app/tarja/page.tsx`, sobre `startTarja` recibiendo 2 argumentos. Ese archivo se reescribe entero en la Task 7. **No hay commit en esta task**: el árbol no compila hasta terminar la Task 7, y no se commitea un árbol roto.

---

### Task 7: La pantalla `/tarja`

**Files:**
- Create: `frontend/lib/use-vin-search.ts`
- Rewrite: `frontend/app/tarja/page.tsx`

- [ ] **Step 1: Crear el hook de búsqueda**

Toda la lógica no trivial vive aquí, aislada de JSX para poder probarla el día que exista un runner.

Crear `frontend/lib/use-vin-search.ts`:

```ts
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { searchVehicles, type VehicleSearchRow } from '@/lib/api';

const DEBOUNCE_MS = 250;
export const MIN_QUERY = 4;

/** Mismo charset que el backend (ISO 3779, sin I/O/Q). */
const NON_VIN_CHARS = /[^A-HJ-NPR-Z0-9]/g;

export function normalizeVinQuery(raw: string): string {
  return raw.toUpperCase().replace(NON_VIN_CHARS, '');
}

export function useVinSearch() {
  const [query, setQueryRaw] = useState('');
  const [rows, setRows] = useState<VehicleSearchRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');

  // Relanzar la busqueda con el MISMO query no puede hacerse tocando `query`:
  // React descarta un setState al mismo valor y el efecto nunca corre. Este
  // contador es lo que fuerza el re-fetch tras un 409.
  const [nonce, setNonce] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const setQuery = useCallback((raw: string) => setQueryRaw(normalizeVinQuery(raw)), []);

  useEffect(() => {
    // Aborta el fetch anterior: sin esto, la respuesta de '0012' puede llegar
    // despues de la de '00123' y pintar la lista vieja sobre la nueva.
    abortRef.current?.abort();

    if (query.length < MIN_QUERY) {
      setRows([]);
      setSearching(false);
      setError('');
      return;
    }

    setSearching(true);
    setError('');

    const timer = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;

      searchVehicles(query, controller.signal)
        .then((r) => {
          setRows(r);
          setSearching(false);
        })
        .catch((e: unknown) => {
          if (e instanceof DOMException && e.name === 'AbortError') return; // reemplazada
          setRows([]);
          setSearching(false);
          setError('No se pudo buscar. Revisa la conexión.');
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, nonce]);

  /** Tras un 409, la lista debe repintarse con el estado nuevo del VIN. */
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  return { query, setQuery, rows, searching, error, refresh };
}
```

- [ ] **Step 2: Reescribir la página**

Reemplazar el contenido completo de `frontend/app/tarja/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import { Alert, Button, Label } from '@/components/ui';
import { IconArrow, IconSearch, IconShip } from '@/components/icons';
import { startTarja, type VehicleSearchRow } from '@/lib/api';
import { MIN_QUERY, useVinSearch } from '@/lib/use-vin-search';

/** Resalta el fragmento que el tarjador escribió, al final del VIN. */
function VinHighlight({ vin, query }: { vin: string; query: string }) {
  const at = vin.length - query.length;
  const matches = query.length > 0 && vin.slice(at) === query;
  if (!matches) return <span className="font-mono">{vin}</span>;
  return (
    <span className="font-mono">
      <span className="text-muted">{vin.slice(0, at)}</span>
      <span className="font-bold text-navy-900">{query}</span>
    </span>
  );
}

export default function TarjaStartPage() {
  const router = useRouter();
  const { query, setQuery, rows, searching, error: searchError, refresh } = useVinSearch();
  const [picked, setPicked] = useState<VehicleSearchRow | null>(null);
  const [startError, setStartError] = useState('');
  const [busy, setBusy] = useState(false);

  async function confirm() {
    if (!picked) return;
    setBusy(true);
    setStartError('');
    try {
      const r = await startTarja(picked.vin);
      router.push(`/tarja/${r.id}`);
    } catch (err) {
      // Carrera: otro tarjador tomó el VIN entre que se pintó la lista y este
      // click. Volvemos a la lista y la refrescamos: el VIN aparecerá en gris
      // con su motivo, que explica el fallo mejor que un error rojo.
      setStartError(err instanceof Error ? err.message : 'No se pudo iniciar la tarja');
      setPicked(null);
      setBusy(false);
      refresh();
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-2xl">
        <header className="rise deck grain relative overflow-hidden rounded-2xl border border-navy-800 px-5 py-6 text-white sm:px-6">
          <span className="deck-dots absolute inset-0" aria-hidden />
          <div className="relative">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
              Registro en campo
            </p>
            <h1 className="mt-2 font-display text-[26px] font-extrabold leading-none tracking-tight sm:text-[30px]">
              Nueva tarja<span className="text-cosco-400">.</span>
            </h1>
            <p className="mt-2.5 max-w-md text-[13px] leading-relaxed text-white/55">
              Ingresa los últimos dígitos del VIN y elige la unidad de la lista.
            </p>
          </div>
        </header>

        {picked ? (
          <section
            className="rise mt-5 overflow-hidden rounded-2xl border border-line bg-white p-4 sm:p-5"
            aria-label="Confirmar unidad"
          >
            <Label>Confirma la unidad</Label>
            <p className="mt-1 break-all font-mono text-[19px] font-bold tracking-[0.06em] text-navy-900">
              {picked.vin}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[12.5px]">
              {[
                ['BL', picked.blNumber],
                ['Nave', picked.shipName],
                ['Marca', picked.brand],
                ['Modelo', picked.model],
                ['Contenedor', picked.containerNumber],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">{k}</dt>
                  <dd className="mt-0.5 font-medium text-navy-900">{v || '—'}</dd>
                </div>
              ))}
            </dl>

            {startError && <div className="mt-4"><Alert>{startError}</Alert></div>}

            <div className="mt-5 grid gap-2.5">
              <Button full size="lg" disabled={busy} onClick={confirm}>
                {busy ? 'Iniciando…' : <>Iniciar tarja <IconArrow className="h-[18px] w-[18px]" /></>}
              </Button>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="tap ring-focus rounded-xl border border-line py-2.5 text-[13px] font-medium text-muted hover:bg-navy-50/50"
              >
                Volver a la búsqueda
              </button>
            </div>
          </section>
        ) : (
          <div className="mt-5 space-y-5">
            <section className="rise overflow-hidden rounded-2xl border border-line bg-white p-4 sm:p-5">
              <Label htmlFor="vin">VIN</Label>
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
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
                  className="field pl-11 font-mono text-[17px] font-semibold tracking-[0.06em]"
                />
                {/* Anclaje del futuro botón de escáner de cámara. */}
              </div>
              <p className="mt-3 text-[11px] leading-snug text-muted">
                {query.length < MIN_QUERY
                  ? `Ingresa al menos los últimos ${MIN_QUERY} dígitos del VIN`
                  : `${query.length} car.`}
              </p>
            </section>

            {startError && <Alert>{startError}</Alert>}
            {searchError && <Alert>{searchError}</Alert>}

            {query.length >= MIN_QUERY && searching && (
              <div className="grid gap-2.5" aria-busy>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-[68px] animate-pulse rounded-xl bg-navy-50" />
                ))}
              </div>
            )}

            {query.length >= MIN_QUERY && !searching && rows.length === 0 && !searchError && (
              <div className="rise flex items-start gap-3 rounded-2xl border border-dashed border-line bg-canvas px-4 py-5">
                <IconShip className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
                <p className="text-[12.5px] leading-relaxed text-muted">
                  Ningún VIN de las naves en operación termina en{' '}
                  <span className="font-mono font-semibold text-navy-900">{query}</span>. Verifica
                  los dígitos o avisa al supervisor.
                </p>
              </div>
            )}

            {!searching && rows.length > 0 && (
              <ul className="grid gap-2.5">
                {rows.map((r) => {
                  const meta = (
                    <span className="mt-1 flex items-center gap-2 text-[10.5px] text-muted">
                      <span className="truncate font-mono">{r.blNumber ?? 'sin BL'}</span>
                      <span className="shrink-0">·</span>
                      <span className="truncate">{r.shipName}</span>
                    </span>
                  );

                  if (r.blocked) {
                    return (
                      <li
                        key={r.vehicleId}
                        aria-disabled
                        className="flex items-center gap-3.5 rounded-xl border border-line bg-white p-3.5 opacity-55"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] tracking-tight">
                            <VinHighlight vin={r.vin} query={query} />
                          </span>
                          {meta}
                        </span>
                        <span className="shrink-0 rounded border border-line px-2 py-1 text-[9.5px] font-medium uppercase tracking-[0.08em] text-muted">
                          {r.blockedReason}
                        </span>
                      </li>
                    );
                  }

                  return (
                    <li key={r.vehicleId}>
                      <button
                        type="button"
                        onClick={() => { setStartError(''); setPicked(r); }}
                        className="tap ring-focus flex w-full items-center gap-3.5 rounded-xl border border-line bg-white p-3.5 text-left transition-all duration-150 hover:border-navy-200 hover:bg-navy-50/50 active:scale-[0.985]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] tracking-tight">
                            <VinHighlight vin={r.vin} query={query} />
                          </span>
                          {meta}
                        </span>
                        <IconArrow className="h-[18px] w-[18px] shrink-0 text-muted" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
```

- [ ] **Step 3: Verificar que compila**

```bash
cd frontend && npx tsc --noEmit && npm run lint
```

Esperado: sin errores. Si `Button` no acepta `onClick` (hoy se usa dentro de un `<form>`), revisar su firma en `frontend/components/ui.tsx:27` y, si hace falta, envolver la tarjeta de confirmación en un `<form onSubmit={...}>` en vez de usar `onClick`.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api.ts frontend/lib/use-vin-search.ts frontend/app/tarja/page.tsx
git commit -m "feat(tarja): busqueda de VIN por sufijo reemplaza el selector de operacion"
```

---

### Task 8: Verificación end-to-end de la app real

Los tests no pueden ver el estado vacío ni el resaltado del sufijo. Esto sí.

- [ ] **Step 1: Levantar el stack**

```bash
docker compose up -d
```

- [ ] **Step 2: Sembrar datos si hace falta**

Necesitas una operación `ACTIVA` con al menos dos vehículos que compartan sufijo, uno `PENDIENTE` y uno `TARJADO`. Si el seed no los da, crearlos con Prisma Studio (`cd backend && npx prisma studio`) o importando un Excel desde la UI de supervisor.

- [ ] **Step 3: Recorrer el flujo en el navegador, como tarjador**

Abrir `http://localhost:3001/tarja` e ir comprobando:

1. **No hay selector de operación.** El campo de VIN está enfocado al cargar.
2. Con 1–3 caracteres: sale *"Ingresa al menos los últimos 4 dígitos del VIN"*, sin peticiones al servidor (verificar en la pestaña Network).
3. Con 4+: aparece el esqueleto, luego la lista. El sufijo escrito está **en negrita** dentro de cada VIN.
4. El VIN `TARJADO` sale **en gris**, no clickeable, con la insignia "Ya tarjado".
5. El VIN `PENDIENTE` es clickeable → tarjeta con VIN, BL, nave, marca, modelo, contenedor.
6. "Volver a la búsqueda" regresa a la lista sin perder el query.
7. "Iniciar tarja" navega a `/tarja/<id>`.
8. Escribir un sufijo inexistente: sale el mensaje que **nombra el fragmento buscado**.
9. Escribir rápido `0`,`00`,`001`,`0012`,`00123`: en Network debe verse **una sola** petición (debounce), y la lista final corresponde a `00123`.
10. Pegar un VIN completo de 17 caracteres: la lista trae **una sola fila**.

- [ ] **Step 4: Probar la carrera del 409**

Con la tarjeta de confirmación abierta para un VIN `PENDIENTE`, cambiar su `status` a `TARJADO` desde Prisma Studio, y **entonces** pulsar "Iniciar tarja".

Esperado: no navega; vuelve a la lista; el VIN aparece ahora en gris con "Ya tarjado"; el mensaje del backend se muestra en el `Alert`.

- [ ] **Step 5: Correr toda la suite una última vez**

```bash
cd backend && npm test && npx jest --config ./test/jest-e2e.json
```

Esperado: PASS. Pegar la salida real al reportar; no afirmar que pasa sin haberlo visto.

- [ ] **Step 6: Commit de cierre si hubo ajustes**

```bash
git add -A
git commit -m "fix(tarja): ajustes de la verificacion manual de busqueda de VIN"
```

---

## Fuera de alcance (del spec, repetido aquí para el implementador)

- El escáner de cámara. Solo se deja el punto de anclaje en el JSX. Sigue bloqueado por una pregunta de campo, no de código: cuál es la simbología de la etiqueta VIN real.
- El índice para acelerar `LIKE '%...'`.
- La búsqueda por `chassisNumber`. La etiqueta del input pasa de "VIN / Chasis" a "VIN" porque el backend nunca aceptó un chasis.
- El botón "Reportar VIN no encontrado". **Consecuencia conocida:** el aviso `vin.unknown` al supervisor deja de dispararse en la práctica, porque el tarjador ya no llega a `start()` con un VIN inexistente.
- El menú `/tarja/nueva` + `/tarja/consolidado`. Cuando se implemente, `app/tarja/page.tsx` es el archivo que se moverá a `app/tarja/nueva/page.tsx`.
