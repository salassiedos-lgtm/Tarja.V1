# Tarja: menú Nueva Tarja / Consolidado — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `/tarja` into a menu (`/tarja`) with two subsections — `/tarja/nueva` (the existing "start a tarja" form, moved as-is) and `/tarja/consolidado` (a new table showing the logged-in tarjador's own tarja history, filterable by date).

**Architecture:** No new subsystems — this reuses the existing `TarjaReport` Prisma model and the existing JWT auth (`@CurrentUser()`). One new backend endpoint (`GET /reports/mine`) scoped to the calling user's `tarjadorId`. On the frontend, two small shared modules are extracted (`report-status.ts` for status→label→style maps, `quick-card.tsx` for the menu-card component) so the new menu page and the existing dashboard don't duplicate that logic, then three page files are added/moved/edited.

**Tech Stack:** NestJS + Prisma (backend), Next.js App Router + Tailwind v4 (frontend). Backend has Jest configured (`backend/src/**/*.spec.ts`); the frontend has **no test runner configured** — frontend tasks are verified with `npm run build` (typecheck) and `npm run lint` instead of unit tests, matching the existing project setup. Do not add a frontend test framework as part of this plan — out of scope.

> **Note for whoever implements this:** `frontend/AGENTS.md` warns this is a customized Next.js version with breaking changes — check `frontend/node_modules/next/dist/docs/` before assuming standard App Router behavior. This plan was written after confirming against those docs that: (a) static route segments (`/tarja/nueva`, `/tarja/consolidado`) take priority over the sibling dynamic segment (`/tarja/[id]`) — no conflict; (b) pages are Server Components by default and only need `'use client'` when they use hooks/state/browser APIs.

---

## File Structure

**Backend:**
- Modify: `backend/src/reports/reports.service.ts` — add `listMyReports()`.
- Modify: `backend/src/reports/reports.controller.ts` — add `GET /reports/mine`.
- Create: `backend/src/reports/reports.service.spec.ts` — unit tests for `listMyReports()`.

