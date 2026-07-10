'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import Shell from '@/components/shell';
import {
  API_URL,
  getMonitoringLive,
  type MonitorLive,
  type MonitorFinished,
  type MonitorInProgress,
  type MonitorTarjador,
} from '@/lib/api';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Gauge,
  Moon,
  RefreshCw,
  Sun,
  Timer,
  TriangleAlert,
  Users,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/* ────────────────────────────────  semántica del semáforo  ─────────────────── */

type Tone = 'pos' | 'warn' | 'neg' | 'muted';

const TONE: Record<Tone, { text: string; bg: string; ring: string; dot: string; hex: string; soft: string }> = {
  pos: { text: 'text-jade-600', bg: 'bg-jade-50', ring: 'ring-jade-600/20', dot: 'bg-jade-600', hex: '#0d7a63', soft: '#e6f4f0' },
  warn: { text: 'text-ochre-600', bg: 'bg-ochre-50', ring: 'ring-ochre-600/20', dot: 'bg-ochre-600', hex: '#a56a06', soft: '#fbf2e0' },
  neg: { text: 'text-cosco-600', bg: 'bg-cosco-50', ring: 'ring-cosco-500/20', dot: 'bg-cosco-500', hex: '#c8102e', soft: '#fdeaed' },
  muted: { text: 'text-muted', bg: 'bg-canvas', ring: 'ring-line', dot: 'bg-muted', hex: '#61748a', soft: '#eef2f6' },
};

const FAST_MAX = 300; // < 5 min → verde
const MID_MAX = 600; //  5–10 min → ámbar · > 10 min → rojo

/** Verde < 5 min · ámbar 5–10 min · rojo > 10 min. */
function paceTone(seconds: number | null): Tone {
  if (seconds == null) return 'muted';
  if (seconds < FAST_MAX) return 'pos';
  if (seconds <= MID_MAX) return 'warn';
  return 'neg';
}

/* ────────────────────────────────  utilidades  ─────────────────────────────── */

function fmtClock(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fmtDur(sec: number | null): string {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${String(s).padStart(2, '0')}s` : `${s}s`;
}

function fmtHm(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

function elapsedSeconds(iso: string | null, now: number): number {
  if (!iso) return 0;
  return Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
}

function initialsOf(name: string, initials: string | null): string {
  if (initials) return initials.slice(0, 2).toUpperCase();
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase() || '—';
}

/* ────────────────────────────────  átomos  ─────────────────────────────────── */

function Avatar({ name, initials, tone }: { name: string; initials: string | null; tone?: Tone }) {
  const t = TONE[tone ?? 'muted'];
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] text-[11px] font-bold text-white shadow-[0_3px_10px_-3px_rgba(11,61,107,0.4)]"
      style={{ background: tone && tone !== 'muted' ? `linear-gradient(135deg, ${t.hex}, ${t.hex}cc)` : 'linear-gradient(135deg, #12558f, #0b3d6b)' }}
    >
      {initialsOf(name, initials)}
    </span>
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

/** Barra segmentada verde/ámbar/rojo con el reparto del turno. */
function PaceBar({ fast, mid, slow }: { fast: number; mid: number; slow: number }) {
  const total = fast + mid + slow;
  if (!total) return <div className="h-1.5 w-full rounded-full bg-canvas" />;
  const seg = (n: number, hex: string) =>
    n > 0 ? <span className="h-full" style={{ width: `${(n / total) * 100}%`, background: hex }} /> : null;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-canvas">
      {seg(fast, TONE.pos.hex)}
      {seg(mid, TONE.warn.hex)}
      {seg(slow, TONE.neg.hex)}
    </div>
  );
}

/* ────────────────────────────  tarjeta EN VIVO  ────────────────────────────── */

function LiveCard({ r, now, i }: { r: MonitorInProgress; now: number; i: number }) {
  const sec = elapsedSeconds(r.startedAt, now);
  const tone = paceTone(sec);
  const t = TONE[tone];
  // Progreso hacia el umbral rojo (10 min) para el aro de fondo.
  const pct = Math.min(100, (sec / (MID_MAX + 120)) * 100);
  return (
    <div
      className="rise relative overflow-hidden rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(11,61,107,0.04)] transition-all duration-200 hover:-translate-y-0.5"
      style={{ animationDelay: `${i * 40}ms`, borderColor: `${t.hex}40` }}
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: t.hex }} />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <Avatar name={r.tarjador} initials={r.initials} tone={tone} />
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[13.5px] font-semibold text-navy-900">{r.tarjador}</p>
            <p className="tnum truncate text-[11px] text-muted">
              {r.operationCode ?? '—'}
              {r.vessel ? ` · ${r.vessel}` : ''}
            </p>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-bold ring-1 ring-inset ${t.bg} ${t.text} ${t.ring}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${t.dot} ${tone === 'neg' ? 'pulse-dot' : ''}`} />
          {tone === 'pos' ? 'En tiempo' : tone === 'warn' ? 'Atención' : 'Demora'}
        </span>
      </div>

      <div className="mt-3.5 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">VIN</p>
          {r.vin ? (
            <p className="tnum truncate font-mono text-[13px] font-semibold text-navy-800">{r.vin}</p>
          ) : (
            <p className="text-[13px] text-muted/60">—</p>
          )}
          <p className="mt-1 flex items-center gap-1 text-[11px] text-muted">
            <Clock className="h-3 w-3" strokeWidth={2} />
            inicio {fmtHm(r.startedAt)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted">Transcurrido</p>
          <p className={`tnum font-display text-[30px] font-bold leading-none ${t.text}`}>{fmtClock(sec)}</p>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-canvas">
        <div className="h-full rounded-full transition-[width] duration-1000 ease-linear" style={{ width: `${pct}%`, background: t.hex }} />
      </div>
    </div>
  );
}

