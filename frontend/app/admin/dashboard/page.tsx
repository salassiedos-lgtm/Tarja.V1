'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import { listOperations, type Operation } from '@/lib/api';

/** ISO → "09/07/2026 14:04". Null → "—". */
function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Anillo de avance de tarja: una magnitud sobre pista neutra, con % al centro. */
function Donut({ value, total, size = 132, stroke = 13 }: { value: number; total: number; size?: number; stroke?: number }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = (Math.min(100, Math.max(0, pct)) / 100) * c;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}% tarjado`}>
      <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-track)" strokeWidth={stroke} />
        {pct > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="var(--color-green)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${c - filled}`}
          />
        )}
      </g>
      <text x="50%" y="50%" textAnchor="middle" dy="0.02em" style={{ fontSize: 26, fontWeight: 700, fill: 'var(--color-text)' }}>
        {pct}%
      </text>
      <text x="50%" y="50%" textAnchor="middle" dy="1.7em" style={{ fontSize: 11, fill: 'var(--color-muted)' }}>
        tarjado
      </text>
    </svg>
  );
}

export default function AdminDashboard() {
  const router = useRouter();
  const [ops, setOps] = useState<Operation[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useEffect(() => {
    listOperations()
      .then(setOps)
      .catch((e) => setErr(e instanceof Error ? e.message : 'Error'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Shell title="Dashboard" onBack={() => router.push('/admin')}>
      {err && <div className="error">{err}</div>}
      {loading ? (
        <div className="empty">Cargando…</div>
      ) : ops.length === 0 ? (
        <div className="empty">Aún no se ha registrado ninguna operación.</div>
      ) : (
        ops.map((v) => {
          const total = v.total ?? v._count?.vehicles ?? 0;
          const completed = v.completed ?? 0;
          const pending = v.pending ?? total - completed;
          const bls = v._count?.bills ?? 0;
          return (
            <div className="card" key={v.id}>
              <h3>{v.shipName}</h3>
              <div className="muted" style={{ marginBottom: 10 }}>
                {v.code}
                {bls ? ` · ${bls} B/L` : ' · sin B/L'}
              </div>

              <div className="dash">
                <Donut value={completed} total={total} />
                <div className="dash-cards">
                  <div className="stat">
                    <span className="n">{total}</span>
                    <span className="l">Chasis</span>
                  </div>
                  <div className="stat ok">
                    <span className="n">{completed}</span>
                    <span className="l">Tarjados</span>
                  </div>
                  <div className="stat warn">
                    <span className="n">{pending}</span>
                    <span className="l">Por tarjar</span>
                  </div>
                  <div className="stat">
                    <span className="n">{bls}</span>
                    <span className="l">B/L</span>
                  </div>
                </div>
              </div>

              <table className="dates">
                <tbody>
                  <tr>
                    <th>Tarea creada</th>
                    <td>{fmtDateTime(v.createdAt)}</td>
                  </tr>
                  <tr>
                    <th>Aperturada</th>
                    <td>{fmtDateTime(v.openedAt)}</td>
                  </tr>
                  <tr>
                    <th>Finalizada</th>
                    <td>{fmtDateTime(v.status === 'CERRADA' ? v.closedAt : null)}</td>
                  </tr>
                  <tr>
                    <th>Última tarja</th>
                    <td>{fmtDateTime(v.lastReportAt)}</td>
                  </tr>
                </tbody>
              </table>

              <button
                className="btn secondary"
                style={{ marginTop: 12 }}
                onClick={() => router.push('/reportes/turno')}
              >
                Reporte de avance de turno
              </button>
            </div>
          );
        })
      )}
    </Shell>
  );
}
