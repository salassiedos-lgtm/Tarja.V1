'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import { listOperations, startTarja, type Operation } from '@/lib/api';

export default function TarjaStartPage() {
  const router = useRouter();
  const [ops, setOps] = useState<Operation[]>([]);
  const [operationId, setOperationId] = useState<number | ''>('');
  const [vin, setVin] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    listOperations()
      .then((o) => {
        const active = o.filter((x) => x.status === 'ACTIVA');
        setOps(active);
        if (active[0]) setOperationId(active[0].id);
      })
      .catch(() => {});
  }, []);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!operationId || !vin.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await startTarja(Number(operationId), vin.trim());
      router.push(`/tarja/${r.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-semibold text-slate-800">Nueva tarja</h1>
        <p className="mt-1 text-slate-500">Selecciona la operación e ingresa el VIN/Chasis.</p>
        <form
          onSubmit={start}
          className="mt-6 space-y-4 rounded-xl border border-slate-200 bg-white p-5"
        >
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Operación</label>
            <select
              value={operationId}
              onChange={(e) => setOperationId(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2"
            >
              {ops.length === 0 && <option value="">Sin operaciones activas</option>}
              {ops.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.code} — {o.shipName}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">VIN / Chasis</label>
            <input
              value={vin}
              onChange={(e) => setVin(e.target.value.toUpperCase())}
              autoFocus
              placeholder="Ingresar VIN"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono"
            />
            <p className="mt-1 text-xs text-slate-400">
              El escáner de cámara se habilitará más adelante; por ahora ingreso manual.
            </p>
          </div>
          {error && <p className="text-sm text-[#C8102E]">{error}</p>}
          <button
            disabled={busy || !operationId}
            className="w-full rounded-lg bg-[#0B3D6B] py-2.5 font-medium text-white hover:bg-[#082C4D] disabled:opacity-60"
          >
            {busy ? 'Iniciando…' : 'Iniciar tarja'}
          </button>
        </form>
      </div>
    </Shell>
  );
}
