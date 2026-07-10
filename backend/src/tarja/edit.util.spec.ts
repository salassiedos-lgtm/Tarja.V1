import {
  REOPEN_WINDOW_MIN,
  reopenSecondsLeft,
  canEnterEdit,
  snapshotOf,
  computeEditDiff,
  type TarjaSnapshot,
} from './edit.util';

const base = {
  status: 'FINALIZADO' as const,
  finishedAt: new Date('2026-07-10T12:00:00Z'),
  tarjadorId: 5,
};

describe('reopenSecondsLeft', () => {
  it('devuelve segundos restantes dentro de la ventana', () => {
    const now = new Date('2026-07-10T12:04:00Z'); // 4 min después
    expect(reopenSecondsLeft(base, now)).toBe(REOPEN_WINDOW_MIN * 60 - 240);
  });
  it('0 si venció', () => {
    expect(reopenSecondsLeft(base, new Date('2026-07-10T12:20:00Z'))).toBe(0);
  });
  it('0 si no está finalizada', () => {
    expect(reopenSecondsLeft({ ...base, status: 'BORRADOR' }, new Date())).toBe(0);
  });
});

describe('canEnterEdit', () => {
  const now = new Date('2026-07-10T12:04:00Z'); // dentro de ventana
  const late = new Date('2026-07-10T12:20:00Z'); // fuera de ventana
  it('bloquea si no es el dueño', () => {
    expect(canEnterEdit(base, 9, false, now)).toEqual({ allowed: false, code: 'NOT_OWNER' });
  });
  it('bloquea si no está finalizada', () => {
    expect(canEnterEdit({ ...base, status: 'ANULADO' }, 5, false, now).code).toBe('NOT_FINALIZED');
  });
  it('permite al dueño dentro de la ventana', () => {
    expect(canEnterEdit(base, 5, false, now)).toEqual({ allowed: true });
  });
  it('permite al dueño fuera de ventana si hay solicitud aprobada', () => {
    expect(canEnterEdit(base, 5, true, late)).toEqual({ allowed: true });
  });
  it('exige autorización al dueño fuera de ventana sin aprobación', () => {
    expect(canEnterEdit(base, 5, false, late)).toEqual({ allowed: false, code: 'REQUIERE_AUTORIZACION' });
  });
});

describe('snapshotOf / computeEditDiff', () => {
  const report = {
    hasDamage: false,
    damageSource: null,
    damageOperation: null,
    damageAffects: null,
    damageMoment: null,
    damageMomentOther: null,
    details: null,
    tarjadorInitials: 'JIR',
    accessories: [
      { hasAccessory: true, quantity: 1, accessory: { name: 'Radio' } },
      { hasAccessory: true, quantity: 1, accessory: { name: 'Llaves del vehiculo' } },
    ],
    damages: [] as { description: string }[],
  };

  it('snapshotOf ordena accesorios y daños de forma estable', () => {
    const snap = snapshotOf(report);
    expect(snap.accessories.map((a) => a.name)).toEqual(['Llaves del vehiculo', 'Radio']);
    expect(snap.hasDamage).toBe(false);
  });

  it('sin cambios: changed=false', () => {
    const before = snapshotOf(report);
    const after = snapshotOf(report);
    expect(computeEditDiff(before, after).changed).toBe(false);
  });

  it('detecta daño, accesorio y cantidad', () => {
    const before = snapshotOf(report);
    const after = snapshotOf({
      ...report,
      hasDamage: true,
      damageSource: 'ENCONTRADO',
      accessories: [
        { hasAccessory: false, quantity: 0, accessory: { name: 'Radio' } },
        { hasAccessory: true, quantity: 2, accessory: { name: 'Llaves del vehiculo' } },
      ],
      damages: [{ description: 'Rayón puerta' }],
    });
    const diff = computeEditDiff(before, after);
    expect(diff.changed).toBe(true);
    expect(diff.summary).toContain('Daño No→Sí');
    expect(diff.summary).toContain('Radio Sí→No');
    expect(diff.summary).toContain('Llaves del vehiculo ×1→×2');
    expect(diff.summary).toContain("+daño 'Rayón puerta'");
    expect(JSON.parse(diff.oldJson).hasDamage).toBe(false);
    expect(JSON.parse(diff.newJson).hasDamage).toBe(true);
  });
});
