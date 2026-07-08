'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '@/components/shell';
import { listOperations, createOperation, getUser, type Operation } from '@/lib/api';

const STATUS_BADGE: Record<string, string> = {
  ACTIVA: 'bg-emerald-100 text-emerald-700',
  PAUSADA: 'bg-amber-100 text-amber-700',
  CERRADA: 'bg-slate-200 text-slate-600',
};
const TYPE_LABEL: Record<string, string> = {
  ROLL_ON_ROLL_OFF: 'Ro-Ro',
  DESCONSOLIDADO: 'Desconsolidado',
};

function NewOperationForm({ onCreated }: { onCreated: () => void }) {
  const [code, setCode] = useState('');
  const [shipName, setShipName] = useState('');
  const [operationType, setOperationType] = useState('ROLL_ON_ROLL_OFF');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await createOperation({ code, shipName, operationType });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-3"
    >
      <input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Código (ej. OP-001)"
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0B3D6B]"
      />
      <input
        value={shipName}
        onChange={(e) => setShipName(e.target.value)}
        placeholder="Nave"
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0B3D6B]"
      />
      <select
        value={operationType}
        onChange={(e) => setOperationType(e.target.value)}
        className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0B3D6B]"
      >
        <option value="ROLL_ON_ROLL_OFF">Ro-Ro</option>
        <option value="DESCONSOLIDADO">Desconsolidado</option>
      </select>
      {error && <p className="text-sm text-[#C8102E] sm:col-span-3">{error}</p>}
      <div className="sm:col-span-3">
        <button
          disabled={saving}
          className="rounded-lg bg-[#0B3D6B] px-4 py-2 text-sm font-medium text-white hover:bg-[#082C4D] disabled:opacity-60"
        >
          {saving ? 'Guardando…' : 'Crear operación'}
        </button>
      </div>
    </form>
  );
}

export default function OperationsPage() {
  const [ops, setOps] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const isAdmin = getUser()?.role === 'ADMIN';

  const load = useCallback(async () => {
    try {
      setOps(await listOperations());
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
        <h1 className="text-2xl font-semibold text-slate-800">Operaciones</h1>
        {isAdmin && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-lg bg-[#0B3D6B] px-4 py-2 text-sm font-medium text-white hover:bg-[#082C4D]"
          >
            {showForm ? 'Cerrar' : 'Nueva operación'}
          </button>
        )}
      </div>

      {showForm && isAdmin && <NewOperationForm onCreated={() => { setShowForm(false); load(); }} />}
      {error && <p className="mt-4 text-sm text-[#C8102E]">{error}</p>}

      {loading ? (
        <p className="mt-6 text-slate-500">Cargando…</p>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-slate-500">
              <tr>
                <th className="px-4 py-3">Código</th>
                <th className="px-4 py-3">Nave</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Vehículos</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {ops.map((op) => (
                <tr key={op.id} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-medium text-slate-800">{op.code}</td>
                  <td className="px-4 py-3">{op.shipName}</td>
                  <td className="px-4 py-3">{TYPE_LABEL[op.operationType] ?? op.operationType}</td>
                  <td className="px-4 py-3">{op._count?.vehicles ?? 0}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_BADGE[op.status] ?? ''}`}>
                      {op.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/operations/${op.id}`} className="text-[#0B3D6B] hover:underline">
                      Abrir
                    </Link>
                  </td>
                </tr>
              ))}
              {ops.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-slate-400">
                    Sin operaciones todavía.
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
