'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import {
  getUser,
  listEditRequests,
  resolveEditRequest,
  type AuthUser,
  type EditRequestRow,
} from '@/lib/api';

export default function SolicitudesEdicion() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [rows, setRows] = useState<EditRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    if (u.role !== 'ADMIN' && u.role !== 'SUPERVISOR') {
      router.replace('/inicio');
      return;
    }
    setUser(u);
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await listEditRequests('PENDIENTE'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  async function resolve(id: number, approve: boolean) {
    const comment = approve ? undefined : (window.prompt('Motivo del rechazo (opcional):') ?? undefined);
    setBusy(id);
    try {
      await resolveEditRequest(id, approve, comment);
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(null);
    }
  }

  if (!user) return null;

  return (
    <Shell title="Solicitudes de edición" onBack={() => router.push('/inicio')}>
      {loading ? (
        <div className="empty">Cargando…</div>
      ) : rows.length === 0 ? (
        <div className="empty">No hay solicitudes pendientes.</div>
      ) : (
        rows.map((r) => (
          <div key={r.id} className="card">
            <div className="mono">
              {r.report.reportCode} · {r.report.vehicle?.vin ?? '—'}
            </div>
            <div className="muted">
              {r.report.operation?.ship.name ?? '—'} · {r.report.operation?.code ?? '—'}
            </div>
            <div>
              Solicita: {r.requestedBy.name} {r.requestedBy.lastname}
            </div>
            <div>Motivo: {r.reason}</div>
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small" disabled={busy === r.id} onClick={() => resolve(r.id, true)}>
                Aprobar
              </button>
              <button
                className="btn small ghost"
                disabled={busy === r.id}
                onClick={() => resolve(r.id, false)}
              >
                Rechazar
              </button>
            </div>
          </div>
        ))
      )}
    </Shell>
  );
}
