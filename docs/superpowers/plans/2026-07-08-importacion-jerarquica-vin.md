# Importación jerárquica Nave→Operación→BL→VIN — Plan de implementación (backend)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convertir el sistema al modelo real de operación portuaria: VIN y BL únicos globales, importador por tipo de operación, correlativo de tarja continuo, y VIN desconocido bloqueado + registrado en bitácora.

**Architecture:** Prisma/Postgres con `Ship` como tabla, unicidad global en `vin` y `bl_number`. Los importadores de Excel son clases en código seleccionadas por `OperationType` (strategy + registry), no configuración en DB. El correlativo de tarja usa una secuencia de Postgres. El lookup de VIN es global y sin scope de operación: el VIN resuelve su propia nave/operación/BL.

**Tech Stack:** NestJS 11, Prisma 6, PostgreSQL, ExcelJS, Jest (unit `npm test`, e2e `npm run test:e2e`).

**Fuera de alcance:** frontend (plan aparte), OCR (plan aparte), exportación XLSX (descartada: el Excel es solo entrada).

---

## Decisiones fijadas (no relitigar durante la ejecución)

| Tema | Decisión |
|---|---|
| Unicidad | `vin` y `bl_number` únicos **globales** |
| Lookup | Por VIN, **sin** `operationId` |
| VIN desconocido | **Bloquea** al tarjador. Se registra en `audit_logs` y se emite por websocket |
| `VehicleStatus` | Sin cambios. `NO_PLANIFICADO`/`isUnplanned` pasan a describir el vehículo que el **supervisor** da de alta al regularizar |
| `OperationStatus` | Sin cambios (`ACTIVA/PAUSADA/CERRADA`) |
| Excel | Solo entrada. Sin exportación |
| VIN == chasis | Sí. `chassisNumber` se mantiene en la tabla |
| Carga de Excel | `ADMIN` **y** `SUPERVISOR` |
| Código de tarja | Correlativo continuo, 6 dígitos, nunca reinicia |
| Campos nuevos en `vehicles` | **Solo** `container_number` y `model` |
| Reimportación | Aditiva: agrega nuevos, omite existentes, rechaza BL de otra operación |
| Corregir VIN errado | Borrado manual de vehículo en `PENDIENTE` |
| `import_templates` | No se crea |

### Decisión tomada por el implementador (marcada explícitamente)

**Validación de VIN en importación = advertencia, no bloqueo.** Verificado sobre el archivo real: los 195 VINs de `CFS-Unstuffing - COSU6502185840.xlsx` cumplen longitud 17, charset ISO 3779 y dígito verificador. Aun así, un VIN que falle el check digit se importa igual y se marca como `warning`. Razón: el dato de origen es autoritativo y rechazar un vehículo físico real por un dígito sería peor que registrarlo con una advertencia. La validación **estricta** se usará en el OCR (plan aparte), donde sí sirve para descartar lecturas erróneas.

---

## Estructura de archivos

**Crear:**
- `backend/src/common/vin.util.ts` — normalización, charset y dígito verificador ISO 3779
- `backend/src/common/vin.util.spec.ts`
- `backend/src/imports/importers/types.ts` — `ImportedRow`, `VehicleImporter`
- `backend/src/imports/importers/header.util.ts` — normalización de encabezados
- `backend/src/imports/importers/header.util.spec.ts`
- `backend/src/imports/importers/base.importer.ts` — localizar fila de encabezado, mapear columnas, iterar filas
- `backend/src/imports/importers/desconsolidado.importer.ts`
- `backend/src/imports/importers/desconsolidado.importer.spec.ts`
- `backend/src/imports/importers/roro.importer.ts` — lógica actual extraída
- `backend/src/imports/importers/roro.importer.spec.ts`
- `backend/src/imports/importers/importer.registry.ts`
- `backend/src/ships/ships.service.ts`, `ships.controller.ts`, `ships.module.ts`
- `backend/src/tarja/report-code.service.ts`
- `backend/test/phase7.e2e-spec.ts`

**Modificar:**
- `backend/prisma/schema.prisma`
- `backend/src/imports/imports.service.ts` — deja de parsear; orquesta registry + persistencia
- `backend/src/imports/imports.controller.ts` — `@Roles('ADMIN','SUPERVISOR')`
- `backend/src/imports/imports.module.ts`
- `backend/src/operations/operations.service.ts` — resuelve/crea `Ship`
- `backend/src/vehicles/vehicles.service.ts` + `.controller.ts` — `lookup`, `remove`, `containers`
- `backend/src/tarja/tarja.service.ts` — bloqueo de VIN desconocido + correlativo
- `backend/src/tarja/dto/tarja.dto.ts` — `StartTarjaDto` sin `operationId`
- `backend/src/app.module.ts` — registra `ShipsModule`
- `backend/test/phase2.e2e-spec.ts`, `phase3.e2e-spec.ts`, `phase4.e2e-spec.ts`

---

## Fase A — Modelo de datos

### Task A1: Tabla `ships` y unicidad global

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_ships_global_unique/migration.sql` (generada)

- [ ] **Step 1: Añadir el modelo `Ship` y ajustar `Operation`**

En `schema.prisma`, agregar:

```prisma
model Ship {
  id         Int         @id @default(autoincrement())
  name       String      @unique
  status     String      @default("ACTIVE")
  operations Operation[]
  createdAt  DateTime    @default(now()) @map("created_at")
  updatedAt  DateTime    @updatedAt @map("updated_at")

  @@map("ships")
}
```

En `model Operation`, reemplazar la línea `shipName String @map("ship_name")` por:

```prisma
  shipId        Int             @map("ship_id")
  ship          Ship            @relation(fields: [shipId], references: [id])
```

- [ ] **Step 2: Unicidad global de BL y VIN, y campos nuevos**

En `model BillOfLading`, cambiar `blNumber String @map("bl_number")` por:

```prisma
  blNumber      String        @unique @map("bl_number")
```

**eliminar** la línea `@@unique([operationId, blNumber])`, y **añadir**:

```prisma
  @@index([operationId])
```

> Sin ese índice, `operation_id` se queda sin cobertura al dropear el unique compuesto, y el `_count: { bills: true }` de `operations.service.ts` degrada a sequential scan.

En `model Vehicle`, cambiar `vin String` por:

```prisma
  vin             String        @unique
  containerNumber String?       @map("container_number")
  model           String?
```

y **eliminar** la línea `@@unique([operationId, vin])`. Conservar `@@index([operationId])` y añadir:

```prisma
  @@index([containerNumber])
```

- [ ] **Step 3: Generar la migración**

Run: `npx prisma migrate dev --create-only --name ships_global_unique`
Expected: crea `prisma/migrations/<ts>_ships_global_unique/migration.sql`. No aplicarla todavía.

- [ ] **Step 4: Editar la migración a mano para preservar datos**

Prisma genera un `DROP COLUMN ship_name` que perdería las naves existentes. Reemplazar el SQL generado por:

```sql
-- 1. Tabla ships
CREATE TABLE "ships" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ships_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ships_name_key" ON "ships"("name");

-- 2. Backfill desde operations.ship_name, normalizado a MAYUSCULAS.
--    Sin UPPER(), "Guang He Kou" y "GUANG HE KOU" crearian dos naves distintas.
INSERT INTO "ships" ("name", "updated_at")
SELECT DISTINCT UPPER(TRIM("ship_name")), CURRENT_TIMESTAMP
FROM "operations"
WHERE "ship_name" IS NOT NULL AND TRIM("ship_name") <> '';

