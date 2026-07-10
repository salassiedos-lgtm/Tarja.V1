'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import NewOperationModal from '@/components/new-operation-modal';
import {
  listOperations,
  setOperationStatus,
  deleteOperation,
  type Operation,
} from '@/lib/api';

/** ISO → "09/07/2026 14:04". Null → "—". */
function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const isOpen = (o: Operation) => o.status !== 'CERRADA';

const FILTERS: [('open' | 'closed'), string][] = [
  ['open', 'Pendientes de cierre'],
  ['closed', 'Cerradas'],
];

export default function AdminTasks() {
  const router = useRouter();
  const [ops, setOps] = useState<Operation[]>([]);
  const [filter, setFilter] = useState<'open' | 'closed'>('open');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(0);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      setOps(await listOperations());
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleStatus(o: Operation) {
    setBusy(o.id);
    setErr('');
    try {
      await setOperationStatus(o.id, isOpen(o) ? 'close' : 'activate');
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(0);
    }
  }

  async function remove(o: Operation) {
    const ok = window.confirm(
      `¿Eliminar el lote ${o.code}?\n\n` +
        `Se borrarán sus ${o.total ?? 0} tareas y las ${o.completed ?? 0} tarjas ya registradas. ` +
        `Esta acción no se puede deshacer.`,
    );
    if (!ok) return;
    setBusy(o.id);
    setErr('');
    try {
      await deleteOperation(o.id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(0);
    }
  }

  const count = (f: 'open' | 'closed') =>
    ops.filter((o) => (f === 'open' ? isOpen(o) : !isOpen(o))).length;
  const shown = ops.filter((o) => (filter === 'open' ? isOpen(o) : !isOpen(o)));

  return (
    <Shell title="Tareas" onBack={() => router.push('/admin')}>
      {err && <div className="error">{err}</div>}

      <button className="btn" onClick={() => setShowModal(true)} style={{ marginBottom: 16 }}>
        Nueva operación
      </button>

      <div className="tabs">
        {FILTERS.map(([v, l]) => (
          <div
            key={v}
            className={`tab ${filter === v ? 'active' : ''}`}
            onClick={() => setFilter(v)}
          >
            {l} ({count(v)})
          </div>
        ))}
      </div>

      {loading ? (
        <div className="empty">Cargando…</div>
      ) : shown.length === 0 ? (
        <div className="empty">
          {filter === 'open'
            ? 'No hay lotes pendientes de cierre.'
            : 'No has cerrado ningún lote.'}
        </div>
      ) : (
        shown.map((o) => {
          const total = o.total ?? o._count?.vehicles ?? 0;
          const completed = o.completed ?? 0;
          const pending = o.pending ?? total - completed;
          const pct = total ? Math.round((completed / total) * 100) : 0;
          const open = isOpen(o);
          return (
            <div className="card bl" key={o.id}>
              <div className="bl-head">
                <div className="bl-no">{o.code}</div>
                <span className={`badge ${open ? 'in_progress' : 'pending'}`}>
                  {open ? 'Aperturado' : 'Cerrado'}
                </span>
                <span className={`badge ${pct === 100 ? 'completed' : 'pending'}`}>{pct}%</span>
              </div>
              <div className="muted">Nave: {o.shipName || '—'}</div>
              <div className="muted">
                {o.fileName || 'sin archivo'}
                {o.uploadedByName ? ` · ${o.uploadedByName}` : ''}
              </div>

              <table className="dates">
                <tbody>
                  <tr>
                    <th>Creada</th>
                    <td>{fmtDateTime(o.createdAt)}</td>
                  </tr>
                  <tr>
                    <th>Aperturada</th>
                    <td>{fmtDateTime(o.openedAt)}</td>
                  </tr>
                  <tr>
                    <th>Cerrada</th>
                    <td>{fmtDateTime(open ? null : o.closedAt)}</td>
                  </tr>
                  <tr>
                    <th>Última tarja</th>
                    <td>{fmtDateTime(o.lastReportAt)}</td>
                  </tr>
                </tbody>
              </table>

              <div className="bar">
                <div className="bar-fill" style={{ width: `${pct}%` }} />
              </div>

              <div className="bl-counts">
                <div className="cell">
                  <span className="n">{total}</span>
                  <span className="l">Chasis</span>
                </div>
                <div className="cell ok">
                  <span className="n">{completed}</span>
                  <span className="l">Tarjados</span>
                </div>
                <div className="cell warn">
                  <span className="n">{pending}</span>
                  <span className="l">Por tarjar</span>
                </div>
              </div>

              <button
                className="btn secondary"
                style={{ marginTop: 12, marginBottom: 8 }}
                onClick={() => router.push(`/operations/${o.id}`)}
              >
                Abrir · importar vehículos
              </button>

              <button
                className="btn"
                disabled={busy === o.id}
                onClick={() => toggleStatus(o)}
                style={{ marginBottom: 8 }}
              >
                {busy === o.id ? '…' : open ? 'Cerrar tareas' : 'Aperturar tareas'}
              </button>

              <div className="row">
                <button
                  className="btn secondary small"
                  onClick={() => router.push(`/admin/lote/${o.id}`)}
                >
                  Reportes ({completed})
                </button>
                <button
                  className="btn ghost small"
                  disabled={busy === o.id}
                  onClick={() => remove(o)}
                >
                  {busy === o.id ? 'Eliminando…' : 'Eliminar'}
                </button>
              </div>
            </div>
          );
        })
      )}

      {showModal && (
        <NewOperationModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            setShowModal(false);
            load();
          }}
        />
      )}
    </Shell>
  );
}
