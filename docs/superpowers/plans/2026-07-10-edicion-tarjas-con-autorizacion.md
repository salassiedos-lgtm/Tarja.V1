# Edición de tarjas con autorización — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que un tarjador edite su tarja realizada libremente por 10 min y, pasado ese plazo, solo con autorización de un supervisor/admin (solicitud → aprobación), dejando trazabilidad con diff antes/después en auditoría.

**Architecture:** Se reutiliza el motor de reapertura existente (`tarja.service.reopen` → BORRADOR editable). Se añade una tabla `TarjaEditRequest` (cola de autorización) y un campo `editSnapshot` en `TarjaReport` para computar el diff al re-finalizar. La lógica de decisión (autorización, diff, snapshot) se extrae a funciones puras testeables (`edit.util.ts`); la cola vive en un servicio/controlador nuevos. El cron `autoRelease` exime las ediciones autorizadas.

**Tech Stack:** NestJS 11, Prisma 6 (Postgres), Jest (unit con PrismaService mockeado), Next.js (frontend), TypeScript.

**Referencia:** spec en `docs/superpowers/specs/2026-07-10-edicion-tarjas-con-autorizacion-design.md`.

**Nota de despliegue (dos Postgres):** la migración debe aplicarse a la BD que usa el frontend, el Postgres de Docker (`tarjav1-postgres-1`, host `:5433`, db `tarja`), además de la BD de dev (`:5432/tarja_dev`). Ver Task 14.

---

## Estructura de archivos

**Backend:**
- `backend/prisma/schema.prisma` — modificar: enum `EditRequestStatus`, modelo `TarjaEditRequest`, campo `editSnapshot` + relación en `TarjaReport`, relaciones en `User`.
- `backend/src/tarja/edit.util.ts` — crear: funciones puras `reopenSecondsLeft`, `canEnterEdit`, `snapshotOf`, `computeEditDiff`.
- `backend/src/tarja/edit.util.spec.ts` — crear: tests de las funciones puras.
- `backend/src/tarja/tarja.service.ts` — modificar: `reopen` (snapshot + camino autorizado), `finish` (diff + completar solicitud), `autoRelease` (exención).
- `backend/src/tarja/tarja.service.spec.ts` — crear: tests de guardas de `reopen`.
- `backend/src/tarja/edit-requests.service.ts` — crear: crear/listar/resolver/cancelar solicitudes.
- `backend/src/tarja/edit-requests.service.spec.ts` — crear: tests de guardas.
- `backend/src/tarja/edit-requests.controller.ts` — crear: endpoints de la cola.
- `backend/src/tarja/dto/edit-request.dto.ts` — crear: `EditRequestDto`, `ResolveEditRequestDto`.
- `backend/src/tarja/tarja.module.ts` — modificar: registrar servicio y controlador nuevos.
- `backend/src/tarja/tarja.controller.ts` — modificar: endpoint `edit-request`.
- `backend/src/vehicles/vehicles.controller.ts` y `vehicles.service.ts` — modificar: `naveVehicles` con `tarjadorId`, estado de edición y scope por rol.

**Frontend:**
- `frontend/lib/api.ts` — modificar: tipos y funciones nuevas.
- `frontend/app/tablero/[opId]/page.tsx` — modificar: filtro Realizados + botones Editar/Reabrir con estados.
- `frontend/app/solicitudes-edicion/page.tsx` — crear: bandeja del supervisor.
- `frontend/app/inicio/page.tsx` — modificar: MOD nuevo.
- `frontend/app/audit/page.tsx` — modificar: acciones nuevas en `ACTION_META`.

---

## Task 1: Esquema Prisma + migración

**Files:**
- Modify: `backend/prisma/schema.prisma`

- [ ] **Step 1: Añadir el enum y el modelo**

En `backend/prisma/schema.prisma`, tras el enum `WorkShift`, añadir:

```prisma
enum EditRequestStatus {
  PENDIENTE
  APROBADA
  RECHAZADA
  COMPLETADA
}
```

Al final del archivo, añadir el modelo:

```prisma
model TarjaEditRequest {
  id             Int               @id @default(autoincrement())
  reportId       Int               @map("report_id")
  report         TarjaReport       @relation(fields: [reportId], references: [id])
  requestedById  Int               @map("requested_by")
  requestedBy    User              @relation("EditReqRequester", fields: [requestedById], references: [id])
  reason         String
  status         EditRequestStatus @default(PENDIENTE)
  resolvedById   Int?              @map("resolved_by")
  resolvedBy     User?             @relation("EditReqResolver", fields: [resolvedById], references: [id])
  resolvedAt     DateTime?         @map("resolved_at")
  resolveComment String?           @map("resolve_comment")
  createdAt      DateTime          @default(now()) @map("created_at")
  updatedAt      DateTime          @updatedAt @map("updated_at")

  @@index([status])
  @@index([reportId])
  @@map("tarja_edit_requests")
}
```

- [ ] **Step 2: Añadir campo y relación en `TarjaReport`**

Dentro de `model TarjaReport`, junto a los demás campos, añadir:

```prisma
  editSnapshot Json?               @map("edit_snapshot")
  editRequests TarjaEditRequest[]
```

- [ ] **Step 3: Añadir relaciones inversas en `User`**

Dentro de `model User`, junto a las demás relaciones, añadir:

```prisma
  editRequestsMade     TarjaEditRequest[] @relation("EditReqRequester")
  editRequestsResolved TarjaEditRequest[] @relation("EditReqResolver")
```

- [ ] **Step 4: Crear la migración y regenerar el cliente**

Run:
```bash
cd backend
DATABASE_URL="postgresql://tarja:tarja_local@localhost:5432/tarja_dev?schema=public" \
  npx prisma migrate dev --name tarja_edit_requests
```
Expected: crea `backend/prisma/migrations/<ts>_tarja_edit_requests/` y regenera `@prisma/client` sin error.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(tarja): esquema de solicitudes de edicion (TarjaEditRequest + editSnapshot)"
```

---

## Task 2: Funciones puras de edición (autorización, snapshot, diff)

**Files:**
- Create: `backend/src/tarja/edit.util.ts`
- Test: `backend/src/tarja/edit.util.spec.ts`

- [ ] **Step 1: Escribir los tests que fallan**

Crear `backend/src/tarja/edit.util.spec.ts`:

```ts
import {
  REOPEN_WINDOW_MIN,
  reopenSecondsLeft,
  canEnterEdit,
  snapshotOf,
  computeEditDiff,
  type TarjaSnapshot,
} from './edit.util';

const base = {
  status: 'FINALIZADO' as const,
  finishedAt: new Date('2026-07-10T12:00:00Z'),
  tarjadorId: 5,
};

describe('reopenSecondsLeft', () => {
  it('devuelve segundos restantes dentro de la ventana', () => {
    const now = new Date('2026-07-10T12:04:00Z'); // 4 min después
    expect(reopenSecondsLeft(base, now)).toBe(REOPEN_WINDOW_MIN * 60 - 240);
  });
  it('0 si venció', () => {
    expect(reopenSecondsLeft(base, new Date('2026-07-10T12:20:00Z'))).toBe(0);
  });
  it('0 si no está finalizada', () => {
    expect(reopenSecondsLeft({ ...base, status: 'BORRADOR' }, new Date())).toBe(0);
  });
});

