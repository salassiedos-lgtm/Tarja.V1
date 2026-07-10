'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Barcode, Camera } from 'lucide-react';
import Shell from '@/components/shell';
import BarcodeScanner from '@/components/barcode-scanner';
import OcrScanner from '@/components/ocr-scanner';
import { getNaveVehicles, startTarja, type NaveVehicle, type NaveVehicles } from '@/lib/api';
import { extractVinFromScan } from '@/lib/vin-scan';

/** Tope de filas dibujadas: una nave RO-RO puede traer miles de chasis; el
 * tarjador ubica el suyo con el buscador/escáner, no bajando toda la lista. */
const MAX_RENDER = 500;

function cleanCode(s: string): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function vehicleMeta(v: NaveVehicle): string {
  return (
    [v.containerNumber, [v.brand, v.model].filter(Boolean).join(' '), v.blNumber && `B/L ${v.blNumber}`]
      .filter(Boolean)
      .join(' · ') || '—'
  );
}

export default function NaveTasksPage() {
  const { opId } = useParams<{ opId: string }>();
  const router = useRouter();
  const [data, setData] = useState<NaveVehicles | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'todo' | 'done'>('todo');
  const [q, setQ] = useState('');
  const [scan, setScan] = useState<'' | 'barcode' | 'ocr'>('');
  const [startingVin, setStartingVin] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setData(await getNaveVehicles(opId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la nave');
    }
  }, [opId]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = useMemo(() => {
    let todo = 0;
    let done = 0;
    for (const v of data?.vehicles ?? []) v.done ? done++ : todo++;
    return { todo, done };
  }, [data]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = cleanCode(q);
    return data.vehicles.filter((v) => {
      if ((tab === 'done') !== v.done) return false;
      if (!needle) return true;
      return (
        v.vin.toUpperCase().includes(needle) ||
        (v.containerNumber ?? '').toUpperCase().includes(needle) ||
        (v.blNumber ?? '').toUpperCase().includes(needle)
      );
    });
  }, [data, tab, q]);

  const shown = filtered.slice(0, MAX_RENDER);

  async function startFor(v: NaveVehicle) {
    if (v.blocked || startingVin) return;
    setStartingVin(v.vin);
    setError('');
    try {
      const r = await startTarja(v.vin);
      router.push(`/tarja/${r.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar la tarja');
      setStartingVin('');
      load();
    }
  }

  function onScanned(raw: string, mode: 'barcode' | 'ocr') {
    setScan('');
    const vin = mode === 'barcode' ? extractVinFromScan(raw) || cleanCode(raw) : cleanCode(raw);
    if (vin) setQ(vin);
  }

  return (
    <Shell title="Cuadro de tareas" onBack={() => router.push('/tablero')}>
      {data && (
        <div className="input" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
            <span className="muted" style={{ fontSize: 12 }}>Nave</span>
            <strong style={{ fontSize: 15 }}>{data.shipName}</strong>
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {data.operationCode} · todos los B/L
          </div>
        </div>
      )}

      <div className="tabs">
        <button className={`tab ${tab === 'todo' ? 'active' : ''}`} onClick={() => setTab('todo')}>
          Por tarjar ({counts.todo})
        </button>
        <button className={`tab ${tab === 'done' ? 'active' : ''}`} onClick={() => setTab('done')}>
          Realizados ({counts.done})
        </button>
      </div>

      <div className="searchrow">
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          placeholder="Filtrar por VIN, contenedor o B/L"
        />
        <button
          type="button"
          className="scanbtn"
          onClick={() => setScan(scan === 'barcode' ? '' : 'barcode')}
          aria-label="Escanear código de barras / QR"
        >
          <Barcode className="h-5 w-5" />
        </button>
        <button
          type="button"
          className="scanbtn"
          onClick={() => setScan(scan === 'ocr' ? '' : 'ocr')}
          aria-label="Escanear VIN con cámara (OCR)"
        >
          <Camera className="h-5 w-5" />
        </button>
      </div>

      {scan === 'barcode' && (
        <BarcodeScanner onDetected={(t) => onScanned(t, 'barcode')} onClose={() => setScan('')} />
      )}
      {scan === 'ocr' && <OcrScanner onResult={(t) => onScanned(t, 'ocr')} onClose={() => setScan('')} />}

      {error && <div className="error">{error}</div>}

      {!data ? (
        <div className="empty">Cargando chasis…</div>
      ) : filtered.length === 0 ? (
        <div className="empty">
          {tab === 'todo' ? 'No quedan chasis por tarjar en esta nave.' : 'Aún no hay chasis tarjados.'}
        </div>
      ) : (
        <>
          {shown.map((v) =>
            tab === 'done' ? (
              <button
                key={v.vehicleId}
                type="button"
                className="task tap"
                style={{ width: '100%', textAlign: 'left' }}
                onClick={() => v.currentReportId && router.push(`/tarja/${v.currentReportId}`)}
              >
                <div className="grow">
                  <div className="vin">{v.vin}</div>
                  <div className="meta">{vehicleMeta(v)}</div>
                </div>
                <span className={`badge ${v.status === 'OBSERVADO' ? 'in_progress' : 'completed'}`}>
                  {v.status === 'OBSERVADO' ? 'Con daño' : 'Tarjado'}
                </span>
              </button>
            ) : v.blocked ? (
              <div key={v.vehicleId} className="task" style={{ opacity: 0.55 }}>
                <div className="grow">
                  <div className="vin">{v.vin}</div>
                  <div className="meta">{vehicleMeta(v)}</div>
                </div>
                <span className="badge pending">{v.blockedReason}</span>
              </div>
            ) : (
              <div key={v.vehicleId} className="task">
                <div className="grow">
                  <div className="vin">{v.vin}</div>
                  <div className="meta">{vehicleMeta(v)}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge pending">Pendiente</span>
                  <button
                    type="button"
                    className="btn small"
                    disabled={!!startingVin}
                    onClick={() => startFor(v)}
                  >
                    {startingVin === v.vin ? 'Iniciando…' : 'Abrir'}
                  </button>
                </div>
              </div>
            ),
          )}
          {filtered.length > MAX_RENDER && (
            <div className="empty" style={{ paddingTop: 16 }}>
              Mostrando {MAX_RENDER} de {filtered.length} chasis. Usa el buscador o el escáner para
              ubicar un VIN.
            </div>
          )}
        </>
      )}
    </Shell>
  );
}
