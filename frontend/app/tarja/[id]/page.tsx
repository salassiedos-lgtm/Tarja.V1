'use client';

import { createElement, useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Shell from '@/components/shell';
import {
  Alert,
  Badge,
  Button,
  Label,
  OptionGroup,
  QtyStepper,
  SectionCard,
  StickyActions,
  Toggle,
} from '@/components/ui';
import { IconArrow, IconCheck, IconClose, IconPlus } from '@/components/icons';
import { accessoryIcon } from '@/lib/accessory-icons';
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

const DAMAGE_SOURCE = [
  ['CAUSADO', 'Daño infligido'],
  ['ENCONTRADO', 'Daño encontrado'],
] as const;
const DAMAGE_OP = [
  ['DESCARGA', 'Descarga'],
  ['EMBARQUE', 'Embarque'],
  ['TRANSITO', 'Tránsito'],
  ['REESTIBA', 'Reestiba'],
] as const;
const DAMAGE_AFFECTS = [
  ['CARGA_CHANCAY', 'Carga con destino Chancay'],
  ['CARGA_TRANSITO', 'Carga en tránsito'],
] as const;
const DAMAGE_MOMENT = [
  ['ANTES_DESCARGA', 'Antes de la descarga'],
  ['DURANTE_DESCARGA', 'Durante la descarga'],
  ['POSTERIOR_DESCARGA', 'Posterior a la descarga'],
  ['ANTES_EMBARQUE', 'Antes del embarque'],
  ['DURANTE_EMBARQUE', 'Durante el embarque'],
  ['OTROS', 'Otros'],
] as const;

type AccState = Record<number, { has: boolean; qty: number }>;

/** Cronómetro desde el inicio de la tarja. */
function useElapsed(startedAt: string | null | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);

  if (!startedAt) return '—';
  const s = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/* ------------------------------------------------------------------ *
 * Tarjeta de accesorio
 * ------------------------------------------------------------------ */

function AccessoryCard({
  accessory,
  state,
  onToggle,
  onQty,
  delay,
}: {
  accessory: Accessory;
  state: { has: boolean; qty: number };
  onToggle: () => void;
  onQty: (q: number) => void;
  delay: number;
}) {
  const on = state.has;
  return (
    <div
      role="checkbox"
      aria-checked={on}
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      style={{ animationDelay: `${delay}ms` }}
      className={`rise tap ring-focus group relative flex min-h-[68px] cursor-pointer items-center gap-3 overflow-hidden rounded-xl border p-3 transition-all duration-150 active:scale-[0.985] ${
        on
          ? 'border-jade-600/40 bg-jade-50/60 shadow-[0_6px_18px_-12px_rgba(13,122,99,0.6)]'
          : 'border-line bg-white hover:border-navy-200 hover:bg-navy-50/40'
      }`}
    >
      <span
        className={`grid h-11 w-11 shrink-0 place-items-center rounded-[11px] transition-colors duration-150 ${
          on ? 'bg-jade-600 text-white' : 'bg-navy-50 text-navy-800 ring-1 ring-navy-100'
        }`}
      >
        {createElement(accessoryIcon(accessory.name), { className: 'h-[21px] w-[21px]' })}
      </span>

      <span className="min-w-0 flex-1">
        <span
          className={`block truncate text-[13.5px] font-semibold leading-tight ${
            on ? 'text-jade-700' : 'text-navy-900'
          }`}
        >
          {accessory.name}
        </span>
        <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
          {on ? 'Presente' : 'No presente'}
        </span>
      </span>

      {on ? (
        <QtyStepper value={state.qty || 1} onChange={onQty} />
      ) : (
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border-[1.5px] border-line transition-colors group-hover:border-navy-200" />
      )}

      {on && (
        <span className="pop absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-jade-600 text-white">
          <IconCheck className="h-2.5 w-2.5" strokeWidth={3.2} />
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Página
 * ------------------------------------------------------------------ */

export default function TarjaFormPage() {
  const { id } = useParams<{ id: string }>();
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
  const [findings, setFindings] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const [initials, setInitials] = useState(getUser()?.initials ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const elapsed = useElapsed(report?.startedAt);

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
      setFindings((r.damages ?? []).map((d) => d.description).filter(Boolean));
      if (r.tarjadorInitials) setInitials(r.tarjadorInitials);
    } catch (e) {
      setLoadFailed(true);
      setError(e instanceof Error ? e.message : 'No se pudo cargar el reporte');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const present = useMemo(() => Object.values(acc).filter((a) => a.has).length, [acc]);

  function setAll(has: boolean) {
    setAcc((s) => {
      const next: AccState = {};
      for (const c of catalog) next[c.id] = { has, qty: has ? Math.max(1, s[c.id]?.qty ?? 1) : 0 };
      return next;
    });
  }

  function addFinding() {
    const v = draft.trim();
    if (!v) return;
    setFindings((f) => [...f, v]);
    setDraft('');
  }

  /** Validación en cliente: evita un 400 del servidor tras rellenar todo. */
  const damageIncomplete =
    hasDamage &&
    (!dSource ||
      !dOp ||
      !dAffects ||
      !dMoment ||
      (dMoment === 'OTROS' && !dOther.trim()) ||
      findings.length === 0);

  async function finish() {
    if (damageIncomplete) {
      setError('Completa todos los campos del daño y agrega al menos un hallazgo.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await setReportAccessories(
        id,
        catalog.map((c) => ({
          accessoryId: c.id,
          hasAccessory: acc[c.id]?.has ?? false,
          quantity: acc[c.id]?.has ? Math.max(1, acc[c.id]?.qty ?? 1) : 0,
        })),
      );
      await setReportDamages(id, {
        hasDamage,
        damageSource: hasDamage ? dSource : undefined,
        damageOperation: hasDamage ? dOp : undefined,
        damageAffects: hasDamage ? dAffects : undefined,
        damageMoment: hasDamage ? dMoment : undefined,
        damageMomentOther: hasDamage && dMoment === 'OTROS' ? dOther.trim() : undefined,
        descriptions: hasDamage ? findings : [],
      });
      const r = await finishTarja(id, { initials: initials || undefined });
      router.push(`/operations/${r.operationId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al finalizar');
      setBusy(false);
    }
  }

  /* ---------- estados de carga ---------- */

  if (!report) {
    return (
      <Shell>
        <div className="mx-auto max-w-3xl">
          {loadFailed ? (
            <Alert>{error}</Alert>
          ) : (
            <div className="space-y-4">
              <div className="h-28 animate-pulse rounded-2xl bg-navy-50" />
              <div className="h-64 animate-pulse rounded-2xl bg-navy-50" />
            </div>
          )}
        </div>
      </Shell>
    );
  }

  const finalized = report.status !== 'BORRADOR';

  return (
    <Shell>
      <div className="mx-auto max-w-3xl">
        {/* ---------- cabecera: identidad de la unidad ---------- */}
        <header className="rise deck grain relative overflow-hidden rounded-2xl border border-navy-800 px-5 py-5 text-white sm:px-6">
          <span className="deck-dots absolute inset-0" aria-hidden />
          <span
            className="pointer-events-none absolute -right-4 -top-6 select-none font-display text-[120px] font-extrabold leading-none text-white/[0.045]"
            aria-hidden
          >
            {report.reportCode.slice(-2)}
          </span>

          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
                {report.reportCode}
              </span>
              {finalized ? (
                <Badge tone="jade" dot>
                  Finalizado
                </Badge>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2.5 py-1 text-[10.5px] font-semibold text-white ring-1 ring-inset ring-white/15">
                  <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cosco-400" />
                  En curso · {elapsed}
                </span>
              )}
            </div>

            <p className="tnum mt-3 break-all font-mono text-[26px] font-bold leading-none tracking-tight sm:text-[32px]">
              {report.vehicle?.vin ?? '—'}
            </p>
            {report.vehicle?.brand && (
              <p className="mt-2 text-[13px] text-white/55">{report.vehicle.brand}</p>
            )}

            {!finalized && (
              <div className="mt-5 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/12">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-cosco-500 to-cosco-400 transition-[width] duration-500 ease-out"
                    style={{ width: `${catalog.length ? (present / catalog.length) * 100 : 0}%` }}
                  />
                </div>
                <p className="tnum shrink-0 font-mono text-[11.5px] text-white/60">
                  <span className="font-bold text-white">{present}</span> / {catalog.length}{' '}
                  accesorios
                </p>
              </div>
            )}
          </div>
        </header>

        {/* ---------- reporte ya cerrado ---------- */}
        {finalized ? (
          <div
            className="rise mt-5 flex flex-col items-center gap-4 rounded-2xl border border-jade-600/25 bg-jade-50 px-6 py-10 text-center"
            style={{ animationDelay: '80ms' }}
          >
            <span className="pop grid h-14 w-14 place-items-center rounded-2xl bg-jade-600 text-white">
              <IconCheck className="h-7 w-7" strokeWidth={2.6} />
            </span>
            <div>
              <p className="font-display text-[17px] font-bold text-jade-700">
                Tarja finalizada
              </p>
              <p className="mt-1 text-[13px] text-jade-700/70">
                Este reporte ya no admite cambios.
              </p>
            </div>
            <Link href={`/operations/${report.operationId}`}>
              <Button variant="outline">
                Volver a la operación
                <IconArrow className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        ) : (
          <>
            {/* ---------- 1 · accesorios ---------- */}
            <div className="mt-5">
              <SectionCard
                step={1}
                title="Inventario de accesorios"
                hint="Marca los accesorios presentes en la unidad."
                delay={80}
                action={
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => setAll(true)}
                      className="tap ring-focus rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-navy-700 transition-colors hover:bg-navy-50"
                    >
                      Todos
                    </button>
                    <button
                      type="button"
                      onClick={() => setAll(false)}
                      className="tap ring-focus rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-muted transition-colors hover:bg-navy-50"
                    >
                      Limpiar
                    </button>
                  </div>
                }
              >
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {catalog.map((c, i) => (
                    <AccessoryCard
                      key={c.id}
                      accessory={c}
                      state={acc[c.id] ?? { has: false, qty: 0 }}
                      onToggle={() =>
                        setAcc((s) => {
                          const has = !(s[c.id]?.has ?? false);
                          return {
                            ...s,
                            [c.id]: { has, qty: has ? Math.max(1, s[c.id]?.qty ?? 1) : 0 },
                          };
                        })
                      }
                      onQty={(q) => setAcc((s) => ({ ...s, [c.id]: { has: true, qty: q } }))}
                      delay={100 + i * 24}
                    />
                  ))}
                </div>
              </SectionCard>
            </div>

            {/* ---------- 2 · daños ---------- */}
            <div className="mt-5">
              <SectionCard
                step={2}
                title="Estado de la unidad"
                hint="Declara si la unidad presenta daños."
                delay={140}
                tone={hasDamage ? 'cosco' : 'navy'}
              >
                <Toggle
                  checked={hasDamage}
                  onChange={setHasDamage}
                  tone="cosco"
                  label="¿Existen daños en la unidad?"
                  hint={
                    hasDamage
                      ? 'Detalla el origen, el momento y los hallazgos.'
                      : 'La unidad se registra sin daños.'
                  }
                />

                {hasDamage && (
                  <div className="slide-up mt-5 space-y-6 border-t border-line pt-5">
                    <OptionGroup
                      required
                      label="Origen del daño"
                      value={dSource}
                      onChange={setDSource}
                      opts={DAMAGE_SOURCE}
                    />
                    <OptionGroup
                      required
                      label="El daño fue durante"
                      value={dOp}
                      onChange={setDOp}
                      opts={DAMAGE_OP}
                    />
                    <OptionGroup
                      required
                      label="Daño ocasionado a"
                      value={dAffects}
                      onChange={setDAffects}
                      opts={DAMAGE_AFFECTS}
                    />
                    <OptionGroup
                      required
                      label="¿En qué momento?"
                      value={dMoment}
                      onChange={setDMoment}
                      opts={DAMAGE_MOMENT}
                    />

                    {dMoment === 'OTROS' && (
                      <div className="slide-up">
                        <Label htmlFor="dOther">Especifique el momento</Label>
                        <input
                          id="dOther"
                          value={dOther}
                          onChange={(e) => setDOther(e.target.value)}
                          placeholder="Describe cuándo ocurrió"
                          className="field"
                        />
                      </div>
                    )}

                    {/* hallazgos como lista, no como texto libre con saltos de línea */}
                    <div>
                      <Label htmlFor="finding">Hallazgos / daños detectados</Label>
                      <div className="flex gap-2">
                        <input
                          id="finding"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addFinding();
                            }
                          }}
                          placeholder="Ej. Rayadura en puerta delantera izquierda"
                          className="field flex-1"
                        />
                        <button
                          type="button"
                          onClick={addFinding}
                          disabled={!draft.trim()}
                          aria-label="Agregar hallazgo"
                          className="tap ring-focus grid h-[50px] w-[50px] shrink-0 place-items-center rounded-xl bg-navy-800 text-white transition-all hover:bg-navy-900 disabled:opacity-40 active:scale-90"
                        >
                          <IconPlus className="h-5 w-5" strokeWidth={2.4} />
                        </button>
                      </div>

                      {findings.length > 0 ? (
                        <ul className="mt-3 space-y-2">
                          {findings.map((f, i) => (
                            <li
                              key={`${f}-${i}`}
                              className="pop flex items-start gap-2.5 rounded-xl border border-cosco-500/20 bg-cosco-50/70 py-2.5 pl-3 pr-2"
                            >
                              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-cosco-500" />
                              <span className="min-w-0 flex-1 text-[13px] leading-snug text-cosco-700">
                                {f}
                              </span>
                              <button
                                type="button"
                                aria-label={`Quitar ${f}`}
                                onClick={() => setFindings((x) => x.filter((_, j) => j !== i))}
                                className="tap ring-focus grid h-7 w-7 shrink-0 place-items-center rounded-lg text-cosco-600/60 transition-colors hover:bg-cosco-500/10 hover:text-cosco-600"
                              >
                                <IconClose className="h-3.5 w-3.5" strokeWidth={2.2} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2.5 text-[11.5px] text-muted">
                          Agrega al menos un hallazgo para poder finalizar.
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </SectionCard>
            </div>

            {/* ---------- 3 · firma ---------- */}
            <div className="mt-5">
              <SectionCard
                step={3}
                title="Responsable"
                hint="Iniciales del tarjador que registra la unidad."
                delay={200}
              >
                <Label htmlFor="initials">Iniciales</Label>
                <input
                  id="initials"
                  value={initials}
                  onChange={(e) => setInitials(e.target.value.toUpperCase().slice(0, 5))}
                  placeholder="TJ1"
                  autoCapitalize="characters"
                  className="field w-32 text-center font-mono text-[18px] font-bold tracking-[0.16em]"
                />
              </SectionCard>
            </div>

            {error && (
              <div className="mt-5">
                <Alert>{error}</Alert>
              </div>
            )}

            <StickyActions>
              <Button
                full
                size="lg"
                onClick={finish}
                disabled={busy}
                variant={damageIncomplete ? 'outline' : 'primary'}
              >
                {busy ? (
                  'Finalizando…'
                ) : (
                  <>
                    <IconCheck className="h-[18px] w-[18px]" strokeWidth={2.4} />
                    Finalizar tarja
                  </>
                )}
              </Button>
              <p className="mt-2 pb-1 text-center text-[11px] text-muted">
                {present} de {catalog.length} accesorios presentes
                {hasDamage && ` · ${findings.length} hallazgo${findings.length === 1 ? '' : 's'}`}
              </p>
            </StickyActions>
          </>
        )}
      </div>
    </Shell>
  );
}
