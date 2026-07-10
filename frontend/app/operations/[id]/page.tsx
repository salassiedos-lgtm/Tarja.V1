'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Shell from '@/components/shell';
import {
  getOperation,
  listVehicles,
  previewImport,
  confirmImport,
  setOperationStatus,
  getUser,
  type Operation,
  type Vehicle,
  type ImportPreview,
} from '@/lib/api';
import {
  IconLayers,
  IconArrow,
  IconSearch,
  IconUpload,
  IconCheck,
  IconAlert,
  IconTire,
} from '@/components/icons';

const TYPE_LABEL: Record<string, string> = {
  ROLL_ON_ROLL_OFF: 'RO-RO',
  DESCONSOLIDADO: 'Desconsolidado',
};

const OP_STATUS_META: Record<Operation['status'], { label: string; dot: string; pill: string }> = {
  ACTIVA: { label: 'Activa', dot: 'bg-jade-600', pill: 'bg-jade-50 text-jade-600 ring-jade-600/15' },
  PAUSADA: { label: 'Pausada', dot: 'bg-ochre-600', pill: 'bg-ochre-50 text-ochre-600 ring-ochre-600/15' },
  CERRADA: { label: 'Cerrada', dot: 'bg-white/40', pill: 'bg-white/10 text-white/70 ring-white/20' },
};

const VEHICLE_STATUS: Record<string, { label: string; pill: string; dot: string }> = {
  PENDIENTE: { label: 'Pendiente', pill: 'bg-line/50 text-muted ring-muted/20', dot: 'bg-muted' },
  EN_PROCESO: { label: 'En proceso', pill: 'bg-navy-50 text-navy-700 ring-navy-700/15', dot: 'bg-navy-600' },
  TARJADO: { label: 'Tarjado', pill: 'bg-jade-50 text-jade-600 ring-jade-600/15', dot: 'bg-jade-600' },
  OBSERVADO: { label: 'Observado', pill: 'bg-ochre-50 text-ochre-600 ring-ochre-600/15', dot: 'bg-ochre-600' },
  REABIERTO: { label: 'Reabierto', pill: 'bg-navy-50 text-navy-600 ring-navy-600/15', dot: 'bg-navy-600' },
  BLOQUEADO: { label: 'Bloqueado', pill: 'bg-cosco-50 text-cosco-600 ring-cosco-600/15', dot: 'bg-cosco-500' },
  NO_PLANIFICADO: { label: 'No planif.', pill: 'bg-ochre-50 text-ochre-600 ring-ochre-600/15', dot: 'bg-ochre-600' },
};

const DONE_STATES = ['TARJADO', 'OBSERVADO'];

function statusMeta(s: string) {
  return VEHICLE_STATUS[s] ?? { label: s, pill: 'bg-line/50 text-muted ring-muted/20', dot: 'bg-muted' };
}

/* --------------------------- resumen de la nave --------------------------- */

function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function Donut({ pct }: { pct: number }) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  return (
    <div className="relative h-[108px] w-[108px] shrink-0">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#e7ebf1" strokeWidth="10" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#1a9d5a"
          strokeWidth="10"
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: 'stroke-dashoffset .4s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="tnum font-display text-[20px] font-bold text-navy-900">{pct}%</span>
        <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">tarjado</span>
      </div>
    </div>
  );
}

