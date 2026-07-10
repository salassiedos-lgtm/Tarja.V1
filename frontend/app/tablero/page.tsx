'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import Shell from '@/components/shell';
import { getBlBoard, type BlBoardRow } from '@/lib/api';

function pctClass(p: number): string {
  if (p >= 100) return 'hi';
  if (p >= 50) return 'mid';
  return 'lo';
}

export default function TableroPage() {
  const router = useRouter();
  const [rows, setRows] = useState<BlBoardRow[] | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setRows(await getBlBoard());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el tablero');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <Shell title="Cuadro de Tareas" onBack={() => router.push('/inicio')}>
      <button className="btn" style={{ marginBottom: 14 }} onClick={() => router.push('/tarja')}>
        <Search className="h-4 w-4" /> Buscar VIN / Nueva tarja
      </button>

      {error && <div className="error">{error}</div>}

      {rows === null ? (
        <div className="empty">Cargando tablero…</div>
      ) : rows.length === 0 ? (
        <div className="empty">
          No hay B/L en lotes abiertos. Pídele al administrador que abra un lote.
        </div>
      ) : (
        rows.map((bl) => (
          <div key={bl.billOfLadingId} className="card">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, wordBreak: 'break-all' }}>
                  {bl.blNumber}
                </div>
                <div className="muted" style={{ marginTop: 2 }}>
                  {bl.shipName} · {bl.containers} {bl.containers === 1 ? 'contenedor' : 'contenedores'}
                </div>
              </div>
              <span className={`bl-pct ${pctClass(bl.percent)}`}>{bl.percent}%</span>
            </div>

            <div className="bar">
              <div className="bar-fill" style={{ width: `${bl.percent}%` }} />
            </div>

            <div className="bl-counts">
              <div className="stat">
                <span className="n tnum">{bl.total}</span>
                <span className="l">Chasis</span>
              </div>
              <div className="stat ok">
                <span className="n tnum">{bl.done}</span>
                <span className="l">Tarjados</span>
              </div>
              <div className="stat warn">
                <span className="n tnum">{bl.pending}</span>
                <span className="l">Por tarjar</span>
              </div>
            </div>

            <button
              className="btn secondary"
              style={{ marginTop: 12 }}
              onClick={() => router.push(`/tablero/${bl.billOfLadingId}`)}
            >
              Ver chasis
            </button>
          </div>
        ))
      )}
    </Shell>
  );
}
