'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import {
  cancelEditRequest,
  getUser,
  listEditRequests,
  resolveEditRequest,
  type AuthUser,
  type EditRequestRow,
} from '@/lib/api';

export default function SolicitudesEdicion() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [pending, setPending] = useState<EditRequestRow[]>([]);
  const [approved, setApproved] = useState<EditRequestRow[]>([]);
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
      const [p, a] = await Promise.all([
        listEditRequests('PENDIENTE'),
        listEditRequests('APROBADA'),
      ]);
      setPending(p);
      setApproved(a);
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

  async function cancel(id: number) {
    if (!window.confirm('¿Cancelar esta edición autorizada? El tarjador perderá el permiso de edición en curso.')) {
      return;
    }
    setBusy(id);
    try {
      await cancelEditRequest(id);
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
      ) : (
        <>
          <h3 className="muted" style={{ marginTop: 0 }}>
            Pendientes de autorización
          </h3>
          {pending.length === 0 ? (
            <div className="empty">No hay solicitudes pendientes.</div>
          ) : (
            pending.map((r) => (
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

          <h3 className="muted" style={{ marginTop: 24 }}>
            En edición (autorizadas)
          </h3>
          {approved.length === 0 ? (
            <div className="empty">No hay ediciones autorizadas en curso.</div>
          ) : (
            approved.map((r) => (
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
                  <button
                    className="btn small ghost"
                    disabled={busy === r.id}
                    onClick={() => cancel(r.id)}
                  >
                    Cancelar edición
                  </button>
                </div>
              </div>
            ))
          )}
        </>
      )}
    </Shell>
  );
}
