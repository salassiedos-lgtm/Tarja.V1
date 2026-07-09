import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { validateVin } from '../common/vin.util';
import { getVehicleBlock } from '../common/vehicle-block';
import { parseVinQuery } from '../common/vin-search.util';

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