-- 3. FK en operations
ALTER TABLE "operations" ADD COLUMN "ship_id" INTEGER;
UPDATE "operations" o SET "ship_id" = s."id"
FROM "ships" s WHERE s."name" = UPPER(TRIM(o."ship_name"));
ALTER TABLE "operations" ALTER COLUMN "ship_id" SET NOT NULL;
ALTER TABLE "operations" DROP COLUMN "ship_name";
ALTER TABLE "operations" ADD CONSTRAINT "operations_ship_id_fkey"
    FOREIGN KEY ("ship_id") REFERENCES "ships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Unicidad global
DROP INDEX IF EXISTS "bills_of_lading_operation_id_bl_number_key";
CREATE UNIQUE INDEX "bills_of_lading_bl_number_key" ON "bills_of_lading"("bl_number");
-- operation_id perdio su indice al dropear el unique compuesto; se restituye.
CREATE INDEX "bills_of_lading_operation_id_idx" ON "bills_of_lading"("operation_id");
DROP INDEX IF EXISTS "vehicles_operation_id_vin_key";
CREATE UNIQUE INDEX "vehicles_vin_key" ON "vehicles"("vin");

-- 5. Campos nuevos
ALTER TABLE "vehicles" ADD COLUMN "container_number" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "model" TEXT;
CREATE INDEX "vehicles_container_number_idx" ON "vehicles"("container_number");
```

> Si la base de datos de desarrollo ya tiene VINs o BLs duplicados entre operaciones, los pasos 4 fallarán. Limpiar antes con `npx prisma migrate reset` (borra todo y re-siembra) — es un entorno de desarrollo.

- [ ] **Step 5: Aplicar y regenerar el cliente**

Run: `npx prisma migrate dev && npx prisma generate`
Expected: `Your database is now in sync with your schema.`

- [ ] **Step 6: Commit**

```bash
git add backend/prisma
git commit -m "feat(db): tabla ships, unicidad global de vin/bl, container_number y model"
```

---

### Task A2: Secuencia del correlativo de tarja

**Files:**
- Create: `backend/prisma/migrations/<timestamp>_tarja_report_code_seq/migration.sql`

- [ ] **Step 1: Crear la migración vacía**

Run: `npx prisma migrate dev --create-only --name tarja_report_code_seq`

- [ ] **Step 2: Escribir el SQL**

```sql
CREATE SEQUENCE "tarja_report_code_seq" START WITH 1 INCREMENT BY 1 NO CYCLE;
```

> El número de arranque real (continuación de las tarjas físicas) aún no fue definido por el cliente. Cuando lo entregue, se crea **una migración nueva** con `ALTER SEQUENCE "tarja_report_code_seq" RESTART WITH <N>;` y nada más. No se toca código.
>
> `nextval()` consume el número aunque la transacción haga rollback. Eso produce huecos en la numeración. Es el comportamiento correcto y coincide con los talonarios físicos.

- [ ] **Step 3: Aplicar**

Run: `npx prisma migrate dev`
Expected: migración aplicada sin error.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/migrations
git commit -m "feat(db): secuencia para el correlativo de tarja"
```

---

## Fase B — Validación de VIN

### Task B1: `vin.util.ts`

**Files:**
- Create: `backend/src/common/vin.util.ts`
- Test: `backend/src/common/vin.util.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

`backend/src/common/vin.util.spec.ts`:

```ts
import { normalizeVin, hasValidVinFormat, hasValidCheckDigit, validateVin } from './vin.util';

describe('vin.util', () => {
  const REAL_VIN = 'LEFEDDE15VTP04723'; // del Excel de desconsolidado
  const PHOTO_VIN = 'LVTDB11B2VD024641'; // de la etiqueta Chery T1D

  describe('normalizeVin', () => {
    it('pasa a mayusculas y elimina separadores', () => {
      expect(normalizeVin(' lefedde15vtp04723 ')).toBe(REAL_VIN);
      expect(normalizeVin('LEFEDDE15-VTP 04723')).toBe(REAL_VIN);
    });
  });

  describe('hasValidVinFormat', () => {
    it('acepta 17 caracteres del charset ISO 3779', () => {
      expect(hasValidVinFormat(REAL_VIN)).toBe(true);
      expect(hasValidVinFormat(PHOTO_VIN)).toBe(true);
    });
    it('rechaza longitud distinta de 17', () => {
      expect(hasValidVinFormat('LEFEDDE15VTP0472')).toBe(false);
      expect(hasValidVinFormat('LEFEDDE15VTP047233')).toBe(false);
    });
    it('rechaza las letras I, O y Q', () => {
      expect(hasValidVinFormat('IEFEDDE15VTP04723')).toBe(false);
      expect(hasValidVinFormat('OEFEDDE15VTP04723')).toBe(false);
      expect(hasValidVinFormat('QEFEDDE15VTP04723')).toBe(false);
    });
  });

  describe('hasValidCheckDigit', () => {
    it('acepta VINs reales', () => {
      expect(hasValidCheckDigit(REAL_VIN)).toBe(true);
      expect(hasValidCheckDigit(PHOTO_VIN)).toBe(true);
    });
    it('rechaza un VIN con un caracter alterado', () => {
      expect(hasValidCheckDigit('LEFEDDE15VTP04724')).toBe(false);
    });
    it('no explota con formato invalido', () => {
      expect(hasValidCheckDigit('CORTO')).toBe(false);
    });
  });

  describe('validateVin', () => {
    it('devuelve el VIN normalizado y ambos flags', () => {
      expect(validateVin(' lefedde15vtp04723 ')).toEqual({
        vin: REAL_VIN,
        formatOk: true,
        checkDigitOk: true,
      });
    });
    it('marca checkDigitOk=false sin marcar formatOk=false', () => {
      expect(validateVin('LEFEDDE15VTP04724')).toEqual({
        vin: 'LEFEDDE15VTP04724',
        formatOk: true,
        checkDigitOk: false,
      });
    });
  });
});
```

- [ ] **Step 2: Correr el test para verificar que falla**

Run: `cd backend && npx jest src/common/vin.util.spec.ts`
Expected: FAIL — `Cannot find module './vin.util'`

- [ ] **Step 3: Implementar**

`backend/src/common/vin.util.ts`:

```ts
/**
 * Utilidades de VIN segun ISO 3779.
 * El charset excluye I, O y Q para evitar confusion con 1 y 0.
 */
const VIN_LENGTH = 17;
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4,
  '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
};

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

export interface VinValidation {
  vin: string;
  formatOk: boolean;
  checkDigitOk: boolean;
}

