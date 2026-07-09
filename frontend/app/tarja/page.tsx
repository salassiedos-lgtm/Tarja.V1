'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import { Alert, Button, Label } from '@/components/ui';
import { IconArrow, IconCheck, IconSearch, IconShip } from '@/components/icons';
import { listOperations, startTarja, type Operation } from '@/lib/api';

const TYPE_LABEL: Record<string, string> = {
  ROLL_ON_ROLL_OFF: 'RO-RO',
  DESCONSOLIDADO: 'Desconsolidado',
};

export default function TarjaStartPage() {
  const router = useRouter();
  const [ops, setOps] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [operationId, setOperationId] = useState<number | null>(null);
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
      .catch(() => setError('No se pudieron cargar las operaciones.'))
      .finally(() => setLoading(false));
  }, []);

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!operationId || !vin.trim()) return;
    setBusy(true);
    setError('');
    try {
      const r = await startTarja(operationId, vin.trim());
      router.push(`/tarja/${r.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo iniciar la tarja');
      setBusy(false);
    }
  }

  const ready = Boolean(operationId) && vin.trim().length > 0;

  return (
    <Shell>
      <div className="mx-auto max-w-2xl">
        {/* ---------- héroe ---------- */}
        <header className="rise deck grain relative overflow-hidden rounded-2xl border border-navy-800 px-5 py-6 text-white sm:px-6">
          <span className="deck-dots absolute inset-0" aria-hidden />
          <div className="relative">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/50">
              Registro en campo
            </p>
            <h1 className="mt-2 font-display text-[26px] font-extrabold leading-none tracking-tight sm:text-[30px]">
              Nueva tarja<span className="text-cosco-400">.</span>
            </h1>
            <p className="mt-2.5 max-w-md text-[13px] leading-relaxed text-white/55">
              Selecciona la nave en operación e ingresa el VIN o número de chasis de la unidad.
            </p>
          </div>
        </header>

        <form onSubmit={start} className="mt-5 space-y-5">
          {/* ---------- operación ---------- */}
          <section
            className="rise overflow-hidden rounded-2xl border border-line bg-white p-4 sm:p-5"
            style={{ animationDelay: '80ms' }}
          >
            <Label>Operación activa</Label>

            {loading ? (
              <div className="mt-1 h-[70px] animate-pulse rounded-xl bg-navy-50" />
            ) : ops.length === 0 ? (
              <div className="mt-1 flex items-center gap-3 rounded-xl border border-dashed border-line bg-canvas px-4 py-5">
                <IconShip className="h-5 w-5 shrink-0 text-muted" />
                <p className="text-[12.5px] text-muted">
                  No hay operaciones activas. Pide a un supervisor que active una nave.
                </p>
              </div>
            ) : (
              <div className="mt-1 grid gap-2.5">
                {ops.map((o) => {
                  const on = operationId === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setOperationId(o.id)}
                      className={`tap ring-focus flex items-center gap-3.5 rounded-xl border p-3.5 text-left transition-all duration-150 active:scale-[0.985] ${
                        on
                          ? 'border-navy-700 bg-navy-700/[0.06]'
                          : 'border-line bg-white hover:border-navy-200 hover:bg-navy-50/50'
                      }`}
                    >
                      <span
                        className={`grid h-11 w-11 shrink-0 place-items-center rounded-[11px] transition-colors ${
                          on ? 'bg-navy-800 text-white' : 'bg-navy-50 text-navy-800 ring-1 ring-navy-100'
                        }`}
                      >
                        <IconShip className="h-[21px] w-[21px]" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[14px] font-bold tracking-tight text-navy-900">
                          {o.shipName}
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <span className="truncate font-mono text-[10.5px] text-muted">
                            {o.code}
                          </span>
                          <span className="shrink-0 rounded border border-line px-1.5 py-px font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
                            {TYPE_LABEL[o.operationType] ?? o.operationType}
                          </span>
                        </span>
                      </span>
                      {on && (
                        <span className="pop grid h-5 w-5 shrink-0 place-items-center rounded-full bg-navy-800 text-white">
                          <IconCheck className="h-3 w-3" strokeWidth={3} />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* ---------- VIN ---------- */}
          <section
            className="rise overflow-hidden rounded-2xl border border-line bg-white p-4 sm:p-5"
            style={{ animationDelay: '140ms' }}
          >
            <Label htmlFor="vin">VIN / Chasis</Label>
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
              <input
                id="vin"
                value={vin}
                onChange={(e) => setVin(e.target.value.toUpperCase().trim())}
                autoFocus
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                inputMode="text"
                placeholder="LSGKB54E9DL000000"
                className="field pl-11 font-mono text-[17px] font-semibold tracking-[0.06em]"
              />
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[11px] leading-snug text-muted">
                Escáner de cámara pendiente de habilitar. Por ahora, ingreso manual.
              </p>
              <span className="tnum shrink-0 font-mono text-[10.5px] text-muted">
                {vin.length} car.
              </span>
            </div>
          </section>

          {error && <Alert>{error}</Alert>}

          <Button full size="lg" disabled={busy || !ready}>
            {busy ? (
              'Iniciando…'
            ) : (
              <>
                Iniciar tarja
                <IconArrow className="h-[18px] w-[18px]" />
              </>
            )}
          </Button>
        </form>
      </div>
    </Shell>
  );
}
