'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Shell from '@/components/shell';
import {
  listOperationReports,
  reopenReport,
  openReportPdf,
  openOperationPdf,
  type OperationReportRow,
} from '@/lib/api';

/** Segundos → "12:34" o "1:02:03". Null → "—". */
function fmtDuration(sec: number | null): string {
  if (sec === null || sec === undefined) return '—';
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
}

const GROUPS: [('1' | '0'), string][] = [
  ['1', 'Con daños'],
  ['0', 'Sin daños'],
];

export default function BatchReports() {
  const params = useParams<{ id: string }>();
  const batchId = params.id;
  const router = useRouter();
  const [reports, setReports] = useState<OperationReportRow[]>([]);
  const [group, setGroup] = useState<'1' | '0'>('1');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setErr('');
    try {
      setReports(await listOperationReports(batchId));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, [batchId]);

  useEffect(() => {
    load();
  }, [load]);

  async function reopen(t: OperationReportRow) {
    const ok = window.confirm(
      `¿Reabrir la tarja de ${t.vin ?? t.chassisNumber ?? 'la unidad'}?\n\n` +
        `Vuelve al cuadro de tareas como "En proceso" para que se pueda editar.`,
    );
    if (!ok) return;
    setBusy(t.id);
    setErr('');
    try {
      await reopenReport(t.id);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(0);
    }
  }

  const inGroup = (t: OperationReportRow) => (t.hasDamage ? '1' : '0') === group;
  const count = (g: '1' | '0') => reports.filter((t) => (t.hasDamage ? '1' : '0') === g).length;
  const shown = reports.filter(inGroup);

  return (
    <Shell title="Reportes tarjados" onBack={() => router.push('/admin/tareas')}>
      {err && <div className="error">{err}</div>}

      <div className="tabs">
        {GROUPS.map(([v, l]) => (
          <div
            key={v}
            className={`tab ${group === v ? 'active' : ''}`}
            onClick={() => setGroup(v)}
          >
            {l} ({count(v)})
          </div>
        ))}
      </div>

      {loading ? (
        <div className="empty">Cargando…</div>
      ) : shown.length === 0 ? (
        <div className="empty">
          {group === '1' ? 'Ninguna tarja registró daños.' : 'Todas las tarjas registraron daños.'}
        </div>
      ) : (
        <>
          <button
            className="btn"
            style={{ marginBottom: 12 }}
            onClick={() => openOperationPdf(Number(batchId), group).catch((e) => setErr(e.message))}
          >
            Imprimir las {shown.length} tarjas {group === '1' ? 'con daños' : 'sin daños'}
          </button>

          {shown.map((t) => (
            <div className="task" key={t.id}>
              <div className="grow">
                <div className="vin">{t.vin || t.chassisNumber || '(sin VIN)'}</div>
                <div className="meta">
                  {[t.brand, t.model].filter(Boolean).join(' ')}
                  {t.containerNumber ? ` · ${t.containerNumber}` : ''}
                  {t.tarjador ? ` · ${t.tarjador}` : ''}
                </div>
                <div className="meta">
                  N° {t.reportCode || '—'} · Duración: {fmtDuration(t.durationSeconds)}
                </div>
              </div>
              <button
                className="btn small ghost"
                disabled={busy === t.id}
                onClick={() => reopen(t)}
              >
                {busy === t.id ? '…' : 'Reabrir'}
              </button>
              <button
                className="btn small"
                onClick={() => openReportPdf(t.id).catch((e) => setErr(e.message))}
              >
                Imprimir
              </button>
            </div>
          ))}
        </>
      )}
    </Shell>
  );
}