/** Mayusculas, sin espacios ni guiones. No corrige confusiones O/0. */
export function normalizeVin(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hasValidVinFormat(vin: string): boolean {
  return VIN_PATTERN.test(vin);
}

/** Digito verificador en la posicion 9 (indice 8). */
export function hasValidCheckDigit(vin: string): boolean {
  if (!hasValidVinFormat(vin)) return false;
  let sum = 0;
  for (let i = 0; i < VIN_LENGTH; i++) {
    sum += TRANSLITERATION[vin[i]] * WEIGHTS[i];
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);
  return vin[8] === expected;
}

export function validateVin(raw: string): VinValidation {
  const vin = normalizeVin(raw);
  const formatOk = hasValidVinFormat(vin);
  return { vin, formatOk, checkDigitOk: formatOk && hasValidCheckDigit(vin) };
}
```

- [ ] **Step 4: Correr el test**

Run: `cd backend && npx jest src/common/vin.util.spec.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/common/vin.util.ts backend/src/common/vin.util.spec.ts
git commit -m "feat(vin): validacion de formato y digito verificador ISO 3779"
```

---

## Fase C — Importadores

### Task C1: Normalización de encabezados

**Files:**
- Create: `backend/src/imports/importers/header.util.ts`
- Test: `backend/src/imports/importers/header.util.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

```ts
import { normalizeHeader } from './header.util';

describe('normalizeHeader', () => {
  it('colapsa el salto de linea del encabezado real del Excel', () => {
    expect(normalizeHeader('Part number/\nchassis number')).toBe('part number/chassis number');
  });
  it('normaliza los espacios alrededor de la barra', () => {
    expect(normalizeHeader('B/L number')).toBe('b/l number');
    expect(normalizeHeader('B / L  number')).toBe('b/l number');
  });
  it('quita acentos y espacios sobrantes', () => {
    expect(normalizeHeader('  Número  de Piezas ')).toBe('numero de piezas');
  });
  it('tolera valores vacios', () => {
    expect(normalizeHeader('')).toBe('');
  });
});
```

- [ ] **Step 2: Correr el test**

Run: `cd backend && npx jest src/imports/importers/header.util.spec.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
/**
 * Normaliza un encabezado de Excel para compararlo con una clave fija.
 * El Excel de desconsolidado trae 'Part number/\nchassis number' con salto de linea.
 */
export function normalizeHeader(text: string): string {
  return (text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .trim()
    .toLowerCase();
}
```

- [ ] **Step 4: Correr el test**

Run: `cd backend && npx jest src/imports/importers/header.util.spec.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/imports/importers/header.util.ts backend/src/imports/importers/header.util.spec.ts
git commit -m "feat(imports): normalizacion de encabezados de Excel"
```

---

### Task C2: Contratos y clase base

**Files:**
- Create: `backend/src/imports/importers/types.ts`
- Create: `backend/src/imports/importers/base.importer.ts`

- [ ] **Step 1: Definir los tipos**

`backend/src/imports/importers/types.ts`:

```ts
import { OperationType } from '@prisma/client';

/** Una fila del Excel ya mapeada al vocabulario del sistema. */
export interface ImportedRow {
  rowNumber: number;
  vin: string;
  bl: string;
  containerNumber: string | null;
  brand: string | null;
  model: string | null;
  weight: number | null;
  quantity: number;
  /** Bloquean la importacion de la fila. */
  errors: string[];
  /** No bloquean. Ej: digito verificador invalido. */
  warnings: string[];
}

export interface VehicleImporter {
  readonly operationType: OperationType;
  parse(buffer: Buffer): Promise<ImportedRow[]>;
}

/** Clave normalizada del encabezado -> campo destino. */
export type ColumnMap = Record<string, keyof ImportedRow>;
```

- [ ] **Step 2: Implementar la clase base**

`backend/src/imports/importers/base.importer.ts`:

```ts
import { BadRequestException } from '@nestjs/common';
import { Workbook, Worksheet } from 'exceljs';
import { validateVin } from '../../common/vin.util';
import { normalizeHeader } from './header.util';
import { ColumnMap, ImportedRow } from './types';

const HEADER_SCAN_ROWS = 10;

export abstract class BaseImporter {
  /** Encabezado normalizado -> campo. */
  protected abstract readonly columns: ColumnMap;
  /** Encabezado normalizado que identifica la fila de cabecera. */
  protected abstract readonly anchorHeader: string;
  /** Nombre legible para los mensajes de error. */
  protected abstract readonly formatName: string;

  async parse(buffer: Buffer): Promise<ImportedRow[]> {
    const ws = await this.loadSheet(buffer);
    const headerRow = this.findHeaderRow(ws);
    const colMap = this.mapColumns(ws, headerRow);
    return this.readRows(ws, headerRow, colMap);
  }

  private async loadSheet(buffer: Buffer): Promise<Worksheet> {
    const wb = new Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('No se pudo leer el archivo Excel');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('El Excel no tiene hojas');
    return ws;
  }

  private findHeaderRow(ws: Worksheet): number {
    const max = Math.min(HEADER_SCAN_ROWS, ws.rowCount);
    for (let r = 1; r <= max; r++) {
      const headers: string[] = [];
      ws.getRow(r).eachCell((cell) => headers.push(normalizeHeader(String(cell.text ?? ''))));
      if (headers.includes(this.anchorHeader)) return r;
    }
    throw new BadRequestException(
      `El archivo no corresponde al formato ${this.formatName}: falta la columna "${this.anchorHeader}"`,
    );
  }

  private mapColumns(ws: Worksheet, headerRow: number): Map<number, keyof ImportedRow> {
    const map = new Map<number, keyof ImportedRow>();
    ws.getRow(headerRow).eachCell((cell, colNumber) => {
      const field = this.columns[normalizeHeader(String(cell.text ?? ''))];
      if (field) map.set(colNumber, field);
    });
    return map;
  }

  private readRows(
    ws: Worksheet,
    headerRow: number,
    colMap: Map<number, keyof ImportedRow>,
  ): ImportedRow[] {
    const rows: ImportedRow[] = [];
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const excelRow = ws.getRow(r);
      const raw: Partial<Record<keyof ImportedRow, string>> = {};
      let hasAny = false;
      colMap.forEach((field, colNumber) => {
        const value = String(excelRow.getCell(colNumber).text ?? '').trim();
        if (value) hasAny = true;
        raw[field] = value;
      });
      if (!hasAny) continue;
      rows.push(this.buildRow(r, raw));
    }
    return rows;
  }

  private buildRow(
    rowNumber: number,
    raw: Partial<Record<keyof ImportedRow, string>>,
  ): ImportedRow {
    const errors: string[] = [];
    const warnings: string[] = [];

    const { vin, formatOk, checkDigitOk } = validateVin(raw.vin ?? '');
    if (!vin) errors.push('VIN vacio');
    else if (!formatOk) warnings.push('VIN no cumple el formato ISO 3779 (17 caracteres, sin I/O/Q)');
    else if (!checkDigitOk) warnings.push('Digito verificador del VIN invalido');

    const bl = (raw.bl ?? '').trim();
    if (!bl) errors.push('BL vacio');

    let quantity = 1;
    if (raw.quantity) {
      const q = Number(raw.quantity.replace(',', '.'));
      if (Number.isFinite(q) && q > 0) quantity = Math.trunc(q);
      else errors.push('Cantidad invalida');
    }

    let weight: number | null = null;
    if (raw.weight) {
      const w = Number(raw.weight.replace(',', '.'));
      if (Number.isFinite(w)) weight = w;
      else errors.push('Peso invalido');
    }

    return {
      rowNumber,
      vin,
      bl,
      containerNumber: raw.containerNumber?.trim() || null,
      brand: raw.brand?.trim() || null,
      model: raw.model?.trim() || null,
      weight,
      quantity,
      errors,
      warnings,
    };
  }
}
```

- [ ] **Step 3: Verificar que compila**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/src/imports/importers/types.ts backend/src/imports/importers/base.importer.ts
git commit -m "feat(imports): contrato VehicleImporter y clase base"
```

---

### Task C3: Importador de desconsolidado

**Files:**
- Create: `backend/src/imports/importers/desconsolidado.importer.ts`
- Test: `backend/src/imports/importers/desconsolidado.importer.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

Reproduce los encabezados **exactos** del archivo real, incluido el `\n`:

```ts
import { Workbook } from 'exceljs';
import { DesconsolidadoImporter } from './desconsolidado.importer';

const HEADERS = [
  'Commission number', 'Container number', 'B/L number', 'Goods name',
  'Number of pieces', 'Weight(kg)', 'Volume(M3)', 'Cargo code', 'Package',
  'Mark', 'Cargo space', 'Operation time', 'Staff', 'license plate number',
  'Part number/\nchassis number', 'brand', 'model', 'damaged', 'Remark',
];

function row(vin: string, container = 'FCIU9513895', bl = 'COSU6502185840 ') {
  return ['', container, bl, 'GENERAL CARGO', '1', '1920', '0', 'C01', 'VEI',
    '', '', '', '', '', vin, 'JMC', 'Grand Vigus', '', ''];
}

async function makeExcel(rows: string[][]): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(HEADERS);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('DesconsolidadoImporter', () => {
  const importer = new DesconsolidadoImporter();

  it('lee el VIN de "Part number/\\nchassis number"', async () => {
    const rows = await importer.parse(await makeExcel([row('LEFEDDE15VTP04723')]));
    expect(rows).toHaveLength(1);
    expect(rows[0].vin).toBe('LEFEDDE15VTP04723');
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].warnings).toEqual([]);
  });

  it('hace trim del BL, que en el archivo real trae un espacio final', async () => {
    const rows = await importer.parse(await makeExcel([row('LEFEDDE15VTP04723')]));
    expect(rows[0].bl).toBe('COSU6502185840');
  });

  it('mapea contenedor, marca, modelo, peso y cantidad', async () => {
    const rows = await importer.parse(await makeExcel([row('LEFEDDE15VTP04723')]));
    expect(rows[0]).toMatchObject({
      containerNumber: 'FCIU9513895',
      brand: 'JMC',
      model: 'Grand Vigus',
      weight: 1920,
      quantity: 1,
    });
  });

  it('advierte (sin error) cuando el digito verificador falla', async () => {
    const rows = await importer.parse(await makeExcel([row('LEFEDDE15VTP04724')]));
    expect(rows[0].errors).toEqual([]);
    expect(rows[0].warnings).toContain('Digito verificador del VIN invalido');
  });

  it('marca error cuando el VIN esta vacio', async () => {
    const rows = await importer.parse(await makeExcel([row('')]));
    expect(rows[0].errors).toContain('VIN vacio');
  });

  it('ignora las filas totalmente vacias', async () => {
    const rows = await importer.parse(await makeExcel([row('LEFEDDE15VTP04723'), []]));
    expect(rows).toHaveLength(1);
  });

  it('rechaza un Excel que no tiene la columna de chasis', async () => {
    const wb = new Workbook();
    wb.addWorksheet('Sheet1').addRow(['Nave', 'VIN', 'BL']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(importer.parse(buf)).rejects.toThrow(/formato Desconsolidado/);
  });
});
```

- [ ] **Step 2: Correr el test**

Run: `cd backend && npx jest src/imports/importers/desconsolidado.importer.spec.ts`
Expected: FAIL — módulo inexistente.

- [ ] **Step 3: Implementar**

```ts
import { Injectable } from '@nestjs/common';
import { OperationType } from '@prisma/client';
import { BaseImporter } from './base.importer';
import { ColumnMap, VehicleImporter } from './types';

@Injectable()
export class DesconsolidadoImporter extends BaseImporter implements VehicleImporter {
  readonly operationType = OperationType.DESCONSOLIDADO;
  protected readonly formatName = 'Desconsolidado';
  protected readonly anchorHeader = 'part number/chassis number';
  protected readonly columns: ColumnMap = {
    'part number/chassis number': 'vin',
    'b/l number': 'bl',
    'container number': 'containerNumber',
    brand: 'brand',
    model: 'model',
    'weight(kg)': 'weight',
    'number of pieces': 'quantity',
  };
}
```

- [ ] **Step 4: Correr el test**

Run: `cd backend && npx jest src/imports/importers/desconsolidado.importer.spec.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Verificar contra el archivo real**

Run:
```bash
cd backend && npx ts-node -e "
const { DesconsolidadoImporter } = require('./src/imports/importers/desconsolidado.importer');
const fs = require('fs');
new DesconsolidadoImporter()
  .parse(fs.readFileSync('../CFS-Unstuffing - COSU6502185840.xlsx'))
  .then(r => console.log({
    filas: r.length,
    conError: r.filter(x => x.errors.length).length,
    conWarning: r.filter(x => x.warnings.length).length,
    bls: new Set(r.map(x => x.bl)).size,
    contenedores: new Set(r.map(x => x.containerNumber)).size,
  }));
"
```
Expected exactamente: `{ filas: 195, conError: 0, conWarning: 0, bls: 1, contenedores: 65 }`

> Si algún número difiere, el importador está mal. No continuar.

- [ ] **Step 6: Commit**

```bash
git add backend/src/imports/importers/desconsolidado.importer.ts backend/src/imports/importers/desconsolidado.importer.spec.ts
git commit -m "feat(imports): importador de desconsolidado"
```

---

### Task C4: Importador RORO (extrae la lógica actual)

**Files:**
- Create: `backend/src/imports/importers/roro.importer.ts`
- Test: `backend/src/imports/importers/roro.importer.spec.ts`

> El formato que hoy soporta `imports.service.ts` (`Nave / VIN / BL / Cantidad / Marca / Peso / ...`) no corresponde a ningún archivo real entregado. Se conserva como importador RORO para no romper los e2e existentes, hasta que el cliente entregue un Excel RORO real.

- [ ] **Step 1: Escribir el test que falla**

```ts
import { Workbook } from 'exceljs';
import { RoroImporter } from './roro.importer';

async function makeExcel(): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow(['Nave', 'VIN', 'BL', 'Cantidad', 'Marca', 'Modelo', 'Peso']);
  ws.addRow(['NAVE T3', 'LEFEDDE15VTP04723', 'BL-T3', 1, 'JMC', 'Grand Vigus', 1500]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('RoroImporter', () => {
  it('mapea el formato legado', async () => {
    const rows = await new RoroImporter().parse(await makeExcel());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      vin: 'LEFEDDE15VTP04723',
      bl: 'BL-T3',
      brand: 'JMC',
      model: 'Grand Vigus',
      weight: 1500,
      quantity: 1,
      containerNumber: null,
    });
    expect(rows[0].errors).toEqual([]);
  });

  it('rechaza un Excel sin columna VIN', async () => {
    const wb = new Workbook();
    wb.addWorksheet('H').addRow(['Container number', 'B/L number']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(new RoroImporter().parse(buf)).rejects.toThrow(/formato RORO/);
  });
});
```

- [ ] **Step 2: Correr el test**

Run: `cd backend && npx jest src/imports/importers/roro.importer.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

```ts
import { Injectable } from '@nestjs/common';
import { OperationType } from '@prisma/client';
import { BaseImporter } from './base.importer';
import { ColumnMap, VehicleImporter } from './types';

@Injectable()
export class RoroImporter extends BaseImporter implements VehicleImporter {
  readonly operationType = OperationType.ROLL_ON_ROLL_OFF;
  protected readonly formatName = 'RORO';
  protected readonly anchorHeader = 'vin';
  protected readonly columns: ColumnMap = {
    vin: 'vin',
    bl: 'bl',
    marca: 'brand',
    modelo: 'model',
    peso: 'weight',
    cantidad: 'quantity',
  };
}
```

> `Nave`, `Puerto embarque` y `Puerto descarga` **dejan de leerse del Excel**: ahora vienen del formulario de creación de operación.

- [ ] **Step 4: Correr el test**

Run: `cd backend && npx jest src/imports/importers/roro.importer.spec.ts`
Expected: PASS, 2 tests.

- [ ] **Step 5: Commit**

```bash
git add backend/src/imports/importers/roro.importer.ts backend/src/imports/importers/roro.importer.spec.ts
git commit -m "feat(imports): importador RORO extraido a su propia clase"
```

---

### Task C5: Registry

**Files:**
- Create: `backend/src/imports/importers/importer.registry.ts`
- Modify: `backend/src/imports/imports.module.ts`

- [ ] **Step 1: Implementar el registry**

```ts
import { BadRequestException, Injectable } from '@nestjs/common';
import { OperationType } from '@prisma/client';
import { DesconsolidadoImporter } from './desconsolidado.importer';
import { RoroImporter } from './roro.importer';
import { VehicleImporter } from './types';

@Injectable()
export class ImporterRegistry {
  private readonly importers: VehicleImporter[];

  constructor(roro: RoroImporter, desconsolidado: DesconsolidadoImporter) {
    this.importers = [roro, desconsolidado];
  }

  get(operationType: OperationType): VehicleImporter {
    const importer = this.importers.find((i) => i.operationType === operationType);
    if (!importer) {
      throw new BadRequestException(`No hay importador para el tipo ${operationType}`);
    }
    return importer;
  }
}
```

- [ ] **Step 2: Registrar los providers**

En `backend/src/imports/imports.module.ts`, añadir a `providers`:

```ts
providers: [ImportsService, ImporterRegistry, RoroImporter, DesconsolidadoImporter],
```

con sus imports correspondientes.

- [ ] **Step 3: Verificar que compila**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/src/imports/importers/importer.registry.ts backend/src/imports/imports.module.ts
git commit -m "feat(imports): registry de importadores por tipo de operacion"
```

---

### Task C6: `ImportsService` orquesta, no parsea

**Files:**
- Modify: `backend/src/imports/imports.service.ts` (reescritura completa)
- Modify: `backend/src/imports/imports.controller.ts:23`

- [ ] **Step 1: Ampliar los roles del controller**

En `backend/src/imports/imports.controller.ts`, cambiar:

```ts
@Roles('ADMIN')
```

por:

```ts
@Roles('ADMIN', 'SUPERVISOR')
```

- [ ] **Step 2: Reescribir el servicio**

`backend/src/imports/imports.service.ts` completo:

```ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ImporterRegistry } from './importers/importer.registry';
import { ImportedRow } from './importers/types';

