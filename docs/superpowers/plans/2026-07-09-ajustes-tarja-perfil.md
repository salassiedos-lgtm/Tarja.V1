# Ajustes de tarja y perfil de tarjador Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar los 5 ajustes acordados en `docs/superpowers/specs/2026-07-09-ajustes-tarja-perfil-design.md`: adicionales excedentes en el PDF, iniciales fijas y reubicadas, accesorios con estado "-" cuando no se marcan, vista "Mis tarjas" para el tarjador, y cambio de contraseña propio ("Mi perfil").

**Architecture:** Cambios incrementales sobre módulos NestJS existentes (`pdf`, `tarja`, `reports`, `users`) sin tocar el esquema de Prisma (todo se resuelve con la lógica ya existente de upsert-por-ítem-enviado y con nuevos parámetros de scope). En el frontend se extienden `frontend/app/tarja/[id]/page.tsx`, `frontend/lib/api.ts` y `frontend/components/shell.tsx`, y se agregan dos páginas nuevas (`/mis-tarjas`, `/perfil`).

**Tech Stack:** NestJS + Prisma + class-validator + Jest (backend), Next.js + Tailwind (frontend, sin test runner — se verifica con `tsc --noEmit`). Sin librerías nuevas.

Spec de referencia: `docs/superpowers/specs/2026-07-09-ajustes-tarja-perfil-design.md`.

---

### Task 1: PDF — adicionales excedentes en el bloque de observaciones

**Files:**
- Modify: `backend/src/pdf/report-template.ts`
- Create: `backend/src/pdf/report-template.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

```typescript
import { renderReportHtml, type PdfAccessoryRow, type PdfReport } from './report-template';

function baseReport(overrides: Partial<PdfReport> = {}): PdfReport {
  return {
    reportCode: 'RPT-0001',
    status: 'FINALIZADO',
    startedAt: null,
    finishedAt: null,
    durationSeconds: null,
    hasDamage: false,
    damageSource: null,
    damageOperation: null,
    damageAffects: null,
    damageMoment: null,
    damageMomentOther: null,
    details: null,
    tarjadorInitials: 'TJ1',
    vehicle: { vin: 'LEFEDDE15VTP04723', chassisNumber: null },
    operation: { shipName: 'Nave Test', portDischarge: 'Chancay', code: 'OP-1' },
    billOfLading: { blNumber: 'BL-1' },
    tarjador: { username: 'tarjador', initials: 'TJ1' },
    damages: [],
    ...overrides,
  };
}

const ACCESSORY_NAMES = [
  'Radio', 'Reloj', 'Encendedor', 'Ceniceros', 'Espejos interiores', 'Espejos laterales',
  'Antena', 'Pisos adicionales', 'Plumillas', 'Tapa de llanta', 'Llanta de repuesto',
  'Gata', 'Herramientas', 'Llaves del vehiculo', 'Catalogos', 'Relays',
];

function accessories16(): PdfAccessoryRow[] {
  return ACCESSORY_NAMES.map((name) => ({ name, hasAccessory: false, quantity: 0 }));
}

describe('renderReportHtml', () => {
  it('lista como texto los adicionales excedentes (posicion 17+) y no los muestra en la tabla', () => {
    const accessories = [
      ...accessories16(),
      { name: 'Chalecos', hasAccessory: true, quantity: 3 },
      { name: 'Triangulos', hasAccessory: true, quantity: 2 },
      { name: 'Extintor', hasAccessory: false, quantity: 0 },
    ];
    const html = renderReportHtml(baseReport(), accessories, '');
    expect(html).not.toContain('Chalecos</td>');
    expect(html).not.toContain('Triangulos</td>');
    expect(html).toContain('3 Chalecos, 2 Triangulos');
    expect(html).not.toContain('Extintor');
  });

  it('no agrega texto de adicionales si no hay excedentes marcados', () => {
    const html = renderReportHtml(baseReport(), accessories16(), '');
    expect(html).not.toMatch(/\d+ \w+, \d+ \w+/);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest report-template.spec.ts`
Expected: FAIL — `accessories.slice(16)` no existe aún como concepto; el texto `"3 Chalecos, 2 Triangulos"` no aparece en el HTML generado.

- [ ] **Step 3: Implementar en `report-template.ts`**

Agregar esta función nueva (después de `accRow`, línea 49 actual):

```typescript
function extraAccessoriesText(accessories: PdfAccessoryRow[]): string {
  return accessories
    .slice(16)
    .filter((a) => a.hasAccessory)
    .map((a) => `${a.quantity} ${a.name}`)
    .join(', ');
}
```

Dentro de `renderReportHtml`, justo después de la línea que arma `rows` (línea 61 actual, después del `for`), agregar:

```typescript
  const extras = extraAccessoriesText(accessories);
```

Y cambiar la fila del bloque de observaciones (línea 148 actual):

```typescript
  <tr><td colspan="4" class="damageblock">${damages}${r.details ? `<div style="margin-top:4px">${esc(r.details)}</div>` : ''}${extras ? `<div style="margin-top:4px">${esc(extras)}</div>` : ''}</td></tr>
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && npx jest report-template.spec.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/pdf/report-template.ts backend/src/pdf/report-template.spec.ts
git commit -m "feat(pdf): lista los adicionales excedentes como texto en observaciones"
```

---

### Task 2: Backend — iniciales del reporte fijas desde la cuenta del tarjador

**Files:**
- Modify: `backend/src/tarja/dto/tarja.dto.ts`
- Modify: `backend/src/tarja/tarja.service.ts`
- Modify: `backend/test/phase3.e2e-spec.ts`

- [ ] **Step 1: Quitar `initials` de `FinishTarjaDto`**

En `backend/src/tarja/dto/tarja.dto.ts`, reemplazar:

```typescript
export class FinishTarjaDto {
  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsString()
  initials?: string;
}
```

por:

```typescript
export class FinishTarjaDto {
  @IsOptional()
  @IsString()
  details?: string;
}
```

- [ ] **Step 2: Escribir el test e2e que falla**

En `backend/test/phase3.e2e-spec.ts`, agregar la constante junto a las demás (línea 12 actual):

```typescript
const VIN_INICIALES = `VINT3${RUN}03`;
```

Y agregar la fila en `makeExcel()` (después de la fila de `VIN_2`, línea 20 actual):

```typescript
  ws.addRow(['NAVE T3', VIN_INICIALES, BL_1, 1, 'Mazda', 1300, 'SH', 'Chancay']);
```

Y agregar el test, al final del `describe` (después de la línea 122 actual, antes del cierre `});`):

```typescript
  it('las iniciales del reporte finalizado son las de la cuenta del tarjador, no las del payload', async () => {
    const srv = app.getHttpServer();
    const start = await request(srv)
      .post('/tarja/start')
      .set(H(tarjadorToken))
      .send({ vin: VIN_INICIALES })
      .expect(201);
    const reportId = start.body.id;

    await request(srv)
      .patch(`/tarja/${reportId}/damages`)
      .set(H(tarjadorToken))
      .send({ hasDamage: false })
      .expect(200);

    const finish = await request(srv)
      .post(`/tarja/${reportId}/finish`)
      .set(H(tarjadorToken))
      .send({ initials: 'HACKED' })
      .expect(201);

    expect(finish.body.tarjadorInitials).toBe('TJ1');
  });
```

- [ ] **Step 3: Correr el test y verificar que falla**

Run: `cd backend && npx jest --config ./test/jest-e2e.json phase3.e2e-spec.ts --runInBand`
Expected: FAIL — hoy `tarjadorInitials` queda en `'HACKED'` porque el servicio usa `dto.initials` tal cual.

- [ ] **Step 4: Implementar en `tarja.service.ts`**

Reemplazar el método `finish` completo (líneas 172-212 actuales):

```typescript
  async finish(reportId: number, dto: FinishTarjaDto) {
    const report = await this.getDraft(reportId);
    const tarjador = await this.prisma.user.findUniqueOrThrow({ where: { id: report.tarjadorId } });
    const now = new Date();
    const durationSeconds = report.startedAt
      ? Math.max(0, Math.round((now.getTime() - report.startedAt.getTime()) / 1000))
      : null;
    const status: ReportStatus = report.hasDamage ? 'CON_DANO' : 'FINALIZADO';
    const vehicleStatus: VehicleStatus = report.hasDamage ? 'OBSERVADO' : 'TARJADO';

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.tarjaReport.update({
        where: { id: reportId },
        data: {
          finishedAt: now,
          durationSeconds,
          status,
          details: dto.details ?? null,
          tarjadorInitials: tarjador.initials ?? null,
        },
      });
      await tx.vehicle.update({
        where: { id: report.vehicleId },
        data: { status: vehicleStatus, lockedById: null, lockedAt: null },
      });
      return r;
    });

    this.realtime.emit('report.finished', {
      reportId,
      operationId: report.operationId,
      vehicleId: report.vehicleId,
      status,
    });
    this.audit.record({
      userId: report.tarjadorId,
      module: 'tarja',
      action: 'FINISH',
      description: `Reporte ${reportId} -> ${status}`,
    });
    return updated;
  }
