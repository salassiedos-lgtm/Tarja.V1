'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import Shell from '@/components/shell';
import {
  getSupervisorDashboard,
  annulReport,
  openReportPdf,
  API_URL,
  type DashboardData,
  type ReportRow,
} from '@/lib/api';
import {
  Activity,
  Anchor,
  ArrowRight,
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock,
  Container,
  FileText,
  Gauge,
  MapPin,
  PackageCheck,
  Radar,
  RefreshCw,
  Repeat2,
  Search,
  Ship,
  ShieldAlert,
  Timer,
  TriangleAlert,
  X,
  type LucideIcon,
} from 'lucide-react';

/* ────────────────────────────────  semántica  ──────────────────────────────── */

type Tone = 'pos' | 'neg' | 'warn' | 'info' | 'muted';

const TONE: Record<Tone, { text: string; bg: string; ring: string; dot: string; hex: string }> = {
  pos: { text: 'text-jade-600', bg: 'bg-jade-50', ring: 'ring-jade-600/20', dot: 'bg-jade-600', hex: '#0d7a63' },
  neg: { text: 'text-cosco-600', bg: 'bg-cosco-50', ring: 'ring-cosco-500/20', dot: 'bg-cosco-500', hex: '#c8102e' },
  warn: { text: 'text-ochre-600', bg: 'bg-ochre-50', ring: 'ring-ochre-600/20', dot: 'bg-ochre-600', hex: '#a56a06' },
  info: { text: 'text-navy-700', bg: 'bg-navy-50', ring: 'ring-navy-700/15', dot: 'bg-navy-700', hex: '#12558f' },
  muted: { text: 'text-muted', bg: 'bg-canvas', ring: 'ring-line', dot: 'bg-muted', hex: '#61748a' },
};

const REPORT_META: Record<string, { label: string; icon: LucideIcon; tone: Tone; strike?: boolean }> = {
  FINALIZADO: { label: 'Finalizado', icon: CheckCircle2, tone: 'pos' },
  CON_DANO: { label: 'Con daño', icon: TriangleAlert, tone: 'warn' },
  ANULADO: { label: 'Anulado', icon: Ban, tone: 'neg', strike: true },
  BORRADOR: { label: 'Borrador', icon: Clock, tone: 'info' },
  REEMPLAZADO: { label: 'Reemplazado', icon: Repeat2, tone: 'muted' },
};
const reportMeta = (s: string) => REPORT_META[s] ?? { label: s, icon: Activity, tone: 'muted' as Tone };

const OP_STATUS: Record<string, { label: string; tone: Tone; hex: string }> = {
  ACTIVA: { label: 'Activa', tone: 'pos', hex: '#0d7a63' },
  PAUSADA: { label: 'Pausada', tone: 'warn', hex: '#a56a06' },
  CERRADA: { label: 'Cerrada', tone: 'muted', hex: '#61748a' },
};
const opStatus = (s: string) => OP_STATUS[s] ?? { label: s, tone: 'muted' as Tone, hex: '#61748a' };

const OP_TYPE: Record<string, { label: string; icon: LucideIcon }> = {
  ROLL_ON_ROLL_OFF: { label: 'RO-RO', icon: Ship },
  DESCONSOLIDADO: { label: 'Desconsolidado', icon: Container },
};
const opType = (t: string) => OP_TYPE[t] ?? { label: t, icon: Anchor };

/* ────────────────────────────────  utilidades  ─────────────────────────────── */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fmtDur(s: number | null) {
  if (s == null) return '—';
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${String(sec).padStart(2, '0')}s` : `${sec}s`;
}

function fmtHm(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Verde < 5 min · ámbar 5–10 min · rojo > 10 min. */
function durTone(s: number | null): Tone {
  if (s == null) return 'muted';
  if (s < 300) return 'pos';
  if (s <= 600) return 'warn';
  return 'neg';
}

function DurationBadge({ seconds }: { seconds: number | null }) {
  const t = TONE[durTone(seconds)];
  return (
    <span
      className={`tnum inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold ring-1 ring-inset ${t.bg} ${t.text} ${t.ring}`}
    >
      <Timer className="h-3.5 w-3.5" strokeWidth={2} />
      {fmtDur(seconds)}
    </span>
  );
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/* ────────────────────────────────  átomos  ─────────────────────────────────── */

function StatusPill({ status }: { status: string }) {
  const m = reportMeta(status);
  const t = TONE[m.tone];
  const Icon = m.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-inset ${t.bg} ${t.text} ${t.ring} ${
        m.strike ? 'line-through decoration-cosco-500/50' : ''
      }`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.1} />
      {m.label}
    </span>
  );
}

