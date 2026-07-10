'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import {
  getShiftReport,
  getUser,
  type AuthUser,
  type ShiftReport,
  type WorkShift,
} from '@/lib/api';
import { Printer } from 'lucide-react';

const SHIFT_LABEL: Record<WorkShift, string> = {
  DIA: 'Día · 07:00–19:00',
  NOCHE: 'Noche · 19:00–07:00',
};

/** Fecha de hoy en hora de Lima (UTC-5, sin horario de verano), formato YYYY-MM-DD. */
function limaToday(): string {
  return new Date(Date.now() - 5 * 3600 * 1000).toISOString().slice(0, 10);
}

function fmtDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDate(iso: string): string {
  // iso = YYYY-MM-DD → DD/MM/YYYY sin construir Date (evita corrimiento de zona)
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
}

export default function AvanceTurno() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [date, setDate] = useState(limaToday());
  const [shift, setShift] = useState<WorkShift>('DIA');
  const [data, setData] = useState<ShiftReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const u = getUser();
    if (!u) {
      router.replace('/login');
      return;
    }
    if (u.role !== 'ADMIN' && u.role !== 'SUPERVISOR') {
      router.replace('/inicio');
      return;
    }
    setUser(u);
  }, [router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getShiftReport(date, shift));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el avance');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [date, shift]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  if (!user) return null;

  return (
    <Shell title="Avance por turno" onBack={() => router.push('/inicio')}>
      <div className="card no-print">
        <label className="usr-label" htmlFor="fecha">
          Fecha
        </label>
        <input
          id="fecha"
          type="date"
          className="input"
          value={date}
          max={limaToday()}
          onChange={(e) => setDate(e.target.value)}
        />
        <label className="usr-label">Turno</label>
        <div className="tabs">
          {(['DIA', 'NOCHE'] as WorkShift[]).map((s) => (
            <button
              key={s}
              className={`tab ${shift === s ? 'active' : ''}`}
              onClick={() => setShift(s)}
            >
              {s === 'DIA' ? 'Día' : 'Noche'}
            </button>
          ))}
        </div>
        <div className="muted">{SHIFT_LABEL[shift]}</div>
      </div>

      {error ? <div className="error no-print">{error}</div> : null}

      {loading ? (
        <div className="empty no-print">Cargando avance…</div>
      ) : data ? (
        <>
          {/* ---------- Vista en pantalla ---------- */}
          <div className="no-print">
            <div className="modgrid" style={{ marginBottom: 12 }}>
              <div className="stat">
                <span className="n tnum">{data.total}</span>
                <span className="l">Tarjadas</span>
              </div>
              <div className="stat ok">
                <span className="n tnum">{data.undamaged}</span>
                <span className="l">Sin daño</span>
              </div>
              <div className="stat warn">
                <span className="n tnum">{data.damaged}</span>
                <span className="l">Con daño</span>
              </div>
              <div className="stat">
                <span className="n tnum">{fmtDuration(data.avgSeconds)}</span>
                <span className="l">Tiempo medio</span>
              </div>
            </div>

            {data.rows.length === 0 ? (
              <div className="empty">Sin tarjas registradas en este turno.</div>
            ) : (
              <>
                <div className="rtable-wrap">
                  <table className="rtable">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Código</th>
                        <th>VIN</th>
                        <th>Contenedor</th>
                        <th>Marca / Modelo</th>
                        <th>Nave</th>
                        <th>B/L</th>
                        <th>Tarjador</th>
                        <th>Estado</th>
                        <th>Duración</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((r, i) => (
                        <tr key={r.reportCode}>
                          <td>{i + 1}</td>
                          <td className="mono">{r.reportCode}</td>
                          <td className="mono">{r.vin ?? '—'}</td>
                          <td className="mono">{r.container ?? '—'}</td>
                          <td>{[r.brand, r.model].filter(Boolean).join(' ') || '—'}</td>
                          <td>{r.vessel ?? '—'}</td>
                          <td>{r.bl ?? '—'}</td>
                          <td>{r.initials ?? r.tarjador ?? '—'}</td>
                          <td className={r.hasDamage ? 'dmg' : 'ok'}>
                            {r.hasDamage ? 'Con daño' : 'OK'}
                          </td>
                          <td>{fmtDuration(r.durationSeconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <button className="btn no-print" style={{ marginTop: 12 }} onClick={() => window.print()}>
                  <Printer className="h-4 w-4" /> Imprimir / PDF
                </button>
              </>
            )}
          </div>

          {/* ---------- Documento imprimible (oculto en pantalla) ---------- */}
          <div className="report-doc">
            <div className="print-head">
              <div className="logo">COSCO SHIPPING PORTS CHANCAY</div>
              <div className="title">Reporte de tarja por turno</div>
              <div className="meta">
                Fecha: {fmtDate(data.date)} · Turno: {data.shift === 'DIA' ? 'Día' : 'Noche'} (
                {SHIFT_LABEL[data.shift].split('·')[1]?.trim()})
              </div>
            </div>

            <table className="print-summary">
              <thead>
                <tr>
                  <th>Total tarjadas</th>
                  <th>Sin daño</th>
                  <th>Con daño</th>
                  <th>Tiempo promedio</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{data.total}</td>
                  <td>{data.undamaged}</td>
                  <td>{data.damaged}</td>
                  <td>{fmtDuration(data.avgSeconds)}</td>
                </tr>
              </tbody>
            </table>

            <table className="print-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Código</th>
                  <th>VIN</th>
                  <th>Contenedor</th>
                  <th>Marca / Modelo</th>
                  <th>Nave</th>
                  <th>B/L</th>
                  <th>Tarjador</th>
                  <th>Daño</th>
                  <th>Dur.</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r, i) => (
                  <tr key={r.reportCode}>
                    <td>{i + 1}</td>
                    <td>{r.reportCode}</td>
                    <td>{r.vin ?? '—'}</td>
                    <td>{r.container ?? '—'}</td>
                    <td>{[r.brand, r.model].filter(Boolean).join(' ') || '—'}</td>
                    <td>{r.vessel ?? '—'}</td>
                    <td>{r.bl ?? '—'}</td>
                    <td>{r.tarjador ?? r.initials ?? '—'}</td>
                    <td>{r.hasDamage ? 'Sí' : 'No'}</td>
                    <td>{fmtDuration(r.durationSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="print-sign">
              <div className="slot">
                <div className="line">Supervisor</div>
              </div>
              <div className="slot">
                <div className="line">Jefe de turno</div>
              </div>
              <div className="slot">
                <div className="line">COSCO Shipping Ports</div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </Shell>
  );
}