export interface ImportSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rowsWithWarnings: number;
  newVehicles: number;
  existingVehicles: number;
  conflictingVehicles: number;
  blsDetected: number;
}

interface Classification {
  valid: ImportedRow[];
  fresh: ImportedRow[];
  existing: ImportedRow[];
  conflicting: ImportedRow[];
  blsDetected: number;
}

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: ImporterRegistry,
  ) {}

  private async ensureOperation(id: number) {
    const op = await this.prisma.operation.findUnique({ where: { id } });
    if (!op) throw new NotFoundException('Operacion no encontrada');
    return op;
  }

  private async parse(operationId: number, buffer: Buffer) {
    const op = await this.ensureOperation(operationId);
    const rows = await this.registry.get(op.operationType).parse(buffer);
    return { op, rows };
  }

  /**
   * Clasifica cada VIN valido contra la base:
   *  - new: no existe
   *  - existing: ya existe en ESTA operacion (reimportacion aditiva -> se omite)
   *  - conflicting: existe en OTRA operacion (VIN es unico global -> se rechaza)
   */
  private async classify(operationId: number, rows: ImportedRow[]): Promise<Classification> {
    const valid = rows.filter((r) => r.errors.length === 0);
    const vins = valid.map((r) => r.vin);

    const found = await this.prisma.vehicle.findMany({
      where: { vin: { in: vins } },
      select: { vin: true, operationId: true },
    });
    const byVin = new Map(found.map((v) => [v.vin, v.operationId]));

    const bls = [...new Set(valid.map((r) => r.bl))];
    const foundBls = await this.prisma.billOfLading.findMany({
      where: { blNumber: { in: bls } },
      select: { blNumber: true, operationId: true },
    });
    const blOwner = new Map(foundBls.map((b) => [b.blNumber, b.operationId]));

    const fresh: ImportedRow[] = [];
    const existing: ImportedRow[] = [];
    const conflicting: ImportedRow[] = [];

    for (const row of valid) {
      const blOwnedBy = blOwner.get(row.bl);
      if (blOwnedBy !== undefined && blOwnedBy !== operationId) {
        row.errors.push(`El BL ${row.bl} pertenece a otra operacion`);
        conflicting.push(row);
        continue;
      }
      const vinOwnedBy = byVin.get(row.vin);
      if (vinOwnedBy === undefined) fresh.push(row);
      else if (vinOwnedBy === operationId) existing.push(row);
      else {
        row.errors.push(`El VIN ${row.vin} ya existe en otra operacion`);
        conflicting.push(row);
      }
    }
    return { valid, fresh, existing, conflicting, blsDetected: bls.length };
  }

  private summarize(rows: ImportedRow[], c: Classification): ImportSummary {
    return {
      totalRows: rows.length,
      validRows: c.valid.length - c.conflicting.length,
      invalidRows: rows.length - c.valid.length + c.conflicting.length,
      rowsWithWarnings: rows.filter((r) => r.warnings.length > 0).length,
      newVehicles: c.fresh.length,
      existingVehicles: c.existing.length,
      conflictingVehicles: c.conflicting.length,
      blsDetected: c.blsDetected,
    };
  }

  async preview(operationId: number, buffer: Buffer) {
    const { rows } = await this.parse(operationId, buffer);
    const c = await this.classify(operationId, rows);
    return { ...this.summarize(rows, c), rows: rows.slice(0, 200) };
  }

  async confirm(operationId: number, buffer: Buffer, userId: number, fileName = 'import.xlsx') {
    const { rows } = await this.parse(operationId, buffer);
    const c = await this.classify(operationId, rows);
    const summary = this.summarize(rows, c);

    await this.prisma.$transaction(async (tx) => {
      const blIds = new Map<string, number>();
      for (const blNumber of new Set(c.fresh.map((r) => r.bl))) {
        const bl = await tx.billOfLading.upsert({
          where: { blNumber },
          update: {},
          create: { operationId, blNumber, portDischarge: 'Chancay' },
        });
        blIds.set(blNumber, bl.id);
      }

      if (c.fresh.length > 0) {
        await tx.vehicle.createMany({
          data: c.fresh.map((r) => ({
            operationId,
            billOfLadingId: blIds.get(r.bl)!,
            vin: r.vin,
            chassisNumber: r.vin,
            containerNumber: r.containerNumber,
            brand: r.brand,
            model: r.model,
            weight: r.weight,
            quantity: r.quantity,
          })),
        });
      }

      await tx.operationImport.create({
        data: {
          operationId,
          fileName,
          totalRows: summary.totalRows,
          validRows: summary.validRows,
          invalidRows: summary.invalidRows,
          uploadedById: userId,
        },
      });
    });

    this.audit.record({
      userId,
      module: 'imports',
      action: 'CONFIRM',
      description:
        `${fileName}: ${summary.newVehicles} nuevos, ` +
        `${summary.existingVehicles} ya existentes, ` +
        `${summary.conflictingVehicles} rechazados`,
    });

    return summary;
  }

  list(operationId: number) {
    return this.prisma.operationImport.findMany({
      where: { operationId },
      orderBy: { id: 'desc' },
    });
  }
}
```

- [ ] **Step 3: Verificar que compila**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/src/imports
git commit -m "feat(imports): reimportacion aditiva, BL/VIN unico global, roles ADMIN+SUPERVISOR"
```

