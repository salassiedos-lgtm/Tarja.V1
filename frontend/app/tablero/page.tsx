'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import Shell from '@/components/shell';
import { getNavesBoard, type NaveBoardRow } from '@/lib/api';

function pctClass(p: number): string {
  if (p >= 100) return 'hi';
  if (p >= 50) return 'mid';
  return 'lo';
}

function filterAndSortRows(rows: NaveBoardRow[], query: string): NaveBoardRow[] {
  const q = query.trim().toLowerCase();
  const filtered = q
    ? rows.filter(
        (r) => r.shipName.toLowerCase().includes(q) || r.operationCode.toLowerCase().includes(q),
      )
    : rows;

  return [...filtered].sort((a, b) => {
    const aDone = a.pending === 0;
    const bDone = b.pending === 0;
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (b.pending !== a.pending) return b.pending - a.pending;
    return a.percent - b.percent;
  });
}

export default function TableroPage() {
  const router = useRouter();
  const [rows, setRows] = useState<NaveBoardRow[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setRows(await getNavesBoard());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el tablero');
      setRows([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const visibleRows = useMemo(
    () => (rows ? filterAndSortRows(rows, query) : null),
    [rows, query],
  );

  const searchInputRef = useRef<HTMLInputElement>(null);

  return (
    <Shell title="Cuadro de Tareas" onBack={() => router.push('/inicio')}>
      <div className="searchrow" style={{ marginBottom: 14 }}>
        <input
          ref={searchInputRef}
          className="input"
          placeholder="Buscar por nave o código…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="scanbtn"
          aria-label="Enfocar búsqueda"
          onClick={() => searchInputRef.current?.focus()}
        >
          <Search className="h-4 w-4" />
        </button>
      </div>

      {error && <div className="error">{error}</div>}

      {rows === null ? (
        <TableroSkeleton />
      ) : visibleRows && visibleRows.length === 0 ? (
        <div className="empty">
          {query
            ? `No se encontraron naves para "${query}".`
            : 'No hay naves en lotes abiertos. Pídele al administrador que abra un lote.'}
        </div>
      ) : (
        visibleRows!.map((nave) => (
          <div key={nave.operationId} className="card bl">
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16, wordBreak: 'break-word' }}>
                  {nave.shipName}
                </div>
                <div className="muted" style={{ marginTop: 2 }}>
                  {nave.operationCode} · {nave.bls} {nave.bls === 1 ? 'B/L' : 'B/L'} ·{' '}
                  {nave.containers} {nave.containers === 1 ? 'contenedor' : 'contenedores'}
                </div>
              </div>
              <span className={`bl-pct ${pctClass(nave.percent)}`}>{nave.percent}%</span>
            </div>

            <div className="bar">
              <div className="bar-fill" style={{ width: `${nave.percent}%` }} />
            </div>

            <div className="bl-counts">
              <div className="cell">
                <span className="n tnum">{nave.total}</span>
                <span className="l">Chasis</span>
              </div>
              <div className="cell ok">
                <span className="n tnum">{nave.done}</span>
                <span className="l">Tarjados</span>
              </div>
              <div className="cell warn">
                <span className="n tnum">{nave.pending}</span>
                <span className="l">Por tarjar</span>
              </div>
            </div>

            <button
              className="btn secondary"
              style={{ marginTop: 12 }}
              onClick={() => router.push(`/tablero/${nave.operationId}`)}
            >
              Ver chasis
            </button>
          </div>
        ))
      )}
    </Shell>
  );
}

function TableroSkeleton() {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <div key={i} className="card bl skeleton-card" aria-hidden="true">
          <div className="skeleton" style={{ width: '60%', height: 15 }} />
          <div className="skeleton" style={{ width: '40%', height: 12, marginTop: 8 }} />
          <div className="skeleton" style={{ width: '100%', height: 6, marginTop: 16 }} />
          <div className="skeleton" style={{ width: '100%', height: 46, marginTop: 12 }} />
        </div>
      ))}
    </>
  );
}