function TarjadorChip({ initials, username }: { initials?: string | null; username?: string }) {
  const label = initials ?? username ?? '—';
  if (label === '—') return <span className="text-muted/50">—</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-gradient-to-br from-navy-800 to-navy-600 text-[10px] font-bold text-white shadow-[0_2px_8px_-2px_rgba(11,61,107,0.5)]">
        {label.slice(0, 2).toUpperCase()}
      </span>
      <span className="text-[13px] font-semibold text-navy-900">{label}</span>
    </span>
  );
}

function Ring({ pct, hex, size = 46 }: { pct: number; hex: string; size?: number }) {
  const r = size / 2 - 4;
  const c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(pct, 100) / 100);
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90" viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e8eef4" strokeWidth={4} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={hex}
        strokeWidth={4}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={off}
        style={{ transition: 'stroke-dashoffset 0.7s cubic-bezier(0.22,1,0.36,1)' }}
      />
    </svg>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  hint,
  accent,
  delay,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint: string;
  accent: string;
  delay: number;
}) {
  return (
    <div
      className="rise group relative overflow-hidden rounded-2xl border border-line bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgba(11,61,107,0.4)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: accent }} />
      <div className="flex items-start justify-between">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted">{label}</p>
        <span
          className="grid h-8 w-8 place-items-center rounded-[10px] transition-transform duration-200 group-hover:scale-110"
          style={{ background: `${accent}18`, color: accent }}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>
      <p className="tnum mt-2 font-display text-[27px] font-bold leading-none text-navy-900">{value}</p>
      <p className="mt-1.5 text-[11.5px] text-muted">{hint}</p>
    </div>
  );
}

/* ────────────────────────────────  página  ─────────────────────────────────── */

