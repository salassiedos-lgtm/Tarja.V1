import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ImporterRegistry } from './importers/importer.registry';
import { ImportedRow } from './importers/types';

export interface ImportSummary {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  rowsWithWarnings: number;
  newVehicles: number;
  existingVehicles: number;
  conflictingVehicles: number;
  blsDetected: number;
}

interface Classification {
  valid: ImportedRow[];
  fresh: ImportedRow[];
  existing: ImportedRow[];
  conflicting: ImportedRow[];
  blsDetected: number;
}

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: ImporterRegistry,
  ) {}

  private async ensureOperation(id: number) {
    const op = await this.prisma.operation.findUnique({ where: { id } });
    if (!op) throw new NotFoundException('Operacion no encontrada');
    return op;
  }

  private async parse(operationId: number, buffer: Buffer) {
    const op = await this.ensureOperation(operationId);
    const rows = await this.registry.get(op.operationType).parse(buffer);
    return { op, rows };
  }

  /**
   * Clasifica cada VIN valido contra la base:
   *  - new: no existe
   *  - existing: ya existe en ESTA operacion (reimportacion aditiva -> se omite)
   *  - conflicting: existe en OTRA operacion (VIN es unico global -> se rechaza)
   */
  private async classify(operationId: number, rows: ImportedRow[]): Promise<Classification> {
    const valid = rows.filter((r) => r.errors.length === 0);
    const vins = valid.map((r) => r.vin);

    const found = await this.prisma.vehicle.findMany({
      where: { vin: { in: vins } },
      select: { vin: true, operationId: true },
    });
    const byVin = new Map(found.map((v) => [v.vin, v.operationId]));

    const bls = [...new Set(valid.map((r) => r.bl))];
    const foundBls = await this.prisma.billOfLading.findMany({
      where: { blNumber: { in: bls } },
      select: { blNumber: true, operationId: true },
    });
    const blOwner = new Map(foundBls.map((b) => [b.blNumber, b.operationId]));

    const fresh: ImportedRow[] = [];
    const existing: ImportedRow[] = [];
    const conflicting: ImportedRow[] = [];

    for (const row of valid) {
      const blOwnedBy = blOwner.get(row.bl);
      if (blOwnedBy !== undefined && blOwnedBy !== operationId) {
        row.errors.push(`El BL ${row.bl} pertenece a otra operacion`);
        conflicting.push(row);
        continue;
      }
      const vinOwnedBy = byVin.get(row.vin);
      if (vinOwnedBy === undefined) fresh.push(row);
      else if (vinOwnedBy === operationId) existing.push(row);
      else {
        row.errors.push(`El VIN ${row.vin} ya existe en otra operacion`);
        conflicting.push(row);
      }
    }
    return { valid, fresh, existing, conflicting, blsDetected: bls.length };
  }

  private summarize(rows: ImportedRow[], c: Classification): ImportSummary {
    return {
      totalRows: rows.length,
      validRows: c.valid.length - c.conflicting.length,
      invalidRows: rows.length - c.valid.length + c.conflicting.length,
      rowsWithWarnings: rows.filter((r) => r.warnings.length > 0).length,
      newVehicles: c.fresh.length,
      existingVehicles: c.existing.length,
      conflictingVehicles: c.conflicting.length,
      blsDetected: c.blsDetected,
    };
  }

  async preview(operationId: number, buffer: Buffer) {
    const { rows } = await this.parse(operationId, buffer);
    const c = await this.classify(operationId, rows);
    return { ...this.summarize(rows, c), rows: rows.slice(0, 200) };
  }

  async confirm(operationId: number, buffer: Buffer, userId: number, fileName = 'import.xlsx') {
    const { rows } = await this.parse(operationId, buffer);
    const c = await this.classify(operationId, rows);
    const summary = this.summarize(rows, c);

    await this.prisma.$transaction(async (tx) => {
      const blIds = new Map<string, number>();
      for (const blNumber of new Set(c.fresh.map((r) => r.bl))) {
        const bl = await tx.billOfLading.upsert({
          where: { blNumber },
          update: {},
          create: { operationId, blNumber, portDischarge: 'Chancay' },
        });
        blIds.set(blNumber, bl.id);
      }

      if (c.fresh.length > 0) {
        await tx.vehicle.createMany({
          data: c.fresh.map((r) => ({
            operationId,
            billOfLadingId: blIds.get(r.bl)!,
            vin: r.vin,
            chassisNumber: r.vin,
            containerNumber: r.containerNumber,
            brand: r.brand,
            model: r.model,
            weight: r.weight,
            quantity: r.quantity,
          })),
        });
      }

      await tx.operationImport.create({
        data: {
          operationId,
          fileName,
          totalRows: summary.totalRows,
          validRows: summary.validRows,
          invalidRows: summary.invalidRows,
          uploadedById: userId,
        },
      });
    });

    this.audit.record({
      userId,
      module: 'imports',
      action: 'CONFIRM',
      description:
        `${fileName}: ${summary.newVehicles} nuevos, ` +
        `${summary.existingVehicles} ya existentes, ` +
        `${summary.conflictingVehicles} rechazados`,
    });

    return summary;
  }

  list(operationId: number) {
    return this.prisma.operationImport.findMany({
      where: { operationId },
      orderBy: { id: 'desc' },
    });
  }
}
