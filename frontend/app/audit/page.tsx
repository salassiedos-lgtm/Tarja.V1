'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Shell from '@/components/shell';
import {
  queryAuditLogs,
  downloadAuditCsv,
  type AuditLog,
  type AuditQueryParams,
} from '@/lib/api';
import {
  Activity,
  AlertTriangle,
  Ban,
  CalendarRange,
  Download,
  Fingerprint,
  FileDown,
  Flag,
  Layers,
  LogIn,
  PlusCircle,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Trash2,
  TriangleAlert,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';

const PAGE_SIZE = 200;

/* ────────────────────────────────  semántica  ──────────────────────────────── */

type Accent = { label: string; hex: string; soft: string; ink: string };

const MODULE_META: Record<string, Accent> = {
  auth: { label: 'Autenticación', hex: '#12558f', soft: '#eaf2fb', ink: '#0b3d6b' },
  tarja: { label: 'Tarja', hex: '#1a6cb0', soft: '#e7f1fb', ink: '#0b3d6b' },
  operations: { label: 'Operaciones', hex: '#0d7a63', soft: '#e6f4f0', ink: '#0a5f4d' },
  vehicles: { label: 'Vehículos', hex: '#a56a06', soft: '#fbf2e0', ink: '#7c4f04' },
  reports: { label: 'Reportes', hex: '#c8102e', soft: '#fdeaed', ink: '#8d1c2e' },
  imports: { label: 'Importación', hex: '#5b56d6', soft: '#ecebfb', ink: '#3f3aa8' },
};

const moduleMeta = (m: string): Accent =>
  MODULE_META[m] ?? { label: m, hex: '#61748a', soft: '#eef2f6', ink: '#3a4757' };

type Tone = 'pos' | 'neg' | 'warn' | 'info';

const ACTION_META: Record<string, { label: string; icon: LucideIcon; tone: Tone }> = {
  LOGIN: { label: 'Inicio de sesión', icon: LogIn, tone: 'pos' },
  LOGIN_FAILED: { label: 'Acceso fallido', icon: Ban, tone: 'neg' },
  CREATE: { label: 'Creación', icon: PlusCircle, tone: 'pos' },
  START: { label: 'Tarja iniciada', icon: Play, tone: 'info' },
  FINISH: { label: 'Tarja finalizada', icon: Flag, tone: 'info' },
  DELETE: { label: 'Eliminación', icon: Trash2, tone: 'neg' },
  ANNUL: { label: 'Anulación', icon: Ban, tone: 'neg' },
  CONFIRM: { label: 'Importación', icon: FileDown, tone: 'pos' },
  VIN_NO_ENCONTRADO: { label: 'VIN no encontrado', icon: AlertTriangle, tone: 'warn' },
  AUTO_RELEASE: { label: 'Liberación automática', icon: RotateCcw, tone: 'warn' },
};

const actionMeta = (a: string) =>
  ACTION_META[a] ?? { label: a, icon: Activity, tone: 'info' as Tone };

const TONE: Record<Tone, { text: string; bg: string; ring: string; dot: string }> = {
  pos: { text: 'text-jade-600', bg: 'bg-jade-50', ring: 'ring-jade-600/20', dot: 'bg-jade-600' },
  neg: { text: 'text-cosco-600', bg: 'bg-cosco-50', ring: 'ring-cosco-500/20', dot: 'bg-cosco-500' },
  warn: { text: 'text-ochre-600', bg: 'bg-ochre-50', ring: 'ring-ochre-600/20', dot: 'bg-ochre-600' },
  info: { text: 'text-navy-700', bg: 'bg-navy-50', ring: 'ring-navy-700/15', dot: 'bg-navy-700' },
};

/* ────────────────────────────────  utilidades  ─────────────────────────────── */

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function fmtTime(d: string) {
  const dt = new Date(d);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(dt.getHours())}:${p(dt.getMinutes())}`;
}

function fmtDate(d: string) {
  const dt = new Date(d);
  return `${dt.getDate()} ${MESES[dt.getMonth()]}`;
}

function relTime(iso: string, now: number) {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'ahora mismo';
  const m = Math.round(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `hace ${h} h`;
  const day = Math.round(h / 24);
  return day <= 1 ? 'ayer' : `hace ${day} días`;
}

function isSameDay(iso: string, now: number) {
  const a = new Date(iso);
  const b = new Date(now);
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

function displayUser(l: AuditLog) {
  return l.username ?? (l.userId ? `#${l.userId}` : 'Sistema');
}

