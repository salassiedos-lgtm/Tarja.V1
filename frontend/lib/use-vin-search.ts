'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { searchVehicles, type VehicleSearchRow } from '@/lib/api';

const DEBOUNCE_MS = 250;
export const MIN_QUERY = 4;

/** Mismo charset que el backend (ISO 3779, sin I/O/Q). */
const NON_VIN_CHARS = /[^A-HJ-NPR-Z0-9]/g;

export function normalizeVinQuery(raw: string): string {
  return raw.toUpperCase().replace(NON_VIN_CHARS, '');
}

/**
 * El resultado viaja etiquetado con la consulta (y el nonce) que lo produjo.
 * Asi `searching`, `rows` y `error` se DERIVAN de comparar esa etiqueta con el
 * query actual, en vez de limpiarse con setState dentro del efecto: eso ultimo
 * dispara renders en cascada y la regla react-hooks/set-state-in-effect lo
 * prohibe en este proyecto.
 */
interface SearchResult {
  q: string;
  nonce: number;
  rows: VehicleSearchRow[];
  error: string;
}

export function useVinSearch() {
  const [query, setQueryRaw] = useState('');
  const [result, setResult] = useState<SearchResult | null>(null);

  // Relanzar la busqueda con el MISMO query no puede hacerse tocando `query`:
  // React descarta un setState al mismo valor y el efecto nunca corre. Este
  // contador es lo que fuerza el re-fetch tras un 409.
  const [nonce, setNonce] = useState(0);

  const abortRef = useRef<AbortController | null>(null);

  const setQuery = useCallback((raw: string) => setQueryRaw(normalizeVinQuery(raw)), []);

  /** Tras un 409, la lista debe repintarse con el estado nuevo del VIN. */
  const refresh = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    // Aborta el fetch anterior: sin esto, la respuesta de '0012' puede llegar
    // despues de la de '00123' y pintar la lista vieja sobre la nueva.
    abortRef.current?.abort();

    if (query.length < MIN_QUERY) return;

    const timer = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;

      searchVehicles(query, controller.signal)
        .then((rows) => setResult({ q: query, nonce, rows, error: '' }))
        .catch((e: unknown) => {
          // La peticion fue reemplazada por una mas nueva: su resultado ya no importa.
          if (e instanceof DOMException && e.name === 'AbortError') return;
          setResult({ q: query, nonce, rows: [], error: 'No se pudo buscar. Revisa la conexión.' });
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, nonce]);

  const fresh = result !== null && result.q === query && result.nonce === nonce;
  const active = query.length >= MIN_QUERY;

  return {
    query,
    setQuery,
    refresh,
    rows: fresh ? result.rows : [],
    error: fresh ? result.error : '',
    searching: active && !fresh,
  };
}