```

(único cambio real: se agrega la búsqueda de `tarjador` y se usa `tarjador.initials` en vez de `dto.initials`).

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd backend && npx jest --config ./test/jest-e2e.json phase3.e2e-spec.ts --runInBand`
Expected: PASS (todos los tests del archivo)

- [ ] **Step 6: Commit**

```bash
git add backend/src/tarja/dto/tarja.dto.ts backend/src/tarja/tarja.service.ts backend/test/phase3.e2e-spec.ts
git commit -m "fix(tarja): las iniciales del reporte se toman de la cuenta del tarjador, no del payload"
```

---

### Task 3: PDF — iniciales reubicadas en la esquina del recuadro de observaciones

**Files:**
- Modify: `backend/src/pdf/report-template.ts`
- Modify: `backend/src/pdf/report-template.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al `describe('renderReportHtml', ...)` de `report-template.spec.ts`:

```typescript
  it('deja "Port" en blanco para firma fisica e imprime las iniciales en el recuadro de observaciones', () => {
    const html = renderReportHtml(baseReport({ tarjadorInitials: 'TJ1' }), accessories16(), '');
    expect(html).toContain('<div class="line">Port</div>');
    expect(html).not.toContain('Port — TJ1');
    expect(html).toMatch(/damageblock">[\s\S]*Iniciales: TJ1[\s\S]*<\/td>/);
  });
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest report-template.spec.ts`
Expected: FAIL — hoy la firma imprime `Port — TJ1` y no existe ningún `Iniciales:` en el recuadro de observaciones.

- [ ] **Step 3: Implementar en `report-template.ts`**

Agregar la clase CSS `.initials` dentro del bloque `<style>` (junto a `.damageblock`, línea 88 actual):

```css
  .initials { text-align: right; font-size: 8px; color: #555; margin-top: 8px; }
```

Cambiar la fila del bloque de observaciones (la que quedó en el Task 1, ahora agregando las iniciales al final):

```typescript
  <tr><td colspan="4" class="damageblock">${damages}${r.details ? `<div style="margin-top:4px">${esc(r.details)}</div>` : ''}${extras ? `<div style="margin-top:4px">${esc(extras)}</div>` : ''}<div class="initials">Iniciales: ${esc(r.tarjadorInitials)}</div></td></tr>
```

Cambiar la fila de firma (línea 154 actual):

```typescript
<table class="sign"><tr>
  <td><div class="line">Ship´s representative</div></td>
  <td><div class="line">Customs Agent / Consignee</div></td>
  <td><div class="line">Port</div></td>
</tr></table>
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd backend && npx jest report-template.spec.ts`
Expected: PASS (todos los tests del archivo)

- [ ] **Step 5: Commit**

```bash
git add backend/src/pdf/report-template.ts backend/src/pdf/report-template.spec.ts
git commit -m "feat(pdf): mueve las iniciales del tarjador a observaciones y deja Port en blanco"
```

---

### Task 4: Frontend — iniciales de solo lectura en el formulario

**Files:**
- Modify: `frontend/lib/api.ts`
- Modify: `frontend/app/tarja/[id]/page.tsx`

- [ ] **Step 1: Simplificar `finishTarja` en `api.ts`**

Reemplazar (línea 284-285 actual):

```typescript
export const finishTarja = (id: number | string, d: { details?: string; initials?: string }) =>
  apiJson<TarjaReport>(`/tarja/${id}/finish`, 'POST', d);
```

por:

```typescript
export const finishTarja = (id: number | string, d: { details?: string } = {}) =>
  apiJson<TarjaReport>(`/tarja/${id}/finish`, 'POST', d);
```

- [ ] **Step 2: Quitar el estado editable de iniciales en `tarja/[id]/page.tsx`**

Reemplazar (línea 166 actual):

```typescript
  const [initials, setInitials] = useState(getUser()?.initials ?? '');
```

por:

```typescript
  const initials = getUser()?.initials ?? report?.tarjadorInitials ?? '';
```

Quitar la línea que ya no aplica dentro de `load()` (línea 188 actual):

```typescript
      if (r.tarjadorInitials) setInitials(r.tarjadorInitials);
```

(se elimina sin reemplazo — `initials` ahora es derivado, no estado).

- [ ] **Step 3: Simplificar la llamada a `finishTarja` en `finish()`**

Reemplazar (línea 251 actual):

```typescript
      const r = await finishTarja(id, { initials: initials || undefined });
```

por:

```typescript
      const r = await finishTarja(id);
```

- [ ] **Step 4: Hacer el input de iniciales de solo lectura**

Reemplazar el bloque del paso 3 "Responsable" (líneas 543-551 actuales):

```tsx
                <Label htmlFor="initials">Iniciales</Label>
                <input
                  id="initials"
                  value={initials}
                  disabled
                  readOnly
                  className="field w-32 text-center font-mono text-[18px] font-bold tracking-[0.16em] disabled:bg-canvas disabled:text-navy-900"
                />
                <p className="mt-2 text-[11px] text-muted">
                  Asignadas automáticamente según tu cuenta.
                </p>
```

- [ ] **Step 5: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `app/tarja/[id]/page.tsx` ni `lib/api.ts`.

- [ ] **Step 6: Commit**

```bash
git add frontend/lib/api.ts "frontend/app/tarja/[id]/page.tsx"
git commit -m "feat(tarja): iniciales de solo lectura, tomadas siempre de la cuenta"
```

---

### Task 5: Backend — accesorios sin marcar se imprimen como "-"

**Files:**
- Modify: `backend/src/pdf/pdf.service.ts`
- Modify: `backend/src/pdf/report-template.ts`
- Modify: `backend/src/pdf/report-template.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

Agregar al `describe('renderReportHtml', ...)`:

```typescript
  it('imprime "-" para un accesorio que el tarjador nunca marco', () => {
    const accessories = accessories16();
    accessories[0] = { name: 'Radio', hasAccessory: null, quantity: 0 };
    const html = renderReportHtml(baseReport(), accessories, '');
    expect(html).toContain('<td>Radio</td><td class="c">-</td><td class="c">-</td>');
  });
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest report-template.spec.ts`
Expected: FAIL — hoy `PdfAccessoryRow.hasAccessory` es `boolean`, TypeScript rechaza `null`; y aunque compilara, `accRow` imprimiría "NO" en vez de "-".

- [ ] **Step 3: Implementar en `report-template.ts`**

Cambiar la interfaz (línea 22-26 actual):

```typescript
export interface PdfAccessoryRow {
  name: string;
  hasAccessory: boolean | null;
  quantity: number;
}
```

Cambiar `accRow` (línea 46-49 actual):

```typescript
function accRow(a: PdfAccessoryRow | undefined): string {
  if (!a) return `<td></td><td class="c"></td><td class="c"></td>`;
  if (a.hasAccessory === null) {
    return `<td>${esc(a.name)}</td><td class="c">-</td><td class="c">-</td>`;
  }
  return `<td>${esc(a.name)}</td><td class="c">${a.hasAccessory ? 'SI' : 'NO'}</td><td class="c">${a.hasAccessory ? a.quantity : ''}</td>`;
}
```

Y actualizar `extraAccessoriesText` (del Task 1) para no romper con `null` (el `.filter((a) => a.hasAccessory)` ya excluye `null` y `false` correctamente, no requiere cambio).

- [ ] **Step 4: Implementar en `pdf.service.ts`**

Reemplazar (línea 38-45 actual):

```typescript
    const accessories: PdfAccessoryRow[] = catalog.map((c) => {
      const link = byId.get(c.id);
      return {
        name: c.name,
        hasAccessory: link ? link.hasAccessory : null,
        quantity: link?.quantity ?? 0,
      };
    });
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd backend && npx jest report-template.spec.ts`
Expected: PASS (todos los tests del archivo)

- [ ] **Step 6: Verificar que el resto del backend compila**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos relacionados a `pdf/`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/pdf/pdf.service.ts backend/src/pdf/report-template.ts backend/src/pdf/report-template.spec.ts
git commit -m "feat(pdf): imprime \"-\" para accesorios que el tarjador nunca marco"
```

---

### Task 6: Frontend — control de 3 estados para accesorios (Sin marcar / Sí / No)

**Files:**
- Modify: `frontend/app/tarja/[id]/page.tsx`

- [ ] **Step 1: Cambiar el tipo de estado**

Reemplazar (línea 54 actual):

```typescript
type AccState = Record<number, { has: boolean; qty: number }>;
```

por:

```typescript
type AccState = Record<number, { state: 'unset' | 'yes' | 'no'; qty: number }>;
```

- [ ] **Step 2: Reescribir `AccessoryCard`**

Reemplazar el componente completo (líneas 78-145 actuales):

```tsx
function AccessoryCard({
  accessory,
  state,
  onSetYes,
  onSetNo,
  onQty,
  delay,
}: {
  accessory: Accessory;
  state: { state: 'unset' | 'yes' | 'no'; qty: number };
  onSetYes: () => void;
  onSetNo: () => void;
  onQty: (q: number) => void;
  delay: number;
}) {
  const isYes = state.state === 'yes';
  const isNo = state.state === 'no';
  return (
    <div
      style={{ animationDelay: `${delay}ms` }}
      className={`rise flex min-h-[68px] items-center gap-3 overflow-hidden rounded-xl border p-3 transition-all duration-150 ${
        isYes
          ? 'border-jade-600/40 bg-jade-50/60 shadow-[0_6px_18px_-12px_rgba(13,122,99,0.6)]'
          : isNo
            ? 'border-line bg-canvas'
            : 'border-line bg-white'
      }`}
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-[11px] transition-colors duration-150 ${
          isYes ? 'bg-jade-600 text-white' : 'bg-navy-50 text-navy-800 ring-1 ring-navy-100'
        }`}
      >
        {createElement(accessoryIcon(accessory.name), { className: 'h-[21px] w-[21px]' })}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13.5px] font-semibold leading-tight ${
            isYes ? 'text-jade-700' : 'text-navy-900'
          }`}
        >
          {accessory.name}
        </span>
        <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          {isYes ? 'Presente' : isNo ? 'No presente' : 'Sin marcar'}
        </span>
      </span>

      <div className="flex shrink-0 items-center gap-1.5">
        {isYes && <QtyStepper value={state.qty || 1} onChange={onQty} />}
        <div className="flex shrink-0 gap-1">
          <button
            type="button"
            onClick={onSetYes}
            aria-pressed={isYes}
            className={`tap ring-focus rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              isYes
                ? 'border-jade-600/40 bg-jade-600 text-white'
                : 'border-line text-navy-700 hover:bg-jade-50 hover:text-jade-700'
            }`}
          >
            Sí
          </button>
          <button
            type="button"
            onClick={onSetNo}
            aria-pressed={isNo}
            className={`tap ring-focus rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition-colors ${
              isNo
                ? 'border-navy-700 bg-navy-700/[0.07] text-navy-900'
                : 'border-line text-muted hover:bg-navy-50'
            }`}
          >
            No
          </button>
        </div>
      </div>
    </div>
  );
}
```

(se elimina el `role="checkbox"`/`onClick` en el contenedor: ahora la interacción es solo por los botones Sí/No, evitando el click accidental en toda la tarjeta).

- [ ] **Step 3: Actualizar `load()` para construir el estado de 3 vías**

Reemplazar (líneas 180-185 actuales):

```typescript
      const state: AccState = {};
      for (const c of active) state[c.id] = { state: 'unset', qty: 0 };
      for (const ra of r.accessories ?? []) {
        state[ra.accessoryId] = { state: ra.hasAccessory ? 'yes' : 'no', qty: ra.quantity };
      }
      setAcc(state);
```

- [ ] **Step 4: Actualizar `present` (contador del encabezado)**

Reemplazar (línea 199 actual):

```typescript
  const present = useMemo(() => Object.values(acc).filter((a) => a.state === 'yes').length, [acc]);
```

- [ ] **Step 5: Actualizar `setAll`**

Reemplazar (líneas 201-207 actuales):

```typescript
  function setAll(yes: boolean) {
    setAcc((s) => {
      const next: AccState = {};
      for (const c of catalog) {
        next[c.id] = yes
          ? { state: 'yes', qty: Math.max(1, s[c.id]?.qty ?? 1) }
          : { state: 'unset', qty: 0 };
      }
      return next;
    });
  }
```

- [ ] **Step 6: Actualizar el payload de `setReportAccessories` en `finish()`**

Reemplazar (líneas 234-241 actuales):

```typescript
      await setReportAccessories(
        id,
        catalog
          .filter((c) => (acc[c.id]?.state ?? 'unset') !== 'unset')
          .map((c) => ({
            accessoryId: c.id,
            hasAccessory: acc[c.id].state === 'yes',
            quantity: acc[c.id].state === 'yes' ? Math.max(1, acc[c.id].qty ?? 1) : 0,
          })),
      );
```

- [ ] **Step 7: Actualizar el uso de `AccessoryCard` en el JSX**

Reemplazar (líneas 387-403 actuales):

```tsx
                  {catalog.map((c, i) => (
                    <AccessoryCard
                      key={c.id}
                      accessory={c}
                      state={acc[c.id] ?? { state: 'unset', qty: 0 }}
                      onSetYes={() =>
                        setAcc((s) => ({
                          ...s,
                          [c.id]: { state: 'yes', qty: Math.max(1, s[c.id]?.qty ?? 1) },
                        }))
                      }
                      onSetNo={() => setAcc((s) => ({ ...s, [c.id]: { state: 'no', qty: 0 } }))}
                      onQty={(q) => setAcc((s) => ({ ...s, [c.id]: { state: 'yes', qty: q } }))}
                      delay={100 + i * 24}
                    />
                  ))}
```

- [ ] **Step 8: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `app/tarja/[id]/page.tsx`.

- [ ] **Step 9: Commit**

```bash
git add "frontend/app/tarja/[id]/page.tsx"
git commit -m "feat(tarja): control de 3 estados (sin marcar/si/no) para accesorios"
```

---

### Task 7: Backend — `GET /reports` limita al tarjador a sus propias tarjas

**Files:**
- Modify: `backend/src/reports/reports.service.ts`
- Modify: `backend/src/reports/reports.controller.ts`
- Create: `backend/test/mis-tarjas.e2e-spec.ts`

- [ ] **Step 1: Escribir el test e2e que falla**

```typescript
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Workbook } from 'exceljs';
import { AppModule } from '../src/app.module';

