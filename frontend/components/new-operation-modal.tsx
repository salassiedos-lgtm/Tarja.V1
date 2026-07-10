'use client';

import { useEffect, useState } from 'react';
import { createOperation } from '@/lib/api';
import { IconShip, IconArrow, IconClose, IconLayers } from '@/components/icons';

const TYPE_LABEL: Record<string, string> = {
  ROLL_ON_ROLL_OFF: 'RO-RO',
  DESCONSOLIDADO: 'Desconsolidado',
};

/**
 * Formulario "Nueva operación" del sistema (nave, tipo de descarga, arribo).
 * Se reutiliza en Operaciones y en el Administrador → Tareas.
 */
export default function NewOperationModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [code, setCode] = useState('');
  const [shipName, setShipName] = useState('');
  const [operationType, setOperationType] = useState('ROLL_ON_ROLL_OFF');
  const [operationDate, setOperationDate] = useState('');
  const [portDischarge, setPortDischarge] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await createOperation({
        code: code.trim(),
        shipName: shipName.trim(),
        operationType,
        operationDate: operationDate || undefined,
        portDischarge: portDischarge.trim() || undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo crear la operación');
    } finally {
      setSaving(false);
    }
  }

  const fieldCls =
    'w-full rounded-[11px] border-[1.5px] border-line bg-white px-3.5 py-2.5 text-[13.5px] text-ink outline-none transition-all placeholder:text-muted/60 focus:border-navy-700 focus:shadow-[0_0_0_3px_rgba(18,85,143,0.14)]';
  const labelCls = 'mb-1.5 block font-mono text-[10px] uppercase tracking-[0.14em] text-muted';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div className="absolute inset-0 bg-navy-950/50 backdrop-blur-[2px]" onClick={onClose} />
      <div className="rise relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-line bg-white shadow-[0_24px_60px_-20px_rgba(4,24,42,0.55)] sm:rounded-3xl">
        {/* cabecera Command Deck */}
        <div className="grain relative overflow-hidden bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 px-6 py-6">
          <span className="grid-plot absolute inset-0 opacity-70" />
          <span className="absolute -right-6 -top-10 h-32 w-32 rounded-full bg-navy-600/30 blur-3xl" />
          <IconShip className="absolute -bottom-5 right-3 h-28 w-28 text-white/[0.05]" />
          <div className="relative flex items-start justify-between gap-4">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-navy-200">
                Registro de operación
              </p>
              <h2 className="mt-1.5 font-display text-[22px] font-extrabold leading-none tracking-tight text-white">
                Nueva operación<span className="text-cosco-500">.</span>
              </h2>
              <p className="mt-2 text-[12px] text-white/55">
                Nave, tipo de descarga y datos del arribo.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white/70 transition-all hover:bg-white/10 hover:text-white active:scale-90"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
          <span className="absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-cosco-500 via-cosco-400/60 to-transparent" />
        </div>

        {/* formulario */}
        <form onSubmit={submit} className="thin-scroll overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Código</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="OP-001"
                required
                className={`${fieldCls} font-mono`}
              />
            </div>
            <div>
              <label className={labelCls}>Nave</label>
              <input
                value={shipName}
                onChange={(e) => setShipName(e.target.value)}
                placeholder="MV Chancay Star"
                required
                className={fieldCls}
              />
            </div>
          </div>

          {/* tipo — control segmentado */}
          <div className="mt-4">
            <label className={labelCls}>Tipo de operación</label>
            <div className="grid grid-cols-2 gap-2 rounded-[13px] border-[1.5px] border-line bg-canvas p-1.5">
              {(['ROLL_ON_ROLL_OFF', 'DESCONSOLIDADO'] as const).map((t) => {
                const active = operationType === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setOperationType(t)}
                    className={`flex items-center justify-center gap-2 rounded-[9px] px-3 py-2.5 text-[12.5px] font-semibold transition-all ${
                      active
                        ? 'bg-navy-800 text-white shadow-[0_6px_16px_-8px_rgba(11,61,107,0.6)]'
                        : 'text-muted hover:bg-white hover:text-navy-800'
                    }`}
                  >
                    {t === 'ROLL_ON_ROLL_OFF' ? (
                      <IconShip className="h-4 w-4" />
                    ) : (
                      <IconLayers className="h-4 w-4" />
                    )}
                    {TYPE_LABEL[t]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Fecha de arribo</label>
              <input
                type="date"
                value={operationDate}
                onChange={(e) => setOperationDate(e.target.value)}
                className={fieldCls}
              />
            </div>
            <div>
              <label className={labelCls}>Puerto de descarga</label>
              <input
                value={portDischarge}
                onChange={(e) => setPortDischarge(e.target.value)}
                placeholder="Chancay"
                className={fieldCls}
              />
            </div>
          </div>

          {error && (
            <p className="mt-4 rounded-lg bg-cosco-50 px-3 py-2 text-[12.5px] font-medium text-cosco-600">
              {error}
            </p>
          )}

          <div className="mt-6 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="rounded-[11px] px-4 py-2.5 text-[13px] font-semibold text-muted transition-colors hover:bg-canvas hover:text-navy-900"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="group inline-flex items-center gap-2 rounded-[11px] bg-navy-800 px-5 py-2.5 text-[13px] font-semibold text-white transition-all hover:bg-navy-900 disabled:opacity-60"
            >
              {saving ? 'Guardando…' : 'Crear operación'}
              {!saving && (
                <IconArrow className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
