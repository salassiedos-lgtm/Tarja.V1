'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import NewOperationModal from '@/components/new-operation-modal';
import {
  listOperations,
  deleteOperation,
  getUser,
  type Operation,
} from '@/lib/api';
import {
  IconShip,
  IconPlus,
  IconSearch,
  IconArrow,
  IconClose,
  IconLayers,
  IconClock,
} from '@/components/icons';

type Status = Operation['status'];

const STATUS_META: Record<Status, { label: string; dot: string; pill: string }> = {
  ACTIVA: {
    label: 'Activa',
    dot: 'bg-jade-600',
    pill: 'bg-jade-50 text-jade-600 ring-jade-600/15',
  },
  PAUSADA: {
    label: 'Pausada',
    dot: 'bg-ochre-600',
    pill: 'bg-ochre-50 text-ochre-600 ring-ochre-600/15',
  },
  CERRADA: {
    label: 'Cerrada',
    dot: 'bg-muted',
    pill: 'bg-line/60 text-muted ring-muted/20',
  },
};

const TYPE_LABEL: Record<string, string> = {
  ROLL_ON_ROLL_OFF: 'RO-RO',
  DESCONSOLIDADO: 'Desconsolidado',
};

const STATUS_FILTERS: { key: 'TODAS' | Status; label: string }[] = [
  { key: 'TODAS', label: 'Todas' },
  { key: 'ACTIVA', label: 'Activas' },
  { key: 'PAUSADA', label: 'Pausadas' },
  { key: 'CERRADA', label: 'Cerradas' },
];

/* ----------------------------- KPI strip ----------------------------- */