const RUN = Date.now().toString().slice(-8);
const VIN_A = `VINMT${RUN}01`;
const VIN_B = `VINMT${RUN}02`;
const BL = `BL-MT-${RUN}`;

async function makeExcel(): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow(['Nave', 'VIN', 'BL', 'Cantidad', 'Marca', 'Peso', 'Puerto embarque', 'Puerto descarga']);
  ws.addRow(['NAVE MT', VIN_A, BL, 1, 'Toyota', 1500, 'SH', 'Chancay']);
  ws.addRow(['NAVE MT', VIN_B, BL, 1, 'Kia', 1200, 'SH', 'Chancay']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('Mis tarjas - alcance por tarjador (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let supervisorToken: string;
  let tarjadorToken: string;
  let reportIdA: number;
  const H = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const srv = app.getHttpServer();
    adminToken = (
      await request(srv).post('/auth/login').send({ username: 'admin', password: 'Admin123!' })
    ).body.accessToken;
    supervisorToken = (
      await request(srv).post('/auth/login').send({ username: 'supervisor', password: 'Super123!' })
    ).body.accessToken;
    tarjadorToken = (
      await request(srv).post('/auth/login').send({ username: 'tarjador', password: 'Tarja123!' })
    ).body.accessToken;

    const op = await request(srv)
      .post('/operations')
      .set(H(adminToken))
      .send({ code: `OP-MT-${Date.now()}`, shipName: 'Nave MT', operationType: 'ROLL_ON_ROLL_OFF' });
    await request(srv)
      .post(`/operations/${op.body.id}/imports/confirm`)
      .set(H(adminToken))
      .attach('file', await makeExcel(), 'mt.xlsx');

    const start = await request(srv)
      .post('/tarja/start')
      .set(H(tarjadorToken))
      .send({ vin: VIN_A })
      .expect(201);
    reportIdA = start.body.id;
    await request(srv)
      .patch(`/tarja/${reportIdA}/damages`)
      .set(H(tarjadorToken))
      .send({ hasDamage: false })
      .expect(200);
    await request(srv).post(`/tarja/${reportIdA}/finish`).set(H(tarjadorToken)).expect(201);
  });

  afterAll(async () => {
    await app.close();
  });

  it('el tarjador solo ve sus propias tarjas en GET /reports', async () => {
    const res = await request(app.getHttpServer()).get('/reports').set(H(tarjadorToken)).expect(200);
    expect(
      res.body.every((r: { tarjador: { username: string } }) => r.tarjador.username === 'tarjador'),
    ).toBe(true);
    expect(res.body.some((r: { id: number }) => r.id === reportIdA)).toBe(true);
  });

  it('supervisor/admin siguen viendo todas las tarjas sin filtro forzado', async () => {
    const res = await request(app.getHttpServer()).get('/reports').set(H(supervisorToken)).expect(200);
    expect(res.body.some((r: { id: number }) => r.id === reportIdA)).toBe(true);
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `cd backend && npx jest --config ./test/jest-e2e.json mis-tarjas.e2e-spec.ts --runInBand`
Expected: FAIL en "el tarjador solo ve sus propias tarjas" — hoy `GET /reports` devuelve las tarjas de todos los tarjadores.

- [ ] **Step 3: Implementar en `reports.service.ts`**

Reemplazar `listReports` (líneas 15-26 actuales):

```typescript
  listReports(operationId?: number, tarjadorId?: number) {
    return this.prisma.tarjaReport.findMany({
      where: {
        ...(operationId ? { operationId } : {}),
        ...(tarjadorId ? { tarjadorId } : {}),
      },
      orderBy: { id: 'desc' },
      take: 200,
      include: {
        vehicle: { select: { vin: true } },
        tarjador: { select: { username: true, initials: true } },
        operation: { select: { code: true } },
      },
    });
  }
```

- [ ] **Step 4: Implementar en `reports.controller.ts`**

Reemplazar el método `list` (líneas 23-26 actuales):

```typescript
  @Get('reports')
  list(@Query('operationId') operationId: string | undefined, @CurrentUser() user: AuthUser) {
    const scopedTarjadorId = user.role === 'TARJADOR' ? user.userId : undefined;
    return this.service.listReports(operationId ? Number(operationId) : undefined, scopedTarjadorId);
  }
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `cd backend && npx jest --config ./test/jest-e2e.json mis-tarjas.e2e-spec.ts --runInBand`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add backend/src/reports/reports.service.ts backend/src/reports/reports.controller.ts backend/test/mis-tarjas.e2e-spec.ts
git commit -m "feat(reports): el tarjador solo ve sus propias tarjas en GET /reports"
```

---

### Task 8: Backend — el tarjador puede descargar el PDF de sus propias tarjas

**Files:**
- Modify: `backend/src/pdf/pdf.controller.ts`
- Modify: `backend/src/pdf/pdf.service.ts`
- Modify: `backend/test/mis-tarjas.e2e-spec.ts`

- [ ] **Step 1: Escribir los tests e2e que fallan**

Agregar al `describe('Mis tarjas - alcance por tarjador (e2e)', ...)` del archivo del Task 7:

```typescript
  it('el tarjador puede descargar el PDF de su propia tarja', async () => {
    await request(app.getHttpServer())
      .get(`/reports/${reportIdA}/pdf`)
      .set(H(tarjadorToken))
      .expect(200);
  });

  it('el tarjador no puede descargar el PDF de una tarja ajena (403)', async () => {
    const srv = app.getHttpServer();
    const created = await request(srv)
      .post('/users')
      .set(H(adminToken))
      .send({
        name: 'Otro',
        lastname: 'Tarjador',
        username: `otro.tarjador.${RUN}`,
        email: `otro.tarjador.${RUN}@test.com`,
        password: 'OtroClave123',
        role: 'TARJADOR',
      })
      .expect(201);
    const otroToken = (
      await request(srv)
        .post('/auth/login')
        .send({ username: created.body.username, password: 'OtroClave123' })
    ).body.accessToken;

    const start = await request(srv)
      .post('/tarja/start')
      .set(H(otroToken))
      .send({ vin: VIN_B })
      .expect(201);
    const reportIdB = start.body.id;
    await request(srv)
      .patch(`/tarja/${reportIdB}/damages`)
      .set(H(otroToken))
      .send({ hasDamage: false })
      .expect(200);
    await request(srv).post(`/tarja/${reportIdB}/finish`).set(H(otroToken)).expect(201);

    await request(srv).get(`/reports/${reportIdB}/pdf`).set(H(tarjadorToken)).expect(403);
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && npx jest --config ./test/jest-e2e.json mis-tarjas.e2e-spec.ts --runInBand`
Expected: FAIL — hoy `GET /reports/:id/pdf` está restringido a `@Roles('SUPERVISOR', 'ADMIN')`, así que ambos tests reciben 403 (el primero debería ser 200).

- [ ] **Step 3: Implementar en `pdf.service.ts`**

Reemplazar el import y la firma de `generate` (líneas 1 y 22 actuales):

```typescript
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { type AuthUser } from '../auth/current-user.decorator';
import { renderReportHtml, type PdfAccessoryRow, type PdfReport } from './report-template';
```

```typescript
  async generate(reportId: number, actor: AuthUser): Promise<Buffer> {
    const report = await this.prisma.tarjaReport.findUnique({
      where: { id: reportId },
      include: {
        vehicle: true,
        operation: { include: { ship: true } },
        billOfLading: true,
        tarjador: true,
        accessories: { include: { accessory: true } },
        damages: true,
      },
    });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    if (actor.role === 'TARJADOR' && report.tarjadorId !== actor.userId) {
      throw new ForbiddenException('No puedes descargar el PDF de una tarja que no es tuya');
    }
```

(el resto del método sigue igual).

- [ ] **Step 4: Implementar en `pdf.controller.ts`**

Reemplazar el archivo completo:

```typescript
import { Controller, Get, Param, ParseIntPipe, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { PdfService } from './pdf.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class PdfController {
  constructor(private readonly service: PdfService) {}

  @Roles('SUPERVISOR', 'ADMIN', 'TARJADOR')
  @Get('reports/:id/pdf')
  async pdf(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
  ) {
    const buf = await this.service.generate(id, user);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="reporte-${id}.pdf"`,
      'Content-Length': String(buf.length),
    });
    res.end(buf);
  }
}
```

- [ ] **Step 5: Correr los tests y verificar que pasan**

Run: `cd backend && npx jest --config ./test/jest-e2e.json mis-tarjas.e2e-spec.ts --runInBand`
Expected: PASS (4 tests en total del archivo)

- [ ] **Step 6: Commit**

```bash
git add backend/src/pdf/pdf.controller.ts backend/src/pdf/pdf.service.ts backend/test/mis-tarjas.e2e-spec.ts
git commit -m "feat(pdf): el tarjador puede descargar el PDF de sus propias tarjas"
```

---

### Task 9: Frontend — página "Mis tarjas" y entrada de navegación

**Files:**
- Create: `frontend/app/mis-tarjas/page.tsx`
- Modify: `frontend/components/shell.tsx`

- [ ] **Step 1: Crear la página**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import Shell from '@/components/shell';
import { listReports, openReportPdf, type ReportRow } from '@/lib/api';
import { IconArrow } from '@/components/icons';

const STATUS_LABEL: Record<string, string> = {
  BORRADOR: 'En curso',
  FINALIZADO: 'Finalizado',
  CON_DANO: 'Con daño',
  ANULADO: 'Anulado',
};

export default function MisTarjasPage() {
  const [items, setItems] = useState<ReportRow[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await listReports());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function download(id: number) {
    setDownloadingId(id);
    try {
      await openReportPdf(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar el PDF');
    } finally {
      setDownloadingId(null);
    }
  }

  return (
    <Shell>
      <section className="rise mb-7">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted">Operación</p>
        <h1 className="mt-2 font-display text-[28px] font-extrabold leading-none tracking-tight text-navy-900 sm:text-[32px]">
          Mis tarjas
        </h1>
      </section>

      {error && <p className="mb-4 text-[12.5px] font-medium text-cosco-600">{error}</p>}

      {loading ? (
        <p className="text-[13px] text-muted">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white px-5 py-10 text-center">
          <p className="text-[13px] text-muted">Aún no has registrado ninguna tarja.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-canvas text-[10.5px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-semibold">Código</th>
                <th className="px-4 py-3 font-semibold">VIN</th>
                <th className="px-4 py-3 font-semibold">Operación</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0 hover:bg-canvas/60">
                  <td className="px-4 py-3 font-mono text-[12px] text-navy-900">{r.reportCode}</td>
                  <td className="px-4 py-3 font-mono text-[12px] text-muted">{r.vehicle?.vin ?? '—'}</td>
                  <td className="px-4 py-3 text-muted">{r.operation?.code ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ring-1 ring-inset ${
                        r.hasDamage
                          ? 'bg-cosco-50 text-cosco-600 ring-cosco-600/20'
                          : 'bg-jade-50 text-jade-600 ring-jade-600/15'
                      }`}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => download(r.id)}
                      disabled={downloadingId === r.id}
                      className="tap ring-focus inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-navy-700 transition-colors hover:bg-navy-50 disabled:opacity-50"
                    >
                      {downloadingId === r.id ? 'Descargando…' : 'Descargar PDF'}
                      <IconArrow className="h-3.5 w-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