**Frontend:**
- Create: `frontend/lib/report-status.ts` — shared `STATUS_TAG` / `TAG_STYLE` maps (currently duplicated ad hoc inside `dashboard/page.tsx`; extracted here and extended to cover `BORRADOR`/`REEMPLAZADO`, which Consolidado needs but the dashboard widget didn't).
- Modify: `frontend/lib/api.ts` — add `startedAt` to `ReportRow`, add `MyReportsResult` type and `listMyReports()`.
- Create: `frontend/components/quick-card.tsx` — `QuickCard` component extracted from `dashboard/page.tsx` (used by both the dashboard and the new Tarja menu).
- Modify: `frontend/app/dashboard/page.tsx` — drop the local `STATUS_TAG`/`TAG_STYLE`/`QuickCard` definitions in favor of the shared ones; point the "Nueva tarja" links at `/tarja/nueva`.
- Move: `frontend/app/tarja/page.tsx` → `frontend/app/tarja/nueva/page.tsx` (content unchanged).
- Create: `frontend/app/tarja/page.tsx` — new menu with two cards (Nueva Tarja / Consolidado).
- Create: `frontend/app/tarja/consolidado/page.tsx` — history table with date filter and pagination.
- Modify: `frontend/components/shell.tsx` — add `TITLES` entries for `/tarja/nueva` and `/tarja/consolidado`.

---

### Task 1: Backend — `listMyReports` service method

**Files:**
- Modify: `backend/src/reports/reports.service.ts`
- Test: `backend/src/reports/reports.service.spec.ts` (new)

- [ ] **Step 1: Write the failing tests**

Create `backend/src/reports/reports.service.spec.ts`:

```ts
import { ReportsService } from './reports.service';

function build(overrides: { findMany?: unknown[]; count?: number } = {}) {
  const prisma = {
    tarjaReport: {
      findMany: jest.fn().mockResolvedValue(overrides.findMany ?? []),
      count: jest.fn().mockResolvedValue(overrides.count ?? 0),
    },
  };
  const realtime = { emit: jest.fn() };
  const audit = { record: jest.fn() };
  const service = new ReportsService(prisma as never, realtime as never, audit as never);
  return { service, prisma };
}

describe('ReportsService.listMyReports', () => {
  it('filtra por tarjadorId y devuelve items + total', async () => {
    const { service, prisma } = build({ findMany: [{ id: 1 }], count: 1 });

    const result = await service.listMyReports(7, {});

    expect(prisma.tarjaReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tarjadorId: 7 } }),
    );
    expect(prisma.tarjaReport.count).toHaveBeenCalledWith({ where: { tarjadorId: 7 } });
    expect(result).toEqual({ items: [{ id: 1 }], total: 1 });
  });

  it('agrega rango de fechas sobre startedAt cuando from/to estan presentes', async () => {
    const from = new Date('2026-07-08T00:00:00');
    const to = new Date('2026-07-08T23:59:59.999');
    const { service, prisma } = build();

    await service.listMyReports(7, { from, to });

    expect(prisma.tarjaReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tarjadorId: 7, startedAt: { gte: from, lte: to } },
      }),
    );
  });

  it('usa skip=0 y take=20 por defecto, y respeta valores pasados', async () => {
    const { service, prisma } = build();

    await service.listMyReports(7, {});
    expect(prisma.tarjaReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 0, take: 20 }),
    );

    await service.listMyReports(7, { skip: 40, take: 10 });
    expect(prisma.tarjaReport.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 40, take: 10 }),
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && npx jest reports.service.spec.ts`
Expected: FAIL — `service.listMyReports is not a function`

- [ ] **Step 3: Implement `listMyReports` in the service**

In `backend/src/reports/reports.service.ts`, add this method to the `ReportsService` class (e.g. right after `listReports`):

```ts
  async listMyReports(
    tarjadorId: number,
    params: { from?: Date; to?: Date; skip?: number; take?: number },
  ) {
    const where = {
      tarjadorId,
      ...(params.from || params.to
        ? {
            startedAt: {
              ...(params.from ? { gte: params.from } : {}),
              ...(params.to ? { lte: params.to } : {}),
            },
          }
        : {}),
    };
    const skip = params.skip ?? 0;
    const take = params.take ?? 20;

    const [items, total] = await Promise.all([
      this.prisma.tarjaReport.findMany({
        where,
        orderBy: { startedAt: 'desc' },
        skip,
        take,
        include: {
          vehicle: { select: { vin: true } },
          operation: { select: { code: true } },
        },
      }),
      this.prisma.tarjaReport.count({ where }),
    ]);

    return { items, total };
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && npx jest reports.service.spec.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/reports/reports.service.ts backend/src/reports/reports.service.spec.ts
git commit -m "feat(reports): agrega listMyReports para historial por tarjador"
```

---

### Task 2: Backend — `GET /reports/mine` endpoint

**Files:**
- Modify: `backend/src/reports/reports.controller.ts`

- [ ] **Step 1: Add the route**

In `backend/src/reports/reports.controller.ts`, add this method to `ReportsController` (e.g. right after `list()`):

```ts
  @Get('reports/mine')
  mine(
    @CurrentUser() user: AuthUser,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    return this.service.listMyReports(user.userId, {
      from: from ? new Date(`${from}T00:00:00`) : undefined,
      to: to ? new Date(`${to}T23:59:59.999`) : undefined,
      skip: skip ? Number(skip) : undefined,
      take: take ? Number(take) : undefined,
    });
  }
```

No new imports are needed — `Query`, `CurrentUser`, and `AuthUser` are already imported at the top of this file.

- [ ] **Step 2: Verify the backend still builds**

Run: `cd backend && npm run build`
Expected: exits 0, no TypeScript errors.

- [ ] **Step 3: Run the full backend test suite**

Run: `cd backend && npm test`
Expected: PASS, all suites green (including `reports.service.spec.ts` from Task 1).

- [ ] **Step 4: Commit**

```bash
git add backend/src/reports/reports.controller.ts
git commit -m "feat(reports): expone GET /reports/mine para el tarjador logueado"
```

---

### Task 3: Frontend — shared status maps

**Files:**
- Create: `frontend/lib/report-status.ts`

- [ ] **Step 1: Create the shared module**

```ts
export const STATUS_TAG: Record<string, string> = {
  BORRADOR: 'En proceso',
  FINALIZADO: 'Finalizada',
  CON_DANO: 'Con daño',
  ANULADO: 'Anulada',
  REEMPLAZADO: 'Reemplazada',
};

export const TAG_STYLE: Record<string, string> = {
  'En proceso': 'bg-navy-50 text-navy-700 ring-navy-700/15',
  Finalizada: 'bg-jade-50 text-jade-600 ring-jade-600/15',
  'Con daño': 'bg-cosco-500/8 text-cosco-600 ring-cosco-600/15',
  Anulada: 'bg-ochre-50 text-ochre-600 ring-ochre-600/15',
  Reemplazada: 'bg-navy-50 text-muted ring-line',
};
```

- [ ] **Step 2: Commit**

```bash
git add frontend/lib/report-status.ts
git commit -m "refactor(frontend): extrae mapas de estado de tarja a modulo compartido"
```

---

### Task 4: Frontend — `listMyReports` API client

**Files:**
- Modify: `frontend/lib/api.ts`

- [ ] **Step 1: Add `startedAt` to `ReportRow`**

Find the `ReportRow` interface (around line 246) and add `startedAt`:

```ts
export interface ReportRow {
  id: number;
  reportCode: string;
  status: string;
  hasDamage: boolean;
  durationSeconds: number | null;
  startedAt: string | null;
  updatedAt?: string;
  vehicle?: { vin: string };
  tarjador?: { username: string; initials: string | null };
  operation?: { code: string };
}
```

- [ ] **Step 2: Add `MyReportsResult` type and `listMyReports` function**

Right after the existing `listReports` export (around line 274), add:

```ts
export interface MyReportsResult {
  items: ReportRow[];
  total: number;
}
export const listMyReports = (params: {
  from?: string;
  to?: string;
  skip?: number;
  take?: number;
}) => {
  const q = new URLSearchParams();
  if (params.from) q.set('from', params.from);
  if (params.to) q.set('to', params.to);
  if (params.skip) q.set('skip', String(params.skip));
  if (params.take) q.set('take', String(params.take));
  const qs = q.toString();
  return apiGet<MyReportsResult>(`/reports/mine${qs ? `?${qs}` : ''}`);
};
```

- [ ] **Step 3: Verify the frontend still typechecks**

Run: `cd frontend && npm run build`
Expected: exits 0. (This will currently fail to *route* anywhere new yet — that's fine, we're only checking `api.ts` compiles; no other file references `listMyReports` or the new `startedAt` field yet.)

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(frontend): agrega cliente listMyReports para /reports/mine"
```

---

### Task 5: Frontend — extract `QuickCard`

**Files:**
- Create: `frontend/components/quick-card.tsx`
- Modify: `frontend/app/dashboard/page.tsx`

- [ ] **Step 1: Create the shared component**

```tsx
import Link from 'next/link';
import { IconArrow } from '@/components/icons';

export function QuickCard({
  href,
  title,
  desc,
  Icon,
  primary,
}: {
  href: string;
  title: string;
  desc: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex items-start gap-4 overflow-hidden rounded-2xl border p-5 transition-all hover:-translate-y-0.5 ${
        primary
          ? 'grain border-navy-800 bg-navy-900 text-white hover:shadow-[0_16px_40px_-16px_rgba(11,61,107,0.6)]'
          : 'border-line bg-white hover:border-navy-200 hover:shadow-[0_12px_32px_-16px_rgba(11,61,107,0.3)]'
      }`}
    >
      {primary && <span className="grid-plot absolute inset-0" />}
      <div
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          primary ? 'bg-white/10 ring-1 ring-white/15' : 'bg-navy-50 ring-1 ring-navy-100'
        }`}
      >
        <Icon className={`h-5 w-5 ${primary ? 'text-cosco-400' : 'text-navy-800'}`} />
      </div>
      <div className="relative min-w-0 flex-1">
        <p
          className={`font-display text-[15px] font-bold tracking-tight ${
            primary ? 'text-white' : 'text-navy-900'
          }`}
        >
          {title}
        </p>
        <p className={`mt-1 text-[12.5px] leading-relaxed ${primary ? 'text-white/55' : 'text-muted'}`}>
          {desc}
        </p>
      </div>
      <IconArrow
        className={`relative mt-1 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1 ${
          primary ? 'text-white/50' : 'text-muted/50'
        }`}
      />
    </Link>
  );
}
```

- [ ] **Step 2: Update `dashboard/page.tsx` to use the shared pieces**

In `frontend/app/dashboard/page.tsx`:

1. Delete the local `TAG_STYLE` and `STATUS_TAG` const declarations (lines 16–26).
2. Delete the local `QuickCard` function declaration (lines 88–137).
3. Add these imports near the top (alongside the existing `@/components/icons` import):

```ts
import { QuickCard } from '@/components/quick-card';
import { STATUS_TAG, TAG_STYLE } from '@/lib/report-status';
```

4. Change the header CTA link (originally `href={user?.role === 'TARJADOR' ? '/tarja' : '/operations'}`) to:

```tsx
href={user?.role === 'TARJADOR' ? '/tarja/nueva' : '/operations'}
```

5. Change the "Nueva tarja" `QuickCard` usage in "Accesos rápidos" (originally `href="/tarja"`) to:

```tsx
href="/tarja/nueva"
```

- [ ] **Step 3: Verify the frontend still builds**

Run: `cd frontend && npm run build`
Expected: exits 0, no TypeScript/ESLint errors, dashboard page compiles referencing the shared imports.

- [ ] **Step 4: Commit**

```bash
git add frontend/components/quick-card.tsx frontend/app/dashboard/page.tsx
git commit -m "refactor(frontend): extrae QuickCard compartido y apunta CTAs a /tarja/nueva"
```

---

### Task 6: Frontend — move the existing form to `/tarja/nueva`

**Files:**
- Move: `frontend/app/tarja/page.tsx` → `frontend/app/tarja/nueva/page.tsx`

- [ ] **Step 1: Move the file with git (preserves history), no content changes**

```bash
git mv "frontend/app/tarja/page.tsx" "frontend/app/tarja/nueva/page.tsx"
```

The file's content (the "Nueva tarja" form: operation select + VIN input + `startTarja` call + redirect to `/tarja/{id}`) is unchanged — it doesn't reference its own route path, so no edits are needed.

- [ ] **Step 2: Verify the frontend still builds**

Run: `cd frontend && npm run build`
Expected: exits 0. Note `/tarja` currently has no `page.tsx` at this point in the plan — that's expected, Task 7 adds it back as the menu.

- [ ] **Step 3: Commit**

```bash
git commit -m "refactor(frontend): mueve el formulario de nueva tarja a /tarja/nueva"
```

---

### Task 7: Frontend — new `/tarja` menu page

**Files:**
- Create: `frontend/app/tarja/page.tsx`

- [ ] **Step 1: Create the menu page**

```tsx
import Shell from '@/components/shell';
import { QuickCard } from '@/components/quick-card';
import { IconClipboard, IconLayers } from '@/components/icons';

