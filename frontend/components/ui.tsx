'use client';

import type { ReactNode } from 'react';
import { IconAlert, IconCheck } from '@/components/icons';

/* ------------------------------------------------------------------ *
 * Botón
 * ------------------------------------------------------------------ */

type ButtonProps = {
  children: ReactNode;
  variant?: 'primary' | 'outline' | 'ghost' | 'danger';
  size?: 'md' | 'lg';
  full?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>;

const BTN_VARIANT: Record<string, string> = {
  primary:
    'bg-navy-800 text-white shadow-[0_10px_28px_-12px_rgba(11,61,107,0.75)] hover:bg-navy-900 active:scale-[0.985]',
  outline:
    'border border-line bg-white text-navy-900 hover:border-navy-200 hover:bg-navy-50 active:scale-[0.985]',
  ghost: 'text-navy-700 hover:bg-navy-50 active:scale-[0.985]',
  danger:
    'bg-cosco-500 text-white shadow-[0_10px_28px_-12px_rgba(200,16,46,0.75)] hover:bg-cosco-600 active:scale-[0.985]',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  full,
  className = '',
  ...rest
}: ButtonProps) {
  const sizing = size === 'lg' ? 'h-13 min-h-[52px] px-6 text-[15px]' : 'h-11 px-4 text-[13.5px]';
  return (
    <button
      {...rest}
      className={`tap ring-focus inline-flex items-center justify-center gap-2 rounded-xl font-semibold tracking-tight transition-all duration-150 disabled:pointer-events-none disabled:opacity-55 ${sizing} ${
        BTN_VARIANT[variant]
      } ${full ? 'w-full' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Tarjeta de sección numerada
 * ------------------------------------------------------------------ */

export function SectionCard({
  step,
  title,
  hint,
  action,
  children,
  delay = 0,
  tone = 'navy',
}: {
  step: number | string;
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  delay?: number;
  tone?: 'navy' | 'cosco';
}) {
  const chip =
    tone === 'cosco'
      ? 'bg-cosco-500/10 text-cosco-600 ring-cosco-600/20'
      : 'bg-navy-800 text-white ring-navy-900/10';
  return (
    <section
      className="rise overflow-hidden rounded-2xl border border-line bg-white"
      style={{ animationDelay: `${delay}ms` }}
    >
      <header className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
        <span
          className={`grid h-7 w-7 shrink-0 place-items-center rounded-lg font-mono text-[11.5px] font-bold ring-1 ${chip}`}
        >
          {step}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-[14.5px] font-bold tracking-tight text-navy-900">
            {title}
          </h2>
          {hint && (
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{hint}</p>
          )}
        </div>
        {action}
      </header>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Etiqueta + campo de texto
 * ------------------------------------------------------------------ */

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
    >
      {children}
    </label>
  );
}

/* ------------------------------------------------------------------ *
 * Grupo de opciones — reemplaza <select> nativo.
 * Todas las opciones visibles: menos toques, cero menús del sistema.
 * ------------------------------------------------------------------ */

export function OptionGroup({
  label,
  value,
  onChange,
  opts,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  opts: readonly (readonly [string, string])[];
  required?: boolean;
}) {
  const missing = required && !value;
  return (
    <fieldset>
      <legend className="mb-2 flex items-center gap-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
        {label}
        {missing && <span className="h-1 w-1 rounded-full bg-cosco-500" aria-hidden />}
      </legend>
      <div className="flex flex-wrap gap-2">
        {opts.map(([v, l]) => {
          const on = value === v;
          return (
            <button
              key={v}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? '' : v)}
              className={`tap ring-focus inline-flex min-h-[42px] items-center gap-1.5 rounded-xl border px-3.5 text-[13px] font-medium transition-all duration-150 active:scale-[0.97] ${
                on
                  ? 'border-navy-700 bg-navy-700/[0.07] font-semibold text-navy-800'
                  : 'border-line bg-white text-ink/75 hover:border-navy-200 hover:bg-navy-50'
              }`}
            >
              {on && <IconCheck className="h-3.5 w-3.5 shrink-0 text-navy-700" strokeWidth={2.6} />}
              {l}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/* ------------------------------------------------------------------ *
 * Interruptor
 * ------------------------------------------------------------------ */

export function Toggle({
  checked,
  onChange,
  label,
  hint,
  tone = 'navy',
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
  tone?: 'navy' | 'cosco';
}) {
  const onBg = tone === 'cosco' ? 'bg-cosco-500' : 'bg-navy-700';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="tap ring-focus flex w-full items-center gap-3.5 rounded-xl text-left"
    >
      <span
        className={`relative grid h-[30px] w-[52px] shrink-0 rounded-full transition-colors duration-200 ${
          checked ? onBg : 'bg-line'
        }`}
      >
        <span
          className={`absolute top-[3px] h-6 w-6 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,0.22)] transition-all duration-200 ease-out ${
            checked ? 'left-[25px]' : 'left-[3px]'
          }`}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-navy-900">{label}</span>
        {hint && <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">{hint}</span>}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Contador de cantidad — botones de 40px, usable con guantes
 * ------------------------------------------------------------------ */

export function QtyStepper({
  value,
  onChange,
  min = 1,
  max = 99,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
}) {
  const step = (d: number) => onChange(Math.min(max, Math.max(min, value + d)));
  return (
    <div
      className="flex items-center gap-0.5 rounded-xl border border-line bg-white p-0.5"
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        aria-label="Disminuir"
        onClick={() => step(-1)}
        disabled={value <= min}
        className="tap ring-focus grid h-9 w-9 place-items-center rounded-lg text-navy-800 transition-colors hover:bg-navy-50 disabled:opacity-30 active:scale-90"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
          <path d="M5 12h14" />
        </svg>
      </button>
      <span className="tnum w-7 text-center font-mono text-[14px] font-bold text-navy-900">
        {value}
      </span>
      <button
        type="button"
        aria-label="Aumentar"
        onClick={() => step(1)}
        disabled={value >= max}
        className="tap ring-focus grid h-9 w-9 place-items-center rounded-lg text-navy-800 transition-colors hover:bg-navy-50 disabled:opacity-30 active:scale-90"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Insignia de estado
 * ------------------------------------------------------------------ */

const BADGE_TONE: Record<string, string> = {
  jade: 'bg-jade-50 text-jade-600 ring-jade-600/20',
  cosco: 'bg-cosco-50 text-cosco-600 ring-cosco-600/20',
  ochre: 'bg-ochre-50 text-ochre-600 ring-ochre-600/20',
  navy: 'bg-navy-50 text-navy-700 ring-navy-700/20',
  muted: 'bg-canvas text-muted ring-line',
};

export function Badge({
  children,
  tone = 'navy',
  dot,
}: {
  children: ReactNode;
  tone?: keyof typeof BADGE_TONE;
  dot?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-semibold ring-1 ring-inset ${BADGE_TONE[tone]}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ *
 * Alerta de error
 * ------------------------------------------------------------------ */

export function Alert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="shake flex items-start gap-2.5 rounded-xl border border-cosco-500/25 bg-cosco-50 px-3.5 py-3 text-[13px] font-medium text-cosco-700"
    >
      <IconAlert className="mt-px h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Barra de acción fija (móvil) — respeta la barra de gestos
 * ------------------------------------------------------------------ */

export function StickyActions({ children }: { children: ReactNode }) {
  return (
    <div className="safe-b sticky bottom-0 z-20 -mx-4 mt-6 border-t border-line bg-white/85 px-4 pt-3.5 backdrop-blur-xl sm:-mx-5 sm:px-5">
      {children}
    </div>
  );
}