```

- [ ] **Step 2: Agregar la entrada de navegación en `shell.tsx`**

Cambiar el import de `lucide-react` (líneas 8-22 actuales):

```typescript
import {
  Bell,
  ChevronRight,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  Ship,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
```

Cambiar el grupo `'Operación'` (líneas 38-46 actuales):

```typescript
  {
    section: 'Operación',
    items: [
      { href: '/dashboard', label: 'Panel', icon: LayoutDashboard, roles: ['ADMIN', 'SUPERVISOR', 'TARJADOR'] },
      { href: '/operations', label: 'Operaciones', icon: Ship, roles: ['ADMIN', 'SUPERVISOR', 'TARJADOR'] },
      { href: '/tarja', label: 'Tarja', icon: ClipboardList, roles: ['TARJADOR'] },
      { href: '/mis-tarjas', label: 'Mis tarjas', icon: History, roles: ['TARJADOR'] },
      { href: '/supervisor', label: 'Supervisión', icon: Radar, roles: ['ADMIN', 'SUPERVISOR'] },
    ],
  },
```

Cambiar `TITLES` (líneas 57-65 actuales):

```typescript
const TITLES: Record<string, { title: string; crumb: string }> = {
  '/dashboard': { title: 'Panel de control', crumb: 'Resumen operativo' },
  '/operations': { title: 'Operaciones', crumb: 'Naves, BL y vehículos' },
  '/tarja': { title: 'Tarja', crumb: 'Registro en campo' },
  '/mis-tarjas': { title: 'Mis tarjas', crumb: 'Historial personal' },
  '/supervisor': { title: 'Supervisión', crumb: 'Monitoreo en tiempo real' },
  '/users': { title: 'Usuarios', crumb: 'Cuentas y roles' },
  '/accessories': { title: 'Accesorios', crumb: 'Catálogo del formulario' },
  '/audit': { title: 'Auditoría', crumb: 'Registro de acciones' },
};
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `app/mis-tarjas/page.tsx` ni `components/shell.tsx`.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/mis-tarjas/page.tsx frontend/components/shell.tsx
git commit -m "feat(tarja): pagina Mis tarjas para el tarjador"
```

---

### Task 10: Backend — cambio de contraseña propio

**Files:**
- Modify: `backend/src/users/dto/user.dto.ts`
- Modify: `backend/src/users/users.service.ts`
- Modify: `backend/src/users/users.controller.ts`
- Modify: `backend/test/users.e2e-spec.ts`

- [ ] **Step 1: Escribir los tests e2e que fallan**

Agregar al final del `describe('Usuarios (e2e)', ...)` de `backend/test/users.e2e-spec.ts` (antes del cierre `});`):

```typescript
  it('un usuario cambia su propia contrasena con la actual correcta', async () => {
    const created = await request(app.getHttpServer())
      .post('/users')
      .set(H(adminT))
      .send({
        name: 'Gina',
        lastname: 'Vega',
        username: `gina.${RUN}`,
        email: `gina.${RUN}@test.com`,
        password: 'GinaClave123',
        role: 'TARJADOR',
      });
    const ginaToken = (
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: created.body.username, password: 'GinaClave123' })
    ).body.accessToken;

    await request(app.getHttpServer())
      .patch('/users/me/password')
      .set(H(ginaToken))
      .send({ currentPassword: 'GinaClave123', newPassword: 'GinaClaveNueva456' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: created.body.username, password: 'GinaClaveNueva456' })
      .expect(201);
  });

  it('rechaza el cambio de contrasena propia si la actual es incorrecta', async () => {
    await request(app.getHttpServer())
      .patch('/users/me/password')
      .set(H(tarjadorT))
      .send({ currentPassword: 'ClaveIncorrecta', newPassword: 'OtraClaveNueva456' })
      .expect(400);
  });