export default function TarjaMenuPage() {
  return (
    <Shell>
      <div className="mx-auto max-w-2xl">
        <h1 className="font-display text-[24px] font-bold tracking-tight text-navy-900">Tarja</h1>
        <p className="mt-1 text-[13.5px] text-muted">
          Registra una nueva tarja o revisa tu historial de registros.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <QuickCard
            primary
            href="/tarja/nueva"
            title="Nueva Tarja"
            desc="Ingresa el VIN y registra accesorios y daños de la unidad."
            Icon={IconClipboard}
          />
          <QuickCard
            href="/tarja/consolidado"
            title="Consolidado"
            desc="Revisa tu historial de tarjas registradas por fecha."
            Icon={IconLayers}
          />
        </div>
      </div>
    </Shell>
  );
}
```

This is a Server Component (no `'use client'`) — it has no state, effects, or browser APIs, only static links, which is the default and recommended mode per `frontend/node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`.

- [ ] **Step 2: Verify the frontend still builds**

Run: `cd frontend && npm run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/tarja/page.tsx
git commit -m "feat(tarja): agrega menu /tarja con accesos a Nueva Tarja y Consolidado"
```

---

### Task 8: Frontend — `/tarja/consolidado` history table

**Files:**
- Create: `frontend/app/tarja/consolidado/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import { listMyReports, type ReportRow } from '@/lib/api';
import { STATUS_TAG, TAG_STYLE } from '@/lib/report-status';