describe('canEnterEdit', () => {
  const now = new Date('2026-07-10T12:04:00Z'); // dentro de ventana
  const late = new Date('2026-07-10T12:20:00Z'); // fuera de ventana
  it('bloquea si no es el dueño', () => {
    expect(canEnterEdit(base, 9, false, now)).toEqual({ allowed: false, code: 'NOT_OWNER' });
  });
  it('bloquea si no está finalizada', () => {
    expect(canEnterEdit({ ...base, status: 'ANULADO' }, 5, false, now).code).toBe('NOT_FINALIZED');
  });
  it('permite al dueño dentro de la ventana', () => {
    expect(canEnterEdit(base, 5, false, now)).toEqual({ allowed: true });
  });
  it('permite al dueño fuera de ventana si hay solicitud aprobada', () => {
    expect(canEnterEdit(base, 5, true, late)).toEqual({ allowed: true });
  });
  it('exige autorización al dueño fuera de ventana sin aprobación', () => {
    expect(canEnterEdit(base, 5, false, late)).toEqual({ allowed: false, code: 'REQUIERE_AUTORIZACION' });
  });
});

describe('snapshotOf / computeEditDiff', () => {
  const report = {
    hasDamage: false,
    damageSource: null,
    damageOperation: null,
    damageAffects: null,
    damageMoment: null,
    damageMomentOther: null,
    details: null,
    tarjadorInitials: 'JIR',
    accessories: [
      { hasAccessory: true, quantity: 1, accessory: { name: 'Radio' } },
      { hasAccessory: true, quantity: 1, accessory: { name: 'Llaves del vehiculo' } },
    ],
    damages: [] as { description: string }[],
  };

  it('snapshotOf ordena accesorios y daños de forma estable', () => {
    const snap = snapshotOf(report);
    expect(snap.accessories.map((a) => a.name)).toEqual(['Llaves del vehiculo', 'Radio']);
    expect(snap.hasDamage).toBe(false);
  });

  it('sin cambios: changed=false', () => {
    const before = snapshotOf(report);
    const after = snapshotOf(report);
    expect(computeEditDiff(before, after).changed).toBe(false);
  });

  it('detecta daño, accesorio y cantidad', () => {
    const before = snapshotOf(report);
    const after = snapshotOf({
      ...report,
      hasDamage: true,
      damageSource: 'ENCONTRADO',
      accessories: [
        { hasAccessory: false, quantity: 0, accessory: { name: 'Radio' } },
        { hasAccessory: true, quantity: 2, accessory: { name: 'Llaves del vehiculo' } },
      ],
      damages: [{ description: 'Rayón puerta' }],
    });
    const diff = computeEditDiff(before, after);
    expect(diff.changed).toBe(true);
    expect(diff.summary).toContain('Daño No→Sí');
    expect(diff.summary).toContain('Radio Sí→No');
    expect(diff.summary).toContain('Llaves del vehiculo ×1→×2');
    expect(diff.summary).toContain("+daño 'Rayón puerta'");
    expect(JSON.parse(diff.oldJson).hasDamage).toBe(false);
    expect(JSON.parse(diff.newJson).hasDamage).toBe(true);
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx jest edit.util -t "canEnterEdit" 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './edit.util'`.

- [ ] **Step 3: Implementar `edit.util.ts`**

Crear `backend/src/tarja/edit.util.ts`:

```ts
/** Minutos de la ventana de edición libre del dueño tras finalizar. */
export const REOPEN_WINDOW_MIN = 10;

type ReportStateForEdit = {
  status: string;
  finishedAt: Date | null;
  tarjadorId: number;
};

/** Segundos restantes de la ventana de 10 min desde finishedAt. 0 si venció o no aplica. */
export function reopenSecondsLeft(
  report: { status: string; finishedAt: Date | null },
  now: Date = new Date(),
): number {
  if (report.status !== 'FINALIZADO' && report.status !== 'CON_DANO') return 0;
  if (!report.finishedAt) return 0;
  const elapsed = (now.getTime() - report.finishedAt.getTime()) / 1000;
  return Math.max(0, Math.round(REOPEN_WINDOW_MIN * 60 - elapsed));
}

export type EnterEditResult =
  | { allowed: true }
  | { allowed: false; code: 'NOT_OWNER' | 'NOT_FINALIZED' | 'REQUIERE_AUTORIZACION' };

/** Decide si el usuario puede entrar a editar la tarja. Pura y testeable. */
export function canEnterEdit(
  report: ReportStateForEdit,
  userId: number,
  hasApprovedRequest: boolean,
  now: Date = new Date(),
): EnterEditResult {
  if (report.tarjadorId !== userId) return { allowed: false, code: 'NOT_OWNER' };
  if (report.status !== 'FINALIZADO' && report.status !== 'CON_DANO') {
    return { allowed: false, code: 'NOT_FINALIZED' };
  }
  if (reopenSecondsLeft(report, now) > 0 || hasApprovedRequest) return { allowed: true };
  return { allowed: false, code: 'REQUIERE_AUTORIZACION' };
}

export interface TarjaSnapshot {
  hasDamage: boolean;
  damageSource: string | null;
  damageOperation: string | null;
  damageAffects: string | null;
  damageMoment: string | null;
  damageMomentOther: string | null;
  details: string | null;
  tarjadorInitials: string | null;
  accessories: { name: string; hasAccessory: boolean; quantity: number }[];
  damages: string[];
}

type ReportWithRelations = {
  hasDamage: boolean;
  damageSource: string | null;
  damageOperation: string | null;
  damageAffects: string | null;
  damageMoment: string | null;
  damageMomentOther: string | null;
  details: string | null;
  tarjadorInitials: string | null;
  accessories: { hasAccessory: boolean; quantity: number; accessory: { name: string } }[];
  damages: { description: string }[];
};

/** Serializa el estado editable de un reporte, con orden estable para comparar. */
export function snapshotOf(r: ReportWithRelations): TarjaSnapshot {
  return {
    hasDamage: r.hasDamage,
    damageSource: r.damageSource,
    damageOperation: r.damageOperation,
    damageAffects: r.damageAffects,
    damageMoment: r.damageMoment,
    damageMomentOther: r.damageMomentOther,
    details: r.details,
    tarjadorInitials: r.tarjadorInitials,
    accessories: r.accessories
      .map((a) => ({ name: a.accessory.name, hasAccessory: a.hasAccessory, quantity: a.quantity }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    damages: r.damages.map((d) => d.description).sort((a, b) => a.localeCompare(b)),
  };
}

export interface EditDiff {
  changed: boolean;
  summary: string;
  oldJson: string;
  newJson: string;
}

const yn = (b: boolean) => (b ? 'Sí' : 'No');

/** Compara dos snapshots y produce un resumen legible + JSON antes/después. */
export function computeEditDiff(before: TarjaSnapshot, after: TarjaSnapshot): EditDiff {
  const parts: string[] = [];

  if (before.hasDamage !== after.hasDamage) {
    const extra = after.hasDamage && after.damageSource ? ` (${after.damageSource})` : '';
    parts.push(`Daño ${yn(before.hasDamage)}→${yn(after.hasDamage)}${extra}`);
  }
  if ((before.details ?? '') !== (after.details ?? '')) parts.push('detalles modificados');
  if ((before.tarjadorInitials ?? '') !== (after.tarjadorInitials ?? '')) parts.push('iniciales modificadas');

  const beforeAcc = new Map(before.accessories.map((a) => [a.name, a]));
  for (const a of after.accessories) {
    const b = beforeAcc.get(a.name);
    if (!b) continue;
    if (b.hasAccessory !== a.hasAccessory) parts.push(`${a.name} ${yn(b.hasAccessory)}→${yn(a.hasAccessory)}`);
    else if (b.quantity !== a.quantity) parts.push(`${a.name} ×${b.quantity}→×${a.quantity}`);
  }

  const beforeDmg = new Set(before.damages);
  const afterDmg = new Set(after.damages);
  for (const d of after.damages) if (!beforeDmg.has(d)) parts.push(`+daño '${d}'`);
  for (const d of before.damages) if (!afterDmg.has(d)) parts.push(`-daño '${d}'`);

  return {
    changed: parts.length > 0,
    summary: parts.join('; '),
    oldJson: JSON.stringify(before),
    newJson: JSON.stringify(after),
  };
}
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `cd backend && npx jest edit.util 2>&1 | tail -20`
Expected: PASS (todos los describe).

- [ ] **Step 5: Commit**

```bash
git add backend/src/tarja/edit.util.ts backend/src/tarja/edit.util.spec.ts
git commit -m "feat(tarja): funciones puras de autorizacion, snapshot y diff de edicion"
```

---

## Task 3: `reopen` con snapshot y camino autorizado

**Files:**
- Modify: `backend/src/tarja/tarja.service.ts`
- Test: `backend/src/tarja/tarja.service.spec.ts`

- [ ] **Step 1: Escribir el test de guarda que falla**

Crear `backend/src/tarja/tarja.service.spec.ts`:

```ts
import { TarjaService } from './tarja.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RealtimeService } from '../realtime/realtime.service';
import type { AuditService } from '../audit/audit.service';
import type { ReportCodeService } from './report-code.service';

function makeService(reportFindUnique: jest.Mock, editReqCount: jest.Mock) {
  const prisma = {
    tarjaReport: { findUnique: reportFindUnique },
    tarjaEditRequest: { count: editReqCount },
  } as unknown as PrismaService;
  const realtime = { emit: jest.fn() } as unknown as RealtimeService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const reportCode = { next: jest.fn() } as unknown as ReportCodeService;
  return new TarjaService(prisma, realtime, audit, reportCode);
}

describe('TarjaService.reopen guardas', () => {
  const finished = {
    id: 1,
    tarjadorId: 5,
    status: 'FINALIZADO',
    finishedAt: new Date(Date.now() - 20 * 60_000), // hace 20 min (ventana vencida)
    vehicleId: 10,
    operationId: 3,
  };

  it('no-dueño → ForbiddenException', async () => {
    const svc = makeService(jest.fn().mockResolvedValue(finished), jest.fn().mockResolvedValue(0));
    await expect(svc.reopen(1, 9)).rejects.toThrow('tarjador');
  });

  it('ventana vencida sin aprobación → BadRequest REQUIERE_AUTORIZACION', async () => {
    const svc = makeService(jest.fn().mockResolvedValue(finished), jest.fn().mockResolvedValue(0));
    await expect(svc.reopen(1, 5)).rejects.toThrow('autoriz');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx jest tarja.service 2>&1 | tail -20`
Expected: FAIL (la implementación actual lanza otro mensaje / no consulta `tarjaEditRequest`).

- [ ] **Step 3: Reescribir `reopen` en `tarja.service.ts`**

En `backend/src/tarja/tarja.service.ts`, reemplazar los imports de la ventana y el método `reopen`. Primero, sustituir el bloque de constante/función local por el import de `edit.util`:

Quitar:
```ts
const AUTO_RELEASE_MIN = 15;
/** Ventana de edición post-finalización: el tarjador dueño puede reabrir su tarja. */
const REOPEN_WINDOW_MIN = 10;

/** Segundos que restan de la ventana de 10 min, medidos desde finishedAt. 0 si venció o no aplica. */
function reopenSecondsLeft(report: {
  status: ReportStatus;
  finishedAt: Date | null;
}): number {
  if (report.status !== 'FINALIZADO' && report.status !== 'CON_DANO') return 0;
  if (!report.finishedAt) return 0;
  const elapsed = (Date.now() - report.finishedAt.getTime()) / 1000;
  return Math.max(0, Math.round(REOPEN_WINDOW_MIN * 60 - elapsed));
}
```

Poner (dejando `AUTO_RELEASE_MIN` local):
```ts
const AUTO_RELEASE_MIN = 15;
```

Y en los imports de la cabecera, añadir:
```ts
import {
  REOPEN_WINDOW_MIN,
  reopenSecondsLeft,
  canEnterEdit,
  snapshotOf,
  computeEditDiff,
} from './edit.util';
```

Reemplazar el método `reopen` completo por:

```ts
  /**
   * Entra a editar una tarja finalizada. Dos caminos:
   *  - Dueño dentro de la ventana de 10 min (edición libre).
   *  - Dueño con una solicitud de edición APROBADA (post-10min, sin cronómetro).
   * Captura un snapshot del estado actual para el diff posterior, pasa el reporte
   * a BORRADOR y bloquea el vehículo. Conserva finishedAt/duración.
   */
  async reopen(reportId: number, userId: number) {
    const report = await this.prisma.tarjaReport.findUnique({
      where: { id: reportId },
      include: {
        accessories: { include: { accessory: { select: { name: true } } } },
        damages: { select: { description: true } },
        operation: { select: { status: true, code: true } },
      },
    });
    if (!report) throw new NotFoundException('Reporte no encontrado');

    const approved = await this.prisma.tarjaEditRequest.count({
      where: { reportId, status: 'APROBADA' },
    });
    const gate = canEnterEdit(report, userId, approved > 0, new Date());
    if (!gate.allowed) {
      if (gate.code === 'NOT_OWNER') {
        throw new ForbiddenException('Solo el tarjador que la realizó puede editar esta tarja');
      }
      if (gate.code === 'NOT_FINALIZED') {
        throw new BadRequestException('La tarja no está finalizada');
      }
      throw new BadRequestException(
        'REQUIERE_AUTORIZACION: la ventana de edición de 10 minutos expiró. Solicita autorización al supervisor.',
      );
    }
    if (report.operation.status !== 'ACTIVA') {
      throw new ConflictException(
        `El lote ${report.operation.code} está cerrado. Pídele al administrador que lo abra para editar.`,
      );
    }

    const snapshot = snapshotOf(report);

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.tarjaReport.update({
        where: { id: reportId },
        data: { status: 'BORRADOR', editSnapshot: snapshot as unknown as Prisma.InputJsonValue },
      });
      await tx.vehicle.update({
        where: { id: report.vehicleId },
        data: {
          status: 'EN_PROCESO',
          lockedById: userId,
          lockedAt: new Date(),
          currentReportId: reportId,
        },
      });
      return r;
    });

    this.realtime.emit('report.reopened', {
      reportId,
      operationId: report.operationId,
      vehicleId: report.vehicleId,
    });
    this.audit.record({
      userId,
      module: 'tarja',
      action: 'EDIT_START',
      description: `Tarja ${report.reportCode} abierta para edición (ventana ${REOPEN_WINDOW_MIN} min o autorizada)`,
    });
    return updated;
  }
```

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `cd backend && npx jest tarja.service 2>&1 | tail -20`
Expected: PASS (ambas guardas). `npx tsc --noEmit` sin errores.

- [ ] **Step 5: Commit**

```bash
git add backend/src/tarja/tarja.service.ts backend/src/tarja/tarja.service.spec.ts
git commit -m "feat(tarja): reopen captura snapshot y admite edicion autorizada"
```

---

## Task 4: `finish` con diff en auditoría y cierre de solicitud

**Files:**
- Modify: `backend/src/tarja/tarja.service.ts`

- [ ] **Step 1: Reescribir `finish`**

En `backend/src/tarja/tarja.service.ts`, reemplazar el método `finish` completo por (añade el bloque de diff cuando el reporte trae `editSnapshot`):

```ts
  async finish(reportId: number, dto: FinishTarjaDto) {
    const report = await this.getDraft(reportId);
    const now = new Date();
    const durationSeconds =
      report.finishedAt != null
        ? report.durationSeconds
        : report.startedAt
          ? Math.max(0, Math.round((now.getTime() - report.startedAt.getTime()) / 1000))
          : null;
    const status: ReportStatus = report.hasDamage ? 'CON_DANO' : 'FINALIZADO';
    const vehicleStatus: VehicleStatus = report.hasDamage ? 'OBSERVADO' : 'TARJADO';
    const { reportDate, workShift } = limaShift(now);

    // ¿Es el cierre de una edición? Entonces computamos el diff contra el snapshot.
    const isEdit = report.editSnapshot != null;

    const updated = await this.prisma.$transaction(async (tx) => {
      const r = await tx.tarjaReport.update({
        where: { id: reportId },
        data: {
          finishedAt: now,
          durationSeconds,
          status,
          reportDate,
          workShift,
          details: dto.details ?? null,
          tarjadorInitials: dto.initials ?? null,
          editSnapshot: Prisma.DbNull,
        },
      });
      await tx.vehicle.update({
        where: { id: report.vehicleId },
        data: { status: vehicleStatus, lockedById: null, lockedAt: null },
      });
      // Cerrar una solicitud aprobada asociada, si la hubiera.
      if (isEdit) {
        await tx.tarjaEditRequest.updateMany({
          where: { reportId, status: 'APROBADA' },
          data: { status: 'COMPLETADA' },
        });
      }
      return r;
    });

    if (isEdit) {
      const after = await this.prisma.tarjaReport.findUnique({
        where: { id: reportId },
        include: {
          accessories: { include: { accessory: { select: { name: true } } } },
          damages: { select: { description: true } },
        },
      });
      const before = report.editSnapshot as unknown as ReturnType<typeof snapshotOf>;
      const diff = computeEditDiff(before, snapshotOf(after!));
      this.audit.record({
        userId: report.tarjadorId,
        module: 'tarja',
        action: 'EDITADA',
        description: diff.changed
          ? `Editó ${report.reportCode} · ${diff.summary}`
          : `Editó ${report.reportCode} · sin cambios`,
        oldValue: diff.oldJson,
        newValue: diff.newJson,
      });
    } else {
      this.audit.record({
        userId: report.tarjadorId,
        module: 'tarja',
        action: 'FINISH',
        description: `Reporte ${reportId} -> ${status}`,
      });
    }

    this.realtime.emit('report.finished', {
      reportId,
      operationId: report.operationId,
      vehicleId: report.vehicleId,
      status,
    });
    return updated;
  }
```

Nota: `getDraft` hace `findUnique` sin incluir `editSnapshot` explícitamente, pero al ser columna escalar del modelo viene por defecto. Verificar que `report.editSnapshot` esté disponible; si `getDraft` usa `select`, añadir `editSnapshot: true` (revisar `getDraft` — actualmente hace `findUnique({ where })` sin select, así que trae todo).

- [ ] **Step 2: Verificar tipos**

Run: `cd backend && npx tsc --noEmit 2>&1 | tail -20`
Expected: sin errores. (`Prisma.DbNull` limpia el campo Json.)

- [ ] **Step 3: Ejecutar tests existentes**

Run: `cd backend && npx jest tarja 2>&1 | tail -20`
Expected: PASS (no rompe los tests de reopen).

- [ ] **Step 4: Commit**

```bash
git add backend/src/tarja/tarja.service.ts
git commit -m "feat(tarja): finish audita EDITADA con diff y cierra la solicitud"
```

---

## Task 5: Exención de la edición autorizada en `autoRelease`

**Files:**
- Modify: `backend/src/tarja/tarja.service.ts`

- [ ] **Step 1: Ajustar la consulta de reaperturas abandonadas**

En `autoRelease()`, la segunda consulta (`abandoned`) debe excluir reportes con una solicitud `APROBADA` activa. Reemplazar:

```ts
    const reopenThreshold = new Date(Date.now() - REOPEN_WINDOW_MIN * 60_000);
    const abandoned = await this.prisma.tarjaReport.findMany({
      where: { status: 'BORRADOR', finishedAt: { lt: reopenThreshold } },
      select: { id: true, vehicleId: true, operationId: true, hasDamage: true },
    });
```

por:

```ts
    const reopenThreshold = new Date(Date.now() - REOPEN_WINDOW_MIN * 60_000);
    const abandoned = await this.prisma.tarjaReport.findMany({
      // Las ediciones AUTORIZADAS no tienen cronómetro: se eximen del auto-revert.
      where: {
        status: 'BORRADOR',
        finishedAt: { lt: reopenThreshold },
        NOT: { editRequests: { some: { status: 'APROBADA' } } },
      },
      select: { id: true, vehicleId: true, operationId: true, hasDamage: true },
    });
```

- [ ] **Step 2: Verificar tipos y tests**

Run: `cd backend && npx tsc --noEmit && npx jest tarja 2>&1 | tail -15`
Expected: sin errores; tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/tarja/tarja.service.ts
git commit -m "feat(tarja): autoRelease exime ediciones autorizadas (sin cronometro)"
```

---

## Task 6: DTOs de solicitud de edición

**Files:**
- Create: `backend/src/tarja/dto/edit-request.dto.ts`

- [ ] **Step 1: Crear los DTOs**

Crear `backend/src/tarja/dto/edit-request.dto.ts`:

```ts
import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

export class EditRequestDto {
  @IsString()
  @MinLength(3)
  reason: string;
}

export class ResolveEditRequestDto {
  @IsBoolean()
  approve: boolean;

  @IsOptional()
  @IsString()
  comment?: string;
}
```

- [ ] **Step 2: Verificar tipos**

Run: `cd backend && npx tsc --noEmit 2>&1 | tail -10`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add backend/src/tarja/dto/edit-request.dto.ts
git commit -m "feat(tarja): DTOs de solicitud de edicion"
```

---

## Task 7: `EditRequestsService` — crear, listar, resolver, cancelar

**Files:**
- Create: `backend/src/tarja/edit-requests.service.ts`
- Test: `backend/src/tarja/edit-requests.service.spec.ts`

- [ ] **Step 1: Escribir los tests de guarda que fallan**

Crear `backend/src/tarja/edit-requests.service.spec.ts`:

```ts
import { EditRequestsService } from './edit-requests.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { RealtimeService } from '../realtime/realtime.service';

function make(over: Partial<Record<string, unknown>> = {}) {
  const prisma = {
    tarjaReport: { findUnique: jest.fn() },
    tarjaEditRequest: { findFirst: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    vehicle: { update: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaTx)),
    ...over,
  } as unknown as PrismaService;
  const prismaTx = prisma;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const realtime = { emit: jest.fn() } as unknown as RealtimeService;
  return { svc: new EditRequestsService(prisma, audit, realtime), prisma, audit };
}

describe('EditRequestsService.create', () => {
  it('rechaza si no es el dueño', async () => {
    const { svc, prisma } = make();
    (prisma.tarjaReport.findUnique as jest.Mock).mockResolvedValue({
      id: 1, tarjadorId: 5, status: 'FINALIZADO', finishedAt: new Date(Date.now() - 20 * 60_000),
    });
    await expect(svc.create(1, 9, { reason: 'me equivoqué' })).rejects.toThrow('dueñ');
  });

  it('rechaza si aún está dentro de la ventana (no necesita autorización)', async () => {
    const { svc, prisma } = make();
    (prisma.tarjaReport.findUnique as jest.Mock).mockResolvedValue({
      id: 1, tarjadorId: 5, status: 'FINALIZADO', finishedAt: new Date(),
    });
    await expect(svc.create(1, 5, { reason: 'x' })).rejects.toThrow('ventana');
  });

  it('rechaza solicitud duplicada activa', async () => {
    const { svc, prisma } = make();
    (prisma.tarjaReport.findUnique as jest.Mock).mockResolvedValue({
      id: 1, tarjadorId: 5, status: 'FINALIZADO', finishedAt: new Date(Date.now() - 20 * 60_000),
    });
    (prisma.tarjaEditRequest.findFirst as jest.Mock).mockResolvedValue({ id: 99, status: 'PENDIENTE' });
    await expect(svc.create(1, 5, { reason: 'x' })).rejects.toThrow('ya');
  });
});
```

- [ ] **Step 2: Ejecutar y verificar que falla**

Run: `cd backend && npx jest edit-requests 2>&1 | tail -20`
Expected: FAIL — `Cannot find module './edit-requests.service'`.

- [ ] **Step 3: Implementar el servicio**

Crear `backend/src/tarja/edit-requests.service.ts`:

```ts
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { RealtimeService } from '../realtime/realtime.service';
import { EditRequestDto, ResolveEditRequestDto } from './dto/edit-request.dto';
import { reopenSecondsLeft } from './edit.util';

@Injectable()
export class EditRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  /** El dueño solicita autorización para editar una tarja cuya ventana venció. */
  async create(reportId: number, userId: number, dto: EditRequestDto) {
    const report = await this.prisma.tarjaReport.findUnique({ where: { id: reportId } });
    if (!report) throw new NotFoundException('Reporte no encontrado');
    if (report.tarjadorId !== userId) {
      throw new ForbiddenException('Solo el tarjador dueño puede solicitar la edición');
    }
    if (report.status !== 'FINALIZADO' && report.status !== 'CON_DANO') {
      throw new BadRequestException('La tarja no está finalizada');
    }
    if (reopenSecondsLeft(report) > 0) {
      throw new BadRequestException('Aún estás dentro de la ventana de edición; no necesitas autorización');
    }
    const active = await this.prisma.tarjaEditRequest.findFirst({
      where: { reportId, status: { in: ['PENDIENTE', 'APROBADA'] } },
    });
    if (active) throw new BadRequestException('Ya existe una solicitud de edición activa para esta tarja');

    const created = await this.prisma.tarjaEditRequest.create({
      data: { reportId, requestedById: userId, reason: dto.reason },
    });
    this.audit.record({
      userId,
      module: 'tarja',
      action: 'EDIT_REQUEST',
      description: `Solicita editar ${report.reportCode}: ${dto.reason}`,
    });
    this.realtime.emit('edit_request.created', { reportId, requestId: created.id });
    return created;
  }

  /** Bandeja para supervisor/admin. */
  list(status: string = 'PENDIENTE') {
    return this.prisma.tarjaEditRequest.findMany({
      where: { status: status as never },
      orderBy: { id: 'desc' },
      take: 200,
      include: {
        requestedBy: { select: { name: true, lastname: true, initials: true, username: true } },
        report: {
          select: {
            reportCode: true,
            vehicle: { select: { vin: true } },
            operation: { select: { code: true, ship: { select: { name: true } } } },
          },
        },
      },
    });
  }

  /** Supervisor/admin aprueba o rechaza. */
  async resolve(requestId: number, resolverId: number, dto: ResolveEditRequestDto) {
    const req = await this.prisma.tarjaEditRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new NotFoundException('Solicitud no encontrada');
    if (req.status !== 'PENDIENTE') throw new BadRequestException('La solicitud ya fue resuelta');

    const status = dto.approve ? 'APROBADA' : 'RECHAZADA';
    const updated = await this.prisma.tarjaEditRequest.update({
      where: { id: requestId },
      data: { status, resolvedById: resolverId, resolvedAt: new Date(), resolveComment: dto.comment ?? null },
    });
    this.audit.record({
      userId: resolverId,
      module: 'tarja',
      action: dto.approve ? 'EDIT_APPROVED' : 'EDIT_REJECTED',
      description: `Solicitud de edición #${requestId} ${dto.approve ? 'aprobada' : 'rechazada'}` +
        (dto.comment ? `: ${dto.comment}` : ''),
    });
    this.realtime.emit('edit_request.resolved', { requestId, reportId: req.reportId, approved: dto.approve });
    return updated;
  }

  /** Supervisor/admin cancela una edición autorizada en curso: revierte a finalizada. */
  async cancel(requestId: number, resolverId: number) {
    const req = await this.prisma.tarjaEditRequest.findUnique({
      where: { id: requestId },
      include: { report: { select: { id: true, vehicleId: true, hasDamage: true, reportCode: true } } },
    });
    if (!req) throw new NotFoundException('Solicitud no encontrada');
    if (req.status !== 'APROBADA') throw new BadRequestException('Solo se cancela una edición autorizada en curso');

    await this.prisma.$transaction(async (tx) => {
      await tx.tarjaReport.update({
        where: { id: req.reportId },
        data: {
          status: req.report.hasDamage ? 'CON_DANO' : 'FINALIZADO',
          editSnapshot: null,
        },
      });
      await tx.vehicle.update({
        where: { id: req.report.vehicleId },
        data: {
          status: req.report.hasDamage ? 'OBSERVADO' : 'TARJADO',
          lockedById: null,
          lockedAt: null,
          currentReportId: req.reportId,
        },
      });
      await tx.tarjaEditRequest.update({ where: { id: requestId }, data: { status: 'RECHAZADA' } });
    });
    this.audit.record({
      userId: resolverId,
      module: 'tarja',
      action: 'EDIT_CANCELED',
      description: `Edición autorizada de ${req.report.reportCode} cancelada por el supervisor`,
    });
    this.realtime.emit('edit_request.canceled', { requestId, reportId: req.reportId });
    return { canceled: true };
  }
}
```

Nota: `editSnapshot: null` en `cancel` usa `null` directo (Prisma acepta `null` para limpiar `Json?` en `update` si el tipo lo permite; si `tsc` se queja, usar `Prisma.DbNull` importando `Prisma`).

- [ ] **Step 4: Ejecutar y verificar que pasan**

Run: `cd backend && npx jest edit-requests 2>&1 | tail -20`
Expected: PASS (las 3 guardas de `create`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/tarja/edit-requests.service.ts backend/src/tarja/edit-requests.service.spec.ts
git commit -m "feat(tarja): servicio de solicitudes de edicion (crear/listar/resolver/cancelar)"
```

---

## Task 8: Controlador y wiring del módulo

**Files:**
- Create: `backend/src/tarja/edit-requests.controller.ts`
- Modify: `backend/src/tarja/tarja.controller.ts`
- Modify: `backend/src/tarja/tarja.module.ts`

- [ ] **Step 1: Crear el controlador de la cola**

Crear `backend/src/tarja/edit-requests.controller.ts`:

```ts
import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { EditRequestsService } from './edit-requests.service';
import { ResolveEditRequestDto } from './dto/edit-request.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tarja/edit-requests')
export class EditRequestsController {
  constructor(private readonly service: EditRequestsService) {}

  @Roles('SUPERVISOR', 'ADMIN')
  @Get()
  list(@Query('status') status?: string) {
    return this.service.list(status ?? 'PENDIENTE');
  }

  @Roles('SUPERVISOR', 'ADMIN')
  @Post(':id/resolve')
  resolve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveEditRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.resolve(id, user.userId, dto);
  }

  @Roles('SUPERVISOR', 'ADMIN')
  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.cancel(id, user.userId);
  }
}
```

- [ ] **Step 2: Añadir el endpoint de solicitud en `tarja.controller.ts`**

En `backend/src/tarja/tarja.controller.ts`, importar el DTO y el servicio, y añadir el endpoint (el dueño tarjador crea la solicitud). Añadir el import:

```ts
import { EditRequestDto } from './dto/edit-request.dto';
import { EditRequestsService } from './edit-requests.service';
```

Inyectar el servicio en el constructor:

```ts
  constructor(
    private readonly service: TarjaService,
    private readonly editRequests: EditRequestsService,
  ) {}
```

Añadir el método (junto a los demás `@Roles('TARJADOR')`):

```ts
  @Roles('TARJADOR')
  @Post('tarja/:id/edit-request')
  editRequest(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.editRequests.create(id, user.userId, dto);
  }
```

- [ ] **Step 3: Registrar en el módulo**

En `backend/src/tarja/tarja.module.ts`, reemplazar por:

```ts
import { Module } from '@nestjs/common';
import { TarjaController } from './tarja.controller';
import { EditRequestsController } from './edit-requests.controller';
import { TarjaService } from './tarja.service';
import { EditRequestsService } from './edit-requests.service';
import { ReportCodeService } from './report-code.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [TarjaController, EditRequestsController],
  providers: [TarjaService, EditRequestsService, ReportCodeService],
})
export class TarjaModule {}
```

- [ ] **Step 4: Verificar arranque, tipos y tests**

Run: `cd backend && npx tsc --noEmit && npx jest tarja edit 2>&1 | tail -20`
Expected: sin errores de tipos; tests PASS. (`AuditService`/`PrismaService` deben estar disponibles vía módulos globales — si el arranque falla por inyección, importar `PrismaModule`/`AuditModule` en `TarjaModule`.)

- [ ] **Step 5: Commit**

```bash
git add backend/src/tarja/edit-requests.controller.ts backend/src/tarja/tarja.controller.ts backend/src/tarja/tarja.module.ts
git commit -m "feat(tarja): endpoints de solicitud/aprobacion de edicion + wiring"
```

---

## Task 9: Board con dueño y estado de edición, scope por rol

**Files:**
- Modify: `backend/src/vehicles/vehicles.service.ts`
- Modify: `backend/src/vehicles/vehicles.controller.ts`

- [ ] **Step 1: Extender `naveVehicles` para recibir el usuario y enriquecer los done**

En `backend/src/vehicles/vehicles.service.ts`, añadir el import al inicio:

```ts
import { reopenSecondsLeft } from '../tarja/edit.util';
```

Reemplazar la firma y el cuerpo de `naveVehicles` por:

```ts
  /** Todos los chasis de una NAVE (operación) para la lista de tareas.
   *  Enriquecemos los realizados con el dueño y el estado de edición; si el
   *  llamador es TARJADOR, solo ve como "realizados" los suyos. */
  async naveVehicles(operationId: number, user?: { userId: number; role: string }) {
    const op = await this.prisma.operation.findUnique({
      where: { id: operationId },
      select: { id: true, code: true, status: true, ship: { select: { name: true } } },
    });
    if (!op) throw new NotFoundException('Operación no encontrada');

    const vehicles = await this.prisma.vehicle.findMany({
      where: { operationId },
      orderBy: [{ containerNumber: 'asc' }, { vin: 'asc' }],
      select: {
        id: true,
        vin: true,
        status: true,
        brand: true,
        model: true,
        containerNumber: true,
        currentReportId: true,
        billOfLading: { select: { blNumber: true } },
        currentReport: {
          select: {
            tarjadorId: true,
            finishedAt: true,
            status: true,
            editRequests: {
              where: { status: { in: ['PENDIENTE', 'APROBADA', 'RECHAZADA'] } },
              orderBy: { id: 'desc' },
              take: 1,
              select: { status: true, resolveComment: true },
            },
          },
        },
      },
    });

    const isTarjador = user?.role === 'TARJADOR';

    const mapped = vehicles.map((v) => {
      const block = getVehicleBlock(v.status);
      const done = v.status === 'TARJADO' || v.status === 'OBSERVADO';
      const rep = v.currentReport;
      const secondsLeft = rep ? reopenSecondsLeft({ status: rep.status, finishedAt: rep.finishedAt }) : 0;
      return {
        vehicleId: v.id,
        vin: v.vin,
        status: v.status,
        brand: v.brand,
        model: v.model,
        containerNumber: v.containerNumber,
        blNumber: v.billOfLading?.blNumber ?? null,
        currentReportId: v.currentReportId,
        done,
        blocked: block !== null,
        blockedReason: block?.label ?? null,
        tarjadorId: rep?.tarjadorId ?? null,
        reopenSecondsLeft: secondsLeft,
        editRequestStatus: rep?.editRequests[0]?.status ?? null,
        editRejectComment: rep?.editRequests[0]?.status === 'RECHAZADA' ? rep?.editRequests[0]?.resolveComment ?? null : null,
      };
    });

    // El tarjador solo ve como "realizados" los suyos; los demás realizados se ocultan de esa pestaña.
    const vehiclesOut = isTarjador
      ? mapped.filter((v) => !v.done || v.tarjadorId === user!.userId)
      : mapped;

    return {
      operationId: op.id,
      operationCode: op.code,
      operationStatus: op.status,
      shipName: op.ship.name,
      vehicles: vehiclesOut,
    };
  }
```

- [ ] **Step 2: Pasar el usuario desde el controlador**

En `backend/src/vehicles/vehicles.controller.ts`, en el handler de `GET /naves/:id/vehicles`, inyectar el usuario actual y pasarlo. Asegurar los imports:

```ts
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
```

Reemplazar el handler:

```ts
  @Get('naves/:id/vehicles')
  naveVehicles(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.naveVehicles(id, user);
  }
```

- [ ] **Step 3: Verificar tipos y tests**

Run: `cd backend && npx tsc --noEmit && npx jest vehicles 2>&1 | tail -15`
Expected: sin errores; tests de vehicles PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/src/vehicles/vehicles.service.ts backend/src/vehicles/vehicles.controller.ts
git commit -m "feat(tarja): board de naves con dueno y estado de edicion, scope por rol"
```

---

## Task 10: Cliente API (frontend)

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Extender el tipo `NaveVehicle`**

En `frontend/lib/api.ts`, dentro de `export interface NaveVehicle { ... }`, añadir:

```ts
  tarjadorId: number | null;
  reopenSecondsLeft: number;
  editRequestStatus: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | null;
  editRejectComment: string | null;
```

- [ ] **Step 2: Añadir funciones y tipos de edición**

En `frontend/lib/api.ts`, tras `reopenTarja`, añadir:

```ts
/** El dueño solicita autorización para editar (ventana de 10 min vencida). */
export const requestTarjaEdit = (id: number | string, reason: string) =>
  apiJson<{ id: number }>(`/tarja/${id}/edit-request`, 'POST', { reason });

export interface EditRequestRow {
  id: number;
  reason: string;
  status: 'PENDIENTE' | 'APROBADA' | 'RECHAZADA' | 'COMPLETADA';
  createdAt: string;
  requestedBy: { name: string; lastname: string; initials: string | null; username: string };
  report: {
    reportCode: string;
    vehicle: { vin: string } | null;
    operation: { code: string; ship: { name: string } } | null;
  };
}

export const listEditRequests = (status = 'PENDIENTE') =>
  apiGet<EditRequestRow[]>(`/tarja/edit-requests?status=${status}`);

export const resolveEditRequest = (id: number, approve: boolean, comment?: string) =>
  apiJson<{ id: number }>(`/tarja/edit-requests/${id}/resolve`, 'POST', { approve, comment });

export const cancelEditRequest = (id: number) =>
  apiJson<{ canceled: boolean }>(`/tarja/edit-requests/${id}/cancel`, 'POST');
```

- [ ] **Step 3: Verificar build de tipos del frontend**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -20`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(tarja): cliente API de edicion y solicitudes"
```

---

## Task 11: Cuadro de tareas — filtro Realizados + botones Editar/Reabrir

**Files:**
- Modify: `frontend/app/tablero/[opId]/page.tsx`

- [ ] **Step 1: Añadir usuario, acciones y estados por tarja**

En `frontend/app/tablero/[opId]/page.tsx`:

1. Importar helpers y funciones:
```ts
import { getNaveVehicles, startTarja, reopenTarja, reopenReport, requestTarjaEdit,
  getUser, type AuthUser, type NaveVehicle, type NaveVehicles } from '@/lib/api';
```

2. Obtener el usuario al montar (junto al estado existente):
```ts
  const [user, setUser] = useState<AuthUser | null>(null);
  useEffect(() => { setUser(getUser()); }, []);
```

3. En el render de cada fila de la pestaña `done` (tab === 'done'), reemplazar el bloque del badge por el badge + acciones según rol. Para el **dueño tarjador**:

```tsx
{user?.role === 'TARJADOR' ? (
  v.editRequestStatus === 'PENDIENTE' ? (
    <span className="badge pending">Solicitud pendiente</span>
  ) : v.editRequestStatus === 'APROBADA' ? (
    <button className="btn btn-sm" onClick={() => enterEdit(v)}>Editar</button>
  ) : v.reopenSecondsLeft > 0 ? (
    <button className="btn btn-sm" onClick={() => enterEdit(v)}>
      Editar ({Math.floor(v.reopenSecondsLeft / 60)}:{String(v.reopenSecondsLeft % 60).padStart(2, '0')})
    </button>
  ) : (
    <button className="btn btn-sm btn-outline" onClick={() => askEdit(v)}>Solicitar edición</button>
  )
) : (
  <button className="btn btn-sm btn-outline" onClick={() => reabrir(v)}>Reabrir</button>
)}
```

4. Añadir los handlers dentro del componente:

```ts
  async function enterEdit(v: NaveVehicle) {
    if (!v.currentReportId) return;
    try {
      await reopenTarja(v.currentReportId);
      router.push(`/tarja/${v.currentReportId}`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo abrir para editar');
      load();
    }
  }

  async function askEdit(v: NaveVehicle) {
    if (!v.currentReportId) return;
    const reason = window.prompt('Motivo de la edición (lo revisará el supervisor):')?.trim();
    if (!reason) return;
    try {
      await requestTarjaEdit(v.currentReportId, reason);
      alert('Solicitud enviada. Espera la autorización del supervisor.');
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo enviar la solicitud');
    }
  }

  async function reabrir(v: NaveVehicle) {
    if (!v.currentReportId) return;
    if (!window.confirm('¿Reabrir esta tarja para rehacerla desde cero?')) return;
    try {
      await reopenReport(v.currentReportId);
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'No se pudo reabrir');
    }
  }
```

(`load` es el callback existente que hace `setData(await getNaveVehicles(opId))`.)

- [ ] **Step 2: Verificar tipos**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -20`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/tablero/[opId]/page.tsx
git commit -m "feat(tarja): Realizados filtra por persona con Editar/Reabrir/Solicitar"
```

---

## Task 12: Página bandeja "Solicitudes de edición" + MOD en /inicio

**Files:**
- Create: `frontend/app/solicitudes-edicion/page.tsx`
- Modify: `frontend/app/inicio/page.tsx`

- [ ] **Step 1: Crear la página de bandeja**

Crear `frontend/app/solicitudes-edicion/page.tsx`:

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import {
  getUser, listEditRequests, resolveEditRequest,
  type AuthUser, type EditRequestRow,
} from '@/lib/api';

export default function SolicitudesEdicion() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [rows, setRows] = useState<EditRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) { router.replace('/login'); return; }
    if (u.role !== 'ADMIN' && u.role !== 'SUPERVISOR') { router.replace('/inicio'); return; }
    setUser(u);
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await listEditRequests('PENDIENTE')); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (user) load(); }, [user, load]);

  async function resolve(id: number, approve: boolean) {
    const comment = approve ? undefined : (window.prompt('Motivo del rechazo (opcional):') ?? undefined);
    setBusy(id);
    try { await resolveEditRequest(id, approve, comment); await load(); }
    catch (e) { alert(e instanceof Error ? e.message : 'Error'); }
    finally { setBusy(null); }
  }

  if (!user) return null;

  return (
    <Shell title="Solicitudes de edición" onBack={() => router.push('/inicio')}>
      {loading ? (
        <div className="empty">Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="empty">No hay solicitudes pendientes.</div>
      ) : (
        <div className="card-list">
          {rows.map((r) => (
            <div key={r.id} className="card">
              <div className="mono">{r.report.reportCode} · {r.report.vehicle?.vin ?? '—'}</div>
              <div className="muted">
                {r.report.operation?.ship.name} · {r.report.operation?.code}
              </div>
              <div>Solicita: {r.requestedBy.name} {r.requestedBy.lastname}</div>
              <div>Motivo: {r.reason}</div>
              <div className="row" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn btn-sm" disabled={busy === r.id} onClick={() => resolve(r.id, true)}>
                  Aprobar
                </button>
                <button className="btn btn-sm btn-outline" disabled={busy === r.id} onClick={() => resolve(r.id, false)}>
                  Rechazar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Shell>
  );
}
```

Nota: usar las clases CSS existentes del proyecto (`card`, `btn`, `empty`, `muted`, `mono`). Ajustar nombres si difieren de los usados en otras páginas (ver `frontend/app/reportes/turno/page.tsx`).

- [ ] **Step 2: Añadir el MOD en /inicio**

En `frontend/app/inicio/page.tsx`, importar un ícono y añadir la entrada al array `MODS` (solo ADMIN/SUPERVISOR):

```ts
import { CalendarClock, ClipboardList, FilePen, Fingerprint, Gauge, ShieldCheck, Users } from 'lucide-react';
```

```ts
  { key: 'solicitudes', title: 'Solicitudes de edición', desc: 'Autoriza correcciones de tarjas', to: '/solicitudes-edicion', icon: <FilePen className="h-5 w-5" />, roles: ['ADMIN', 'SUPERVISOR'] },
```

- [ ] **Step 3: Verificar tipos**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -20`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add frontend/app/solicitudes-edicion/page.tsx frontend/app/inicio/page.tsx
git commit -m "feat(tarja): bandeja de solicitudes de edicion + acceso en inicio"
```

---

## Task 13: Acciones nuevas en Auditoría

**Files:**
- Modify: `frontend/app/audit/page.tsx`

- [ ] **Step 1: Añadir las acciones al mapa `ACTION_META`**

En `frontend/app/audit/page.tsx`, importar los íconos necesarios de `lucide-react` (añadir a la lista existente): `FilePen`, `Check`, `X` (ya está `X`), `Undo2`. Luego, dentro de `ACTION_META`, añadir:

```ts
  EDIT_START: { label: 'Edición iniciada', icon: Play, tone: 'info' },
  EDIT_REQUEST: { label: 'Solicitud de edición', icon: FilePen, tone: 'warn' },
  EDIT_APPROVED: { label: 'Edición autorizada', icon: ShieldCheck, tone: 'pos' },
  EDIT_REJECTED: { label: 'Edición rechazada', icon: Ban, tone: 'neg' },
  EDITADA: { label: 'Tarja editada', icon: FilePen, tone: 'info' },
  EDIT_CANCELED: { label: 'Edición cancelada', icon: Undo2, tone: 'warn' },
```

(Reutiliza `Play`, `ShieldCheck`, `Ban` ya importados; añade `FilePen` y `Undo2` al import de `lucide-react`.)

- [ ] **Step 2: Verificar tipos**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -15`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/audit/page.tsx
git commit -m "feat(tarja): acciones de edicion en la vista de auditoria"
```

---

## Task 14: Aplicar la migración a la BD de Docker y verificación E2E manual

**Files:** ninguno (operación de entorno).

- [ ] **Step 1: Aplicar la migración a la BD real (Docker :5433)**

Run (reconstruye la imagen del backend, que aplica `prisma migrate deploy` al arrancar, o aplica manual):
```bash
cd "c:/xampp2026/htdocs/TARJA V.1"
docker compose up -d --build backend
```
Alternativa manual (sin rebuild):
```bash
cd backend
DATABASE_URL="postgresql://tarja:tarja_local_dev@localhost:5433/tarja?schema=public" npx prisma migrate deploy
```
Expected: migración `tarja_edit_requests` aplicada; backend healthy.

- [ ] **Step 2: Verificar el flujo dueño dentro de ventana (API)**

Run (login tarjador, iniciar+finalizar una tarja de un VIN pendiente, luego editar dentro de ventana):
```bash
cd "c:/xampp2026/htdocs/TARJA V.1"
TT=$(curl -s -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d '{"username":"tarjador","password":"Tarja123!"}' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
# Reemplazar <REPORT_ID> por una tarja recién finalizada del tarjador:
curl -s -X POST http://localhost:3000/tarja/<REPORT_ID>/reopen -H "Authorization: Bearer $TT" -w "\nHTTP %{http_code}\n"
```
Expected: HTTP 200/201 (entra a editar). Verificar en la BD que el reporte quedó `BORRADOR` con `edit_snapshot` no nulo.

- [ ] **Step 3: Verificar el bloqueo post-10min y el flujo de autorización**

Para una tarja con `finishedAt` > 10 min: `reopen` debe dar `400` con `REQUIERE_AUTORIZACION`. Luego:
```bash
curl -s -X POST http://localhost:3000/tarja/<REPORT_ID>/edit-request -H "Authorization: Bearer $TT" -H "Content-Type: application/json" -d '{"reason":"corregir accesorios"}' -w "\nHTTP %{http_code}\n"
# como supervisor:
ST=$(curl -s -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d '{"username":"supervisor","password":"Super123!"}' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
curl -s http://localhost:3000/tarja/edit-requests -H "Authorization: Bearer $ST"
curl -s -X POST http://localhost:3000/tarja/edit-requests/<REQ_ID>/resolve -H "Authorization: Bearer $ST" -H "Content-Type: application/json" -d '{"approve":true}' -w "\nHTTP %{http_code}\n"
# el tarjador ahora sí puede entrar a editar:
curl -s -X POST http://localhost:3000/tarja/<REPORT_ID>/reopen -H "Authorization: Bearer $TT" -w "\nHTTP %{http_code}\n"
```
Expected: solicitud creada; aprobada; `reopen` ahora 200.

- [ ] **Step 4: Verificar el diff en auditoría**

Editar (accesorios/daños) y finalizar vía UI o API (`PATCH /tarja/:id/accessories`, `POST /tarja/:id/finish`), luego:
```bash
curl -s "http://localhost:3000/audit?limit=5" -H "Authorization: Bearer $ST"
```
Expected: un evento `EDITADA` con `description` tipo `Editó 000xxx · Radio Sí→No; …` y `oldValue`/`newValue` en JSON.

- [ ] **Step 5: Verificación visual en el frontend**

En el navegador (dev :3001 o Docker :3002): como **tarjador** abrir Cuadro de tareas → nave → pestaña Realizados → ver solo las propias, con botón **Editar** (cuenta regresiva) / **Solicitar edición**. Como **supervisor** → MOD "Solicitudes de edición" → aprobar/rechazar; y botón **Reabrir** en Realizados. Confirmar que en Auditoría aparecen las acciones nuevas con su ícono.

- [ ] **Step 6: Commit (si hubo ajustes de verificación)**

```bash
git add -A && git commit -m "chore(tarja): ajustes tras verificacion e2e de edicion con autorizacion"
```

---

## Notas de ejecución

- **TDD:** Tasks 2, 3, 7 llevan test-primero. Tasks 4/5/9 se cubren con los tests existentes + `tsc`. El frontend se valida con `tsc --noEmit` y verificación manual (el proyecto no tiene tests de componente).
- **e2e:** si se corren los e2e del backend, usar `--runInBand` (comparten base). Ver memoria [[e2e-flake-suites-paralelas]].
- **Inyección global:** si al arrancar Nest falla la inyección de `PrismaService`/`AuditService`/`RealtimeService` en los nuevos providers, importar los módulos correspondientes en `TarjaModule` (hoy solo importa `RealtimeModule`, lo que sugiere que Prisma/Audit son globales — verificar en Task 8).
- **Frontend AGENTS.md:** este Next.js tiene cambios; leer `frontend/node_modules/next/dist/docs/` si algún patrón de routing/params difiere.
