'use client';

import { useCallback, useEffect, useState } from 'react';
import Shell from '@/components/shell';
import { listAccessories, createAccessory, updateAccessory, getUser, type Accessory } from '@/lib/api';

export default function AccessoriesPage() {
  const [items, setItems] = useState<Accessory[]>([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const isAdmin = getUser()?.role === 'ADMIN';

  const load = useCallback(async () => {
    try {
      setItems(await listAccessories());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setError('');
    try {
      await createAccessory(name.trim());
      setName('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  async function toggle(a: Accessory) {
    try {
      await updateAccessory(a.id, { isActive: !a.isActive });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  }

  return (
    <Shell>
      <h1 className="text-2xl font-semibold text-slate-800">Catálogo de accesorios</h1>
      {isAdmin && (
        <form onSubmit={add} className="mt-4 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nuevo accesorio"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-[#0B3D6B]"
          />
          <button className="rounded-lg bg-[#0B3D6B] px-4 py-2 text-sm font-medium text-white hover:bg-[#082C4D]">
            Agregar
          </button>
        </form>
      )}
      {error && <p className="mt-3 text-sm text-[#C8102E]">{error}</p>}
      {loading ? (
        <p className="mt-6 text-slate-500">Cargando…</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {items.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-4 py-3">
              <span className={a.isActive ? 'text-slate-800' : 'text-slate-400 line-through'}>
                {a.sortOrder}. {a.name}
              </span>
              {isAdmin && (
                <button
                  onClick={() => toggle(a)}
                  className={`rounded-md px-3 py-1 text-xs ${
                    a.isActive
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {a.isActive ? 'Activo' : 'Inactivo'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
