import {
  PrismaClient,
  RoleName,
  OperationType,
  OperationStatus,
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
// Datos de demostración: naves reales de la flota RoRo/PCTC, BLs con formato
// de los principales carriers que tocan Chancay, y catálogo de autos chinos
// (marcas/modelos poco comunes en Perú, coherente con el tráfico de CSPCP).
// ---------------------------------------------------------------------------

const SHIPS = [
  'Höegh Trigger',
  'Tonsberg',
  'City of Tokyo',
  'Morning Compass',
  'Grand Pioneer',
  'Figaro',
];

const CAR_CATALOG: { brand: string; models: string[] }[] = [
  { brand: 'BYD', models: ['Song Plus DM-i', 'Yuan Plus', 'Dolphin Mini', 'Han EV', 'Seal', 'Tang DM-i'] },
  { brand: 'Chery', models: ['Tiggo 7 Pro', 'Tiggo 8 Pro Max', 'Omoda 5', 'Arrizo 6 Pro'] },
  { brand: 'JAC', models: ['Sei4', 'JS4', 'e-JS4'] },
  { brand: 'GWM Haval', models: ['Jolion', 'H6 HEV', 'Tank 300', 'Poer'] },
  { brand: 'MG', models: ['ZS', 'RX5', 'MG5', 'One'] },
  { brand: 'Changan', models: ['CS35 Plus', 'UNI-T', 'Alsvin'] },
  { brand: 'DFSK', models: ['Glory 580', 'Glory 500'] },
  { brand: 'Geely', models: ['Coolray', 'Emgrand'] },
  { brand: 'Foton', models: ['Tunland G7'] },
];

const BL_PREFIXES = ['COSU', 'ONEY', 'MAEU', 'HLCU', 'MEDU', 'CMDU'];
const LOADING_PORTS = ['Shanghai, China', 'Yantai, China', 'Shekou, China', 'Ningbo, China', 'Zhoushan, China'];
const DISCHARGE_PORT = 'Chancay, Peru';

const TARJADORES = [
  { username: 'j.injante', name: 'Jhosep', lastname: 'Injante Rojas', initials: 'JIR' },
  { username: 'k.quispe', name: 'Katherine', lastname: 'Quispe Vargas', initials: 'KQV' },
  { username: 'm.salazar', name: 'Marco', lastname: 'Salazar Neyra', initials: 'MSN' },
  { username: 'l.fernandez', name: 'Luis', lastname: 'Fernandez Chumpitaz', initials: 'LFC' },
];

const DAMAGE_DESCRIPTIONS = [
  'Rayón profundo en puerta delantera derecha, aprox. 15 cm',
  'Abolladura en parachoques trasero, lado izquierdo',
  'Espejo lateral derecho fisurado',
  'Rueda delantera izquierda con llanta rozada',
  'Parabrisas con astilla en esquina superior derecha',
  'Faro delantero izquierdo con grieta',
  'Techo con marca de golpe, sin perforación',
  'Guardafango trasero derecho hundido',
];

const ANNULMENT_REASONS = [
  'Reporte duplicado por doble escaneo de VIN',
  'Vehiculo reasignado a otro BL tras correccion de manifiesto',
  'Error de tarjador en registro de accesorios, se rehace tarja',
];

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pick<T>(arr: T[]): T {
  return arr[randInt(0, arr.length - 1)];
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const VIN_CHARS = '0123456789ABCDEFGHJKLMNPRSTUVWXYZ'; // sin I, O, Q
const usedVins = new Set<string>();
function generateVin(wmi: string): string {
  let vin: string;
  do {
    let body = wmi;
    while (body.length < 17) {
      body += VIN_CHARS[randInt(0, VIN_CHARS.length - 1)];
    }
    vin = body.slice(0, 17);
  } while (usedVins.has(vin));
  usedVins.add(vin);
  return vin;
}

const WMI_BY_BRAND: Record<string, string> = {
  BYD: 'LGX',
  Chery: 'LVV',
  JAC: 'LJ1',
  'GWM Haval': 'LGW',
  MG: 'LSJ',
  Changan: 'LS5',
  DFSK: 'LDC',
  Geely: 'L6T',
  Foton: 'LFY',
};

function daysAgo(n: number, hour = randInt(7, 18)): Date {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, randInt(0, 59), randInt(0, 59), 0);
  return d;
}

async function nextReportCode(): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<{ nextval: bigint }[]>(
    `SELECT nextval('tarja_report_code_seq') AS nextval`,
  );
  return rows[0].nextval.toString().padStart(6, '0');
}