/* ─────────────────────────  fila resumen por tarjador  ─────────────────────── */

function TarjadorRow({ t: row, now }: { t: MonitorTarjador; now: number }) {
  const active = row.inProgress > 0;
  const liveSec = active ? elapsedSeconds(row.currentStartedAt, now) : null;
  const liveTone = liveSec != null ? paceTone(liveSec) : 'muted';
  const avgTone = paceTone(row.avgSeconds);
  return (
    <div className="flex items-center gap-3 px-5 py-3.5">
      <Avatar name={row.tarjador} initials={row.initials} tone={active ? liveTone : 'muted'} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13.5px] font-semibold text-navy-900">{row.tarjador}</p>
          {active && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ring-1 ring-inset ${TONE[liveTone].bg} ${TONE[liveTone].text} ${TONE[liveTone].ring}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${TONE[liveTone].dot} pulse-dot`} />
              <span className="tnum">{liveSec != null ? fmtClock(liveSec) : ''}</span>
            </span>
          )}
        </div>
        <div className="mt-1.5 max-w-[220px]">
          <PaceBar fast={row.fast} mid={row.mid} slow={row.slow} />
        </div>
      </div>
      <div className="hidden shrink-0 items-center gap-5 sm:flex">
        <div className="text-right">
          <p className="tnum font-display text-[18px] font-bold leading-none text-navy-900">{row.done}</p>
          <p className="text-[10px] uppercase tracking-[0.1em] text-muted">hechas</p>
        </div>
        <div className="text-right">
          <p className={`tnum font-display text-[16px] font-bold leading-none ${TONE[avgTone].text}`}>{fmtDur(row.avgSeconds)}</p>
          <p className="text-[10px] uppercase tracking-[0.1em] text-muted">prom.</p>
        </div>
      </div>
      {/* móvil: métricas compactas */}
      <div className="flex shrink-0 flex-col items-end sm:hidden">
        <p className="tnum text-[13px] font-bold text-navy-900">{row.done}</p>
        <p className={`tnum text-[11px] font-semibold ${TONE[avgTone].text}`}>{fmtDur(row.avgSeconds)}</p>
      </div>
    </div>
  );
}

/* ────────────────────────────────  página  ─────────────────────────────────── */

export default function MonitoreoPage() {
  const [data, setData] = useState<MonitorLive | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [live, setLive] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async (soft = false) => {
    if (soft) setRefreshing(true);
    try {
      const d = await getMonitoringLive();
      setData(d);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar el monitoreo');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Carga inicial + refresco por eventos de tarja en vivo.
  useEffect(() => {
    load();
    const socket: Socket = io(API_URL, { transports: ['websocket'] });
    socket.on('connect', () => setLive(true));
    socket.on('disconnect', () => setLive(false));
    const refresh = () => load(true);
    [
      'report.started',
      'report.finished',
      'report.reopened',
      'report.annulled',
      'report.reopen_expired',
      'vehicle.released',
      'vehicle.auto_released',
    ].forEach((ev) => socket.on(ev, refresh));
    return () => {
      socket.disconnect();
    };
  }, [load]);

  // Reloj vivo (1s) para los cronómetros. Y refresco de respaldo cada 30s por si
  // el socket no llegó (garantiza que las finalizadas del turno se muevan).
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => load(true), 30_000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [load]);

  const stats = data?.stats;
  const inProgress = useMemo(() => data?.inProgress ?? [], [data]);
  const byTarjador = useMemo(() => data?.byTarjador ?? [], [data]);
  const finished = useMemo(() => data?.finished ?? [], [data]);

  const isNight = stats?.shift === 'NOCHE';

  return (
    <Shell>
      {/* ── Command Deck ── */}
      <div className="rise relative overflow-hidden rounded-[22px] border border-navy-900/30 bg-navy-900 text-white shadow-[0_24px_60px_-32px_rgba(4,24,42,0.85)]">
        <div className="grain absolute inset-0" />
        <div className="absolute inset-0 grid-plot opacity-70" style={{ maskImage: 'linear-gradient(120deg, #000 0%, transparent 70%)' }} />
        <div className="absolute inset-0" style={{ background: 'linear-gradient(120deg, #04182a 0%, #08355a 55%, #12558f 120%)' }} />
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-jade-600/25 blur-3xl" />
        <Gauge className="pointer-events-none absolute -bottom-9 right-5 h-52 w-52 text-white/[0.05]" strokeWidth={0.9} />
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-jade-600 via-navy-600 to-transparent" />

        <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div>
            <p className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.22em] text-navy-200">
              <Zap className="h-3.5 w-3.5" strokeWidth={2} />
              Avance del personal · Tiempo real
            </p>
            <h1 className="mt-2 font-display text-[34px] font-bold leading-none tracking-tight sm:text-[40px]">Monitoreo</h1>
            <p className="mt-2.5 max-w-md text-[13px] leading-relaxed text-navy-100/80">
              Quién está tarjando ahora, cuánto lleva cada unidad y el ritmo del turno —
              <span className="font-semibold text-jade-100"> verde &lt; 5 min</span>,
              <span className="font-semibold text-ochre-100"> ámbar 5–10 min</span>,
              <span className="font-semibold text-cosco-200"> rojo &gt; 10 min</span>.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            {stats && (
              <span className="flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-navy-50">
                {isNight ? <Moon className="h-3.5 w-3.5" strokeWidth={2} /> : <Sun className="h-3.5 w-3.5" strokeWidth={2} />}
                Turno {isNight ? 'Noche' : 'Día'}
              </span>
            )}
            <span
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${
                live ? 'border-jade-600/30 bg-jade-600/15 text-jade-50' : 'border-white/15 bg-white/10 text-navy-100'
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
        <Kpi icon={Users} label="Tarjadores activos" value={stats?.activeTarjadores ?? '—'} hint="tarjando ahora" accent="#0d7a63" delay={40} />
        <Kpi icon={Activity} label="En proceso" value={stats?.inProgressCount ?? '—'} hint="unidades en curso" accent="#12558f" delay={80} />
        <Kpi icon={CheckCircle2} label="Tarjadas turno" value={stats?.finishedCount ?? '—'} hint="cerradas este turno" accent="#5b56d6" delay={120} />
        <Kpi icon={Timer} label="Tiempo prom." value={stats ? fmtDur(stats.avgSeconds) : '—'} hint="por unidad" accent="#a56a06" delay={160} />
        <Kpi icon={TriangleAlert} label="Con demora" value={stats?.slow ?? '—'} hint="más de 10 min" accent="#c8102e" delay={200} />
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-cosco-500/25 bg-cosco-50 px-4 py-3 text-[13px] font-medium text-cosco-600">
          <AlertTriangle className="h-4 w-4" strokeWidth={2} />
          {error}
        </div>
      )}

      {/* ── Panel EN VIVO ── */}
      <div className="rise mt-7 flex items-center justify-between" style={{ animationDelay: '220ms' }}>
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-jade-50 text-jade-600">
            <Zap className="h-4 w-4" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-[15px] font-bold text-navy-900">Tarjando ahora</h2>
            <p className="text-[11.5px] text-muted">
              {inProgress.length} unidad{inProgress.length === 1 ? '' : 'es'} en proceso · cronómetro en vivo
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl border border-line bg-white" />
          ))}
        </div>
      ) : inProgress.length === 0 ? (
        <div className="rise mt-3.5 flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-white/50 px-6 py-12 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-navy-50 text-navy-700">
            <Clock className="h-5 w-5" strokeWidth={1.7} />
          </span>
          <p className="mt-3 text-[13.5px] font-semibold text-navy-900">Nadie está tarjando en este momento</p>
          <p className="mt-1 text-[12px] text-muted">Las unidades en proceso aparecerán aquí con su cronómetro.</p>
        </div>
      ) : (
        <div className="mt-3.5 grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
          {inProgress.map((r, i) => (
            <LiveCard key={r.reportId} r={r} now={now} i={i} />
          ))}
        </div>
      )}

      {/* ── Resumen por tarjador ── */}
      {byTarjador.length > 0 && (
        <>
          <div className="rise mt-8 flex items-center gap-2.5" style={{ animationDelay: '260ms' }}>
            <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-navy-50 text-navy-700">
              <Users className="h-4 w-4" strokeWidth={2} />
            </span>
            <div>
              <h2 className="text-[15px] font-bold text-navy-900">Ritmo por tarjador</h2>
              <p className="text-[11.5px] text-muted">Producción y tiempo promedio del turno</p>
            </div>
          </div>
          <div className="rise mt-3.5 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(11,61,107,0.04)]" style={{ animationDelay: '280ms' }}>
            <div className="divide-y divide-line/70">
              {byTarjador.map((t) => (
                <TarjadorRow key={t.tarjadorId} t={t} now={now} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Finalizadas del turno ── */}
      <div className="rise mt-8 flex items-center gap-2.5" style={{ animationDelay: '300ms' }}>
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-navy-50 text-navy-700">
          <CheckCircle2 className="h-4 w-4" strokeWidth={2} />
        </span>
        <div>
          <h2 className="text-[15px] font-bold text-navy-900">Finalizadas del turno</h2>
          <p className="text-[11.5px] text-muted">{finished.length} tarjas cerradas · con su duración y semáforo</p>
        </div>
      </div>

      <div className="rise mt-3.5 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(11,61,107,0.04)]" style={{ animationDelay: '320ms' }}>
        {finished.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-navy-50 text-navy-700">
              <Timer className="h-5 w-5" strokeWidth={1.7} />
            </span>
            <p className="mt-3 text-[13.5px] font-semibold text-navy-900">Aún no hay tarjas cerradas este turno</p>
            <p className="mt-1 text-[12px] text-muted">Las unidades finalizadas se listarán aquí.</p>
          </div>
        ) : (
          <>
            {/* desktop */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    <th className="px-5 py-3 font-bold">VIN</th>
                    <th className="px-5 py-3 font-bold">Tarjador</th>
                    <th className="px-5 py-3 font-bold">Operación</th>
                    <th className="px-5 py-3 font-bold">Inicio → Fin</th>
                    <th className="px-5 py-3 font-bold">Duración</th>
                    <th className="px-5 py-3 font-bold">Estado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {finished.map((r) => (
                    <FinishedRow key={r.reportId} r={r} />
                  ))}
                </tbody>
              </table>
            </div>

            {/* móvil */}
            <div className="divide-y divide-line/70 lg:hidden">
              {finished.map((r) => {
                const tone = paceTone(r.durationSeconds);
                const t = TONE[tone];
                return (
                  <div key={r.reportId} className="relative px-4 py-3.5">
                    <span className="absolute inset-y-3 left-0 w-[3px] rounded-full" style={{ background: t.hex }} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <Avatar name={r.tarjador} initials={r.initials} />
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-navy-900">{r.tarjador}</p>
                          {r.vin && <p className="tnum truncate font-mono text-[11.5px] text-navy-800">{r.vin}</p>}
                        </div>
                      </div>
                      <span className={`tnum inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold ring-1 ring-inset ${t.bg} ${t.text} ${t.ring}`}>
                        <Timer className="h-3.5 w-3.5" strokeWidth={2} />
                        {fmtDur(r.durationSeconds)}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3 text-[11.5px] text-muted">
                      <span className="tnum inline-flex items-center gap-1 font-semibold text-navy-900">
                        {fmtHm(r.startedAt)}
                        <ArrowRight className="h-3 w-3 text-muted/60" strokeWidth={2} />
                        {fmtHm(r.finishedAt)}
                      </span>
                      {r.hasDamage && (
                        <span className="inline-flex items-center gap-1 font-semibold text-ochre-600">
                          <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} />
                          con daño
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </Shell>
  );
}

function FinishedRow({ r }: { r: MonitorFinished }) {
  const tone = paceTone(r.durationSeconds);
  const t = TONE[tone];
  return (
    <tr className="group transition-colors duration-150 hover:bg-navy-50/40">
      <td className="relative px-5 py-3.5">
        <span className="absolute inset-y-2 left-0 w-[3px] rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-100" style={{ background: t.hex }} />
        {r.vin ? (
          <span className="tnum rounded-md bg-navy-50 px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-navy-800 ring-1 ring-navy-700/10">
            {r.vin}
          </span>
        ) : (
          <span className="text-muted/50">—</span>
        )}
      </td>
      <td className="px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Avatar name={r.tarjador} initials={r.initials} />
          <span className="text-[13px] font-semibold text-navy-900">{r.tarjador}</span>
        </div>
      </td>
      <td className="px-5 py-3.5">
        <span className="tnum font-mono text-[12px] font-medium text-navy-900">{r.operationCode ?? '—'}</span>
        {r.vessel && <span className="ml-1.5 text-[11.5px] text-muted">· {r.vessel}</span>}
      </td>
      <td className="px-5 py-3.5">
        <span className="tnum inline-flex items-center gap-1.5 text-[12.5px] text-ink/80">
          <span className="font-semibold text-navy-900">{fmtHm(r.startedAt)}</span>
          <ArrowRight className="h-3 w-3 text-muted/60" strokeWidth={2} />
          <span className="font-semibold text-navy-900">{fmtHm(r.finishedAt)}</span>
        </span>
      </td>
      <td className="px-5 py-3.5">
        <span className={`tnum inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[12px] font-semibold ring-1 ring-inset ${t.bg} ${t.text} ${t.ring}`}>
          <Timer className="h-3.5 w-3.5" strokeWidth={2} />
          {fmtDur(r.durationSeconds)}
        </span>
      </td>
      <td className="px-5 py-3.5">
        {r.hasDamage ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-ochre-50 px-2.5 py-1 text-[11.5px] font-semibold text-ochre-600 ring-1 ring-inset ring-ochre-600/20">
            <TriangleAlert className="h-3.5 w-3.5" strokeWidth={2} />
            Con daño
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-jade-50 px-2.5 py-1 text-[11.5px] font-semibold text-jade-600 ring-1 ring-inset ring-jade-600/20">
            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={2} />
            Finalizado
          </span>
        )}
      </td>
    </tr>
  );
}
