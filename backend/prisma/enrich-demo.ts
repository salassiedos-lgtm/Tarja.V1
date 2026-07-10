import {
  PrismaClient,
  RoleName,
  WorkShift,
  VehicleStatus,
  ReportStatus,
  DamageSource,
  DamageOperation,
  DamageAffects,
  DamageMoment,
} from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Generador de ACTIVIDAD de demostración sobre las operaciones YA existentes
// (idempotente). Pensado para poblar todos los apartados de la maqueta cuando
// la base tiene vehículos importados pero cero trabajo de tarja:
//   · equipo de tarjadores            → nombres reales en tablero/auditoría
//   · tarjas de varios días atrás      → Reportes por turno + tendencia 14 días
//   · tarjas del turno de hoy          → Monitoreo en vivo (finalizadas)
//   · tarjas en curso (< 10 min)       → Monitoreo en vivo (personal activo)
//   · workShift/reportDate, openedAt,  → campos que dejaban secciones vacías
//     closedAt, lastLoginAt, contenedor
//
// Converge a CAP_PER_OP tarjas finalizadas por operación: correrlo de nuevo NO
// duplica, solo completa lo que falte. No toca importaciones ya registradas.
//
// USO (apuntando a la BD que usa el frontend — el Postgres de Docker en :5433):
//   DATABASE_URL="postgresql://tarja:tarja_local_dev@localhost:5433/tarja?schema=public" \
//     npx ts-node --transpile-only prisma/enrich-demo.ts
// ---------------------------------------------------------------------------

const CAP_PER_OP = 45; // tarjas finalizadas objetivo por operación
const HISTORY_DAYS = 6; // días hacia atrás sobre los que repartir el historial
const TARGET_INPROGRESS = 3; // tarjas "en curso" para el tablero en vivo

const TARJADORES = [
  { username: 'j.injante', name: 'Jhosep', lastname: 'Injante Rojas', initials: 'JIR' },
  { username: 'k.quispe', name: 'Katherine', lastname: 'Quispe Vargas', initials: 'KQV' },
  { username: 'm.salazar', name: 'Marco', lastname: 'Salazar Neyra', initials: 'MSN' },
  { username: 'l.fernandez', name: 'Luis', lastname: 'Fernandez Chumpitaz', initials: 'LFC' },
  { username: 'r.condori', name: 'Rosa', lastname: 'Condori Apaza', initials: 'RCA' },
];

const ACCESSORIES = [
  'Radio', 'Reloj', 'Encendedor', 'Ceniceros', 'Espejos interiores', 'Espejos laterales',
  'Antena', 'Pisos adicionales', 'Plumillas', 'Tapa de llanta', 'Llanta de repuesto',
  'Gata', 'Herramientas', 'Llaves del vehiculo', 'Catalogos', 'Relays',
];

const DAMAGE_DESCRIPTIONS = [
  'Rayón profundo en puerta delantera derecha, aprox. 15 cm',
  'Abolladura en parachoques trasero, lado izquierdo',
  'Espejo lateral derecho fisurado',
  'Rueda delantera izquierda con llanta rozada',
  'Parabrisas con astilla en esquina superior derecha',
  'Faro delantero izquierdo con grieta',
  'Techo con marca de golpe, sin perforación',
];

/** Turno + fecha de reporte en hora de Lima (UTC-5). Copia de shift.util. */
function limaShift(now: Date): { reportDate: Date; workShift: WorkShift } {
  const lima = new Date(now.getTime() - 5 * 3600 * 1000);
  const h = lima.getUTCHours();
  let workShift: WorkShift;
  let dayOffset = 0;
  if (h >= 7 && h < 19) workShift = WorkShift.DIA;
  else {
    workShift = WorkShift.NOCHE;
    if (h < 7) dayOffset = -1;
  }
  const day = new Date(lima);
  day.setUTCDate(day.getUTCDate() + dayOffset);
  const reportDate = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  return { reportDate, workShift };
}

/** Inicio (UTC) del turno vigente. */
function shiftStartUtc(now: Date): Date {
  const { reportDate, workShift } = limaShift(now);
  const offsetH = workShift === WorkShift.DIA ? 12 : 24;
  return new Date(reportDate.getTime() + offsetH * 3600 * 1000);
}

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function shuffle<T>(arr: T[]): T[] {
  const c = [...arr];
  for (let i = c.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [c[i], c[j]] = [c[j], c[i]];
  }
  return c;
}