---

## Fase D — Correlativo de tarja

### Task D1: `ReportCodeService`

**Files:**
- Create: `backend/src/tarja/report-code.service.ts`
- Modify: `backend/src/tarja/tarja.service.ts:62`
- Modify: `backend/src/tarja/tarja.module.ts`

- [ ] **Step 1: Implementar el servicio**

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

const CODE_LENGTH = 6;

/**
 * Correlativo continuo de tarja, respaldado por una secuencia de Postgres.
 * nextval() consume el numero aunque la transaccion falle: los huecos son
 * esperados y coinciden con el comportamiento de los talonarios fisicos.
 */
@Injectable()
export class ReportCodeService {
  async next(tx: Prisma.TransactionClient): Promise<string> {
    const [{ nextval }] = await tx.$queryRaw<
      { nextval: bigint }[]
    >`SELECT nextval('tarja_report_code_seq')`;
    return nextval.toString().padStart(CODE_LENGTH, '0');
  }
}
```

- [ ] **Step 2: Usarlo en `tarja.service.ts`**

Inyectar `private readonly reportCode: ReportCodeService` en el constructor, y dentro de la transacción de `start()` reemplazar:

```ts
            reportCode: `TR-${Date.now()}-${vehicle.id}`,
```

por:

```ts
            reportCode: await this.reportCode.next(tx),