```

- [ ] **Step 2: Correr los tests y verificar que fallan**

Run: `cd backend && npx jest --config ./test/jest-e2e.json users.e2e-spec.ts --runInBand`
Expected: FAIL — `PATCH /users/me/password` no existe todavía (404).

- [ ] **Step 3: Agregar el DTO en `user.dto.ts`**

Agregar al final del archivo:

```typescript
export class ChangeOwnPasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}
```

- [ ] **Step 4: Agregar el método en `users.service.ts`**

Cambiar el import (línea 1 y 10 actuales):

```typescript
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashPassword, verifyPassword } from '../auth/password.util';
import { type AuthUser } from '../auth/current-user.decorator';
import {
  ChangeOwnPasswordDto,
  CreateUserDto,
  ResetPasswordDto,
  SetStatusDto,
  UpdateUserDto,
} from './dto/user.dto';
```

Agregar el método (después de `resetPassword`, antes de `findOrThrow`):

```typescript
  async changeOwnPassword(actor: AuthUser, dto: ChangeOwnPasswordDto) {
    const user = await this.prisma.user.findUnique({ where: { id: actor.userId } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const valid = await verifyPassword(dto.currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException('La contraseña actual no es correcta');

    const passwordHash = await hashPassword(dto.newPassword);
    await this.prisma.user.update({ where: { id: actor.userId }, data: { passwordHash } });
    this.audit.record({
      userId: actor.userId,
      username: actor.username,
      role: actor.role,
      module: 'users',
      action: 'USER_PASSWORD_SELF_CHANGED',
      description: `${actor.username} cambio su propia contrasena`,
    });
    return { id: actor.userId };
  }
```

- [ ] **Step 5: Agregar el endpoint en `users.controller.ts`**

Cambiar el import (líneas 16-21 actuales):

```typescript
import {
  ChangeOwnPasswordDto,
  CreateUserDto,
  ResetPasswordDto,
  SetStatusDto,
  UpdateUserDto,
} from './dto/user.dto';
```

Agregar el método, **antes** de `findAll` (para que la ruta literal `me/password` no quede detrás de `:id/password` en el registro de rutas):

```typescript
  @Patch('me/password')
  changeOwnPassword(@CurrentUser() actor: AuthUser, @Body() dto: ChangeOwnPasswordDto) {
    return this.service.changeOwnPassword(actor, dto);
  }
```

(sin `@Roles`: cualquier usuario autenticado puede cambiar su propia contraseña).

- [ ] **Step 6: Correr los tests y verificar que pasan**

Run: `cd backend && npx jest --config ./test/jest-e2e.json users.e2e-spec.ts --runInBand`
Expected: PASS (todos los tests del archivo)

- [ ] **Step 7: Commit**

```bash
git add backend/src/users/dto/user.dto.ts backend/src/users/users.service.ts backend/src/users/users.controller.ts backend/test/users.e2e-spec.ts
git commit -m "feat(users): cambio de contrasena propio (Mi perfil) para cualquier rol"
```

---

### Task 11: Frontend — página "Mi perfil" y entrada de navegación

**Files:**
- Modify: `frontend/lib/api.ts`
- Create: `frontend/app/perfil/page.tsx`
- Modify: `frontend/components/shell.tsx`

- [ ] **Step 1: Agregar el cliente API en `api.ts`**

Agregar después del bloque de usuarios (línea 209 actual):

```typescript
export const changeMyPassword = (currentPassword: string, newPassword: string) =>
  apiJson<{ id: number }>('/users/me/password', 'PATCH', { currentPassword, newPassword });
```

- [ ] **Step 2: Crear la página**

```tsx
'use client';

import { useState } from 'react';
import Shell from '@/components/shell';
import { changeMyPassword, getUser } from '@/lib/api';
import { Alert, Button, Label } from '@/components/ui';

export default function PerfilPage() {
  const user = getUser();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const valid =
    currentPassword.length > 0 && newPassword.length >= 8 && newPassword === confirmPassword;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setSaving(true);
    setError('');
    setSuccess(false);
    try {
      await changeMyPassword(currentPassword, newPassword);
      setSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cambiar la contraseña');
    } finally {
      setSaving(false);
    }
  }

  if (!user) return null;

  return (
    <Shell>
      <div className="mx-auto max-w-md">
        <section className="rise mb-7">
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted">Cuenta</p>
          <h1 className="mt-2 font-display text-[28px] font-extrabold leading-none tracking-tight text-navy-900 sm:text-[32px]">
            Mi perfil
          </h1>
          <p className="mt-2 text-[13px] text-muted">
            {user.name} {user.lastname} · {user.username}
          </p>
        </section>

        <form onSubmit={submit} className="rise space-y-4 rounded-2xl border border-line bg-white p-5">
          <div>
            <Label htmlFor="currentPassword">Contraseña actual</Label>
            <input
              id="currentPassword"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="field"
              autoComplete="current-password"
            />
          </div>
          <div>
            <Label htmlFor="newPassword">Nueva contraseña</Label>
            <input
              id="newPassword"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="field"
              autoComplete="new-password"
            />
          </div>
          <div>
            <Label htmlFor="confirmPassword">Confirmar nueva contraseña</Label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="field"
              autoComplete="new-password"
            />
            {newPassword && confirmPassword && newPassword !== confirmPassword && (
              <p className="mt-1.5 text-[11.5px] text-cosco-600">Las contraseñas no coinciden</p>
            )}
          </div>

          {error && <Alert>{error}</Alert>}
          {success && (
            <div className="rounded-xl border border-jade-600/25 bg-jade-50 px-3.5 py-3 text-[13px] font-medium text-jade-700">
              Contraseña actualizada correctamente.
            </div>
          )}

          <Button type="submit" full disabled={!valid || saving}>
            {saving ? 'Guardando…' : 'Cambiar contraseña'}
          </Button>
        </form>
      </div>
    </Shell>
  );
}
```

- [ ] **Step 3: Agregar la entrada de navegación en `shell.tsx`**

Cambiar el import de `lucide-react` (agregar `UserCog` a la lista del Task 9):

```typescript
import {
  Bell,
  ChevronRight,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  Ship,
  ShieldCheck,
  UserCog,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
```

Cambiar el grupo `'Sistema'` (líneas 47-54 actuales del archivo original, ya con "Mis tarjas" en Operación del Task 9):

```typescript
  {
    section: 'Sistema',
    items: [
      { href: '/perfil', label: 'Mi perfil', icon: UserCog, roles: ['ADMIN', 'SUPERVISOR', 'TARJADOR'] },
      { href: '/users', label: 'Usuarios', icon: Users, roles: ['ADMIN', 'SUPERVISOR'] },
      { href: '/accessories', label: 'Accesorios', icon: Wrench, roles: ['ADMIN'] },
      { href: '/audit', label: 'Auditoría', icon: ShieldCheck, roles: ['ADMIN'] },
    ],
  },
```

Agregar a `TITLES`:

```typescript
  '/perfil': { title: 'Mi perfil', crumb: 'Cuenta y seguridad' },
```

- [ ] **Step 4: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `lib/api.ts`, `app/perfil/page.tsx` ni `components/shell.tsx`.

- [ ] **Step 5: Commit**

```bash
git add frontend/lib/api.ts frontend/app/perfil/page.tsx frontend/components/shell.tsx
git commit -m "feat(users): pagina Mi perfil con cambio de contrasena propio"
```

---

### Task 12: Verificación manual end-to-end

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Levantar backend y frontend**

Run: `cd backend && npm run start:dev` (puerto 3000)
Run: `cd frontend && npm run dev` (puerto 3001)

- [ ] **Step 2: Probar como TARJADOR**

1. Loguear como `tarjador` / `Tarja123!`.
2. Iniciar una tarja nueva por VIN. En "Inventario de accesorios", dejar algunos sin marcar, marcar otros en "Sí" (con cantidad) y otros en "No". Verificar que "Todos" pone todo en Sí y "Limpiar" vuelve todo a "Sin marcar".
3. Completar el paso de daños y finalizar. Confirmar que el campo "Iniciales" del paso 3 se ve pero no se puede editar, y muestra las iniciales de la cuenta (`TJ1`).
4. Ir a "Mis tarjas" en el nav → debe aparecer la tarja recién finalizada. Descargar el PDF y confirmar: (a) los accesorios no tocados muestran "-", (b) la firma "Port" está en blanco, (c) las iniciales aparecen en la esquina inferior derecha del recuadro de observaciones.
5. Ir a "Mi perfil" → cambiar la contraseña con la actual correcta → cerrar sesión y volver a entrar con la nueva contraseña.

- [ ] **Step 3: Probar accesorios excedentes (requiere ADMIN)**

1. Loguear como `admin` / `Admin123!`.
2. Ir a "Accesorios" → agregar dos accesorios nuevos (ej. "Chalecos", "Triángulos") — quedarán en posición 17 y 18.
3. Loguear como `tarjador`, iniciar una tarja, marcar "Chalecos" (cantidad 3) y "Triángulos" (cantidad 2) como presentes, finalizar.
4. Descargar el PDF (desde "Mis tarjas" o desde Supervisión) y confirmar que "3 Chalecos, 2 Triángulos" aparece como texto en el recuadro de observaciones, y que no aparecen filas nuevas en la tabla de inventario de 16 casilleros.

- [ ] **Step 4: Probar como SUPERVISOR/ADMIN**

1. Confirmar que `GET /reports` (vista de Supervisión) sigue mostrando las tarjas de todos los tarjadores, sin filtrar.
2. Confirmar que "Mi perfil" también existe para estos roles y permite cambiar su propia contraseña.

- [ ] **Step 5: Registrar en memoria si hay hallazgos relevantes**

Si algo del comportamiento difiere de lo esperado, anotarlo y corregir antes de cerrar la tarea. No es necesario un paso de commit adicional si no hubo cambios de código.