const PAGE_SIZE = 20;

function todayStr() {
  return new Date().toLocaleDateString('en-CA');
}

function fmtDateTime(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDuration(totalSeconds: number | null) {
  if (!totalSeconds) return '—';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function ConsolidadoPage() {
  const router = useRouter();
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [items, setItems] = useState<ReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(
    async (skip: number, append: boolean) => {
      setLoading(true);
      setError('');
      try {
        const res = await listMyReports({ from, to, skip, take: PAGE_SIZE });
        setItems((prev) => (append ? [...prev, ...res.items] : res.items));
        setTotal(res.total);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error');
      } finally {
        setLoading(false);
      }
    },
    [from, to],
  );

  useEffect(() => {
    load(0, false);
  }, [load]);

  function resetToday() {
    setFrom(todayStr());
    setTo(todayStr());
  }

  const hasMore = items.length < total;

  return (
    <Shell>
      <div className="mx-auto max-w-4xl">
        <h1 className="font-display text-[24px] font-bold tracking-tight text-navy-900">
          Consolidado
        </h1>
        <p className="mt-1 text-[13.5px] text-muted">Historial de tus tarjas registradas.</p>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-[12px] font-medium text-navy-700">Desde</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-line px-3 py-2 text-[13px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-navy-700">Hasta</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-line px-3 py-2 text-[13px]"
            />
          </div>
          <button
            onClick={resetToday}
            className="rounded-lg border border-line bg-white px-3 py-2 text-[12.5px] font-semibold text-navy-700 hover:bg-navy-50"
          >
            Hoy
          </button>
        </div>

        {error && <p className="mt-3 text-[12.5px] text-[#C8102E]">{error}</p>}

        <div className="mt-5 overflow-hidden rounded-2xl border border-line bg-white">
          {!loading && items.length === 0 ? (
            <p className="px-4 py-10 text-center text-[12.5px] text-muted">
              No hay tarjas registradas en este rango de fechas.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr className="border-b border-line bg-navy-50/50 text-[10.5px] uppercase tracking-[0.1em] text-muted">
                    <th className="px-4 py-3 font-semibold">Código</th>
                    <th className="px-4 py-3 font-semibold">VIN</th>
                    <th className="px-4 py-3 font-semibold">Operación</th>
                    <th className="px-4 py-3 font-semibold">Estado</th>
                    <th className="px-4 py-3 font-semibold">Daño</th>
                    <th className="px-4 py-3 font-semibold">Duración</th>
                    <th className="px-4 py-3 font-semibold">Fecha</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {items.map((r) => {
                    const tag = STATUS_TAG[r.status] ?? r.status;
                    return (
                      <tr
                        key={r.id}
                        onClick={() => router.push(`/tarja/${r.id}`)}
                        className="cursor-pointer transition-colors hover:bg-navy-50/50"
                      >
                        <td className="px-4 py-3 font-mono text-[11.5px] text-navy-900">
                          {r.reportCode}
                        </td>
                        <td className="px-4 py-3 font-mono text-[11.5px] text-navy-900">
                          {r.vehicle?.vin ?? '—'}
                        </td>
                        <td className="px-4 py-3 text-muted">{r.operation?.code ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ${TAG_STYLE[tag] ?? ''}`}
                          >
                            {tag}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-muted">{r.hasDamage ? 'Sí' : 'No'}</td>
                        <td className="px-4 py-3 text-muted">{fmtDuration(r.durationSeconds)}</td>
                        <td className="px-4 py-3 text-muted">{fmtDateTime(r.startedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {hasMore && (
          <div className="mt-4 flex justify-center">
            <button
              onClick={() => load(items.length, true)}
              disabled={loading}
              className="rounded-lg border border-line bg-white px-4 py-2 text-[12.5px] font-semibold text-navy-700 hover:bg-navy-50 disabled:opacity-60"
            >
              {loading ? 'Cargando…' : 'Cargar más'}
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}
```

- [ ] **Step 2: Verify the frontend still builds**

Run: `cd frontend && npm run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/tarja/consolidado/page.tsx
git commit -m "feat(tarja): agrega /tarja/consolidado con historial filtrable por fecha"
```

---

### Task 9: Frontend — sidebar breadcrumb titles

**Files:**
- Modify: `frontend/components/shell.tsx`

- [ ] **Step 1: Add the new routes to `TITLES`**

In `frontend/components/shell.tsx`, find the `TITLES` map (around line 55) and add two entries right after the existing `'/tarja'` entry:

```ts
const TITLES: Record<string, { title: string; crumb: string }> = {
  '/dashboard': { title: 'Panel de control', crumb: 'Resumen operativo' },
  '/operations': { title: 'Operaciones', crumb: 'Naves, BL y vehículos' },
  '/tarja': { title: 'Tarja', crumb: 'Registro en campo' },
  '/tarja/nueva': { title: 'Nueva tarja', crumb: 'Iniciar registro' },
  '/tarja/consolidado': { title: 'Consolidado', crumb: 'Historial de tarjas' },
  '/supervisor': { title: 'Supervisión', crumb: 'Monitoreo en tiempo real' },
  '/accessories': { title: 'Accesorios', crumb: 'Catálogo del formulario' },
  '/audit': { title: 'Auditoría', crumb: 'Registro de acciones' },
};
```

(The lookup in this file already does an exact match first — `TITLES[pathname]` — before falling back to a `startsWith` prefix match, so the more specific `/tarja/nueva` and `/tarja/consolidado` entries take priority over `/tarja` automatically; no other logic changes needed.)

- [ ] **Step 2: Verify the frontend still builds**

Run: `cd frontend && npm run build`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add frontend/components/shell.tsx
git commit -m "feat(shell): agrega titulos de breadcrumb para /tarja/nueva y /tarja/consolidado"
```

---

### Task 10: Manual verification

**Files:** none (verification only)

- [ ] **Step 1: Run both test suites one more time end to end**

```bash
cd backend && npm test && npm run build
cd frontend && npm run build && npm run lint
```

Expected: all four commands exit 0.

- [ ] **Step 2: Manual smoke test with the dev servers running**

Start the backend and frontend dev servers (see project README / existing dev workflow), log in as a `TARJADOR` user, and verify:

1. Dashboard → "Nueva tarja" button goes to `/tarja/nueva` and behaves exactly as the old `/tarja` form did (start a tarja with an active operation + VIN, land on `/tarja/{id}`).
2. Sidebar "Tarja" link goes to `/tarja` and shows the two-card menu.
3. "Nueva Tarja" card → `/tarja/nueva`. "Consolidado" card → `/tarja/consolidado`.
4. `/tarja/consolidado` loads with today's date range pre-filled, showing only reports for the logged-in tarjador (finish at least one tarja first if the list is empty).
5. Changing "Desde"/"Hasta" and re-loading narrows/widens the results; "Hoy" resets the range.
6. Clicking a row navigates to `/tarja/{id}` and shows that report (read-only if already finalized, since `tarja/[id]/page.tsx` already gates the form behind `report.status !== 'BORRADOR'`).
7. If a tarjador has more than 20 reports in range, "Cargar más" appends the next page.

No commit for this task — it's verification only.
