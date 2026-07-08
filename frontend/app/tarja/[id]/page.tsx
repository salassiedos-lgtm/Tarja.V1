'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import {
  getReport,
  listAccessories,
  setReportAccessories,
  setReportDamages,
  finishTarja,
  getUser,
  type TarjaReport,
  type Accessory,
} from '@/lib/api';

const DAMAGE_SOURCE: string[][] = [
  ['CAUSADO', 'Daño infligido'],
  ['ENCONTRADO', 'Daño encontrado'],
];
const DAMAGE_OP: string[][] = [
  ['DESCARGA', 'Descarga'],
  ['EMBARQUE', 'Embarque'],
  ['TRANSITO', 'Tránsito'],
  ['REESTIBA', 'Reestiba'],
];
const DAMAGE_AFFECTS: string[][] = [
  ['CARGA_CHANCAY', 'Carga con destino Chancay'],
  ['CARGA_TRANSITO', 'Carga en tránsito'],
];
const DAMAGE_MOMENT: string[][] = [
  ['ANTES_DESCARGA', 'Antes de la descarga'],
  ['DURANTE_DESCARGA', 'Durante la descarga'],
  ['POSTERIOR_DESCARGA', 'Posterior a la descarga'],
  ['ANTES_EMBARQUE', 'Antes del embarque'],
  ['DURANTE_EMBARQUE', 'Durante el embarque'],
  ['OTROS', 'Otros'],
];

type AccState = Record<number, { has: boolean; qty: number }>;

function SelectField({
  label,
  value,
  onChange,
  opts,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opts: string[][];
}) {
  return (
    <div>
      <label className="mb-1 block text-slate-600">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-slate-300 px-3 py-2"
      >
        <option value="">— Seleccionar —</option>
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </div>
  );
}

