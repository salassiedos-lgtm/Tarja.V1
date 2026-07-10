import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { validateVin } from '../common/vin.util';
import { getVehicleBlock } from '../common/vehicle-block';
import { parseVinQuery } from '../common/vin-search.util';
import { reopenSecondsLeft } from '../tarja/edit.util';

/** Fila de GET /vehicles/search. El frontend nunca interpreta un VehicleStatus. */
export interface VehicleSearchRow {
  vehicleId: number;
  vin: string;
  blNumber: string | null;
  shipName: string;
  operationCode: string;
  brand: string | null;
  model: string | null;
  containerNumber: string | null;
  blocked: boolean;
  blockedReason: string | null;
}

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findByOperation(operationId: number, search?: string) {
    const where: Prisma.VehicleWhereInput = { operationId };
    if (search) {
      where.vin = { contains: search, mode: 'insensitive' };
    }
    return this.prisma.vehicle.findMany({
      where,
      orderBy: { id: 'asc' },
      include: { billOfLading: { select: { blNumber: true } } },
    });
  }

  async findOne(id: number) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { billOfLading: true, operation: true },
    });
    if (!vehicle) throw new NotFoundException('Vehiculo no encontrado');
    return vehicle;
  }

  /**
   * Busca un VIN de forma exacta y global. El VIN es unico en todo el sistema,
   * por lo que resuelve por si solo su operacion, nave y BL.
   */
  async lookup(rawVin: string) {
    const { vin } = validateVin(rawVin);
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { vin },
      include: {
        billOfLading: { select: { blNumber: true } },
        operation: {
          select: {
            id: true,
            code: true,
            operationType: true,
            portDischarge: true,
            ship: { select: { name: true } },
          },
        },
      },
    });
    if (!vehicle) throw new NotFoundException(`VIN ${vin} no encontrado`);
    return {
      vehicleId: vehicle.id,
      vin: vehicle.vin,
      brand: vehicle.brand,
      model: vehicle.model,
      containerNumber: vehicle.containerNumber,
      blNumber: vehicle.billOfLading?.blNumber ?? null,
      operationId: vehicle.operation.id,
      operationCode: vehicle.operation.code,
      operationType: vehicle.operation.operationType,
      shipName: vehicle.operation.ship.name,
      portDischarge: vehicle.operation.portDischarge,
      vehicleStatus: vehicle.status,
    };
  }

  /**
   * Busqueda incremental para el tarjador. Sufijo con 4-16 caracteres, exacta
   * con 17 (lo que entregara el escaner de camara). Solo operaciones ACTIVA.
   *
   * El sufijo se traduce a LIKE '%...', cuyo comodin inicial impide usar el
   * indice vehicles_vin_key: Postgres hace scan secuencial. Con una nave de
   * unos miles de unidades es irrelevante. Si el universo crece, la salida es
   * un indice sobre reverse(vin) o uno trigram.
   */
  async search(rawQuery: string): Promise<VehicleSearchRow[]> {
    const q = parseVinQuery(rawQuery);
    if (q.mode === 'none') return [];

    const rows = await this.prisma.vehicle.findMany({
      where: {
        vin: q.mode === 'exact' ? q.vin : { endsWith: q.vin, mode: 'insensitive' },
        operation: { status: 'ACTIVA' },
      },
      orderBy: { vin: 'asc' },
      take: 20,
      include: {
        billOfLading: { select: { blNumber: true } },
        operation: { select: { id: true, code: true, ship: { select: { name: true } } } },
      },
    });

    return rows.map((v) => {
      const block = getVehicleBlock(v.status);
      return {
        vehicleId: v.id,
        vin: v.vin,
        blNumber: v.billOfLading?.blNumber ?? null,
        shipName: v.operation.ship.name,
        operationCode: v.operation.code,
        brand: v.brand,
        model: v.model,
        containerNumber: v.containerNumber,
        blocked: block !== null,
        blockedReason: block?.label ?? null,
      };
    });
  }

  /**
   * Elimina un vehiculo mal cargado desde el Excel de origen.
   * Solo en PENDIENTE: un vehiculo con historial de tarja nunca se borra.
   */
  async remove(id: number, userId: number) {
    const vehicle = await this.prisma.vehicle.findUnique({
      where: { id },
      include: { _count: { select: { reports: true } } },
    });
    if (!vehicle) throw new NotFoundException('Vehiculo no encontrado');

    if (vehicle.status !== 'PENDIENTE') {
      throw new ConflictException(
        `Solo se puede eliminar un vehiculo en estado PENDIENTE (actual: ${vehicle.status})`,
      );
    }
    if (vehicle._count.reports > 0) {
      throw new ConflictException('El vehiculo tiene reportes asociados y no puede eliminarse');
    }

    await this.prisma.vehicle.delete({ where: { id } });

    this.audit.record({
      userId,
      module: 'vehicles',
      action: 'DELETE',
      description: `Vehiculo ${vehicle.vin} eliminado (estaba PENDIENTE)`,
      oldValue: vehicle.vin,
    });

    return { deleted: true, vin: vehicle.vin };
  }

  /**
   * Tablero por B/L (Cuadro de Tareas): un card por cada BillOfLading de las
   * operaciones ABIERTAS (ACTIVA), con su avance de tarja. El tarjador entra
   * aquí a ver qué le falta por chasis.
   */
  async blBoard() {
    const DONE = ['TARJADO', 'OBSERVADO'];

    const statusRows = await this.prisma.vehicle.groupBy({
      by: ['billOfLadingId', 'status'],
      where: { operation: { status: 'ACTIVA' }, billOfLadingId: { not: null } },
      _count: { _all: true },
    });
    if (statusRows.length === 0) return [];

    const blIds = [...new Set(statusRows.map((r) => r.billOfLadingId!))];
    const [bls, containerRows] = await Promise.all([
      this.prisma.billOfLading.findMany({
        where: { id: { in: blIds } },
        select: {
          id: true,
          blNumber: true,
          operationId: true,
          operation: { select: { code: true, ship: { select: { name: true } } } },
        },
      }),
      this.prisma.vehicle.groupBy({
        by: ['billOfLadingId', 'containerNumber'],
        where: {
          billOfLadingId: { in: blIds },
          containerNumber: { not: null },
        },
        _count: { _all: true },
      }),
    ]);

    const byBl = new Map<number, { byStatus: Record<string, number>; containers: Set<string> }>();
    for (const id of blIds) byBl.set(id, { byStatus: {}, containers: new Set() });
    for (const r of statusRows) byBl.get(r.billOfLadingId!)!.byStatus[r.status] = r._count._all;
    for (const c of containerRows) {
      if (c.containerNumber) byBl.get(c.billOfLadingId!)?.containers.add(c.containerNumber);
    }

    return bls
      .map((bl) => {
        const e = byBl.get(bl.id)!;
        const total = Object.values(e.byStatus).reduce((a, b) => a + b, 0);
        const done = DONE.reduce((a, s) => a + (e.byStatus[s] ?? 0), 0);
        const inProcess = e.byStatus['EN_PROCESO'] ?? 0;
        return {
          billOfLadingId: bl.id,
          blNumber: bl.blNumber,
          operationId: bl.operationId,
          operationCode: bl.operation.code,
          shipName: bl.operation.ship.name,
          total,
          done,
          inProcess,
          pending: total - done,
          containers: e.containers.size,
          percent: total ? Math.round((done / total) * 100) : 0,
        };
      })
      .sort((a, b) => a.percent - b.percent || a.blNumber.localeCompare(b.blNumber));
  }

  /**
   * Tablero por NAVE (Cuadro de Tareas): un card por cada operación ABIERTA
   * (ACTIVA), con el avance de tarja de TODA la nave (sumando sus B/L). El
   * tarjador entra a una nave y ve todos sus chasis juntos, sin elegir un B/L.
   */
  async navesBoard() {
    const DONE = ['TARJADO', 'OBSERVADO'];

    const statusRows = await this.prisma.vehicle.groupBy({
      by: ['operationId', 'status'],
      where: { operation: { status: 'ACTIVA' } },
      _count: { _all: true },
    });
    if (statusRows.length === 0) return [];

    const opIds = [...new Set(statusRows.map((r) => r.operationId))];
    const [ops, containerRows, blRows] = await Promise.all([
      this.prisma.operation.findMany({
        where: { id: { in: opIds } },
        select: { id: true, code: true, ship: { select: { name: true } } },
      }),
      this.prisma.vehicle.groupBy({
        by: ['operationId', 'containerNumber'],
        where: { operationId: { in: opIds }, containerNumber: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.billOfLading.groupBy({
        by: ['operationId'],
        where: { operationId: { in: opIds } },
        _count: { _all: true },
      }),
    ]);

    const byOp = new Map<number, { byStatus: Record<string, number>; containers: Set<string> }>();
    for (const id of opIds) byOp.set(id, { byStatus: {}, containers: new Set() });
    for (const r of statusRows) byOp.get(r.operationId)!.byStatus[r.status] = r._count._all;
    for (const c of containerRows) {
      if (c.containerNumber) byOp.get(c.operationId)?.containers.add(c.containerNumber);
    }
    const blsByOp = new Map(blRows.map((b) => [b.operationId, b._count._all]));

    return ops
      .map((op) => {
        const e = byOp.get(op.id)!;
        const total = Object.values(e.byStatus).reduce((a, b) => a + b, 0);
        const done = DONE.reduce((a, s) => a + (e.byStatus[s] ?? 0), 0);
        const inProcess = e.byStatus['EN_PROCESO'] ?? 0;
        return {
          operationId: op.id,
          operationCode: op.code,
          shipName: op.ship.name,
          total,
          done,
          inProcess,
          pending: total - done,
          containers: e.containers.size,
          bls: blsByOp.get(op.id) ?? 0,
          percent: total ? Math.round((done / total) * 100) : 0,
        };
      })
      .sort((a, b) => a.percent - b.percent || a.shipName.localeCompare(b.shipName));
  }

  /** Todos los chasis de una NAVE (operación) para la lista de tareas.
   *  Enriquecemos los realizados con el dueño y el estado de edición; si el
   *  llamador es TARJADOR, solo ve como "realizados" los suyos. */
  async naveVehicles(operationId: number, user?: { userId: number; role: string }) {
    const op = await this.prisma.operation.findUnique({
      where: { id: operationId },
      select: { id: true, code: true, status: true, ship: { select: { name: true } } },
    });
    if (!op) throw new NotFoundException('Operación no encontrada');

    const vehicles = await this.prisma.vehicle.findMany({
      where: { operationId },
      orderBy: [{ containerNumber: 'asc' }, { vin: 'asc' }],
      select: {
        id: true,
        vin: true,
        status: true,
        brand: true,
        model: true,
        containerNumber: true,
        currentReportId: true,
        billOfLading: { select: { blNumber: true } },
        currentReport: {
          select: {
            tarjadorId: true,
            finishedAt: true,
            status: true,
            editRequests: {
              where: { status: { in: ['PENDIENTE', 'APROBADA', 'RECHAZADA'] } },
              orderBy: { id: 'desc' },
              take: 1,
              select: { status: true, resolveComment: true },
            },
          },
        },
      },
    });

    const isTarjador = user?.role === 'TARJADOR';

    const mapped = vehicles.map((v) => {
      const block = getVehicleBlock(v.status);
      const done = v.status === 'TARJADO' || v.status === 'OBSERVADO';
      const rep = v.currentReport;
      const secondsLeft = rep ? reopenSecondsLeft({ status: rep.status, finishedAt: rep.finishedAt }) : 0;
      return {
        vehicleId: v.id,
        vin: v.vin,
        status: v.status,
        brand: v.brand,
        model: v.model,
        containerNumber: v.containerNumber,
        blNumber: v.billOfLading?.blNumber ?? null,
        currentReportId: v.currentReportId,
        done,
        blocked: block !== null,
        blockedReason: block?.label ?? null,
        tarjadorId: rep?.tarjadorId ?? null,
        reopenSecondsLeft: secondsLeft,
        editRequestStatus: rep?.editRequests[0]?.status ?? null,
        editRejectComment: rep?.editRequests[0]?.status === 'RECHAZADA' ? rep?.editRequests[0]?.resolveComment ?? null : null,
      };
    });

    // El tarjador solo ve como "realizados" los suyos; los demás realizados se ocultan de esa pestaña.
    const vehiclesOut = isTarjador
      ? mapped.filter((v) => !v.done || v.tarjadorId === user!.userId)
      : mapped;

    return {
      operationId: op.id,
      operationCode: op.code,
      operationStatus: op.status,
      shipName: op.ship.name,
      vehicles: vehiclesOut,
    };
  }

  /** Chasis de un B/L para la lista de tareas (tabs Por tarjar / Realizados). */
  async blVehicles(blId: number) {
    const bl = await this.prisma.billOfLading.findUnique({
      where: { id: blId },
      select: {
        id: true,
        blNumber: true,
        operationId: true,
        operation: { select: { code: true, status: true, ship: { select: { name: true } } } },
      },
    });
    if (!bl) throw new NotFoundException('B/L no encontrado');

    const vehicles = await this.prisma.vehicle.findMany({
      where: { billOfLadingId: blId },
      orderBy: [{ containerNumber: 'asc' }, { vin: 'asc' }],
      select: {
        id: true,
        vin: true,
        status: true,
        brand: true,
        model: true,
        containerNumber: true,
        currentReportId: true,
      },
    });

    return {
      billOfLadingId: bl.id,
      blNumber: bl.blNumber,
      operationId: bl.operationId,
      operationCode: bl.operation.code,
      operationStatus: bl.operation.status,
      shipName: bl.operation.ship.name,
      vehicles: vehicles.map((v) => {
        const block = getVehicleBlock(v.status);
        return {
          vehicleId: v.id,
          vin: v.vin,
          status: v.status,
          brand: v.brand,
          model: v.model,
          containerNumber: v.containerNumber,
          currentReportId: v.currentReportId,
          done: v.status === 'TARJADO' || v.status === 'OBSERVADO',
          blocked: block !== null,
          blockedReason: block?.label ?? null,
        };
      }),
    };
  }

  /** Avance por contenedor. Solo para el panel del supervisor. */
  async containerProgress(operationId: number) {
    const rows = await this.prisma.vehicle.groupBy({
      by: ['containerNumber', 'status'],
      where: { operationId, containerNumber: { not: null } },
      _count: { _all: true },
    });

    const byContainer = new Map<string, Record<string, number>>();
    for (const r of rows) {
      const key = r.containerNumber!;
      const entry = byContainer.get(key) ?? {};
      entry[r.status] = r._count._all;
      byContainer.set(key, entry);
    }

    const DONE = ['TARJADO', 'OBSERVADO'];
    return [...byContainer.entries()]
      .map(([containerNumber, counts]) => {
        const total = Object.values(counts).reduce((a, b) => a + b, 0);
        const done = DONE.reduce((a, s) => a + (counts[s] ?? 0), 0);
        return {
          containerNumber,
          total,
          done,
          pending: total - done,
          complete: done === total,
          byStatus: counts,
        };
      })
      .sort((a, b) => a.containerNumber.localeCompare(b.containerNumber));
  }
}
