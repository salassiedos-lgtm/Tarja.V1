'use client';

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import { Alert, Button, Label } from '@/components/ui';
import { VinScannerModal } from '@/components/vin-scanner-modal';
import { IconArrow, IconCamera, IconSearch, IconShip } from '@/components/icons';
import { searchVehicles, startTarja, type VehicleSearchRow } from '@/lib/api';
import { extractVinFromScan, isScannerSupported } from '@/lib/vin-scan';
import { MIN_QUERY, useVinSearch } from '@/lib/use-vin-search';

/** Resalta el fragmento que el tarjador escribió, al final del VIN. */
function VinHighlight({ vin, query }: { vin: string; query: string }) {
  const at = vin.length - query.length;
  const matches = query.length > 0 && at >= 0 && vin.slice(at) === query;
  if (!matches) return <span className="font-mono">{vin}</span>;
  return (
    <span className="font-mono">
      <span className="text-muted">{vin.slice(0, at)}</span>
      <span className="font-bold text-navy-900">{query}</span>
    </span>
  );
}

function RowMeta({ row }: { row: VehicleSearchRow }) {
  return (
    <span className="mt-1 flex items-center gap-2 text-[10.5px] text-muted">
      <span className="truncate font-mono">{row.blNumber ?? 'sin BL'}</span>
      <span className="shrink-0">·</span>
      <span className="truncate">{row.shipName}</span>
    </span>
  );
}