```

- [ ] **Step 3: Registrar el provider**

Añadir `ReportCodeService` a `providers` en `backend/src/tarja/tarja.module.ts`.

- [ ] **Step 4: Escribir el e2e que verifica el correlativo**

Se cubre en Task E4 junto al resto del flujo. Verificar aquí solo que compila:

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/tarja
git commit -m "feat(tarja): correlativo continuo respaldado por secuencia de Postgres"
```

---

## Fase E — Lookup, bloqueo de VIN desconocido, borrado

### Task E1: `Ship` en operaciones

**Files:**
- Create: `backend/src/ships/ships.service.ts`, `ships.controller.ts`, `ships.module.ts`
- Modify: `backend/src/operations/operations.service.ts:30-60`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: `ShipsService`**

```ts
import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShipsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.ship.findMany({ orderBy: { name: 'asc' } });
  }

  /**
   * Busca la nave por nombre normalizado; la crea si no existe.
   * Se almacena en MAYUSCULAS: es como vienen los manifiestos y BLs, y hace que
   * el unique de `ships.name` garantice de verdad una sola fila por nave.
   */
  async findOrCreate(name: string, tx?: Prisma.TransactionClient) {
    const client = tx ?? this.prisma;
    const clean = name.trim().replace(/\s+/g, ' ').toUpperCase();
    return client.ship.upsert({
      where: { name: clean },
      update: {},
      create: { name: clean },
    });
  }
}
```

- [ ] **Step 2: `ShipsController`**

```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ShipsService } from './ships.service';

@UseGuards(JwtAuthGuard)
@Controller('ships')
export class ShipsController {
  constructor(private readonly service: ShipsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
```

- [ ] **Step 3: `ShipsModule`**

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ShipsController } from './ships.controller';
import { ShipsService } from './ships.service';

@Module({
  imports: [PrismaModule],
  controllers: [ShipsController],
  providers: [ShipsService],
  exports: [ShipsService],
})
export class ShipsModule {}
```

Registrarlo en `imports` de `app.module.ts`, e importarlo también en `OperationsModule`.

- [ ] **Step 4: Resolver la nave en `OperationsService`**

El DTO **no cambia**: sigue recibiendo `shipName: string`. El servicio resuelve el `Ship`. En `create()`:

```ts
  async create(dto: CreateOperationDto, userId: number) {
    const ship = await this.ships.findOrCreate(dto.shipName);
    const op = await this.prisma.operation.create({
      data: {
        code: dto.code,
        shipId: ship.id,
        operationType: dto.operationType,
        operationDate: dto.operationDate ? new Date(dto.operationDate) : null,
        portDischarge: dto.portDischarge ?? 'Chancay',
        createdById: userId,
      },
      include: { ship: true },
    });
    this.audit.record({
      userId,
      module: 'operations',
      action: 'CREATE',
      description: `Operacion ${op.code}`,
      newValue: op.code,
    });
    return this.withShipName(op);
  }
```

En `update()`, sustituir `shipName: dto.shipName` por:

```ts
        shipId: dto.shipName ? (await this.ships.findOrCreate(dto.shipName)).id : undefined,
```

Añadir el helper y `include: { ship: true }` en `findAll()` y `findOne()`:

```ts
  /** Mantiene el contrato `shipName` de la API pese a la normalizacion en `ships`. */
  private withShipName<T extends { ship: { name: string } }>(op: T) {
    const { ship, ...rest } = op;
    return { ...rest, shipName: ship.name };
  }
```

Aplicar `withShipName` al retorno de `findAll()` (con `.map`), `findOne()`, `create()` y `update()`.

> El contrato HTTP no cambia: el frontend sigue enviando y recibiendo `shipName`. Por eso `frontend/lib/api.ts` no requiere modificación.

- [ ] **Step 5: Verificar que compila y que `pdf/report-template.ts` sigue recibiendo `shipName`**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores. Si `pdf/pdf.service.ts` lee `operation.shipName` directo de Prisma, cambiar su query a `include: { ship: true }` y mapear.

- [ ] **Step 6: Commit**

```bash
git add backend/src/ships backend/src/operations backend/src/app.module.ts backend/src/pdf
git commit -m "feat(ships): naves normalizadas en tabla propia"
```

---

### Task E2: Lookup global de VIN

**Files:**
- Modify: `backend/src/vehicles/vehicles.service.ts`
- Modify: `backend/src/vehicles/vehicles.controller.ts`

- [ ] **Step 1: Añadir `lookup` al servicio**

```ts
  /**
   * Busca un VIN de forma exacta y global. El VIN es unico en todo el sistema,
   * por lo que resuelve por si solo su operacion, nave y BL.
   */
  async lookup(rawVin: string) {
    const { vin } = validateVin(rawVin);
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { vin },
      include: {
        billOfLading: { select: { blNumber: true } },
        operation: { select: { id: true, code: true, operationType: true, portDischarge: true, ship: { select: { name: true } } } },
      },
    });
    if (!vehicle) throw new NotFoundException(`VIN ${vin} no encontrado`);
    return {
      vehicleId: vehicle.id,
      vin: vehicle.vin,
      brand: vehicle.brand,
      model: vehicle.model,
      containerNumber: vehicle.containerNumber,
      blNumber: vehicle.billOfLading?.blNumber ?? null,
      operationId: vehicle.operation.id,
      operationCode: vehicle.operation.code,
      operationType: vehicle.operation.operationType,
      shipName: vehicle.operation.ship.name,
      portDischarge: vehicle.operation.portDischarge,
      vehicleStatus: vehicle.status,
    };
  }
```

Importar `validateVin` desde `../common/vin.util`.

- [ ] **Step 2: Exponer la ruta**

En `vehicles.controller.ts`, **antes** de `@Get('vehicles/:id')` (si no, `lookup` se interpreta como un `id`):

```ts
  @Get('vehicles/lookup')
  lookup(@Query('vin') vin: string) {
    if (!vin) throw new BadRequestException('Parametro vin requerido');
    return this.service.lookup(vin);
  }
```

- [ ] **Step 3: Verificar que compila**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/src/vehicles
git commit -m "feat(vehicles): lookup global de VIN sin scope de operacion"
```

---