function StatTile({ value, label, tone }: { value: number | string; label: string; tone: string }) {
  return (
    <div className="rounded-xl border border-line bg-canvas/50 px-3.5 py-3">
      <p className={`tnum font-display text-[20px] font-bold leading-none ${tone}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted">{label}</p>
    </div>
  );
}

/* ---------------------------- panel importar ---------------------------- */

function ImportPanel({ operationId, onDone }: { operationId: string; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function pickFile(f: File | null) {
    setFile(f);
    setPreview(null);
    setMsg('');
    setError('');
  }

  async function doPreview() {
    if (!file) return;
    setError('');
    setMsg('');
    setBusy(true);
    try {
      setPreview(await previewImport(operationId, file));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al previsualizar');
    } finally {
      setBusy(false);
    }
  }

  async function doConfirm() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const r = await confirmImport(operationId, file);
      setMsg(
        `Importados ${r.newVehicles} vehículos · ${r.existingVehicles} ya existían · ` +
          `${r.conflictingVehicles} rechazados · ${r.invalidRows} inválidos · ` +
          `${r.rowsWithWarnings} con advertencias.`,
      );
      setPreview(null);
      pickFile(null);
      if (fileRef.current) fileRef.current.value = '';
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al confirmar');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rise overflow-hidden rounded-2xl border border-line bg-white" style={{ animationDelay: '120ms' }}>
      <header className="flex items-center gap-3 border-b border-line px-5 py-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy-800 ring-1 ring-navy-100">
          <IconUpload className="h-[18px] w-[18px]" />
        </span>
        <div>
          <h2 className="font-display text-[14.5px] font-bold tracking-tight text-navy-900">
            Importar vehículos
          </h2>
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
            Excel · Nave · VIN · BL · Cantidad · Marca · Peso · Puertos
          </p>
        </div>
      </header>

      <div className="px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="group flex flex-1 cursor-pointer items-center gap-3 rounded-[12px] border-[1.5px] border-dashed border-line bg-canvas px-4 py-3 transition-colors hover:border-navy-200 hover:bg-navy-50/40">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-navy-800 ring-1 ring-line">
              <IconUpload className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold text-navy-900">
                {file ? file.name : 'Selecciona un archivo .xlsx'}
              </span>
              <span className="block text-[11px] text-muted">
                {file ? `${(file.size / 1024).toFixed(0)} KB` : 'Haz clic para elegir el Excel de vehículos'}
              </span>
            </span>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
          </label>

          <div className="flex shrink-0 gap-2">
            <button
              onClick={doPreview}
              disabled={!file || busy}
              className="rounded-[11px] border-[1.5px] border-navy-800 px-3.5 py-2.5 text-[12.5px] font-semibold text-navy-800 transition-colors hover:bg-navy-50 disabled:opacity-40"
            >
              {busy && !preview ? 'Leyendo…' : 'Previsualizar'}
            </button>
            {preview && (
              <button
                onClick={doConfirm}
                disabled={busy || preview.validRows === 0}
                className="inline-flex items-center gap-1.5 rounded-[11px] bg-navy-800 px-3.5 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-navy-900 disabled:opacity-40"
              >
                <IconCheck className="h-4 w-4" />
                Confirmar {preview.validRows}
              </button>
            )}
          </div>
        </div>

        {msg && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-jade-50 px-3 py-2 text-[12.5px] font-medium text-jade-600">
            <IconCheck className="mt-0.5 h-4 w-4 shrink-0" />
            {msg}
          </p>
        )}
        {error && (
          <p className="mt-3 flex items-start gap-2 rounded-lg bg-cosco-50 px-3 py-2 text-[12.5px] font-medium text-cosco-600">
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}

        {preview && (
          <div className="mt-4 rounded-[12px] border border-line bg-canvas/60 p-3.5">
            <div className="flex flex-wrap items-center gap-4 text-[12.5px]">
              <span className="text-muted">
                Total <span className="tnum font-semibold text-navy-900">{preview.totalRows}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-jade-600">
                <span className="h-1.5 w-1.5 rounded-full bg-jade-600" />
                Válidos <span className="tnum font-semibold">{preview.validRows}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 text-cosco-600">
                <span className="h-1.5 w-1.5 rounded-full bg-cosco-500" />
                Inválidos <span className="tnum font-semibold">{preview.invalidRows}</span>
              </span>
            </div>
            {preview.invalidRows > 0 && (
              <ul className="mt-3 space-y-1 border-t border-line pt-3">
                {preview.rows
                  .filter((r) => r.errors.length > 0)
                  .slice(0, 10)
                  .map((r) => (
                    <li key={r.rowNumber} className="flex gap-2 text-[12px] text-cosco-600">
                      <span className="shrink-0 font-mono text-muted">Fila {r.rowNumber}</span>
                      <span>{r.errors.join(', ')}</span>
                    </li>
                  ))}
                {preview.rows.filter((r) => r.errors.length > 0).length > 10 && (
                  <li className="text-[11.5px] text-muted">…y más filas con errores.</li>
                )}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- página ------------------------------- */

export default function OperationDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const [op, setOp] = useState<Operation | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODOS' | string>('TODOS');
  const [statusBusy, setStatusBusy] = useState(false);
  const isAdmin = getUser()?.role === 'ADMIN';

  async function changeStatus(action: 'activate' | 'pause' | 'close') {
    setStatusBusy(true);
    try {
      await setOperationStatus(Number(id), action);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cambiar el estado');
    } finally {
      setStatusBusy(false);
    }
  }

  const load = useCallback(async () => {
    try {
      const [o, v] = await Promise.all([getOperation(id), listVehicles(id)]);
      setOp(o);
      setVehicles(v);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar la operación');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    const total = vehicles.length;
    const done = vehicles.filter((v) => DONE_STATES.includes(v.status)).length;
    const inProgress = vehicles.filter((v) => v.status === 'EN_PROCESO' || v.status === 'REABIERTO').length;
    const pending = total - done - inProgress;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const maxWeight = vehicles.reduce((mx, v) => Math.max(mx, v.weight ?? 0), 0);
    return { total, done, inProgress, pending, pct, maxWeight };
  }, [vehicles]);

  const presentStatuses = useMemo(
    () => Array.from(new Set(vehicles.map((v) => v.status))),
    [vehicles],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return vehicles.filter((v) => {
      if (statusFilter !== 'TODOS' && v.status !== statusFilter) return false;
      if (!q) return true;
      return (
        v.vin.toLowerCase().includes(q) ||
        (v.brand ?? '').toLowerCase().includes(q) ||
        (v.billOfLading?.blNumber ?? '').toLowerCase().includes(q)
      );
    });
  }, [vehicles, query, statusFilter]);

  const opMeta = op ? OP_STATUS_META[op.status] : null;

  return (
    <Shell>
      {/* volver */}
      <Link
        href="/operations"
        className="rise group mb-4 inline-flex items-center gap-1.5 text-[12px] font-semibold text-muted transition-colors hover:text-navy-800"
      >
        <IconArrow className="h-3.5 w-3.5 rotate-180 transition-transform group-hover:-translate-x-0.5" />
        Operaciones
      </Link>

      {error && !op && (
        <p className="flex items-center gap-2 rounded-lg bg-cosco-50 px-3 py-2 text-[12.5px] font-medium text-cosco-600">
          <IconAlert className="h-4 w-4" />
          {error}
        </p>
      )}

      {loading && !op && (
        <div className="h-40 animate-pulse rounded-2xl border border-line bg-white" />
      )}

      {op && opMeta && (
        <>
          {/* ---------- resumen de la operación ---------- */}
          <section className="rise rounded-2xl border border-line bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                    {TYPE_LABEL[op.operationType] ?? op.operationType}
                  </span>
                  {op.portDischarge && (
                    <span className="text-[11.5px] text-muted">Descarga en {op.portDischarge}</span>
                  )}
                </div>
                <h1 className="mt-1.5 font-display text-[20px] font-bold leading-tight tracking-tight text-navy-900">
                  {op.shipName}
                </h1>
                <p className="mt-0.5 font-mono text-[12px] text-muted">{op.code}</p>
              </div>

              <span
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-[11.5px] font-semibold ring-1 ring-inset ${opMeta.pill}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${opMeta.dot}`} />
                {opMeta.label}
              </span>
            </div>

            {/* progreso + stats */}
            <div className="mt-5 flex flex-wrap items-center gap-5">
              <Donut pct={counts.pct} />
              <div className="grid min-w-[220px] flex-1 grid-cols-2 gap-2.5">
                <StatTile value={counts.total} label="Chasis" tone="text-navy-900" />
                <StatTile value={counts.done} label="Tarjados" tone="text-jade-600" />
                <StatTile value={counts.total - counts.done} label="Por tarjar" tone="text-ochre-600" />
                <StatTile value={op._count?.bills ?? 0} label="B/L" tone="text-navy-900" />
              </div>
            </div>

            {/* fechas */}
            <div className="mt-5 space-y-1.5 border-t border-line pt-4 text-[12.5px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Tarea creada</span>
                <span className="tnum font-medium text-navy-900">{fmtDateTime(op.createdAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Aperturada</span>
                <span className="tnum font-medium text-navy-900">{fmtDateTime(op.openedAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Finalizada</span>
                <span className="tnum font-medium text-navy-900">{fmtDateTime(op.closedAt)}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Última tarja</span>
                <span className="tnum font-medium text-navy-900">{fmtDateTime(op.lastReportAt)}</span>
              </div>
            </div>

            {/* acciones de estado (admin) */}
            {isAdmin && (
              <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-4">
                {op.status !== 'ACTIVA' && (
                  <button
                    onClick={() => changeStatus('activate')}
                    disabled={statusBusy}
                    className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-jade-600 transition-colors hover:bg-jade-50 disabled:opacity-50"
                  >
                    Activar
                  </button>
                )}
                {op.status === 'ACTIVA' && (
                  <button
                    onClick={() => changeStatus('pause')}
                    disabled={statusBusy}
                    className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-ochre-600 transition-colors hover:bg-ochre-50 disabled:opacity-50"
                  >
                    Pausar
                  </button>
                )}
                {op.status !== 'CERRADA' && (
                  <button
                    onClick={() => changeStatus('close')}
                    disabled={statusBusy}
                    className="rounded-lg px-3 py-1.5 text-[12px] font-semibold text-muted transition-colors hover:bg-canvas hover:text-navy-900 disabled:opacity-50"
                  >
                    Cerrar
                  </button>
                )}
              </div>
            )}

            <Link
              href="/reportes/turno"
              className="mt-4 flex items-center justify-center rounded-xl bg-navy-50 px-4 py-3 text-[13px] font-semibold text-navy-800 transition-colors hover:bg-navy-100"
            >
              Reporte de avance de turno
            </Link>
          </section>

          {/* ---------- importar (admin) ---------- */}
          {isAdmin && (
            <div className="mt-5">
              <ImportPanel operationId={id} onDone={load} />
            </div>
          )}

          {/* ---------- filtros vehículos ---------- */}
          <section className="mb-4 mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-display text-[16px] font-bold tracking-tight text-navy-900">
                Vehículos
              </h2>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                {counts.total} unidad{counts.total === 1 ? '' : 'es'} en la nave
              </p>
            </div>
            <div className="relative sm:max-w-xs sm:flex-1">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por VIN, marca o BL…"
                className="w-full rounded-[11px] border-[1.5px] border-line bg-white py-2.5 pl-9 pr-3 text-[13px] text-ink outline-none transition-all placeholder:text-muted/60 focus:border-navy-700 focus:shadow-[0_0_0_3px_rgba(18,85,143,0.12)]"
              />
            </div>
          </section>

          {presentStatuses.length > 1 && (
            <div className="mb-4 flex flex-wrap items-center gap-1.5">
              <button
                onClick={() => setStatusFilter('TODOS')}
                className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all ${
                  statusFilter === 'TODOS'
                    ? 'bg-navy-800 text-white'
                    : 'border border-line bg-white text-muted hover:text-navy-800'
                }`}
              >
                Todos
              </button>
              {presentStatuses.map((s) => {
                const m = statusMeta(s);
                const active = statusFilter === s;
                return (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-all ${
                      active
                        ? 'bg-navy-800 text-white'
                        : 'border border-line bg-white text-muted hover:text-navy-800'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                    {m.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* ---------- listado de vehículos ---------- */}
          <div className="overflow-hidden rounded-2xl border border-line bg-white">
            {filtered.length > 0 ? (
              <>
                <div className="divide-y divide-line">
                  {filtered.map((v, i) => {
                    const m = statusMeta(v.status);
                    const wPct =
                      v.weight != null && counts.maxWeight > 0
                        ? Math.max(6, Math.round((v.weight / counts.maxWeight) * 100))
                        : 0;
                    return (
                      <div
                        key={v.id}
                        className="group relative flex flex-col gap-3.5 px-4 py-4 pl-5 transition-colors hover:bg-navy-50/40 md:flex-row md:items-center md:gap-5"
                      >
                        {/* acento de estado */}
                        <span
                          className={`absolute inset-y-0 left-0 w-1 ${m.dot} opacity-0 transition-opacity group-hover:opacity-100`}
                        />

                        {/* avatar + identidad */}
                        <div className="flex min-w-0 flex-1 items-center gap-3.5">
                          <span
                            className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ring-inset ${m.pill}`}
                          >
                            <IconTire className="h-[22px] w-[22px]" />
                            <span className="tnum absolute -bottom-1.5 -right-1.5 grid h-5 min-w-[20px] place-items-center rounded-md bg-white px-1 font-mono text-[9.5px] font-semibold text-muted ring-1 ring-line">
                              {i + 1}
                            </span>
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-[14px] font-semibold tracking-tight text-navy-900">
                                {v.vin}
                              </span>
                              {v.isUnplanned && (
                                <span className="rounded bg-ochre-50 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-ochre-600 ring-1 ring-inset ring-ochre-600/15">
                                  No planif.
                                </span>
                              )}
                            </div>
                            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-muted">
                              <span className="font-semibold text-navy-800">
                                {v.brand ?? 'Marca sin registrar'}
                              </span>
                              {v.model && (
                                <>
                                  <span className="text-line">·</span>
                                  <span className="font-medium text-navy-700">{v.model}</span>
                                </>
                              )}
                              {v.chassisNumber && (
                                <>
                                  <span className="text-line">·</span>
                                  <span className="font-mono text-[11px]">
                                    Chasis {v.chassisNumber}
                                  </span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* bloque de métricas */}
                        <div className="flex shrink-0 items-stretch divide-x divide-line overflow-hidden rounded-xl border border-line bg-canvas/40">
                          <div className="min-w-[104px] px-3.5 py-2">
                            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                              BL
                            </p>
                            <p className="mt-1 truncate font-mono text-[12.5px] font-medium text-navy-900">
                              {v.billOfLading?.blNumber ?? '—'}
                            </p>
                          </div>
                          <div className="min-w-[96px] px-3.5 py-2">
                            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                              Peso
                            </p>
                            <p className="tnum mt-1 text-[12.5px] font-semibold text-navy-900">
                              {v.weight != null ? (
                                <>
                                  {v.weight}
                                  <span className="ml-0.5 font-mono text-[9px] font-normal text-muted">
                                    kg
                                  </span>
                                </>
                              ) : (
                                <span className="text-muted">—</span>
                              )}
                            </p>
                            {wPct > 0 && (
                              <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-line/70">
                                <span
                                  className="block h-full rounded-full bg-gradient-to-r from-navy-700 to-navy-500"
                                  style={{ width: `${wPct}%` }}
                                />
                              </span>
                            )}
                          </div>
                          <div className="px-3.5 py-2 text-center">
                            <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                              Cant.
                            </p>
                            <p className="tnum mt-1 text-[13px] font-bold text-navy-900">
                              {v.quantity}
                            </p>
                          </div>
                        </div>

                        {/* estado */}
                        <div className="shrink-0 md:w-28">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${m.pill}`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${m.dot}`} />
                            {m.label}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* pie con totales */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas/50 px-5 py-3">
                  <span className="font-mono text-[11px] text-muted">
                    Mostrando{' '}
                    <span className="tnum font-semibold text-navy-900">{filtered.length}</span>
                    {filtered.length !== counts.total && (
                      <> de <span className="tnum font-semibold text-navy-900">{counts.total}</span></>
                    )}{' '}
                    vehículo{filtered.length === 1 ? '' : 's'}
                  </span>
                  <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-jade-600" />
                    <span className="tnum font-semibold text-jade-600">{counts.done}</span> tarjados ·{' '}
                    <span className="tnum font-semibold text-navy-900">{counts.pct}%</span>
                  </span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-navy-50 text-navy-800 ring-1 ring-navy-100">
                  <IconLayers className="h-7 w-7" />
                </span>
                <p className="mt-4 font-display text-[15px] font-bold text-navy-900">
                  {vehicles.length === 0 ? 'Sin vehículos cargados' : 'Sin resultados'}
                </p>
                <p className="mt-1 max-w-xs text-[12.5px] text-muted">
                  {vehicles.length === 0
                    ? isAdmin
                      ? 'Importa un Excel para cargar los vehículos de esta nave.'
                      : 'Cuando se importe el manifiesto aparecerá aquí.'
                    : 'Ajusta la búsqueda o el filtro de estado.'}
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </Shell>
  );
}
