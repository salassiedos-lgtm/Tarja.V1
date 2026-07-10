'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Barcode, Camera, ChevronRight } from 'lucide-react';
import Shell from '@/components/shell';
import BarcodeScanner from '@/components/barcode-scanner';
import OcrScanner from '@/components/ocr-scanner';
import { searchVehicles, startTarja, type VehicleSearchRow } from '@/lib/api';
import { extractVinFromScan } from '@/lib/vin-scan';
import { MIN_QUERY, useVinSearch } from '@/lib/use-vin-search';

function cleanCode(s: string): string {
  return (s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export default function TarjaStartPage() {
  const router = useRouter();
  const { query, setQuery, rows, searching, error: searchError, refresh } = useVinSearch();
  const [picked, setPicked] = useState<VehicleSearchRow | null>(null);
  const [startError, setStartError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scan, setScan] = useState<'' | 'barcode' | 'ocr'>('');

  async function confirm() {
    if (!picked) return;
    setBusy(true);
    setStartError('');
    try {
      const r = await startTarja(picked.vin);
      router.push(`/tarja/${r.id}`);
    } catch (err) {
      setStartError(err instanceof Error ? err.message : 'No se pudo iniciar la tarja');
      setPicked(null);
      setBusy(false);
      refresh();
    }
  }

  async function onScanned(raw: string, mode: 'barcode' | 'ocr') {
    setScan('');
    const vin = mode === 'barcode' ? extractVinFromScan(raw) || cleanCode(raw) : cleanCode(raw);
    if (!vin) return;
    try {
      const found = await searchVehicles(vin);
      if (found.length === 1 && !found[0].blocked) {
        setStartError('');
        setPicked(found[0]);
        return;
      }
    } catch {
      // Sin conexión: cae al mismo camino que escribir a mano.
    }
    setQuery(vin);
  }

  const showEmpty = query.length >= MIN_QUERY && !searching && rows.length === 0 && !searchError;

  return (
    <Shell title="Nueva tarja" onBack={() => router.push('/inicio')}>
      {picked ? (
        <div className="card">
          <h3>Confirmar unidad</h3>
          <p
            style={{
              fontFamily: 'var(--font-mono)',
              fontWeight: 700,
              fontSize: 19,
              letterSpacing: '0.06em',
              wordBreak: 'break-all',
              margin: '2px 0 12px',
            }}
          >
            {picked.vin}
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 12px' }}>
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
                <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {k}
                </div>
                <div style={{ fontWeight: 500 }}>{v || '—'}</div>
              </div>
            ))}
          </div>

          {startError && (
            <div className="error" style={{ marginTop: 14 }}>
              {startError}
            </div>
          )}

          <button className="btn" style={{ marginTop: 16 }} disabled={busy} onClick={confirm}>
            {busy ? 'Iniciando…' : 'Iniciar tarja'}
          </button>
          <button className="btn secondary" style={{ marginTop: 8 }} onClick={() => setPicked(null)}>
            Volver a la búsqueda
          </button>
        </div>
      ) : (
        <>
          <div className="searchrow">
            <input
              className="input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              placeholder="Últimos dígitos del VIN, ej. 00123"
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

          <p className="muted" style={{ marginBottom: 12 }}>
            {query.length < MIN_QUERY
              ? `Ingresa al menos los últimos ${MIN_QUERY} dígitos del VIN, o escanea.`
              : `${query.length} caracteres`}
          </p>

          {startError && <div className="error">{startError}</div>}
          {searchError && <div className="error">{searchError}</div>}

          {query.length >= MIN_QUERY && searching && <div className="empty">Buscando…</div>}

          {showEmpty && (
            <div className="empty">
              Ningún VIN en operación termina en <strong>{query}</strong>. Verifica los dígitos o avisa al
              supervisor.
            </div>
          )}

          {!searching &&
            rows.length > 0 &&
            rows.map((r) =>
              r.blocked ? (
                <div key={r.vehicleId} className="task" style={{ opacity: 0.55 }}>
                  <div className="grow">
                    <div className="vin">{r.vin}</div>
                    <div className="meta">
                      {(r.blNumber ?? 'sin BL') + ' · ' + r.shipName}
                    </div>
                  </div>
                  <span className="badge pending">{r.blockedReason}</span>
                </div>
              ) : (
                <button
                  key={r.vehicleId}
                  type="button"
                  className="task tap"
                  style={{ width: '100%', textAlign: 'left' }}
                  onClick={() => {
                    setStartError('');
                    setPicked(r);
                  }}
                >
                  <div className="grow">
                    <div className="vin">{r.vin}</div>
                    <div className="meta">{(r.blNumber ?? 'sin BL') + ' · ' + r.shipName}</div>
                  </div>
                  <ChevronRight className="h-[18px] w-[18px]" style={{ color: 'var(--color-muted)' }} />
                </button>
              ),
            )}
        </>
      )}
    </Shell>
  );
}