function initialsOf(l: AuditLog) {
  const name = l.username;
  if (!name) return l.userId ? `#${l.userId}` : 'SY';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? parts[0]?.[1] ?? '')).toUpperCase();
}

/** Resalta códigos técnicos (VIN, IDs, OP-…) dentro de la descripción. */
function DescCell({ text }: { text: string }) {
  const parts = text.split(/(\s+)/);
  return (
    <span className="text-[13px] text-ink/75">
      {parts.map((tok, i) => {
        if (tok === '->' || tok === '→')
          return (
            <span key={i} className="mx-0.5 text-muted/60">
              →
            </span>
          );
        const isCode = /[A-Z0-9]/.test(tok) && /\d/.test(tok) && tok.replace(/[^A-Za-z0-9-]/g, '').length >= 5;
        if (isCode)
          return (
            <span
              key={i}
              className="tnum rounded-md bg-navy-50 px-1.5 py-0.5 font-mono text-[11.5px] font-semibold text-navy-800 ring-1 ring-navy-700/10"
            >
              {tok}
            </span>
          );
        return <span key={i}>{tok}</span>;
      })}
    </span>
  );
}

/* ────────────────────────────────  chips  ──────────────────────────────────── */

function ModuleBadge({ module }: { module: string }) {
  const m = moduleMeta(module);
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold"
      style={{ background: m.soft, color: m.ink }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: m.hex }} />
      {m.label}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  const a = actionMeta(action);
  const t = TONE[a.tone];
  const Icon = a.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold ring-1 ring-inset ${t.bg} ${t.text} ${t.ring}`}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2.1} />
      {a.label}
    </span>
  );
}

function Avatar({ log }: { log: AuditLog }) {
  const m = moduleMeta(log.module);
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] text-[11px] font-bold text-white shadow-[0_3px_10px_-3px_rgba(11,61,107,0.4)]"
      style={{ background: `linear-gradient(135deg, ${m.hex}, ${m.ink})` }}
    >
      {initialsOf(log)}
    </span>
  );
}

/* ────────────────────────────────  KPIs  ───────────────────────────────────── */

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
  value: number | string;
  hint: string;
  accent: string;
  delay: number;
}) {
  return (
    <div
      className="rise group relative overflow-hidden rounded-2xl border border-line bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-18px_rgba(11,61,107,0.4)]"
      style={{ animationDelay: `${delay}ms` }}
    >
      <span className="absolute inset-x-0 top-0 h-1 origin-left" style={{ background: accent }} />
      <div className="flex items-start justify-between">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.13em] text-muted">{label}</p>
        <span
          className="grid h-8 w-8 place-items-center rounded-[10px] transition-transform duration-200 group-hover:scale-110"
          style={{ background: `${accent}18`, color: accent }}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
      </div>
      <p className="tnum mt-2 font-display text-[28px] font-bold leading-none text-navy-900">{value}</p>
      <p className="mt-1.5 text-[11.5px] text-muted">{hint}</p>
    </div>
  );
}

/* ────────────────────────────────  skeleton  ───────────────────────────────── */

function SkeletonRows() {
  return (
    <div className="divide-y divide-line/70">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-5 py-4">
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-[11px] bg-line" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-40 animate-pulse rounded bg-line" />
            <div className="h-2.5 w-24 animate-pulse rounded bg-line/70" />
          </div>
          <div className="h-6 w-28 animate-pulse rounded-full bg-line" />
          <div className="h-6 w-32 animate-pulse rounded-lg bg-line" />
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────  página  ─────────────────────────────────── */

export default function AuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(0);

  const [q, setQ] = useState('');
  const [mod, setMod] = useState<string>('all');
  const [onlyAlerts, setOnlyAlerts] = useState(false);
  // Rango de fechas: se resuelve en el servidor (permite ver historial > ventana).
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const serverParams = useMemo<AuditQueryParams>(
    () => ({ from: from || undefined, to: to || undefined, limit }),
    [from, to, limit],
  );

  const load = useCallback(
    async (soft = false) => {
      if (soft) setRefreshing(true);
      try {
        const data = await queryAuditLogs(serverParams);
        setLogs(data.rows);
        setTotal(data.total);
        setNow(Date.now());
        setError('');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar la auditoría');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [serverParams],
  );

  useEffect(() => {
    load();
  }, [load]);

  async function exportCsv() {
    setExporting(true);
    try {
      await downloadAuditCsv({
        from: from || undefined,
        to: to || undefined,
        module: mod !== 'all' ? mod : undefined,
        q: q.trim() || undefined,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar');
    } finally {
      setExporting(false);
    }
  }

  // reloj vivo para los "hace N min"
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const stats = useMemo(() => {
    const users = new Set<string>();
    let today = 0;
    let alerts = 0;
    const perModule = new Map<string, number>();
    for (const l of logs) {
      users.add(displayUser(l));
      if (now && isSameDay(l.createdAt, now)) today += 1;
      const tone = actionMeta(l.action).tone;
      if (tone === 'neg' || tone === 'warn') alerts += 1;
      perModule.set(l.module, (perModule.get(l.module) ?? 0) + 1);
    }
    return { users: users.size, today, alerts, perModule };
  }, [logs, now]);

  const modules = useMemo(() => {
    const keys = Array.from(stats.perModule.keys());
    keys.sort((a, b) => (stats.perModule.get(b) ?? 0) - (stats.perModule.get(a) ?? 0));
    return keys;
  }, [stats.perModule]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return logs.filter((l) => {
      if (mod !== 'all' && l.module !== mod) return false;
      if (onlyAlerts) {
        const tone = actionMeta(l.action).tone;
        if (tone !== 'neg' && tone !== 'warn') return false;
      }
      if (needle) {
        const hay = `${displayUser(l)} ${moduleMeta(l.module).label} ${actionMeta(l.action).label} ${l.module} ${l.action} ${l.description ?? ''}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [logs, q, mod, onlyAlerts]);

  const hasFilters = q.trim() !== '' || mod !== 'all' || onlyAlerts;
  const clearFilters = () => {
    setQ('');
    setMod('all');
    setOnlyAlerts(false);
  };

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
        {/* resplandor de acento */}
        <div className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-cosco-500/25 blur-3xl" />
        {/* ícono fantasma */}
        <ShieldCheck className="pointer-events-none absolute -bottom-8 right-6 h-52 w-52 text-white/[0.05]" strokeWidth={1} />
        {/* línea de horizonte */}
        <span className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-cosco-500 via-navy-600 to-transparent" />

        <div className="relative flex flex-col gap-5 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-7">
          <div>
            <p className="flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.22em] text-navy-200">
              <Fingerprint className="h-3.5 w-3.5" strokeWidth={2} />
              Sistema · Registro inmutable
            </p>
            <h1 className="mt-2 font-display text-[34px] font-bold leading-none tracking-tight sm:text-[40px]">
              Auditoría
            </h1>
            <p className="mt-2.5 max-w-md text-[13px] leading-relaxed text-navy-100/80">
              Trazabilidad completa de cada acción del sistema — accesos, tarjas, operaciones e importaciones,
              firmadas por usuario y momento exacto.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-2 rounded-full border border-jade-600/30 bg-jade-600/15 px-3 py-1.5 text-[11px] font-semibold text-jade-50">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-jade-50" />
              En vivo
            </span>
            <button
              onClick={exportCsv}
              disabled={exporting}
              className="group flex items-center gap-2 rounded-[11px] border border-white/15 bg-white/10 px-3.5 py-2 text-[12.5px] font-semibold text-white backdrop-blur-sm transition-all duration-150 hover:bg-white/20 active:scale-95 disabled:opacity-60"
            >
              <Download className={`h-4 w-4 ${exporting ? 'animate-pulse' : 'transition-transform group-hover:translate-y-0.5'}`} strokeWidth={2} />
              {exporting ? 'Exportando…' : 'Exportar'}
            </button>
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
      <div className="mt-5 grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <Kpi icon={Activity} label="Eventos totales" value={total} hint={`${logs.length} cargados`} accent="#12558f" delay={40} />
        <Kpi icon={ShieldCheck} label="Hoy" value={stats.today} hint="acciones de la jornada" accent="#0d7a63" delay={90} />
        <Kpi icon={Users} label="Usuarios" value={stats.users} hint="usuarios distintos" accent="#a56a06" delay={140} />
        <Kpi icon={TriangleAlert} label="Alertas" value={stats.alerts} hint="fallos y liberaciones" accent="#c8102e" delay={190} />
      </div>

      {/* ── barra de filtros ── */}
      <div className="rise mt-5 rounded-2xl border border-line bg-white p-3.5 shadow-[0_1px_2px_rgba(11,61,107,0.04)]" style={{ animationDelay: '220ms' }}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" strokeWidth={1.9} />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por usuario, VIN, acción o descripción…"
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

          <div className="flex h-11 shrink-0 items-center gap-1.5 rounded-[12px] border-[1.5px] border-line bg-white px-3 text-[12.5px] text-muted">
            <CalendarRange className="h-4 w-4 shrink-0 text-muted" strokeWidth={1.9} />
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="tnum w-[112px] bg-transparent text-[12.5px] text-ink outline-none"
              aria-label="Desde"
            />
            <span className="text-muted/60">→</span>
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="tnum w-[112px] bg-transparent text-[12.5px] text-ink outline-none"
              aria-label="Hasta"
            />
            {(from || to) && (
              <button
                onClick={() => {
                  setFrom('');
                  setTo('');
                }}
                className="grid h-6 w-6 place-items-center rounded-md text-muted transition-colors hover:bg-line hover:text-ink"
                aria-label="Limpiar fechas"
              >
                <X className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            )}
          </div>

          <button
            onClick={() => setOnlyAlerts((v) => !v)}
            className={`flex h-11 shrink-0 items-center gap-2 rounded-[12px] border-[1.5px] px-3.5 text-[12.5px] font-semibold transition-all duration-150 ${
              onlyAlerts
                ? 'border-cosco-500/30 bg-cosco-50 text-cosco-600'
                : 'border-line bg-white text-muted hover:border-cosco-500/25 hover:text-cosco-600'
            }`}
          >
            <TriangleAlert className="h-4 w-4" strokeWidth={2} />
            Solo alertas
          </button>
        </div>

        {/* chips de módulo */}
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line/70 pt-3">
          <Layers className="h-3.5 w-3.5 text-muted" strokeWidth={2} />
          <button
            onClick={() => setMod('all')}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all duration-150 ${
              mod === 'all' ? 'bg-navy-900 text-white' : 'bg-canvas text-muted hover:bg-navy-50 hover:text-navy-700'
            }`}
          >
            Todos
            <span className={`tnum rounded-full px-1.5 text-[10.5px] ${mod === 'all' ? 'bg-white/20' : 'bg-white'}`}>
              {logs.length}
            </span>
          </button>
          {modules.map((key) => {
            const m = moduleMeta(key);
            const active = mod === key;
            return (
              <button
                key={key}
                onClick={() => setMod(active ? 'all' : key)}
                className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all duration-150"
                style={
                  active
                    ? { background: m.hex, color: '#fff' }
                    : { background: m.soft, color: m.ink }
                }
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: active ? '#fff' : m.hex }}
                />
                {m.label}
                <span
                  className="tnum rounded-full px-1.5 text-[10.5px]"
                  style={{ background: active ? 'rgba(255,255,255,0.22)' : '#ffffff' }}
                >
                  {stats.perModule.get(key)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-cosco-500/25 bg-cosco-50 px-4 py-3 text-[13px] font-medium text-cosco-600">
          <AlertTriangle className="h-4 w-4" strokeWidth={2} />
          {error}
        </div>
      )}

      {/* ── resultados ── */}
      <div className="rise mt-4 overflow-hidden rounded-2xl border border-line bg-white shadow-[0_1px_2px_rgba(11,61,107,0.04)]" style={{ animationDelay: '260ms' }}>
        {/* encabezado del panel */}
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <p className="text-[12.5px] font-semibold text-navy-900">
            Bitácora de eventos
            <span className="tnum ml-2 font-normal text-muted">
              {filtered.length} de {logs.length}
            </span>
          </p>
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11.5px] font-semibold text-muted transition-colors hover:bg-canvas hover:text-cosco-600"
            >
              <X className="h-3.5 w-3.5" strokeWidth={2} />
              Limpiar filtros
            </button>
          )}
        </div>

        {loading ? (
          <SkeletonRows />
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-navy-50 text-navy-700">
              <Search className="h-6 w-6" strokeWidth={1.7} />
            </span>
            <p className="mt-4 text-[14px] font-semibold text-navy-900">Sin coincidencias</p>
            <p className="mt-1 max-w-xs text-[12.5px] text-muted">
              {logs.length === 0
                ? 'Aún no se han registrado acciones en el sistema.'
                : 'Ningún evento coincide con los filtros aplicados.'}
            </p>
            {hasFilters && (
              <button
                onClick={clearFilters}
                className="mt-4 rounded-[10px] border border-line px-3.5 py-2 text-[12.5px] font-semibold text-navy-700 transition-colors hover:bg-navy-50"
              >
                Quitar filtros
              </button>
            )}
          </div>
        ) : (
          <>
            {/* tabla (desktop) */}
            <div className="hidden lg:block">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                    <th className="px-5 py-3 font-bold">Momento</th>
                    <th className="px-5 py-3 font-bold">Usuario</th>
                    <th className="px-5 py-3 font-bold">Módulo</th>
                    <th className="px-5 py-3 font-bold">Acción</th>
                    <th className="px-5 py-3 font-bold">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line/70">
                  {filtered.map((l, i) => {
                    const m = moduleMeta(l.module);
                    return (
                      <tr
                        key={l.id}
                        className="group relative transition-colors duration-150 hover:bg-navy-50/40"
                        style={{ animationDelay: `${Math.min(i, 12) * 25}ms` }}
                      >
                        <td className="relative px-5 py-3.5">
                          <span
                            className="absolute inset-y-2 left-0 w-[3px] rounded-full opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                            style={{ background: m.hex }}
                          />
                          <div className="tnum flex items-baseline gap-1.5">
                            <span className="text-[14px] font-semibold text-navy-900">{fmtTime(l.createdAt)}</span>
                            <span className="text-[11px] font-medium text-muted">{fmtDate(l.createdAt)}</span>
                          </div>
                          <p className="mt-0.5 text-[11px] text-muted/80">{now ? relTime(l.createdAt, now) : ''}</p>
                        </td>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-2.5">
                            <Avatar log={l} />
                            <div className="leading-tight">
                              <p className="text-[13px] font-semibold text-navy-900">{displayUser(l)}</p>
                              {l.role && (
                                <p className="mt-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted">
                                  {l.role.toLowerCase()}
                                </p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-3.5">
                          <ModuleBadge module={l.module} />
                        </td>
                        <td className="px-5 py-3.5">
                          <ActionBadge action={l.action} />
                        </td>
                        <td className="max-w-xs px-5 py-3.5">
                          {l.description ? <DescCell text={l.description} /> : <span className="text-muted/50">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* tarjetas (móvil) */}
            <div className="divide-y divide-line/70 lg:hidden">
              {filtered.map((l) => {
                const m = moduleMeta(l.module);
                return (
                  <div key={l.id} className="relative px-4 py-3.5">
                    <span className="absolute inset-y-3 left-0 w-[3px] rounded-full" style={{ background: m.hex }} />
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <Avatar log={l} />
                        <div className="leading-tight">
                          <p className="text-[13px] font-semibold text-navy-900">{displayUser(l)}</p>
                          <p className="tnum mt-0.5 text-[11px] text-muted">
                            {fmtTime(l.createdAt)} · {fmtDate(l.createdAt)}
                          </p>
                        </div>
                      </div>
                      <ModuleBadge module={l.module} />
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-2">
                      <ActionBadge action={l.action} />
                      {l.description && (
                        <span className="min-w-0">
                          <DescCell text={l.description} />
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {!loading && logs.length < total && (
          <div className="border-t border-line px-5 py-3.5">
            <button
              onClick={() => setLimit((n) => n + PAGE_SIZE)}
              disabled={refreshing}
              className="mx-auto flex items-center gap-2 rounded-[11px] border border-line px-4 py-2 text-[12.5px] font-semibold text-navy-700 transition-colors hover:bg-navy-50 active:scale-95 disabled:opacity-60"
            >
              <Plus className="h-4 w-4" strokeWidth={2} />
              Cargar más
              <span className="tnum font-normal text-muted">
                ({logs.length} de {total})
              </span>
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}