async function upsertUser(
  username: string,
  name: string,
  lastname: string,
  role: RoleName,
  password: string,
  initials: string,
) {
  const r = await prisma.role.findUniqueOrThrow({ where: { name: role } });
  const passwordHash = await bcrypt.hash(password, 10);
  return prisma.user.upsert({
    where: { username },
    update: {},
    create: {
      name,
      lastname,
      username,
      email: `${username}@cspcp.local`,
      passwordHash,
      initials,
      roleId: r.id,
    },
  });
}

async function main() {
  console.log('Creando tarjadores adicionales...');
  const tarjadores: Awaited<ReturnType<typeof upsertUser>>[] = [];
  for (const t of TARJADORES) {
    tarjadores.push(await upsertUser(t.username, t.name, t.lastname, 'TARJADOR', 'Tarja123!', t.initials));
  }
  const baseTarjador = await prisma.user.findUnique({ where: { username: 'tarjador' } });
  if (baseTarjador) tarjadores.push(baseTarjador);
  const supervisor = await prisma.user.findUnique({ where: { username: 'supervisor' } });

  const accessories = await prisma.accessory.findMany();
  if (accessories.length === 0) {
    throw new Error('No hay accesorios. Corre primero "npx prisma db seed".');
  }

  console.log('Creando naves...');
  const ships: Awaited<ReturnType<typeof prisma.ship.upsert>>[] = [];
  for (const name of SHIPS) {
    ships.push(await prisma.ship.upsert({ where: { name }, update: {}, create: { name } }));
  }

  const opStatuses: OperationStatus[] = ['ACTIVA', 'ACTIVA', 'ACTIVA', 'PAUSADA', 'PAUSADA', 'CERRADA'];
  let blCounter = 185000 + randInt(0, 900);
  let opIndex = 0;

  const auditEntries: {
    userId?: number;
    username: string;
    role: string;
    module: string;
    action: string;
    description: string;
    createdAt: Date;
  }[] = [];

  for (const ship of ships) {
    opIndex++;
    const opCode = `OP-2026-${String(opIndex).padStart(3, '0')}`;
    const status = opStatuses[opIndex - 1];
    const operationType: OperationType = opIndex === 5 ? 'DESCONSOLIDADO' : 'ROLL_ON_ROLL_OFF';
    const operationDate = daysAgo(randInt(1, 20));

    const operation = await prisma.operation.upsert({
      where: { code: opCode },
      update: {},
      create: {
        code: opCode,
        shipId: ship.id,
        operationType,
        operationDate,
        portDischarge: DISCHARGE_PORT,
        status,
        createdById: supervisor?.id,
      },
    });

    auditEntries.push({
      userId: supervisor?.id,
      username: supervisor?.username ?? 'supervisor',
      role: 'SUPERVISOR',
      module: 'operations',
      action: 'CREATE',
      description: `Operacion ${opCode} creada para nave "${ship.name}"`,
      createdAt: operationDate,
    });

    const blCount = randInt(2, 3);
    for (let b = 0; b < blCount; b++) {
      blCounter += randInt(3, 47);
      const prefix = pick(BL_PREFIXES);
      const blNumber = `${prefix}${blCounter}`;
      const bl = await prisma.billOfLading.upsert({
        where: { blNumber },
        update: {},
        create: {
          operationId: operation.id,
          blNumber,
          bookingNumber: `BK${randInt(100000, 999999)}`,
          portLoading: pick(LOADING_PORTS),
          portDischarge: DISCHARGE_PORT,
        },
      });

      // La mayoria de BLs trae 2 autos (caso tipico solicitado); algunos traen mas.
      const vehicleCount = Math.random() < 0.7 ? 2 : randInt(3, 4);
      const catalogEntry = pick(CAR_CATALOG);
      const wmi = WMI_BY_BRAND[catalogEntry.brand];

      const vehicleStatusPool: VehicleStatus[] = [
        'TARJADO',
        'TARJADO',
        'OBSERVADO',
        'EN_PROCESO',
        'PENDIENTE',
        'REABIERTO',
        'BLOQUEADO',
      ];

      for (let v = 0; v < vehicleCount; v++) {
        const vin = generateVin(wmi);
        const model = pick(catalogEntry.models);
        const vStatus = status === 'CERRADA' ? 'TARJADO' : pick(vehicleStatusPool);

        const vehicle = await prisma.vehicle.create({
          data: {
            operationId: operation.id,
            billOfLadingId: bl.id,
            vin,
            model,
            brand: catalogEntry.brand,
            chassisNumber: vin,
            weight: randInt(1150, 2450),
            quantity: 1,
            status: vStatus,
            isUnplanned: false,
          },
        });

        const tarjador = pick(tarjadores);

        if (vStatus === 'EN_PROCESO' || vStatus === 'BLOQUEADO') {
          // Tarja en curso: reporte BORRADOR, vehiculo bloqueado por el tarjador.
          const reportCode = await nextReportCode();
          const startedAt = daysAgo(0, randInt(7, 17));
          const report = await prisma.tarjaReport.create({
            data: {
              reportCode,
              operationId: operation.id,
              vehicleId: vehicle.id,
              billOfLadingId: bl.id,
              tarjadorId: tarjador.id,
              startedAt,
              status: 'BORRADOR',
              tarjadorInitials: tarjador.initials ?? undefined,
            },
          });
          await prisma.vehicle.update({
            where: { id: vehicle.id },
            data: { currentReportId: report.id, lockedById: tarjador.id, lockedAt: startedAt },
          });
          auditEntries.push({
            userId: tarjador.id,
            username: tarjador.username,
            role: 'TARJADOR',
            module: 'tarja',
            action: 'START',
            description: `Vehiculo ${vin} → EN_PROCESO (reporte ${reportCode})`,
            createdAt: startedAt,
          });
          continue;
        }

        if (vStatus === 'PENDIENTE') {
          continue; // Sin reporte todavia.
        }

        // TARJADO / OBSERVADO / REABIERTO: reporte con historial completo.
        const startedAt = daysAgo(randInt(0, 12), randInt(7, 15));
        const durationSeconds = randInt(180, 900);
        const finishedAt = new Date(startedAt.getTime() + durationSeconds * 1000);
        const hasDamage = vStatus === 'OBSERVADO' || Math.random() < 0.15;
        const reportStatus: ReportStatus = hasDamage ? 'CON_DANO' : 'FINALIZADO';
        const reportCode = await nextReportCode();

        const damageSource: DamageSource | undefined = hasDamage ? pick(['CAUSADO', 'ENCONTRADO']) : undefined;
        const damageOperation: DamageOperation | undefined = hasDamage
          ? pick(['DESCARGA', 'EMBARQUE', 'TRANSITO', 'REESTIBA'])
          : undefined;
        const damageAffects: DamageAffects | undefined = hasDamage
          ? pick(['CARGA_CHANCAY', 'CARGA_TRANSITO'])
          : undefined;
        const damageMoment: DamageMoment | undefined = hasDamage
          ? pick(['ANTES_DESCARGA', 'DURANTE_DESCARGA', 'POSTERIOR_DESCARGA', 'ANTES_EMBARQUE', 'DURANTE_EMBARQUE'])
          : undefined;

        const report = await prisma.tarjaReport.create({
          data: {
            reportCode,
            operationId: operation.id,
            vehicleId: vehicle.id,
            billOfLadingId: bl.id,
            tarjadorId: tarjador.id,
            startedAt,
            finishedAt,
            durationSeconds,
            hasDamage,
            damageSource,
            damageOperation,
            damageAffects,
            damageMoment,
            details: hasDamage ? 'Se registra novedad durante inspeccion visual de la unidad.' : undefined,
            tarjadorInitials: tarjador.initials ?? undefined,
            status: reportStatus,
          },
        });

        await prisma.vehicle.update({ where: { id: vehicle.id }, data: { currentReportId: report.id } });

        // Accesorios: marcar todos, con ausencias aleatorias esporadicas.
        for (const acc of accessories) {
          const has = Math.random() > 0.08;
          await prisma.tarjaReportAccessory.create({
            data: {
              reportId: report.id,
              accessoryId: acc.id,
              hasAccessory: has,
              quantity: has ? (acc.name === 'Llaves del vehiculo' ? randInt(1, 2) : 1) : 0,
            },
          });
        }

        if (hasDamage) {
          const damageCount = randInt(1, 2);
          for (const desc of shuffle(DAMAGE_DESCRIPTIONS).slice(0, damageCount)) {
            await prisma.tarjaReportDamage.create({ data: { reportId: report.id, description: desc } });
          }
        }

        auditEntries.push({
          userId: tarjador.id,
          username: tarjador.username,
          role: 'TARJADOR',
          module: 'tarja',
          action: 'FINISH',
          description: `Vehiculo ${vin} → ${reportStatus} (reporte ${reportCode})`,
          createdAt: finishedAt,
        });

        // Un puñado de reportes REEMPLAZADO/ANULADO para trazabilidad completa.
        if (Math.random() < 0.12) {
          const newReportCode = await nextReportCode();
          const newStartedAt = new Date(finishedAt.getTime() + 1000 * 60 * 30);
          const newDuration = randInt(180, 700);
          const newFinishedAt = new Date(newStartedAt.getTime() + newDuration * 1000);
          // El indice unico parcial solo permite un reporte "vigente" por vehiculo:
          // hay que liberar el vehiculo y marcar el reporte anterior como REEMPLAZADO
          // antes de crear el nuevo, o la creacion choca con "uniq_valid_tarja_per_vehicle".
          await prisma.vehicle.update({ where: { id: vehicle.id }, data: { currentReportId: null } });
          await prisma.tarjaReport.update({ where: { id: report.id }, data: { status: 'REEMPLAZADO' } });
          const replacement = await prisma.tarjaReport.create({
            data: {
              reportCode: newReportCode,
              operationId: operation.id,
              vehicleId: vehicle.id,
              billOfLadingId: bl.id,
              tarjadorId: tarjador.id,
              startedAt: newStartedAt,
              finishedAt: newFinishedAt,
              durationSeconds: newDuration,
              hasDamage: false,
              tarjadorInitials: tarjador.initials ?? undefined,
              status: 'FINALIZADO',
            },
          });
          await prisma.tarjaReport.update({ where: { id: report.id }, data: { replacedById: replacement.id } });
          await prisma.vehicle.update({ where: { id: vehicle.id }, data: { currentReportId: replacement.id, status: 'TARJADO' } });
          auditEntries.push({
            userId: supervisor?.id,
            username: supervisor?.username ?? 'supervisor',
            role: 'SUPERVISOR',
            module: 'reports',
            action: 'CREATE',
            description: `Reporte ${reportCode} reemplazado por ${newReportCode} en vehiculo ${vin}`,
            createdAt: newFinishedAt,
          });
        } else if (Math.random() < 0.08 && supervisor) {
          await prisma.tarjaReport.update({ where: { id: report.id }, data: { status: 'ANULADO' } });
          await prisma.tarjaReportAnnulment.create({
            data: {
              reportId: report.id,
              vehicleId: vehicle.id,
              tarjadorId: tarjador.id,
              supervisorId: supervisor.id,
              reason: pick(ANNULMENT_REASONS),
              previousReportStatus: reportStatus,
              newReportStatus: 'ANULADO',
              annulledAt: new Date(finishedAt.getTime() + 1000 * 60 * 10),
            },
          });
          await prisma.vehicle.update({ where: { id: vehicle.id }, data: { status: 'REABIERTO', currentReportId: null } });
          auditEntries.push({
            userId: supervisor.id,
            username: supervisor.username,
            role: 'SUPERVISOR',
            module: 'reports',
            action: 'ANNUL',
            description: `Reporte ${reportCode}: anulado (vehiculo ${vin})`,
            createdAt: new Date(finishedAt.getTime() + 1000 * 60 * 10),
          });
        }
      }
    }
  }

  // Un par de eventos extra de auth / imports / vin no encontrado, distribuidos en el tiempo.
  for (let i = 0; i < 10; i++) {
    const t = pick(tarjadores);
    auditEntries.push({
      userId: t.id,
      username: t.username,
      role: 'TARJADOR',
      module: 'auth',
      action: Math.random() < 0.9 ? 'LOGIN' : 'LOGIN_FAILED',
      description: Math.random() < 0.9 ? `Inicio de sesion de ${t.username}` : `Intento fallido de ${t.username}`,
      createdAt: daysAgo(randInt(0, 10), randInt(6, 20)),
    });
  }
  for (let i = 0; i < 6; i++) {
    auditEntries.push({
      userId: supervisor?.id,
      username: supervisor?.username ?? 'supervisor',
      role: 'SUPERVISOR',
      module: 'imports',
      action: 'CONFIRM',
      description: `Importacion confirmada: manifiesto_${randInt(1000, 9999)}.xlsx`,
      createdAt: daysAgo(randInt(0, 15), randInt(8, 16)),
    });
  }
  for (let i = 0; i < 4; i++) {
    const t = pick(tarjadores);
    auditEntries.push({
      userId: t.id,
      username: t.username,
      role: 'TARJADOR',
      module: 'tarja',
      action: 'VIN_NO_ENCONTRADO',
      description: `VIN escaneado sin coincidencia en manifiesto: ${generateVin('LXX')}`,
      createdAt: daysAgo(randInt(0, 8), randInt(7, 19)),
    });
  }

  console.log(`Insertando ${auditEntries.length} registros de auditoria...`);
  for (const e of auditEntries) {
    await prisma.auditLog.create({
      data: {
        userId: e.userId,
        username: e.username,
        role: e.role,
        module: e.module,
        action: e.action,
        description: e.description,
        createdAt: e.createdAt,
      },
    });
  }

  console.log('Seed demo OK.');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