function KpiCell({
  label,
  value,
  accent,
  i,
}: {
  label: string;
  value: number | string;
  accent: string;
  i: number;
}) {
  return (
    <div
      className="rise relative flex items-center gap-3.5 px-5 py-4"
      style={{ animationDelay: `${i * 60}ms` }}
    >
      <span className={`h-8 w-[3px] shrink-0 rounded-full ${accent}`} />
      <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted">{label}</p>
        <p className="tnum mt-1 font-display text-[24px] font-bold leading-none text-navy-900">
          {value}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------- fila ------------------------------- */

function OperationRow({
  op,
  isAdmin,
  onDelete,
  i,
}: {
  op: Operation;
  isAdmin: boolean;
  onDelete: (op: Operation) => void;
  i: number;
}) {
  const meta = STATUS_META[op.status];
  const vehicles = op._count?.vehicles ?? 0;

  return (
    <div
      className="rise group relative flex flex-col gap-3 px-5 py-4 transition-colors hover:bg-navy-50/50"
      style={{ animationDelay: `${120 + i * 45}ms` }}
    >
      {/* icono + identidad */}
      <div className="flex min-w-0 items-center gap-3.5">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-navy-50 text-navy-800 ring-1 ring-navy-100">
          {op.operationType === 'DESCONSOLIDADO' ? (
            <IconLayers className="h-5 w-5" />
          ) : (
            <IconShip className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate font-display text-[15px] font-bold tracking-tight text-navy-900">
              {op.shipName}
            </p>
            <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
              {TYPE_LABEL[op.operationType] ?? op.operationType}
            </span>
          </div>
          <p className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted">
            <span>{op.code}</span>
            {op.portDischarge && (
              <>
                <span className="text-line">·</span>
                <span className="truncate">{op.portDischarge}</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* vehículos + estado */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="tnum font-display text-[17px] font-bold text-navy-900">{vehicles}</span>
          <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
            {vehicles === 1 ? 'unidad' : 'unidades'}
          </span>
        </div>
        <span
          className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${meta.pill}`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
          {meta.label}
        </span>
      </div>

      {/* acciones */}
      <div className="flex flex-wrap items-center gap-1.5">
        {isAdmin && (
          <button
            onClick={() => onDelete(op)}
            title="Eliminar lote y todo su trabajo"
            className="rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold text-cosco-600 transition-colors hover:bg-cosco-50 disabled:opacity-50"
          >
            Eliminar
          </button>
        )}
        <Link
          href={`/operations/${op.id}`}
          className="group/link inline-flex items-center gap-1 rounded-lg bg-navy-50 px-3 py-1.5 text-[12px] font-semibold text-navy-800 transition-all hover:bg-navy-100"
        >
          Abrir
          <IconArrow className="h-3.5 w-3.5 transition-transform group-hover/link:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}

/* --------------------------- Eliminar lote --------------------------- */

function DeleteOperationModal({
  op,
  onClose,
  onDeleted,
}: {
  op: Operation;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const vehicles = op._count?.vehicles ?? 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function confirm() {
    setError('');
    setDeleting(true);
    try {
      await deleteOperation(op.id);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el lote');
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="rise relative w-full max-w-md overflow-hidden rounded-t-3xl border border-line bg-white shadow-[0_24px_60px_-20px_rgba(4,24,42,0.55)] sm:rounded-3xl">
        <div className="px-6 pb-2 pt-6">
          <div className="flex items-start gap-3.5">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-cosco-50 text-cosco-600 ring-1 ring-cosco-500/15">
              <IconClose className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-[19px] font-extrabold leading-tight tracking-tight text-navy-900">
                Eliminar lote
              </h2>
              <p className="mt-1 text-[12.5px] text-muted">
                Vas a eliminar <span className="font-semibold text-navy-900">{op.code}</span> ·{' '}
                {op.shipName}.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-cosco-50 px-4 py-3 text-[12.5px] leading-relaxed text-cosco-700">
            Se borrarán <span className="font-semibold">{vehicles}</span>{' '}
            {vehicles === 1 ? 'vehículo' : 'vehículos'} y <span className="font-semibold">todas
            las tarjas, daños y anulaciones</span> de este lote. Esta acción no se puede deshacer.
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-cosco-50 px-3 py-2 text-[12.5px] font-medium text-cosco-600">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2.5 px-6 py-5">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="rounded-[11px] px-4 py-2.5 text-[13px] font-semibold text-muted transition-colors hover:bg-canvas hover:text-navy-900 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-[11px] bg-cosco-600 px-5 py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-cosco-700 disabled:opacity-60"
          >
            {deleting ? 'Eliminando…' : 'Eliminar definitivamente'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- página ------------------------------- */

export default function OperationsPage() {
  const router = useRouter();
  const [ops, setOps] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'TODAS' | Status>('TODAS');
  const [confirmDelete, setConfirmDelete] = useState<Operation | null>(null);
  const isAdmin = getUser()?.role === 'ADMIN';

  const load = useCallback(async () => {
    try {
      setOps(await listOperations());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar operaciones');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const activas = ops.filter((o) => o.status === 'ACTIVA').length;
    const vehiculos = ops.reduce((sum, o) => sum + (o._count?.vehicles ?? 0), 0);
    return { total: ops.length, activas, vehiculos };
  }, [ops]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return ops.filter((o) => {
      if (statusFilter !== 'TODAS' && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        o.code.toLowerCase().includes(q) ||
        o.shipName.toLowerCase().includes(q) ||
        (o.portDischarge ?? '').toLowerCase().includes(q)
      );
    });
  }, [ops, query, statusFilter]);

  return (
    <Shell onBack={() => router.push('/inicio')}>
      {/* ---------- encabezado ---------- */}
      <section className="rise mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted">
            Naves · BL · vehículos
          </p>
          <h1 className="mt-2 font-display text-[30px] font-extrabold leading-none tracking-tight text-navy-900 sm:text-[34px]">
            Operaciones<span className="text-cosco-500">.</span>
          </h1>
          <p className="mt-2 text-[13px] text-muted">
            Crea operaciones, carga el Excel de vehículos y sigue el avance por nave.
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowModal(true)}
            className="group inline-flex items-center gap-2 rounded-lg bg-navy-800 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy-900"
          >
            <IconPlus className="h-4 w-4 transition-transform group-hover:rotate-90" />
            Nueva operación
          </button>
        )}
      </section>

      {/* ---------- KPI strip ---------- */}
      <section className="rise mb-5 grid grid-cols-1 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        <KpiCell label="Operaciones" value={loading ? '—' : stats.total} accent="bg-navy-700" i={0} />
        <KpiCell label="Activas" value={loading ? '—' : stats.activas} accent="bg-jade-600" i={1} />
        <KpiCell
          label="Vehículos"
          value={loading ? '—' : stats.vehiculos}
          accent="bg-cosco-500"
          i={2}
        />
      </section>

      {/* ---------- barra: búsqueda + filtros ---------- */}
      <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs sm:flex-1">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nave, código o puerto…"
            className="w-full rounded-[11px] border-[1.5px] border-line bg-white py-2.5 pl-9 pr-3 text-[13px] text-ink outline-none transition-all placeholder:text-muted/60 focus:border-navy-700 focus:shadow-[0_0_0_3px_rgba(18,85,143,0.12)]"
          />
        </div>
        <div className="flex items-center gap-1 rounded-[11px] border border-line bg-white p-1">
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setStatusFilter(f.key)}
                className={`rounded-[8px] px-3 py-1.5 text-[12px] font-semibold transition-all ${
                  active
                    ? 'bg-navy-800 text-white shadow-[0_4px_12px_-6px_rgba(11,61,107,0.6)]'
                    : 'text-muted hover:bg-navy-50 hover:text-navy-800'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </section>

      {error && (
        <p className="mb-4 rounded-lg bg-cosco-50 px-3 py-2 text-[12.5px] font-medium text-cosco-600">
          {error}
        </p>
      )}

      {/* ---------- listado ---------- */}
      {loading ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {[0, 1, 2].map((k) => (
            <div key={k} className="flex items-center gap-3.5 border-b border-line px-5 py-4 last:border-b-0">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-line/60" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-40 animate-pulse rounded bg-line/60" />
                <div className="h-2.5 w-24 animate-pulse rounded bg-line/40" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {filtered.length > 0 ? (
            <div className="divide-y divide-line">
              {filtered.map((op, i) => (
                <OperationRow
                  key={op.id}
                  op={op}
                  isAdmin={isAdmin}
                  onDelete={setConfirmDelete}
                  i={i}
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-navy-50 text-navy-800 ring-1 ring-navy-100">
                {ops.length === 0 ? (
                  <IconShip className="h-7 w-7" />
                ) : (
                  <IconClock className="h-7 w-7" />
                )}
              </span>
              <p className="mt-4 font-display text-[15px] font-bold text-navy-900">
                {ops.length === 0 ? 'Aún no hay operaciones' : 'Sin resultados'}
              </p>
              <p className="mt-1 max-w-xs text-[12.5px] text-muted">
                {ops.length === 0
                  ? isAdmin
                    ? 'Crea la primera operación para empezar a cargar vehículos.'
                    : 'Cuando un administrador registre una nave aparecerá aquí.'
                  : 'Ajusta la búsqueda o los filtros de estado.'}
              </p>
              {ops.length === 0 && isAdmin && (
                <button
                  onClick={() => setShowModal(true)}
                  className="group mt-5 inline-flex items-center gap-2 rounded-lg bg-navy-800 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy-900"
                >
                  <IconPlus className="h-4 w-4 transition-transform group-hover:rotate-90" />
                  Nueva operación
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {showModal && isAdmin && (
        <NewOperationModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            load();
          }}
        />
      )}

      {confirmDelete && isAdmin && (
        <DeleteOperationModal
          op={confirmDelete}
          onClose={() => setConfirmDelete(null)}
          onDeleted={() => {
            setConfirmDelete(null);
            load();
          }}
        />
      )}
    </Shell>
  );
}