async function nextReportCode(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ nextval: bigint }[]>(
    `SELECT nextval('tarja_report_code_seq') AS nextval`,
  );
  return rows[0].nextval.toString().padStart(6, '0');
}

/** finishedAt para un desfase de días: hoy → dentro del turno vigente ya
 *  transcurrido; días previos → hora de Lima mayormente diurna. */
function finishedAtFor(dayOffset: number, now: Date): Date {
  if (dayOffset === 0) {
    const start = shiftStartUtc(now).getTime();
    const ceil = now.getTime() - 3 * 60 * 1000;
    if (ceil <= start + 5 * 60 * 1000) return new Date(start + 5 * 60 * 1000);
    return new Date(randInt(start + 5 * 60 * 1000, ceil));
  }
  const lima = new Date(now.getTime() - 5 * 3600 * 1000);
  lima.setUTCDate(lima.getUTCDate() - dayOffset);
  const hour = Math.random() < 0.75 ? randInt(8, 17) : randInt(20, 23);
  const limaTs = Date.UTC(lima.getUTCFullYear(), lima.getUTCMonth(), lima.getUTCDate(), hour, randInt(0, 59), 0);
  return new Date(limaTs + 5 * 3600 * 1000); // Lima → UTC
}

async function main() {
  const now = new Date();
  const target = process.env.DATABASE_URL?.replace(/:[^:@/]+@/, ':****@');
  console.log(`Base de datos objetivo: ${target}\n`);

  // ── Roles + equipo de tarjadores ─────────────────────────────────────────
  for (const name of ['ADMIN', 'SUPERVISOR', 'TARJADOR'] as RoleName[]) {
    await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }
  const tarjadorRole = await prisma.role.findUniqueOrThrow({ where: { name: 'TARJADOR' } });
  const passwordHash = await bcrypt.hash('Tarja123!', 10);
  for (const t of TARJADORES) {
    await prisma.user.upsert({
      where: { username: t.username },
      update: { initials: t.initials },
      create: {
        name: t.name,
        lastname: t.lastname,
        username: t.username,
        email: `${t.username}@cspcp.local`,
        passwordHash,
        initials: t.initials,
        roleId: tarjadorRole.id,
        lastLoginAt: new Date(now.getTime() - randInt(5, 300) * 60 * 1000),
      },
    });
  }
  let tarjadores = await prisma.user.findMany({ where: { role: { name: 'TARJADOR' }, initials: { not: null } } });
  if (tarjadores.length < 3) tarjadores = await prisma.user.findMany({ where: { role: { name: 'TARJADOR' } } });
  const supervisor = await prisma.user.findFirst({ where: { role: { name: 'SUPERVISOR' } } });
  console.log(`✓ Equipo: ${tarjadores.length} tarjadores`);

  // ── Accesorios (crea el catálogo base si falta) ──────────────────────────
  let accessories = await prisma.accessory.findMany({ where: { isActive: true } });
  if (accessories.length === 0) {
    for (let i = 0; i < ACCESSORIES.length; i++) {
      await prisma.accessory.upsert({
        where: { name: ACCESSORIES[i] },
        update: {},
        create: { name: ACCESSORIES[i], sortOrder: i + 1 },
      });
    }
    accessories = await prisma.accessory.findMany({ where: { isActive: true } });
  }
  console.log(`✓ Accesorios: ${accessories.length}`);

  // ── Apertura/cierre de lotes + último acceso de usuarios ─────────────────
  const ops = await prisma.operation.findMany({ orderBy: { id: 'asc' }, include: { ship: true } });
  for (const o of ops) {
    const data: { openedAt?: Date; closedAt?: Date } = {};
    if (!o.openedAt) {
      const d = new Date(o.operationDate ?? o.createdAt);
      data.openedAt = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 12, 0, 0));
    }
    if (o.status === 'CERRADA' && !o.closedAt) {
      const ref = o.openedAt ?? data.openedAt ?? now;
      data.closedAt = new Date(ref.getTime() + randInt(1, 3) * 24 * 3600 * 1000);
    }
    if (Object.keys(data).length) await prisma.operation.update({ where: { id: o.id }, data });
  }
  const noLogin = await prisma.user.findMany({ where: { lastLoginAt: null }, select: { id: true } });
  for (const u of noLogin) {
    await prisma.user.update({
      where: { id: u.id },
      data: { lastLoginAt: new Date(now.getTime() - randInt(1, 96) * 3600 * 1000) },
    });
  }
  console.log(`✓ Apertura/cierre y último acceso completados`);

  // ── Contenedores en desconsolidados sin número (vista CFS) ───────────────
  const CONTAINERS = ['COSU6502185840', 'TGHU2938471', 'MSKU7712043', 'TCLU8890124', 'FCIU4471822'];
  for (const o of ops.filter((x) => x.operationType === 'DESCONSOLIDADO')) {
    const vs = await prisma.vehicle.findMany({
      where: { operationId: o.id, containerNumber: null },
      select: { id: true },
      take: 60,
    });
    if (!vs.length) continue;
    const chosen = shuffle(CONTAINERS).slice(0, 3);
    for (let i = 0; i < vs.length; i++) {
      await prisma.vehicle.update({
        where: { id: vs[i].id },
        data: { containerNumber: chosen[i % chosen.length] },
      });
    }
    console.log(`✓ Contenedor asignado a ${vs.length} vehículos de ${o.code}`);
  }

  // ── Actividad de tarja por operación (historial + hoy) ───────────────────
  const activeOps = ops.filter((o) => o.status === 'ACTIVA' || o.status === 'PAUSADA');
  let totalFinished = 0;
  let totalToday = 0;
  const auditRows: {
    userId: number; username: string; role: string; module: string; action: string; description: string; createdAt: Date;
  }[] = [];
  const durations = [190, 240, 300, 360, 430, 520, 610, 700, 820]; // mezcla para el semáforo

  for (const op of activeOps) {
    const existing = await prisma.tarjaReport.count({
      where: { operationId: op.id, status: { in: ['FINALIZADO', 'CON_DANO'] } },
    });
    const need = Math.max(0, CAP_PER_OP - existing);
    if (need === 0) continue;

    const pend = await prisma.vehicle.findMany({
      where: { operationId: op.id, status: 'PENDIENTE', billOfLadingId: { not: null } },
      orderBy: { id: 'asc' },
      take: need,
      select: { id: true, vin: true, billOfLadingId: true },
    });

    for (let i = 0; i < pend.length; i++) {
      const v = pend[i];
      const t = tarjadores[i % tarjadores.length];
      const dur = durations[i % durations.length];
      const dayOffset = i % (HISTORY_DAYS + 1); // 0..HISTORY_DAYS (0 = hoy)
      const finishedAt = finishedAtFor(dayOffset, now);
      const startedAt = new Date(finishedAt.getTime() - dur * 1000);
      const hasDamage = i % 6 === 0;
      const reportStatus: ReportStatus = hasDamage ? 'CON_DANO' : 'FINALIZADO';
      const { reportDate, workShift } = limaShift(finishedAt);
      const code = await nextReportCode();

      const report = await prisma.tarjaReport.create({
        data: {
          reportCode: code,
          operationId: op.id,
          vehicleId: v.id,
          billOfLadingId: v.billOfLadingId,
          tarjadorId: t.id,
          startedAt,
          finishedAt,
          durationSeconds: dur,
          hasDamage,
          status: reportStatus,
          reportDate,
          workShift,
          tarjadorInitials: t.initials ?? undefined,
          ...(hasDamage
            ? {
                damageSource: pick<DamageSource>(['CAUSADO', 'ENCONTRADO']),
                damageOperation: pick<DamageOperation>(['DESCARGA', 'EMBARQUE', 'TRANSITO', 'REESTIBA']),
                damageAffects: pick<DamageAffects>(['CARGA_CHANCAY', 'CARGA_TRANSITO']),
                damageMoment: pick<DamageMoment>(['ANTES_DESCARGA', 'DURANTE_DESCARGA', 'POSTERIOR_DESCARGA']),
                details: 'Novedad registrada durante inspección visual de la unidad.',
              }
            : {}),
        },
      });
      await prisma.vehicle.update({
        where: { id: v.id },
        data: { status: (hasDamage ? 'OBSERVADO' : 'TARJADO') as VehicleStatus, currentReportId: report.id },
      });
      await prisma.tarjaReportAccessory.createMany({
        data: accessories.map((acc) => {
          const has = Math.random() > 0.08;
          return {
            reportId: report.id,
            accessoryId: acc.id,
            hasAccessory: has,
            quantity: has ? (acc.name.toLowerCase().includes('llave') ? randInt(1, 2) : 1) : 0,
          };
        }),
      });
      if (hasDamage) {
        for (const desc of shuffle(DAMAGE_DESCRIPTIONS).slice(0, randInt(1, 2))) {
          await prisma.tarjaReportDamage.create({ data: { reportId: report.id, description: desc } });
        }
      }
      if (dayOffset <= 1 || Math.random() < 0.25) {
        auditRows.push({
          userId: t.id, username: t.username, role: 'TARJADOR', module: 'tarja', action: 'FINISH',
          description: `Vehiculo ${v.vin} → ${reportStatus} (reporte ${code})`, createdAt: finishedAt,
        });
      }
      totalFinished++;
      if (dayOffset === 0) totalToday++;
    }
    console.log(`✓ ${op.code} (${op.ship.name}): ${pend.length} tarjas finalizadas generadas`);
  }

  // ── Tarjas EN CURSO para el tablero en vivo ──────────────────────────────
  // El cron autoRelease del backend descarta borradores con > 15 min; por eso
  // arrancan hace pocos minutos y usan tarjadores que no estén ya activos.
  const activeIds = new Set(
    (await prisma.tarjaReport.findMany({ where: { status: 'BORRADOR', finishedAt: null }, select: { tarjadorId: true } })).map((r) => r.tarjadorId),
  );
  const borrCount = await prisma.tarjaReport.count({ where: { status: 'BORRADOR', finishedAt: null, startedAt: { not: null } } });
  const needInProgress = Math.max(0, TARGET_INPROGRESS - borrCount);
  const freePool = tarjadores.filter((t) => !activeIds.has(t.id));
  const inProgressPend = await prisma.vehicle.findMany({
    where: { status: 'PENDIENTE', operation: { status: { in: ['ACTIVA', 'PAUSADA'] } }, billOfLadingId: { not: null } },
    orderBy: { id: 'desc' },
    take: needInProgress,
    select: { id: true, vin: true, operationId: true, billOfLadingId: true },
  });
  let createdInProgress = 0;
  for (let i = 0; i < inProgressPend.length; i++) {
    const v = inProgressPend[i];
    const pool = freePool.length ? freePool : tarjadores;
    const t = pool[i % pool.length];
    const startedAt = new Date(now.getTime() - (2 + i * 3) * 60 * 1000);
    const code = await nextReportCode();
    const report = await prisma.tarjaReport.create({
      data: {
        reportCode: code, operationId: v.operationId, vehicleId: v.id, billOfLadingId: v.billOfLadingId,
        tarjadorId: t.id, startedAt, status: 'BORRADOR', tarjadorInitials: t.initials ?? undefined,
      },
    });
    await prisma.vehicle.update({
      where: { id: v.id },
      data: { status: 'EN_PROCESO' as VehicleStatus, currentReportId: report.id, lockedById: t.id, lockedAt: startedAt },
    });
    auditRows.push({
      userId: t.id, username: t.username, role: 'TARJADOR', module: 'tarja', action: 'START',
      description: `Vehiculo ${v.vin} → EN_PROCESO (reporte ${code})`, createdAt: startedAt,
    });
    createdInProgress++;
  }

  // ── Auditoría: logins de hoy + confirmaciones de importación ──────────────
  const usedToday = new Set(auditRows.filter((a) => a.createdAt.getTime() > shiftStartUtc(now).getTime()).map((a) => a.userId));
  for (const uid of usedToday) {
    const t = tarjadores.find((x) => x.id === uid);
    if (!t) continue;
    auditRows.push({
      userId: t.id, username: t.username, role: 'TARJADOR', module: 'auth', action: 'LOGIN',
      description: `Inicio de sesion de ${t.username}`, createdAt: new Date(shiftStartUtc(now).getTime() + randInt(1, 30) * 60 * 1000),
    });
  }
  if (supervisor) {
    for (const op of ops) {
      auditRows.push({
        userId: supervisor.id, username: supervisor.username, role: 'SUPERVISOR', module: 'operations', action: 'CREATE',
        description: `Operacion ${op.code} en preparacion`, createdAt: op.openedAt ?? op.createdAt,
      });
    }
  }
  for (const e of auditRows) await prisma.auditLog.create({ data: e });

  console.log(
    `\n✓ Total: ${totalFinished} tarjas finalizadas (${totalToday} hoy) + ${createdInProgress} en curso, ` +
      `${auditRows.length} eventos de auditoría`,
  );
  console.log('Enriquecimiento OK.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