export default function TarjaFormPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();

  const [report, setReport] = useState<TarjaReport | null>(null);
  const [catalog, setCatalog] = useState<Accessory[]>([]);
  const [acc, setAcc] = useState<AccState>({});
  const [hasDamage, setHasDamage] = useState(false);
  const [dSource, setDSource] = useState('');
  const [dOp, setDOp] = useState('');
  const [dAffects, setDAffects] = useState('');
  const [dMoment, setDMoment] = useState('');
  const [dOther, setDOther] = useState('');
  const [descriptions, setDescriptions] = useState('');
  const [initials, setInitials] = useState(getUser()?.initials ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [r, cat] = await Promise.all([getReport(id), listAccessories()]);
      setReport(r);
      const active = cat.filter((c) => c.isActive);
      setCatalog(active);
      const state: AccState = {};
      for (const c of active) state[c.id] = { has: false, qty: 0 };
      for (const ra of r.accessories ?? []) {
        state[ra.accessoryId] = { has: ra.hasAccessory, qty: ra.quantity };
      }
      setAcc(state);
      setHasDamage(r.hasDamage);
      setDescriptions((r.damages ?? []).map((d) => d.description).join('\n'));
      if (r.tarjadorInitials) setInitials(r.tarjadorInitials);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  function setHas(aid: number, has: boolean) {
    setAcc((s) => ({ ...s, [aid]: { has, qty: has ? Math.max(1, s[aid]?.qty ?? 1) : 0 } }));
  }
  function setQty(aid: number, qty: number) {
    setAcc((s) => ({ ...s, [aid]: { has: s[aid]?.has ?? false, qty } }));
  }

  async function finish() {
    setBusy(true);
    setError('');
    try {
      await setReportAccessories(
        id,
        catalog.map((c) => ({
          accessoryId: c.id,
          hasAccessory: acc[c.id]?.has ?? false,
          quantity: acc[c.id]?.qty ?? 0,
        })),
      );
      await setReportDamages(id, {
        hasDamage,
        damageSource: hasDamage ? dSource || undefined : undefined,
        damageOperation: hasDamage ? dOp || undefined : undefined,
        damageAffects: hasDamage ? dAffects || undefined : undefined,
        damageMoment: hasDamage ? dMoment || undefined : undefined,
        damageMomentOther: hasDamage && dMoment === 'OTROS' ? dOther || undefined : undefined,
        descriptions: hasDamage
          ? descriptions.split('\n').map((s) => s.trim()).filter(Boolean)
          : [],
      });
      const r = await finishTarja(id, { initials: initials || undefined });
      router.push(`/operations/${r.operationId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
      setBusy(false);
    }
  }

  if (!report) {
    return (
      <Shell>
        {error ? <p className="text-[#C8102E]">{error}</p> : <p className="text-slate-500">Cargando…</p>}
      </Shell>
    );
  }

  const finalized = report.status !== 'BORRADOR';

  return (
    <Shell>
      <div className="mx-auto max-w-lg">
        <h1 className="text-xl font-semibold text-slate-800">Tarja — {report.vehicle?.vin}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {report.reportCode} · Estado: {report.status}
        </p>
        {finalized && (
          <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Reporte finalizado.
          </p>
        )}

        {!finalized && (
          <>
            <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <h2 className="font-medium text-slate-800">Inventario / Accesorios</h2>
              <ul className="mt-2 divide-y divide-slate-100">
                {catalog.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2">
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={acc[c.id]?.has ?? false}
                        onChange={(e) => setHas(c.id, e.target.checked)}
                      />
                      {c.name}
                    </label>
                    {acc[c.id]?.has && (
                      <input
                        type="number"
                        min={0}
                        value={acc[c.id]?.qty ?? 0}
                        onChange={(e) => setQty(c.id, Number(e.target.value))}
                        className="w-16 rounded border border-slate-300 px-2 py-1 text-sm"
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>

            <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <label className="flex items-center gap-2 font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={hasDamage}
                  onChange={(e) => setHasDamage(e.target.checked)}
                />
                ¿Existen daños a la unidad?
              </label>
              {hasDamage && (
                <div className="mt-3 space-y-3 text-sm">
                  <SelectField label="Origen del daño" value={dSource} onChange={setDSource} opts={DAMAGE_SOURCE} />
                  <SelectField label="El daño fue durante" value={dOp} onChange={setDOp} opts={DAMAGE_OP} />
                  <SelectField label="Daño ocasionado a" value={dAffects} onChange={setDAffects} opts={DAMAGE_AFFECTS} />
                  <SelectField label="¿En qué momento?" value={dMoment} onChange={setDMoment} opts={DAMAGE_MOMENT} />
                  {dMoment === 'OTROS' && (
                    <input
                      value={dOther}
                      onChange={(e) => setDOther(e.target.value)}
                      placeholder="Especifique"
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    />
                  )}
                  <div>
                    <label className="mb-1 block text-slate-600">
                      Detalle de hallazgos / daños (uno por línea)
                    </label>
                    <textarea
                      value={descriptions}
                      onChange={(e) => setDescriptions(e.target.value)}
                      rows={3}
                      className="w-full rounded border border-slate-300 px-3 py-2"
                    />
                  </div>
                </div>
              )}
            </section>

            <section className="mt-5 rounded-xl border border-slate-200 bg-white p-4">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Iniciales del tarjador
              </label>
              <input
                value={initials}
                onChange={(e) => setInitials(e.target.value.toUpperCase())}
                className="w-28 rounded border border-slate-300 px-3 py-2"
              />
            </section>

            {error && <p className="mt-3 text-sm text-[#C8102E]">{error}</p>}
            <button
              onClick={finish}
              disabled={busy}
              className="mt-5 w-full rounded-lg bg-[#0B3D6B] py-2.5 font-medium text-white hover:bg-[#082C4D] disabled:opacity-60"
            >
              {busy ? 'Finalizando…' : 'Finalizar tarja'}
            </button>
          </>
        )}
      </div>
    </Shell>
  );
}