export default function SupervisorPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [live, setLive] = useState(false);
  const [annulTarget, setAnnulTarget] = useState<ReportRow | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [onlyDamage, setOnlyDamage] = useState(false);

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    try {
      setData(await getSupervisorDashboard());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const socket: Socket = io(API_URL, { transports: ['websocket'] });
    socket.on('connect', () => setLive(true));
    socket.on('disconnect', () => setLive(false));
    const refresh = () => load();
    ['report.started', 'report.finished', 'report.annulled', 'vehicle.released', 'vehicle.auto_released'].forEach(
      (ev) => socket.on(ev, refresh),
    );
    return () => {
      socket.disconnect();
    };
  }, [load]);

  async function confirmAnnul() {
    if (!annulTarget || reason.trim().length < 3) {
      setError('Indique un motivo (mínimo 3 caracteres).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await annulReport(annulTarget.id, reason.trim());
      setAnnulTarget(null);
      setReason('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setBusy(false);
    }
  }

  const stats = data?.stats;
  const operations = data?.operations ?? [];
  const recent = useMemo(() => data?.recent ?? [], [data]);

  const statusCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of recent) map.set(r.status, (map.get(r.status) ?? 0) + 1);
    return map;
  }, [recent]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return recent.filter((r) => {
      if (statusFilter !== 'all' && r.status !== statusFilter) return false;
      if (onlyDamage && !r.hasDamage) return false;
      if (needle) {
        const hay = `${r.reportCode} ${r.vehicle?.vin ?? ''} ${r.tarjador?.initials ?? ''} ${r.tarjador?.username ?? ''} ${r.operation?.code ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [recent, q, statusFilter, onlyDamage]);

  const hasFilters = q.trim() !== '' || statusFilter !== 'all' || onlyDamage;
  const clearFilters = () => {
    setQ('');
    setStatusFilter('all');
    setOnlyDamage(false);
  };

  const totalFleet = operations.reduce((a, o) => a + (o._count?.vehicles ?? 0), 0);
  const doneFleet = operations.reduce((a, o) => a + (o.doneVehicles ?? 0), 0);

  return (
    <Shell>
      {/* ── Command Deck ── */}
      <div className="rise relative overflow-hidden rounded-[22px] border border-navy-900/30 bg-navy-900 text-white shadow-[0_24px_60px_-32px_rgba(4,24,42,0.85)]">
        <div className="grain absolute inset-0" />
        <div
          className="absolute inset-0 grid-plot opacity-70"
          style={{ maskImage: 'linear-gradient(120deg, #000 0%, transparent 70%)' }}
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(120deg, #04182a 0%, #08355a 55%, #12558f 120%)' }}
        />
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-jade-600/25 blur-3xl" />
        <Radar className="pointer-events-none absolute -bottom-10 right-4 h-56 w-56 text-white/[0.05]" strokeWidth={0.9} />
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-jade-600 via-navy-600 to-transparent" />

        <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div>
            <p className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.22em] text-navy-200">
              <Radar className="h-3.5 w-3.5" strokeWidth={2} />
              Centro de control · Tiempo real
            </p>
            <h1 className="mt-2 font-display text-[34px] font-bold leading-none tracking-tight sm:text-[40px]">
              Supervisión
            </h1>
            <p className="mt-2.5 max-w-md text-[13px] leading-relaxed text-navy-100/80">
              Monitoreo en vivo de la operación — naves activas, avance de tarja y cada reporte generado en campo,
              con control de anulaciones.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <span
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                live
                  ? 'border-jade-600/30 bg-jade-600/15 text-jade-50'
                  : 'border-white/15 bg-white/10 text-navy-100'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${live ? 'pulse-dot bg-jade-50' : 'bg-navy-200'}`} />
              {live ? 'En vivo' : 'Sin conexión'}
            </span>
            <button
              onClick={() => load(true)}
              disabled={refreshing}
              className="group flex items-center gap-2 rounded-[11px] border border-white/15 bg-white/10 px-3.5 py-2 text-[12.5px] font-semibold text-white backdrop-blur-sm transition-all duration-150 hover:bg-white/20 active:scale-95 disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : 'transition-transform group-hover:rotate-90'}`} strokeWidth={2} />
              Actualizar
            </button>
          </div>
        </div>
      </div>

      {/* ── KPIs ── */}
      <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-5">
        <Kpi icon={PackageCheck} label="Tarjadas" value={stats?.tarjadas ?? '—'} hint="reportes cerrados" accent="#0d7a63" delay={40} />
        <Kpi icon={Clock} label="En proceso" value={stats?.enProceso ?? '—'} hint="borradores activos" accent="#12558f" delay={80} />
        <Kpi icon={ShieldAlert} label="Con daño" value={stats?.conDano ?? '—'} hint="vehículos observados" accent="#a56a06" delay={120} />
        <Kpi icon={Timer} label="Duración prom." value={stats ? fmtDur(stats.avgDurationSeconds) : '—'} hint="por reporte" accent="#5b56d6" delay={160} />
        <Kpi icon={Ship} label="Naves activas" value={stats?.activeShips ?? '—'} hint="operaciones abiertas" accent="#c8102e" delay={200} />
      </div>

      {/* ── flota de operaciones ── */}
      <div className="rise mt-7 flex items-center justify-between" style={{ animationDelay: '220ms' }}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-navy-50 text-navy-700">
            <Anchor className="h-4 w-4" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-[15px] font-bold text-navy-900">Operaciones activas</h2>
            <p className="text-[11.5px] text-muted">
              {operations.length} en curso · <span className="tnum">{doneFleet}</span> de{' '}
              <span className="tnum">{totalFleet}</span> vehículos tarjados
            </p>
          </div>
        </div>
      </div>

      <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
        {operations.map((op, i) => {
          const total = op._count?.vehicles ?? 0;
          const done = op.doneVehicles ?? 0;
          const pct = total ? Math.round((done / total) * 100) : 0;
          const st = opStatus(op.status);
          const ty = opType(op.operationType);
          const TypeIcon = ty.icon;
          return (
            <div
              key={op.id}
              className="rise group relative overflow-hidden rounded-2xl border border-line bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_16px_34px_-20px_rgba(11,61,107,0.45)]"
              style={{ animationDelay: `${240 + i * 40}ms` }}
            >
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: st.hex }} />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px]"
                      style={{ background: `${st.hex}16`, color: st.hex }}
                    >
                      <TypeIcon className="h-4 w-4" strokeWidth={2} />
                    </span>
                    <div className="min-w-0">
                      <p className="tnum truncate font-mono text-[13px] font-bold text-navy-900">{op.code}</p>
                      <p className="truncate text-[11.5px] text-muted">{op.shipName}</p>
                    </div>
                  </div>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold ring-1 ring-inset ${TONE[st.tone].bg} ${TONE[st.tone].text} ${TONE[st.tone].ring}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${TONE[st.tone].dot}`} />
                  {st.label}
                </span>
              </div>

              <div className="mt-4 flex items-center gap-3.5">
                <div className="relative grid place-items-center">
                  <Ring pct={pct} hex={st.hex} />
                  <span className="tnum absolute text-[12px] font-bold text-navy-900">{pct}%</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-baseline gap-1.5">
                    <span className="tnum font-display text-[22px] font-bold leading-none text-navy-900">{done}</span>
                    <span className="tnum text-[13px] text-muted">/ {total}</span>
                    <span className="text-[11.5px] text-muted">vehículos</span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-canvas">
                    <div
                      className="sweep h-full rounded-full"
                      style={{ width: `${pct}%`, background: st.hex }}
                    />
                  </div>
                </div>
              </div>

              <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line/70 pt-2.5 text-[11px] text-muted">
                <span className="inline-flex items-center gap-1">
                  <TypeIcon className="h-3 w-3" strokeWidth={2} />
                  {ty.label}
                </span>
                {op.portDischarge && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" strokeWidth={2} />
                    {op.portDischarge}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <CalendarDays className="h-3 w-3" strokeWidth={2} />
                  {fmtDate(op.operationDate)}
                </span>
              </div>
            </div>
          );
        })}
        {data && operations.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white/50 px-6 py-12 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-navy-50 text-navy-700">
              <Anchor className="h-5 w-5" strokeWidth={1.7} />
            </span>
            <p className="mt-3 text-[13.5px] font-semibold text-navy-900">Sin operaciones activas</p>
            <p className="mt-1 text-[12px] text-muted">Las naves en curso aparecerán aquí en tiempo real.</p>
          </div>
        )}
      </div>

      {/* ── tabla maestra de reportes ── */}
      <div className="rise mt-8 flex items-center gap-2.5" style={{ animationDelay: '300ms' }}>
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-navy-50 text-navy-700">
          <FileText className="h-4 w-4" strokeWidth={2} />
        </span>
        <div>
          <h2 className="text-[15px] font-bold text-navy-900">Bitácora de reportes</h2>
          <p className="text-[11.5px] text-muted">Últimos movimientos cerrados, con daño o anulados</p>
        </div>
      </div>

      {/* filtros */}
      <div className="rise mt-3.5 rounded-2xl border border-line bg-white p-3.5 shadow-[0_1px_2px_rgba(11,61,107,0.04)]" style={{ animationDelay: '320ms' }}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.9} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por código, VIN, operación o tarjador…"
              className="h-11 w-full rounded-[12px] border-[1.5px] border-line bg-canvas/60 pl-10 pr-9 text-[13.5px] text-ink outline-none transition-all duration-150 placeholder:text-muted/70 focus:border-navy-700 focus:bg-white focus:shadow-[0_0_0_3px_rgba(18,85,143,0.14)]"
            />
            {q && (
              <button
                onClick={() => setQ('')}
                className="absolute right-3 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-md text-muted transition-colors hover:bg-line hover:text-ink"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            )}
          </div>
          <button
            onClick={() => setOnlyDamage((v) => !v)}
            className={`flex h-11 shrink-0 items-center gap-2 rounded-[12px] border-[1.5px] px-3.5 text-[12.5px] font-semibold transition-all duration-150 ${
              onlyDamage
                ? 'border-ochre-600/30 bg-ochre-50 text-ochre-600'
                : 'border-line bg-white text-muted hover:border-ochre-600/25 hover:text-ochre-600'
            }`}
          >
            <TriangleAlert className="h-4 w-4" strokeWidth={2} />
            Solo con daño
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3">
          <Gauge className="h-3.5 w-3.5 text-muted" strokeWidth={2} />
          <button
            onClick={() => setStatusFilter('all')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all duration-150 ${
              statusFilter === 'all' ? 'bg-navy-900 text-white' : 'bg-canvas text-muted hover:bg-navy-50 hover:text-navy-700'
            }`}
          >
            Todos
            <span className={`tnum rounded-full px-1.5 text-[10.5px] ${statusFilter === 'all' ? 'bg-white/20' : 'bg-white'}`}>
              {recent.length}
            </span>
          </button>
          {Array.from(statusCounts.keys()).map((key) => {
            const m = reportMeta(key);
            const t = TONE[m.tone];
            const active = statusFilter === key;
            return (
              <button
                key={key}
                onClick={() => setStatusFilter(active ? 'all' : key)}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold ring-1 ring-inset transition-all duration-150 ${
                  active ? `${t.bg} ${t.text} ${t.ring}` : 'bg-canvas text-muted ring-transparent hover:bg-navy-50'
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
                {m.label}
                <span className="tnum rounded-full bg-white/70 px-1.5 text-[10.5px]">{statusCounts.get(key)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {error && !annulTarget && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-cosco-500/25 bg-cosco-50 px-4 py-3 text-[13px] font-medium text-cosco-600">
          <TriangleAlert className="h-4 w-4" strokeWidth={2} />
          {error}
        </div>
      )}

      {/* tabla */}
      <div className="rise mt-4 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(11,61,107,0.04)]" style={{ animationDelay: '340ms' }}>
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <p className="text-[12.5px] font-semibold text-navy-900">
            Reportes
            <span className="tnum ml-2 font-normal text-muted">
              {filtered.length} de {recent.length}
            </span>
          </p>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-muted transition-colors hover:bg-canvas hover:text-cosco-600"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
              Limpiar
            </button>
          )}
        </div>

        {!data ? (
          <div className="divide-y divide-line/70">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4">
                <div className="h-4 w-28 animate-pulse rounded bg-line" />
                <div className="h-4 flex-1 animate-pulse rounded bg-line/60" />
                <div className="h-6 w-24 animate-pulse rounded-full bg-line" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-navy-50 text-navy-700">
              <Search className="h-6 w-6" strokeWidth={1.7} />
            </span>
            <p className="mt-4 text-[14px] font-semibold text-navy-900">Sin coincidencias</p>
            <p className="mt-1 max-w-xs text-[12.5px] text-muted">
              {recent.length === 0 ? 'Aún no se han generado reportes.' : 'Ningún reporte coincide con los filtros.'}
            </p>
          </div>
        ) : (
          <>
            {/* desktop */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    <th className="px-5 py-3 font-bold">Código</th>
                    <th className="px-5 py-3 font-bold">Nave</th>
                    <th className="px-5 py-3 font-bold">Operación</th>
                    <th className="px-5 py-3 font-bold">VIN</th>
                    <th className="px-5 py-3 font-bold">Tarjador</th>
                    <th className="px-5 py-3 font-bold">Inicio → Término</th>
                    <th className="px-5 py-3 font-bold">Duración</th>
                    <th className="px-5 py-3 font-bold">Estado</th>
                    <th className="px-5 py-3 text-right font-bold">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {filtered.map((r) => {
                    const st = reportMeta(r.status);
                    return (
                      <tr key={r.id} className="group transition-colors duration-150 hover:bg-navy-50/40">
                        <td className="relative px-5 py-3.5">
                          <span
                            className="absolute inset-y-2 left-0 w-[3px] rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                            style={{ background: TONE[st.tone].hex }}
                          />
                          <span className="tnum font-mono text-[12px] font-semibold text-navy-900">{r.reportCode}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          {r.operation?.shipName ? (
                            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink/80">
                              <Ship className="h-3.5 w-3.5 shrink-0 text-muted" strokeWidth={1.9} />
                              <span className="truncate">{r.operation.shipName}</span>
                            </span>
                          ) : (
                            <span className="text-muted/50">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="tnum font-mono text-[12px] font-medium text-navy-900">{r.operation?.code ?? '—'}</span>
                        </td>
                        <td className="px-5 py-3.5">
                          {r.vehicle?.vin ? (
                            <span className="tnum rounded-md bg-navy-50 px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-navy-800 ring-1 ring-navy-700/10">
                              {r.vehicle.vin}
                            </span>
                          ) : (
                            <span className="text-muted/50">—</span>
                          )}
                        </td>
                        <td className="px-5 py-3.5">
                          <TarjadorChip initials={r.tarjador?.initials} username={r.tarjador?.username} />
                        </td>
                        <td className="px-5 py-3.5">
                          <span className="tnum inline-flex items-center gap-1.5 text-[12.5px] text-ink/80">
                            <span className="font-semibold text-navy-900">{fmtHm(r.startedAt)}</span>
                            <ArrowRight className="h-3 w-3 text-muted/60" strokeWidth={2} />
                            <span className="font-semibold text-navy-900">{fmtHm(r.finishedAt)}</span>
                          </span>
                        </td>
                        <td className="px-5 py-3.5">
                          <DurationBadge seconds={r.durationSeconds} />
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <StatusPill status={r.status} />
                            {r.hasDamage && r.status !== 'CON_DANO' && (
                              <span title="Con daño" className="grid h-5 w-5 place-items-center rounded-md bg-ochre-50 text-ochre-600 ring-1 ring-ochre-600/20">
                                <TriangleAlert className="h-3 w-3" strokeWidth={2.2} />
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center justify-end gap-1.5">
                            {r.status !== 'BORRADOR' && (
                              <button
                                onClick={() => openReportPdf(r.id).catch(() => {})}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-navy-700 transition-all duration-150 hover:border-navy-700/25 hover:bg-navy-50 active:scale-95"
                              >
                                <FileText className="h-3.5 w-3.5" strokeWidth={2} />
                                PDF
                              </button>
                            )}
                            {(r.status === 'FINALIZADO' || r.status === 'CON_DANO') && (
                              <button
                                onClick={() => {
                                  setAnnulTarget(r);
                                  setReason('');
                                  setError('');
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-cosco-500/25 px-2.5 py-1.5 text-[11.5px] font-semibold text-cosco-600 transition-all duration-150 hover:bg-cosco-50 active:scale-95"
                              >
                                <Ban className="h-3.5 w-3.5" strokeWidth={2} />
                                Anular
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* móvil */}
            <div className="divide-y divide-line/70 lg:hidden">
              {filtered.map((r) => {
                const st = reportMeta(r.status);
                return (
                  <div key={r.id} className="relative px-4 py-3.5">
                    <span className="absolute inset-y-3 left-0 w-[3px] rounded-full" style={{ background: TONE[st.tone].hex }} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="tnum font-mono text-[12.5px] font-bold text-navy-900">{r.reportCode}</p>
                        <p className="tnum mt-0.5 font-mono text-[11px] text-muted">{r.operation?.code}</p>
                        {r.operation?.shipName && (
                          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted">
                            <Ship className="h-3 w-3 shrink-0" strokeWidth={1.9} />
                            <span className="truncate">{r.operation.shipName}</span>
                          </p>
                        )}
                      </div>
                      <StatusPill status={r.status} />
                    </div>
                    {r.vehicle?.vin && (
                      <p className="tnum mt-2 font-mono text-[11.5px] text-navy-800">{r.vehicle.vin}</p>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11.5px] text-muted">
                      <TarjadorChip initials={r.tarjador?.initials} username={r.tarjador?.username} />
                      <span className="tnum inline-flex items-center gap-1 font-semibold text-navy-900">
                        {fmtHm(r.startedAt)}
                        <ArrowRight className="h-3 w-3 text-muted/60" strokeWidth={2} />
                        {fmtHm(r.finishedAt)}
                      </span>
                      <DurationBadge seconds={r.durationSeconds} />
                    </div>
                    <div className="mt-2.5 flex items-center gap-1.5">
                      {r.status !== 'BORRADOR' && (
                        <button
                          onClick={() => openReportPdf(r.id).catch(() => {})}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-navy-700 active:scale-95"
                        >
                          <FileText className="h-3.5 w-3.5" strokeWidth={2} />
                          PDF
                        </button>
                      )}
                      {(r.status === 'FINALIZADO' || r.status === 'CON_DANO') && (
                        <button
                          onClick={() => {
                            setAnnulTarget(r);
                            setReason('');
                            setError('');
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-cosco-500/25 px-2.5 py-1.5 text-[11.5px] font-semibold text-cosco-600 active:scale-95"
                        >
                          <Ban className="h-3.5 w-3.5" strokeWidth={2} />
                          Anular
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ── modal anular ── */}
      {annulTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/50 p-4 backdrop-blur-[2px]"
          onClick={() => setAnnulTarget(null)}
        >
          <div
            className="rise w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-[0_32px_80px_-24px_rgba(4,24,42,0.6)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative overflow-hidden bg-navy-900 px-5 py-4 text-white">
              <div className="grain absolute inset-0" />
              <div className="absolute inset-0" style={{ background: 'linear-gradient(120deg, #04182a, #8d1c2e)' }} />
              <div className="relative flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-white/15">
                  <Ban className="h-[18px] w-[18px]" strokeWidth={2} />
                </span>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-cosco-400/90">Acción irreversible</p>
                  <h3 className="tnum font-mono text-[15px] font-bold">Anular {annulTarget.reportCode}</h3>
                </div>
              </div>
            </div>
            <div className="p-5">
              <p className="text-[13px] text-muted">
                El vehículo <span className="tnum font-mono font-semibold text-navy-800">{annulTarget.vehicle?.vin}</span>{' '}
                volverá a estar disponible para re-tarjar.
              </p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                autoFocus
                placeholder="Motivo de la anulación (mínimo 3 caracteres)"
                className="mt-3 w-full rounded-[12px] border-[1.5px] border-line px-3 py-2.5 text-[13.5px] text-ink outline-none transition-all duration-150 placeholder:text-muted/70 focus:border-cosco-500 focus:shadow-[0_0_0_3px_rgba(200,16,46,0.14)]"
              />
              {error && (
                <p className="mt-2 flex items-center gap-1.5 text-[12.5px] font-medium text-cosco-600">
                  <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} />
                  {error}
                </p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button
                  onClick={() => setAnnulTarget(null)}
                  className="rounded-[10px] px-3.5 py-2 text-[13px] font-semibold text-muted transition-colors hover:bg-canvas hover:text-ink"
                >
                  Cancelar
                </button>
                <button
                  onClick={confirmAnnul}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-cosco-500 px-4 py-2 text-[13px] font-semibold text-white shadow-[0_8px_20px_-8px_rgba(200,16,46,0.6)] transition-all duration-150 hover:bg-cosco-600 active:scale-95 disabled:opacity-60"
                >
                  {busy ? 'Anulando…' : (
                    <>
                      <Ban className="h-4 w-4" strokeWidth={2} />
                      Anular reporte
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Shell>
  );
}