### Task E3: VIN desconocido bloquea + queda en bitácora

**Files:**
- Modify: `backend/src/tarja/dto/tarja.dto.ts`
- Modify: `backend/src/tarja/tarja.service.ts:28-60`

- [ ] **Step 1: Simplificar `StartTarjaDto`**

El `operationId` se deriva del vehículo. En `backend/src/tarja/dto/tarja.dto.ts`, `StartTarjaDto` queda:

```ts
export class StartTarjaDto {
  @IsString()
  @MinLength(1)
  vin: string;
}
```

- [ ] **Step 2: Reescribir `start()` para bloquear el VIN desconocido**

Reemplazar el bloque desde `const op = await this.prisma.operation...` hasta el cierre de la creación del vehículo:

```ts
  async start(dto: StartTarjaDto, tarjadorId: number) {
    const { vin } = validateVin(dto.vin);

    const vehicle = await this.prisma.vehicle.findUnique({ where: { vin } });

    // VIN desconocido: el tarjador no puede continuar. Queda en bitacora
    // para que el supervisor lo regularice dando de alta el vehiculo.
    if (!vehicle) {
      this.audit.record({
        userId: tarjadorId,
        module: 'tarja',
        action: 'VIN_NO_ENCONTRADO',
        description: `VIN ${vin} no existe en ninguna operacion`,
        newValue: vin,
      });
      this.realtime.emit('vin.unknown', { vin, tarjadorId });
      throw new NotFoundException(
        `VIN ${vin} no encontrado. Se notifico al supervisor para su regularizacion.`,
      );
    }

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

    const operationId = vehicle.operationId;

    try {
      const report = await this.prisma.$transaction(async (tx) => {
        const created = await tx.tarjaReport.create({
          data: {
            reportCode: await this.reportCode.next(tx),
            operationId,
            vehicleId: vehicle.id,
            billOfLadingId: vehicle.billOfLadingId,
            tarjadorId,
            startedAt: new Date(),
            status: 'BORRADOR',
          },
        });

        await tx.vehicle.update({
          where: { id: vehicle.id },
          data: {
            status: 'EN_PROCESO',
            lockedById: tarjadorId,
            lockedAt: new Date(),
            currentReportId: created.id,
          },
        });

        return created;
      });
      // ... el resto de start() (emit + audit) queda igual, usando `operationId`
```

Importar `validateVin` desde `../common/vin.util`. Eliminar el import de `Prisma` si queda sin uso.

> `VehicleStatus.NO_PLANIFICADO` y `isUnplanned` dejan de escribirse aquí. Los seguirá usando el supervisor al dar de alta manualmente un vehículo no planificado (fuera del alcance de este plan).

- [ ] **Step 3: Verificar que compila**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/src/tarja
git commit -m "feat(tarja): VIN desconocido bloquea y se registra en bitacora"
```

---

### Task E4: Borrado de vehículo `PENDIENTE`

**Files:**
- Modify: `backend/src/vehicles/vehicles.service.ts`
- Modify: `backend/src/vehicles/vehicles.controller.ts`
- Modify: `backend/src/vehicles/vehicles.module.ts` (inyectar `AuditService`)

- [ ] **Step 1: Implementar `remove`**

```ts
  /**
   * Elimina un vehiculo mal cargado desde el Excel de origen.
   * Solo en PENDIENTE: un vehiculo con historial de tarja nunca se borra.
   */
  async remove(id: number, userId: number) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { _count: { select: { reports: true } } },
    });
    if (!vehicle) throw new NotFoundException('Vehiculo no encontrado');

    if (vehicle.status !== 'PENDIENTE') {
      throw new ConflictException(
        `Solo se puede eliminar un vehiculo en estado PENDIENTE (actual: ${vehicle.status})`,
      );
    }
    if (vehicle._count.reports > 0) {
      throw new ConflictException('El vehiculo tiene reportes asociados y no puede eliminarse');
    }

    await this.prisma.vehicle.delete({ where: { id } });

    this.audit.record({
      userId,
      module: 'vehicles',
      action: 'DELETE',
      description: `Vehiculo ${vehicle.vin} eliminado (estaba PENDIENTE)`,
      oldValue: vehicle.vin,
    });

    return { deleted: true, vin: vehicle.vin };
  }
```

Inyectar `private readonly audit: AuditService` en `VehiclesService` e importar `ConflictException`.

- [ ] **Step 2: Exponer la ruta**

```ts
  @Delete('vehicles/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPERVISOR')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user.userId);
  }
```

- [ ] **Step 3: Verificar que compila**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/src/vehicles
git commit -m "feat(vehicles): borrado auditado de vehiculo en PENDIENTE"
```

---

## Fase F — Avance por contenedor

### Task F1: `GET /operations/:id/containers`

**Files:**
- Modify: `backend/src/vehicles/vehicles.service.ts`
- Modify: `backend/src/vehicles/vehicles.controller.ts`

> El tarjador **no** trabaja por contenedor. Esto es exclusivamente para el panel de avance del supervisor.

- [ ] **Step 1: Implementar la agregación**

```ts
  /** Avance por contenedor. Solo para el panel del supervisor. */
  async containerProgress(operationId: number) {
    const rows = await this.prisma.vehicle.groupBy({
      by: ['containerNumber', 'status'],
      where: { operationId, containerNumber: { not: null } },
      _count: { _all: true },
    });

    const byContainer = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const key = r.containerNumber!;
      const entry = byContainer.get(key) ?? {};
      entry[r.status] = r._count._all;
      byContainer.set(key, entry);
    }

    const DONE = ['TARJADO', 'OBSERVADO'];
    return [...byContainer.entries()]
      .map(([containerNumber, counts]) => {
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        const done = DONE.reduce((a, s) => a + (counts[s] ?? 0), 0);
        return {
          containerNumber,
          total,
          done,
          pending: total - done,
          complete: done === total,
          byStatus: counts,
        };
      })
      .sort((a, b) => a.containerNumber.localeCompare(b.containerNumber));
  }
```

- [ ] **Step 2: Exponer la ruta**

```ts
  @Get('operations/:id/containers')
  containers(@Param('id', ParseIntPipe) id: number) {
    return this.service.containerProgress(id);
  }
```

- [ ] **Step 3: Verificar que compila**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add backend/src/vehicles
git commit -m "feat(vehicles): avance por contenedor para el panel de supervision"
```

---

## Fase G — Tests end-to-end y reparación de los existentes

### Task G1: Reparar los e2e existentes

**Files:**
- Modify: `backend/test/phase3.e2e-spec.ts`
- Modify: `backend/test/phase4.e2e-spec.ts`

> `StartTarjaDto` ya no recibe `operationId`, y los VINs de prueba (`VINP30000000001`, 15 caracteres) generan una advertencia. Se reemplazan por VINs reales para que el fixture refleje la realidad.

- [ ] **Step 1: Actualizar el Excel de prueba de `phase3`**

```ts
async function makeExcel(): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow(['VIN', 'BL', 'Cantidad', 'Marca', 'Modelo', 'Peso']);
  ws.addRow(['LEFEDDE15VTP04723', `BL-T3-${Date.now()}`, 1, 'JMC', 'Grand Vigus', 1500]);
  ws.addRow(['LEFEDDE10VTP04726', `BL-T3-${Date.now()}`, 1, 'JMC', 'Grand Vigus', 1200]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}
