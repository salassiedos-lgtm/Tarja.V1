/** Minutos de la ventana de edición libre del dueño tras finalizar. */
export const REOPEN_WINDOW_MIN = 10;

type ReportStateForEdit = {
  status: string;
  finishedAt: Date | null;
  tarjadorId: number;
};

/** Segundos restantes de la ventana de 10 min desde finishedAt. 0 si venció o no aplica. */
export function reopenSecondsLeft(
  report: { status: string; finishedAt: Date | null },
  now: Date = new Date(),
): number {
  if (report.status !== 'FINALIZADO' && report.status !== 'CON_DANO') return 0;
  if (!report.finishedAt) return 0;
  const elapsed = (now.getTime() - report.finishedAt.getTime()) / 1000;
  return Math.max(0, Math.round(REOPEN_WINDOW_MIN * 60 - elapsed));
}

export type EnterEditResult =
  | { allowed: true }
  | { allowed: false; code: 'NOT_OWNER' | 'NOT_FINALIZED' | 'REQUIERE_AUTORIZACION' };

/** Decide si el usuario puede entrar a editar la tarja. Pura y testeable. */
export function canEnterEdit(
  report: ReportStateForEdit,
  userId: number,
  hasApprovedRequest: boolean,
  now: Date = new Date(),
): EnterEditResult {
  if (report.tarjadorId !== userId) return { allowed: false, code: 'NOT_OWNER' };
  if (report.status !== 'FINALIZADO' && report.status !== 'CON_DANO') {
    return { allowed: false, code: 'NOT_FINALIZED' };
  }
  if (reopenSecondsLeft(report, now) > 0 || hasApprovedRequest) return { allowed: true };
  return { allowed: false, code: 'REQUIERE_AUTORIZACION' };
}

export interface TarjaSnapshot {
  hasDamage: boolean;
  damageSource: string | null;
  damageOperation: string | null;
  damageAffects: string | null;
  damageMoment: string | null;
  damageMomentOther: string | null;
  details: string | null;
  tarjadorInitials: string | null;
  accessories: { name: string; hasAccessory: boolean; quantity: number }[];
  damages: string[];
}

type ReportWithRelations = {
  hasDamage: boolean;
  damageSource: string | null;
  damageOperation: string | null;
  damageAffects: string | null;
  damageMoment: string | null;
  damageMomentOther: string | null;
  details: string | null;
  tarjadorInitials: string | null;
  accessories: { hasAccessory: boolean; quantity: number; accessory: { name: string } }[];
  damages: { description: string }[];
};

/** Serializa el estado editable de un reporte, con orden estable para comparar. */
export function snapshotOf(r: ReportWithRelations): TarjaSnapshot {
  return {
    hasDamage: r.hasDamage,
    damageSource: r.damageSource,
    damageOperation: r.damageOperation,
    damageAffects: r.damageAffects,
    damageMoment: r.damageMoment,
    damageMomentOther: r.damageMomentOther,
    details: r.details,
    tarjadorInitials: r.tarjadorInitials,
    accessories: r.accessories
      .map((a) => ({ name: a.accessory.name, hasAccessory: a.hasAccessory, quantity: a.quantity }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    damages: r.damages.map((d) => d.description).sort((a, b) => a.localeCompare(b)),
  };
}

export interface EditDiff {
  changed: boolean;
  summary: string;
  oldJson: string;
  newJson: string;
}

const yn = (b: boolean) => (b ? 'Sí' : 'No');

/** Compara dos snapshots y produce un resumen legible + JSON antes/después. */
export function computeEditDiff(before: TarjaSnapshot, after: TarjaSnapshot): EditDiff {
  const parts: string[] = [];

  if (before.hasDamage !== after.hasDamage) {
    const extra = after.hasDamage && after.damageSource ? ` (${after.damageSource})` : '';
    parts.push(`Daño ${yn(before.hasDamage)}→${yn(after.hasDamage)}${extra}`);
  }
  if ((before.damageOperation ?? '') !== (after.damageOperation ?? ''))
    parts.push(`operación de daño ${before.damageOperation ?? '—'}→${after.damageOperation ?? '—'}`);
  if ((before.damageAffects ?? '') !== (after.damageAffects ?? ''))
    parts.push(`afectación ${before.damageAffects ?? '—'}→${after.damageAffects ?? '—'}`);
  if ((before.damageMoment ?? '') !== (after.damageMoment ?? ''))
    parts.push(`momento de daño ${before.damageMoment ?? '—'}→${after.damageMoment ?? '—'}`);
  if ((before.damageMomentOther ?? '') !== (after.damageMomentOther ?? ''))
    parts.push('detalle de momento modificado');
  if ((before.details ?? '') !== (after.details ?? '')) parts.push('detalles modificados');
  if ((before.tarjadorInitials ?? '') !== (after.tarjadorInitials ?? '')) parts.push('iniciales modificadas');

  const beforeAcc = new Map(before.accessories.map((a) => [a.name, a]));
  for (const a of after.accessories) {
    const b = beforeAcc.get(a.name);
    if (!b) continue;
    if (b.hasAccessory !== a.hasAccessory) parts.push(`${a.name} ${yn(b.hasAccessory)}→${yn(a.hasAccessory)}`);
    else if (b.quantity !== a.quantity) parts.push(`${a.name} ×${b.quantity}→×${a.quantity}`);
  }

  const beforeDmg = new Set(before.damages);
  const afterDmg = new Set(after.damages);
  for (const d of after.damages) if (!beforeDmg.has(d)) parts.push(`+daño '${d}'`);
  for (const d of before.damages) if (!afterDmg.has(d)) parts.push(`-daño '${d}'`);

  return {
    changed: parts.length > 0,
    summary: parts.join('; '),
    oldJson: JSON.stringify(before),
    newJson: JSON.stringify(after),
  };
}