export default function TarjaStartPage() {
  const router = useRouter();
  const { query, setQuery, rows, searching, error: searchError, refresh } = useVinSearch();
  const [picked, setPicked] = useState<VehicleSearchRow | null>(null);
  const [startError, setStartError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scannerSupported = useSyncExternalStore(
    () => () => {},
    isScannerSupported,
    () => false,
  );

  async function confirm() {
    if (!picked) return;
    setBusy(true);
    setStartError('');
    try {
      const r = await startTarja(picked.vin);
      router.push(`/tarja/${r.id}`);
    } catch (err) {
      // Carrera: otro tarjador tomó el VIN entre que se pintó la lista y este
      // click. Volvemos a la lista y la refrescamos: el VIN aparecerá en gris
      // con su motivo, que explica el fallo mejor que un error rojo suelto.
      setStartError(err instanceof Error ? err.message : 'No se pudo iniciar la tarja');
      setPicked(null);
      setBusy(false);
      refresh();
    }
  }

  async function handleScan(raw: string) {
    setScanning(false);
    const vin = extractVinFromScan(raw);
    if (!vin) {
      setQuery(raw);
      return;
    }
    try {
      const found = await searchVehicles(vin);
      if (found.length === 1 && !found[0].blocked) {
        setStartError('');
        setPicked(found[0]);
        return;
      }
    } catch {
      // Sin conexion: se cae al mismo camino que escribir a mano, que reintenta
      // la busqueda con debounce y muestra su propio error.
    }
    setQuery(vin);
  }

  const showEmpty = query.length >= MIN_QUERY && !searching && rows.length === 0 && !searchError;

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
              Ingresa los últimos dígitos del VIN y elige la unidad de la lista.
            </p>
          </div>
        </header>

        {picked ? (
          /* ---------- confirmación ---------- */
          <section
            className="rise mt-5 overflow-hidden rounded-2xl border border-line bg-white p-4 sm:p-5"
            aria-label="Confirmar unidad"
          >
            <Label>Confirma la unidad</Label>
            <p className="mt-1 break-all font-mono text-[19px] font-bold tracking-[0.06em] text-navy-900">
              {picked.vin}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-[12.5px]">
              {(
                [
                  ['BL', picked.blNumber],
                  ['Nave', picked.shipName],
                  ['Marca', picked.brand],
                  ['Modelo', picked.model],
                  ['Contenedor', picked.containerNumber],
                ] as const
              ).map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[10px] uppercase tracking-[0.12em] text-muted">{k}</dt>
                  <dd className="mt-0.5 font-medium text-navy-900">{v || '—'}</dd>
                </div>
              ))}
            </dl>

            {startError && (
              <div className="mt-4">
                <Alert>{startError}</Alert>
              </div>
            )}

            <div className="mt-5 grid gap-2.5">
              <Button type="button" full size="lg" disabled={busy} onClick={confirm}>
                {busy ? (
                  'Iniciando…'
                ) : (
                  <>
                    Iniciar tarja
                    <IconArrow className="h-[18px] w-[18px]" />
                  </>
                )}
              </Button>
              <button
                type="button"
                onClick={() => setPicked(null)}
                className="tap ring-focus rounded-xl border border-line py-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-navy-50/50"
              >
                Volver a la búsqueda
              </button>
            </div>
          </section>
        ) : (
          /* ---------- búsqueda ---------- */
          <div className="mt-5 space-y-5">
            <section
              className="rise overflow-hidden rounded-2xl border border-line bg-white p-4 sm:p-5"
              style={{ animationDelay: '80ms' }}
            >
              <Label htmlFor="vin">VIN</Label>
              <div className="relative">
                <IconSearch className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted" />
                <input
                  id="vin"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  inputMode="text"
                  placeholder="Últimos dígitos, ej. 00123"
                  className="field pl-11 pr-12 font-mono text-[17px] font-semibold tracking-[0.06em]"
                />
                {scannerSupported && (
                  <button
                    type="button"
                    onClick={() => setScanning(true)}
                    aria-label="Escanear VIN"
                    className="tap ring-focus absolute right-2.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-muted transition-colors hover:bg-navy-50 hover:text-navy-800"
                  >
                    <IconCamera className="h-[18px] w-[18px]" />
                  </button>
                )}
              </div>
              <p className="mt-3 text-[11px] leading-snug text-muted">
                {query.length < MIN_QUERY
                  ? `Ingresa al menos los últimos ${MIN_QUERY} dígitos del VIN`
                  : `${query.length} car.`}
              </p>
            </section>

            {startError && <Alert>{startError}</Alert>}
            {searchError && <Alert>{searchError}</Alert>}

            {query.length >= MIN_QUERY && searching && (
              <div className="grid gap-2.5" aria-busy>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-[68px] animate-pulse rounded-xl bg-navy-50" />
                ))}
              </div>
            )}

            {showEmpty && (
              <div className="rise flex items-start gap-3 rounded-2xl border border-dashed border-line bg-canvas px-4 py-5">
                <IconShip className="mt-0.5 h-5 w-5 shrink-0 text-muted" />
                <p className="text-[12.5px] leading-relaxed text-muted">
                  Ningún VIN de las naves en operación termina en{' '}
                  <span className="font-mono font-semibold text-navy-900">{query}</span>. Verifica
                  los dígitos o avisa al supervisor.
                </p>
              </div>
            )}

            {!searching && rows.length > 0 && (
              <ul className="grid gap-2.5">
                {rows.map((r) =>
                  r.blocked ? (
                    <li key={r.vehicleId}>
                      {/* Un boton deshabilitado es la semantica exacta: un control
                          presente que no se puede activar. El lector de pantalla
                          lo anuncia asi, y el motivo va en el propio texto. */}
                      <button
                        type="button"
                        disabled
                        className="flex w-full cursor-not-allowed items-center gap-3.5 rounded-xl border border-line bg-white p-3.5 text-left opacity-55"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] tracking-tight">
                            <VinHighlight vin={r.vin} query={query} />
                          </span>
                          <RowMeta row={r} />
                        </span>
                        <span className="shrink-0 rounded border border-line px-2 py-1 text-[9.5px] font-medium uppercase tracking-[0.08em] text-muted">
                          {r.blockedReason}
                        </span>
                      </button>
                    </li>
                  ) : (
                    <li key={r.vehicleId}>
                      <button
                        type="button"
                        onClick={() => {
                          setStartError('');
                          setPicked(r);
                        }}
                        className="tap ring-focus flex w-full items-center gap-3.5 rounded-xl border border-line bg-white p-3.5 text-left transition-all duration-150 hover:border-navy-200 hover:bg-navy-50/50 active:scale-[0.985]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[14px] tracking-tight">
                            <VinHighlight vin={r.vin} query={query} />
                          </span>
                          <RowMeta row={r} />
                        </span>
                        <IconArrow className="h-[18px] w-[18px] shrink-0 text-muted" />
                      </button>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        )}
      </div>
      {scanning && <VinScannerModal onDecode={handleScan} onClose={() => setScanning(false)} />}
    </Shell>
  );
}
