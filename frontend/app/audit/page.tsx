'use client';

import { useCallback, useEffect, useState } from 'react';
import Shell from '@/components/shell';
import { listAuditLogs, type AuditLog } from '@/lib/api';

function fmt(d: string) {
  const dt = new Date(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)} ${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      setLogs(await listAuditLogs());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Shell>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-slate-800">Auditoría</h1>
        <button onClick={load} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600">
          Actualizar
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-[#C8102E]">{error}</p>}
      {loading ? (
        <p className="mt-6 text-slate-500">Cargando…</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">Usuario</th>
                <th className="px-4 py-2">Módulo</th>
                <th className="px-4 py-2">Acción</th>
                <th className="px-4 py-2">Descripción</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="whitespace-nowrap px-4 py-2">{fmt(l.createdAt)}</td>
                  <td className="px-4 py-2">{l.username ?? (l.userId ? `#${l.userId}` : '—')}</td>
                  <td className="px-4 py-2">{l.module}</td>
                  <td className="px-4 py-2 font-medium">{l.action}</td>
                  <td className="px-4 py-2 text-slate-600">{l.description ?? ''}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-slate-400">
                    Sin registros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Shell>
  );
}
