'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Shell from '@/components/shell';
import { getUser, getSupervisorDashboard, type DashboardData } from '@/lib/api';
import {
  IconAlert,
  IconArrow,
  IconCheck,
  IconClipboard,
  IconClock,
  IconRadar,
  IconShield,
  IconShip,
  IconWrench,
} from '@/components/icons';

const TAG_STYLE: Record<string, string> = {
  Finalizada: 'bg-jade-50 text-jade-600 ring-jade-600/15',
  'Con daño': 'bg-cosco-500/8 text-cosco-600 ring-cosco-600/15',
  Anulada: 'bg-ochre-50 text-ochre-600 ring-ochre-600/15',
};

const STATUS_TAG: Record<string, string> = {
  FINALIZADO: 'Finalizada',
  CON_DANO: 'Con daño',
  ANULADO: 'Anulada',
};

const STATUS_STYLE: Record<string, string> = {
  ACTIVA: 'bg-jade-600',
  PAUSADA: 'bg-ochre-600',
  CERRADA: 'bg-muted',
};

const TYPE_LABEL: Record<string, string> = {
  ROLL_ON_ROLL_OFF: 'RO-RO',
  DESCONSOLIDADO: 'Desconsolidado',
};

function formatDuration(totalSeconds: number) {
  if (!totalSeconds) return '—';
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function timeAgo(iso?: string) {
  if (!iso) return '—';
  const diffMs = Date.now() - new Date(iso).getTime();
  const min = Math.max(0, Math.round(diffMs / 60000));
  if (min < 1) return 'ahora';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

const KPI_TONE = {
  jade: { text: 'text-jade-600', track: 'text-jade-50', wash: 'from-jade-50', ring: 'ring-jade-600/15' },
  navy: { text: 'text-navy-700', track: 'text-navy-100', wash: 'from-navy-50', ring: 'ring-navy-700/15' },
  cosco: { text: 'text-cosco-600', track: 'text-cosco-50', wash: 'from-cosco-500/8', ring: 'ring-cosco-600/15' },
  ochre: { text: 'text-ochre-600', track: 'text-ochre-50', wash: 'from-ochre-50', ring: 'ring-ochre-600/15' },
} as const;

/** Anillo de progreso (donut) con icono al centro. `pct` es opcional: sin dato
 * de proporcion real que mostrar, se ve solo el icono sobre el trazo completo. */
function KpiBadge({
  tone,
  Icon,
  pct,
}: {
  tone: keyof typeof KPI_TONE;
  Icon: (p: { className?: string }) => React.ReactElement;
  pct?: number;
}) {
  const c = KPI_TONE[tone];
  const r = 19;
  const circumference = 2 * Math.PI * r;
  const clamped = pct == null ? 100 : Math.max(0, Math.min(100, pct));
  const dash = (clamped / 100) * circumference;

  return (
    <div className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white ring-1 ${c.ring}`}>
      <svg viewBox="0 0 44 44" className="h-14 w-14 -rotate-90">
        <circle cx="22" cy="22" r={r} fill="none" strokeWidth="3.5" className={c.track} stroke="currentColor" />
        <circle
          cx="22"
          cy="22"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          className={c.text}
          stroke="currentColor"
          strokeDasharray={`${dash} ${circumference - dash}`}
          opacity={pct == null ? 0.4 : 1}
        />
      </svg>
      <Icon className={`absolute h-5 w-5 ${c.text}`} />
    </div>
  );
}

/** Sparkline de 14 dias con datos reales (no simulados): la linea va en el
 * tono neutro y solo el punto de hoy se resalta con el color de acento. */
function Sparkline({ data, tone }: { data: number[]; tone: keyof typeof KPI_TONE }) {
  if (data.length < 2) return null;
  const c = KPI_TONE[tone];
  const w = 100;
  const h = 30;
  const pad = 3;
  const max = Math.max(...data);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const stepX = (w - pad * 2) / (data.length - 1);
  const points = data.map((v, i) => {
    const x = pad + i * stepX;
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });
  const linePath = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1][0].toFixed(1)},${h} L${points[0][0].toFixed(1)},${h} Z`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full" preserveAspectRatio="none">
      <path d={areaPath} className={c.text} fill="currentColor" opacity="0.1" stroke="none" />
      <path d={linePath} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-navy-900/25" />
      <circle cx={lastX} cy={lastY} r="2.8" className={c.text} fill="currentColor" stroke="white" strokeWidth="1.5" />
    </svg>
  );
}

function Kpi({
  label,
  value,
  unit,
  delta,
  tone,
  Icon,
  pct,
  series,
  seriesLabel,
  i,
}: {
  label: string;
  value: string | number;
  unit?: string;
  delta?: string;
  tone: keyof typeof KPI_TONE;
  Icon: (p: { className?: string }) => React.ReactElement;
  pct?: number;
  series?: number[];
  seriesLabel?: string;
  i: number;
}) {
  const c = KPI_TONE[tone];
  return (
    <div
      className={`rise group relative overflow-hidden rounded-2xl border border-line bg-gradient-to-br ${c.wash} to-white p-5 transition-all hover:-translate-y-0.5 hover:border-navy-200 hover:shadow-[0_12px_32px_-14px_rgba(11,61,107,0.28)]`}
      style={{ animationDelay: `${i * 70}ms` }}
    >
      <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-navy-600/30 to-transparent" />
      <div className="flex items-start justify-between gap-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{label}</p>
        <KpiBadge tone={tone} Icon={Icon} pct={pct} />
      </div>
      <div className="mt-3 flex items-end gap-1.5">
        <p className="tnum font-display text-[34px] font-bold leading-none text-navy-900">
          {value}
        </p>
        {unit && <span className="pb-1 font-mono text-[11px] text-muted">{unit}</span>}
      </div>
      {delta && <p className="mt-2 text-[11.5px] font-medium text-muted">{delta}</p>}

      {series && series.some((v) => v > 0) ? (
        <div className="mt-4 -mx-1">
          <Sparkline data={series} tone={tone} />
          {seriesLabel && (
            <p className="mt-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted/70">
              {seriesLabel}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 h-8" />
      )}
    </div>
  );
}

function QuickCard({
  href,
  title,
  desc,
  Icon,
  primary,
}: {
  href: string;
  title: string;
  desc: string;
  Icon: (p: { className?: string }) => React.ReactElement;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`group relative flex items-start gap-4 overflow-hidden rounded-2xl border p-5 transition-all hover:-translate-y-0.5 ${
        primary
          ? 'grain border-navy-800 bg-navy-900 text-white hover:shadow-[0_16px_40px_-16px_rgba(11,61,107,0.6)]'
          : 'border-line bg-white hover:border-navy-200 hover:shadow-[0_12px_32px_-16px_rgba(11,61,107,0.3)]'
      }`}
    >
      {primary && <span className="grid-plot absolute inset-0" />}
      <div
        className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          primary ? 'bg-white/10 ring-1 ring-white/15' : 'bg-navy-50 ring-1 ring-navy-100'
        }`}
      >
        <Icon className={`h-5 w-5 ${primary ? 'text-cosco-400' : 'text-navy-800'}`} />
      </div>
      <div className="relative min-w-0 flex-1">
        <p
          className={`font-display text-[15px] font-bold tracking-tight ${
            primary ? 'text-white' : 'text-navy-900'
          }`}
        >
          {title}
        </p>
        <p className={`mt-1 text-[12.5px] leading-relaxed ${primary ? 'text-white/55' : 'text-muted'}`}>
          {desc}
        </p>
      </div>
      <IconArrow
        className={`relative mt-1 h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1 ${
          primary ? 'text-white/50' : 'text-muted/50'
        }`}
      />
    </Link>
  );
}

export default function DashboardPage() {
  const user = getUser();
  const isAdmin = user?.role === 'ADMIN';
  const isSup = user?.role === 'SUPERVISOR' || isAdmin;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getSupervisorDashboard()
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hoy = new Date().toLocaleDateString('es-PE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const stats = data?.stats;
  const operations = data?.operations ?? [];
  const recent = data?.recent ?? [];

  return (
    <Shell>
      {/* ---------- encabezado ---------- */}
      <section className="rise mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted">
            Terminal multipropósito · Chancay
          </p>
          <h1 className="mt-2 font-display text-[30px] font-extrabold leading-none tracking-tight text-navy-900 sm:text-[36px]">
            Buenos días{user ? `, ${user.name}` : ''}
            <span className="text-cosco-500">.</span>
          </h1>
          <p className="mt-2 text-[13.5px] capitalize text-muted">{hoy}</p>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-cosco-500" />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
              {stats ? `${stats.activeShips} nave${stats.activeShips === 1 ? '' : 's'} en muelle` : '—'}
            </span>
          </div>
          <Link
            href={user?.role === 'TARJADOR' ? '/tarja' : '/operations'}
            className="group inline-flex items-center gap-2 rounded-lg bg-navy-800 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy-900"
          >
            {user?.role === 'TARJADOR' ? 'Nueva tarja' : 'Nueva operación'}
            <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* ---------- KPIs ---------- */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {(() => {
          const touched = (stats?.tarjadas ?? 0) + (stats?.enProceso ?? 0);
          const doneShare = stats && touched > 0 ? (stats.tarjadas / touched) * 100 : undefined;
          const inProgressShare = doneShare != null ? 100 - doneShare : undefined;
          const damageShare =
            stats && stats.tarjadas > 0 ? (stats.conDano / stats.tarjadas) * 100 : undefined;
          const trend = stats?.trend ?? [];
          return (
            <>
              <Kpi
                label="Unidades tarjadas"
                value={loading ? '—' : (stats?.tarjadas ?? 0)}
                tone="jade"
                Icon={IconCheck}
                pct={loading ? undefined : doneShare}
                series={trend.map((t) => t.tarjadas)}
                seriesLabel="Últimos 14 días"
                i={0}
              />
              <Kpi
                label="En proceso"
                value={loading ? '—' : (stats?.enProceso ?? 0)}
                tone="navy"
                Icon={IconClipboard}
                pct={loading ? undefined : inProgressShare}
                series={trend.map((t) => t.enProceso)}
                seriesLabel="Tarjas iniciadas / día"
                i={1}
              />
              <Kpi
                label="Con daño"
                value={loading ? '—' : (stats?.conDano ?? 0)}
                delta={damageShare != null ? `${damageShare.toFixed(1)}% del total` : undefined}
                tone="cosco"
                Icon={IconAlert}
                pct={loading ? undefined : damageShare}
                series={trend.map((t) => t.conDano)}
                seriesLabel="Últimos 14 días"
                i={2}
              />
              <Kpi
                label="Tiempo medio"
                value={loading ? '—' : formatDuration(stats?.avgDurationSeconds ?? 0)}
                unit="min"
                tone="ochre"
                Icon={IconClock}
                series={trend.map((t) => Math.round(t.avgDurationSeconds / 60))}
                seriesLabel="Minutos / día"
                i={3}
              />
            </>
          );
        })()}
      </section>

      {/* ---------- operaciones + actividad ---------- */}
      <section className="mt-6 grid gap-5 lg:grid-cols-3">
        {/* operaciones */}
        <div
          className="rise overflow-hidden rounded-2xl border border-line bg-white lg:col-span-2"
          style={{ animationDelay: '160ms' }}
        >
          <header className="flex items-center justify-between border-b border-line px-5 py-4">
            <div>
              <h2 className="font-display text-[15px] font-bold tracking-tight text-navy-900">
                Operaciones en curso
              </h2>
              <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                Avance por nave
              </p>
            </div>
            <Link
              href="/operations"
              className="group inline-flex items-center gap-1.5 text-[12px] font-semibold text-navy-700 hover:text-navy-900"
            >
              Ver todas
              <IconArrow className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </header>

          {!loading && operations.length === 0 && (
            <p className="px-5 py-6 text-[12.5px] text-muted">No hay operaciones activas.</p>
          )}

          <div className="divide-y divide-line">
            {operations.map((o, i) => {
              const total = o._count?.vehicles ?? 0;
              const done = o.doneVehicles ?? 0;
              const pct = total > 0 ? Math.round((done / total) * 100) : 0;
              return (
                <div key={o.code} className="group px-5 py-4 transition-colors hover:bg-navy-50/50">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_STYLE[o.status]}`}
                    />
                    <p className="font-display text-[14px] font-bold tracking-tight text-navy-900">
                      {o.shipName}
                    </p>
                    <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-muted">
                      {TYPE_LABEL[o.operationType] ?? o.operationType}
                    </span>
                    <span className="ml-auto font-mono text-[11px] text-muted">{o.code}</span>
                  </div>

                  <div className="mt-3 flex items-center gap-4">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-navy-50">
                      <div
                        className="sweep h-full rounded-full bg-gradient-to-r from-navy-800 to-navy-600"
                        style={{ width: `${pct}%`, animationDelay: `${240 + i * 90}ms` }}
                      />
                    </div>
                    <p className="tnum shrink-0 font-mono text-[11.5px] text-muted">
                      <span className="font-semibold text-navy-900">{done}</span> / {total}
                    </p>
                    <p className="tnum w-10 shrink-0 text-right font-display text-[13px] font-bold text-navy-800">
                      {pct}%
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* actividad */}
        <div
          className="rise overflow-hidden rounded-2xl border border-line bg-white"
          style={{ animationDelay: '220ms' }}
        >
          <header className="border-b border-line px-5 py-4">
            <h2 className="font-display text-[15px] font-bold tracking-tight text-navy-900">
              Actividad reciente
            </h2>
            <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Últimas tarjas
            </p>
          </header>

          {!loading && recent.length === 0 && (
            <p className="px-5 py-6 text-[12.5px] text-muted">Aún no hay tarjas registradas.</p>
          )}

          <ul className="divide-y divide-line">
            {recent.slice(0, 5).map((a) => {
              const tag = STATUS_TAG[a.status] ?? a.status;
              return (
                <li
                  key={a.id}
                  className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-navy-50/50"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[12px] font-medium text-navy-900">
                      {a.vehicle?.vin ?? '—'}
                    </p>
                    <p className="mt-0.5 truncate text-[11.5px] text-muted">
                      {a.tarjador?.initials ?? '—'} · hace {timeAgo(a.updatedAt)}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ${TAG_STYLE[tag] ?? ''}`}
                  >
                    {tag}
                  </span>
                </li>
              );
            })}
          </ul>

          {isSup && (
            <div className="border-t border-line px-5 py-3">
              <Link
                href="/supervisor"
                className="group inline-flex items-center gap-1.5 text-[12px] font-semibold text-navy-700 hover:text-navy-900"
              >
                Abrir supervisión
                <IconArrow className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ---------- accesos rápidos ---------- */}
      <section className="mt-8">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted">
            Accesos rápidos
          </h2>
          <span className="h-px flex-1 bg-line" />
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {user?.role === 'TARJADOR' && (
            <QuickCard
              primary
              href="/tarja"
              title="Nueva tarja"
              desc="Ingresa el VIN y registra accesorios y daños de la unidad."
              Icon={IconClipboard}
            />
          )}
          {isSup && (
            <QuickCard
              primary
              href="/supervisor"
              title="Supervisión"
              desc="Monitorea el avance en tiempo real y anula reportes."
              Icon={IconRadar}
            />
          )}
          {isSup && (
            <QuickCard
              href="/monitoreo"
              title="Monitoreo"
              desc="Avance del personal en vivo: VIN, tarjador y tiempo con semáforo."
              Icon={IconClock}
            />
          )}
          <QuickCard
            href="/operations"
            title="Operaciones"
            desc="Crea operaciones, carga el Excel de vehículos y sigue el avance."
            Icon={IconShip}
          />
          {isAdmin && (
            <QuickCard
              href="/accessories"
              title="Accesorios"
              desc="Administra el catálogo de accesorios del formulario de tarja."
              Icon={IconWrench}
            />
          )}
          {isAdmin && (
            <QuickCard
              href="/audit"
              title="Auditoría"
              desc="Registro de acciones: accesos, tarjas y anulaciones."
              Icon={IconShield}
            />
          )}
        </div>
      </section>
    </Shell>
  );
}