```

> El BL debe ser único global entre corridas del test, de ahí el `Date.now()`. Guardar el valor en una constante para reusarlo en ambas filas.

- [ ] **Step 2: Cambiar todas las llamadas a `/tarja/start`**

De `.send({ operationId, vin })` a `.send({ vin })` en `phase3.e2e-spec.ts` y `phase4.e2e-spec.ts`.

> Los VINs de `phase4` también deben ser válidos y **distintos** de los de `phase3`: el VIN es único global y las suites comparten base de datos. Usar `LEFEDDE10VTP04743` y `LEFEDDE10VTP04757`.

- [ ] **Step 3: Correr la suite completa**

Run: `cd backend && npm run test:e2e`
Expected: todas las suites en verde. Si `phase2` falla por `shipName`, revisar Task E1 Step 4.

- [ ] **Step 4: Commit**

```bash
git add backend/test
git commit -m "test(e2e): adaptar fases 3 y 4 al lookup global de VIN"
```

---

### Task G2: E2E del flujo nuevo

**Files:**
- Create: `backend/test/phase7.e2e-spec.ts`

- [ ] **Step 1: Escribir el test**

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Workbook } from 'exceljs';
import { AppModule } from '../src/app.module';

const HEADERS = [
  'Commission number', 'Container number', 'B/L number', 'Goods name',
  'Number of pieces', 'Weight(kg)', 'Volume(M3)', 'Cargo code', 'Package',
  'Mark', 'Cargo space', 'Operation time', 'Staff', 'license plate number',
  'Part number/\nchassis number', 'brand', 'model', 'damaged', 'Remark',
];

const STAMP = Date.now();
const BL = `COSU${STAMP}`;
const VIN_A = 'LEFEDDE11VTP04735';
const VIN_B = 'LEFEDDE11VTP04749';

function row(vin: string, container: string) {
  return ['', container, `${BL} `, 'GENERAL CARGO', '1', '1920', '0', 'C01', 'VEI',
    '', '', '', '', '', vin, 'JMC', 'Grand Vigus', '', ''];
}

async function excel(rows: string[][]): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(HEADERS);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('Fase 7 - Importacion desconsolidado + lookup global (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let supervisorToken: string;
  let tarjadorToken: string;
  let operationId: number;
  const H = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    const srv = app.getHttpServer();

    const login = async (username: string, password: string) =>
      (await request(srv).post('/auth/login').send({ username, password })).body.accessToken;

    adminToken = await login('admin', 'Admin123!');
    supervisorToken = await login('supervisor', 'Super123!');
    tarjadorToken = await login('tarjador', 'Tarja123!');

    const op = await request(srv).post('/operations').set(H(adminToken)).send({
      code: `OP7-${STAMP}`,
      shipName: 'Guang He Kou',
      operationType: 'DESCONSOLIDADO',
    });
    operationId = op.body.id;
    // El nombre de nave se normaliza a MAYUSCULAS.
    expect(op.body.shipName).toBe('GUANG HE KOU');
  });

  afterAll(async () => { await app.close(); });

  it('el supervisor puede importar (no solo el admin)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/operations/${operationId}/imports/confirm`)
      .set(H(supervisorToken))
      .attach('file', await excel([row(VIN_A, 'FCIU1111111'), row(VIN_B, 'FCIU2222222')]), 'd.xlsx')
      .expect(201);

    expect(res.body).toMatchObject({
      newVehicles: 2, existingVehicles: 0, conflictingVehicles: 0,
      blsDetected: 1, rowsWithWarnings: 0,
    });
  });

  it('la reimportacion es aditiva: omite los existentes', async () => {
    const res = await request(app.getHttpServer())
      .post(`/operations/${operationId}/imports/confirm`)
      .set(H(adminToken))
      .attach('file', await excel([row(VIN_A, 'FCIU1111111')]), 'd.xlsx')
      .expect(201);

    expect(res.body).toMatchObject({ newVehicles: 0, existingVehicles: 1 });
  });

  it('el lookup resuelve nave, BL y modelo desde el VIN, sin operationId', async () => {
    const res = await request(app.getHttpServer())
      .get('/vehicles/lookup').query({ vin: VIN_A })
      .set(H(tarjadorToken)).expect(200);

    expect(res.body).toMatchObject({
      vin: VIN_A, brand: 'JMC', model: 'Grand Vigus',
      blNumber: BL, shipName: 'GUANG HE KOU',
      containerNumber: 'FCIU1111111', vehicleStatus: 'PENDIENTE',
      operationId,
    });
  });

  it('un VIN desconocido devuelve 404 y no crea vehiculo', async () => {
    await request(app.getHttpServer()).post('/tarja/start')
      .set(H(tarjadorToken)).send({ vin: 'LVTDB11B2VD024641' }).expect(404);

    await request(app.getHttpServer()).get('/vehicles/lookup')
      .query({ vin: 'LVTDB11B2VD024641' }).set(H(tarjadorToken)).expect(404);
  });

  it('el correlativo de tarja es numerico y creciente', async () => {
    const srv = app.getHttpServer();
    const r1 = await request(srv).post('/tarja/start').set(H(tarjadorToken)).send({ vin: VIN_A }).expect(201);
    const r2 = await request(srv).post('/tarja/start').set(H(tarjadorToken)).send({ vin: VIN_B }).expect(201);

    expect(r1.body.reportCode).toMatch(/^\d{6,}$/);
    expect(Number(r2.body.reportCode)).toBe(Number(r1.body.reportCode) + 1);
  });

  it('no se puede borrar un vehiculo que ya no esta PENDIENTE', async () => {
    const list = await request(app.getHttpServer())
      .get(`/operations/${operationId}/vehicles`).set(H(adminToken)).expect(200);
    const v = list.body.find((x: { vin: string }) => x.vin === VIN_A);

    await request(app.getHttpServer())
      .delete(`/vehicles/${v.id}`).set(H(supervisorToken)).expect(409);
  });

  it('el avance por contenedor agrupa correctamente', async () => {
    const res = await request(app.getHttpServer())
      .get(`/operations/${operationId}/containers`).set(H(supervisorToken)).expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ containerNumber: 'FCIU1111111', total: 1, complete: false });
  });
});
```

> Verificar los usernames/contraseñas contra `backend/prisma/seed.ts` antes de correr. Si el seed no crea un usuario `supervisor`, añadirlo allí.

- [ ] **Step 2: Correr el test**

Run: `cd backend && npx jest --config ./test/jest-e2e.json phase7`
Expected: PASS, 7 tests.

- [ ] **Step 3: Correr toda la suite**

Run: `cd backend && npm test && npm run test:e2e`
Expected: todo en verde.

- [ ] **Step 4: Commit**

```bash
git add backend/test/phase7.e2e-spec.ts
git commit -m "test(e2e): fase 7 - importacion desconsolidado, lookup global, correlativo"
```

---

## Pendientes explícitos

1. **Número de arranque del correlativo.** El cliente lo entregará después. Migración de una línea:
   `ALTER SEQUENCE "tarja_report_code_seq" RESTART WITH <N>;`
2. **Excel RORO real.** `RoroImporter` usa un formato que nadie ha confirmado. Cuando llegue el archivo real, se reescribe `columns` y `anchorHeader`, y su `.spec.ts` con el fixture real.
3. **Alta manual de vehículo no planificado** por el supervisor (usa `isUnplanned` + `NO_PLANIFICADO`). Plan aparte.
4. **Frontend.** Plan aparte: formulario de operación con autocomplete de nave, previsualización de importación con warnings, escáner que consume `/vehicles/lookup`, columna de contenedores en el panel, botón de borrado de `PENDIENTE`.
5. **OCR.** Plan aparte. Reutiliza `vin.util.ts` en modo estricto + distancia de edición contra los VINs de la operación.
