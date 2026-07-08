'use client';

import { useCallback, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import Shell from '@/components/shell';
import {
  getSupervisorDashboard,
  annulReport,
  openReportPdf,
  API_URL,
  type DashboardData,
  type ReportRow,
} from '@/lib/api';

const REPORT_BADGE: Record<string, string> = {
  FINALIZADO: 'bg-emerald-100 text-emerald-700',
  CON_DANO: 'bg-amber-100 text-amber-700',
  ANULADO: 'bg-slate-200 text-slate-500 line-through',
  BORRADOR: 'bg-blue-100 text-blue-700',
  REEMPLAZADO: 'bg-slate-200 text-slate-500',
};

function fmtDur(s: number | null) {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}m ${sec}s`;
}

export default function SupervisorPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [live, setLive] = useState(false);
  const [annulTarget, setAnnulTarget] = useState<ReportRow | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setData(await getSupervisorDashboard());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }, []);

  useEffect(() => {
    load();
    const socket: Socket = io(API_URL, { transports: ['websocket'] });
    socket.on('connect', () => setLive(true));
    socket.on('disconnect', () => setLive(false));
    const refresh = () => load();
    ['report.started', 'report.finished', 'report.annulled', 'vehicle.released', 'vehicle.auto_released'].forEach(
      (ev) => socket.on(ev, refresh),
    );
    return () => {
      socket.disconnect();
    };
  }, [load]);

  async function confirmAnnul() {
    if (!annulTarget || reason.trim().length < 3) {
      setError('Indique un motivo (mínimo 3 caracteres).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await annulReport(annulTarget.id, reason.trim());
      setAnnulTarget(null);
      setReason('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Supervisión</h1>
        <span className={`flex items-center gap-2 text-sm ${live ? 'text-emerald-600' : 'text-slate-400'}`}>
          <span className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-300'}`} />
          {live ? 'En vivo' : 'Sin conexión'}
        </span>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {data?.operations.map((op) => (
          <div key={op.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="font-semibold text-[#0B3D6B]">{op.code}</p>
            <p className="text-sm text-slate-500">{op.shipName}</p>
            <p className="mt-2 text-sm text-slate-600">
              {op._count?.vehicles ?? 0} vehículos · {op.status}
            </p>
          </div>
        ))}
        {data && data.operations.length === 0 && (
          <p className="text-slate-400">Sin operaciones activas.</p>
        )}
      </div>

      <h2 className="mt-8 text-lg font-medium text-slate-800">Reportes recientes</h2>
      <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Operación</th>
              <th className="px-4 py-3">VIN</th>
              <th className="px-4 py-3">Tarjador</th>
              <th className="px-4 py-3">Duración</th>
              <th className="px-4 py-3">Estado</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {data?.recent.map((r) => (
              <tr key={r.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-mono text-xs">{r.reportCode}</td>
                <td className="px-4 py-3">{r.operation?.code}</td>
                <td className="px-4 py-3 font-mono text-xs">{r.vehicle?.vin}</td>
                <td className="px-4 py-3">{r.tarjador?.initials ?? r.tarjador?.username}</td>
                <td className="px-4 py-3">{fmtDur(r.durationSeconds)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${REPORT_BADGE[r.status] ?? ''}`}>
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-3">
                    {r.status !== 'BORRADOR' && (
                      <button
                        onClick={() => openReportPdf(r.id).catch(() => {})}
                        className="text-[#0B3D6B] hover:underline"
                      >
                        PDF
                      </button>
                    )}
                    {(r.status === 'FINALIZADO' || r.status === 'CON_DANO') && (
                      <button
                        onClick={() => {
                          setAnnulTarget(r);
                          setReason('');
                          setError('');
                        }}
                        className="text-[#C8102E] hover:underline"
                      >
                        Anular
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {data && data.recent.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-slate-400">
                  Sin reportes.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {annulTarget && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setAnnulTarget(null)}
        >
          <div className="w-full max-w-sm rounded-xl bg-white p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-800">Anular reporte {annulTarget.reportCode}</h3>
            <p className="mt-1 text-sm text-slate-500">
              El vehículo volverá a estar disponible para re-tarjar.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Motivo de la anulación"
              className="mt-3 w-full rounded border border-slate-300 px-3 py-2 text-sm"
            />
            {error && <p className="mt-2 text-sm text-[#C8102E]">{error}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setAnnulTarget(null)}
                className="rounded-lg px-3 py-1.5 text-sm text-slate-600"
              >
                Cancelar
              </button>
              <button
                onClick={confirmAnnul}
                disabled={busy}
                className="rounded-lg bg-[#C8102E] px-3 py-1.5 text-sm text-white disabled:opacity-60"
              >
                {busy ? 'Anulando…' : 'Anular'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
