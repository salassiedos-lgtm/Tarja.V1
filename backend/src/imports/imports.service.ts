import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Workbook } from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

type StringField =
  | 'nave'
  | 'vin'
  | 'bl'
  | 'cantidad'
  | 'marca'
  | 'peso'
  | 'puertoEmbarque'
  | 'puertoDescarga';

interface RawRow extends Partial<Record<StringField, string>> {
  rowNumber: number;
}

export interface ValidatedRow {
  rowNumber: number;
  vin: string;
  bl: string;
  brand: string | null;
  weight: number | null;
  quantity: number;
  portLoading: string | null;
  portDischarge: string | null;
  shipName: string | null;
  errors: string[];
}

// Tokens normalizados -> campo. Orden importa (mas especifico primero; 'bl' al final).
const FIELD_BY_TOKEN: [string, StringField][] = [
  ['vin', 'vin'],
  ['nave', 'nave'],
  ['embarque', 'puertoEmbarque'],
  ['loading', 'puertoEmbarque'],
  ['descarga', 'puertoDescarga'],
  ['discharge', 'puertoDescarga'],
  ['cantidad', 'cantidad'],
  ['qty', 'cantidad'],
  ['marca', 'marca'],
  ['peso', 'peso'],
  ['booking', 'bl'],
  ['bl', 'bl'],
];

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private normalize(text: string): string {
    return text
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .trim();
  }

  private async parse(buffer: Buffer): Promise<RawRow[]> {
    const wb = new Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('No se pudo leer el archivo Excel');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('El Excel no tiene hojas');

    // Buscar fila de encabezado (contiene 'vin') en las primeras 10 filas.
    let headerRowNo = 0;
    const maxScan = Math.min(10, ws.rowCount);
    for (let r = 1; r <= maxScan; r++) {
      const texts: string[] = [];
      ws.getRow(r).eachCell((cell) => texts.push(this.normalize(String(cell.text ?? ''))));
      if (texts.some((t) => t.includes('vin'))) {
        headerRowNo = r;
        break;
      }
    }
    if (!headerRowNo) {
      throw new BadRequestException('No se encontro el encabezado con la columna VIN');
    }

    // Mapear columnas por token.
    const colMap = new Map<number, StringField>();
    ws.getRow(headerRowNo).eachCell((cell, colNumber) => {
      const norm = this.normalize(String(cell.text ?? ''));
      if (!norm) return;
      for (const [token, field] of FIELD_BY_TOKEN) {
        if (norm.includes(token) && !Array.from(colMap.values()).includes(field)) {
          colMap.set(colNumber, field);
          break;
        }
      }
    });

    const rows: RawRow[] = [];
    for (let r = headerRowNo + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const raw: RawRow = { rowNumber: r };
      let hasAny = false;
      colMap.forEach((field, colNumber) => {
        const value = String(row.getCell(colNumber).text ?? '').trim();
        if (value) hasAny = true;
        raw[field] = value;
      });
      if (hasAny) rows.push(raw);
    }
    return rows;
  }

  private validate(rows: RawRow[]): ValidatedRow[] {
    return rows.map((r) => {
      const errors: string[] = [];
      const vin = (r.vin ?? '').trim();
      const bl = (r.bl ?? '').trim();
      if (!vin) errors.push('VIN vacio');
      if (!bl) errors.push('BL vacio');

      let quantity = 1;
      if (r.cantidad) {
        const q = Number(r.cantidad.replace(',', '.'));
        if (Number.isFinite(q) && q > 0) quantity = Math.trunc(q);
        else errors.push('Cantidad invalida');
      }
      let weight: number | null = null;
      if (r.peso) {
        const w = Number(r.peso.replace(',', '.'));
        if (Number.isFinite(w)) weight = w;
        else errors.push('Peso invalido');
      }

      return {
        rowNumber: r.rowNumber,
        vin,
        bl,
        brand: r.marca?.trim() || null,
        weight,
        quantity,
        portLoading: r.puertoEmbarque?.trim() || null,
        portDischarge: r.puertoDescarga?.trim() || null,
        shipName: r.nave?.trim() || null,
        errors,
      };
    });
  }

  private async ensureOperation(id: number) {
    const op = await this.prisma.operation.findUnique({ where: { id } });
    if (!op) throw new NotFoundException('Operacion no encontrada');
    return op;
  }

  async preview(operationId: number, buffer: Buffer) {
    await this.ensureOperation(operationId);
    const rows = this.validate(await this.parse(buffer));
    const valid = rows.filter((r) => r.errors.length === 0);
    return {
      totalRows: rows.length,
      validRows: valid.length,
      invalidRows: rows.length - valid.length,
      rows: rows.slice(0, 200),
    };
  }

  async confirm(
    operationId: number,
    buffer: Buffer,
    userId: number,
    fileName = 'import.xlsx',
  ) {
    await this.ensureOperation(operationId);
    const rows = this.validate(await this.parse(buffer));
    const valid = rows.filter((r) => r.errors.length === 0);

    let created = 0;
    let skipped = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const row of valid) {
        const bl = await tx.billOfLading.upsert({
          where: { operationId_blNumber: { operationId, blNumber: row.bl } },
          update: {
            portLoading: row.portLoading ?? undefined,
            portDischarge: row.portDischarge ?? undefined,
          },
          create: {
            operationId,
            blNumber: row.bl,
            portLoading: row.portLoading,
            portDischarge: row.portDischarge,
          },
        });

        const exists = await tx.vehicle.findUnique({
          where: { operationId_vin: { operationId, vin: row.vin } },
        });
        if (exists) {
          skipped++;
          continue;
        }

        await tx.vehicle.create({
          data: {
            operationId,
            billOfLadingId: bl.id,
            vin: row.vin,
            chassisNumber: row.vin,
            brand: row.brand,
            weight: row.weight,
            quantity: row.quantity,
          },
        });
        created++;
      }

      await tx.operationImport.create({
        data: {
          operationId,
          fileName,
          totalRows: rows.length,
          validRows: valid.length,
          invalidRows: rows.length - valid.length,
          uploadedById: userId,
        },
      });
    });

    this.audit.record({
      userId,
      module: 'imports',
      action: 'CONFIRM',
      description: `${fileName}: ${created} vehiculos creados, ${skipped} omitidos`,
    });

    return {
      totalRows: rows.length,
      validRows: valid.length,
      invalidRows: rows.length - valid.length,
      vehiclesCreated: created,
      vehiclesSkipped: skipped,
    };
  }

  list(operationId: number) {
    return this.prisma.operationImport.findMany({
      where: { operationId },
      orderBy: { id: 'desc' },
    });
  }
}
