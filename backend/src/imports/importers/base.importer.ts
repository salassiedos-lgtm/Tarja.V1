import { BadRequestException } from '@nestjs/common';
import { Workbook, Worksheet } from 'exceljs';
import { validateVin } from '../../common/vin.util';
import { normalizeHeader } from './header.util';
import { ColumnMap, ImportedRow } from './types';

const HEADER_SCAN_ROWS = 10;

export abstract class BaseImporter {
  /** Encabezado normalizado -> campo. */
  protected abstract readonly columns: ColumnMap;
  /** Encabezado normalizado que identifica la fila de cabecera. */
  protected abstract readonly anchorHeader: string;
  /** Nombre legible para los mensajes de error. */
  protected abstract readonly formatName: string;
  /**
   * Factor que se aplica al peso leido para dejarlo SIEMPRE en kg.
   * Desconsolidado/CFS ya viene en kg (1). RO-RO trae toneladas (1000).
   */
  protected readonly weightFactor: number = 1;

  async parse(buffer: Buffer): Promise<ImportedRow[]> {
    const ws = await this.loadSheet(buffer);
    const headerRow = this.findHeaderRow(ws);
    const colMap = this.mapColumns(ws, headerRow);
    return this.readRows(ws, headerRow, colMap);
  }

  private async loadSheet(buffer: Buffer): Promise<Worksheet> {
    const wb = new Workbook();
    try {
      await wb.xlsx.load(buffer as unknown as ArrayBuffer);
    } catch {
      throw new BadRequestException('No se pudo leer el archivo Excel');
    }
    const ws = wb.worksheets[0];
    if (!ws) throw new BadRequestException('El Excel no tiene hojas');
    return ws;
  }

  private findHeaderRow(ws: Worksheet): number {
    const max = Math.min(HEADER_SCAN_ROWS, ws.rowCount);
    for (let r = 1; r <= max; r++) {
      const headers: string[] = [];
      ws.getRow(r).eachCell((cell) => headers.push(normalizeHeader(String(cell.text ?? ''))));
      if (headers.includes(this.anchorHeader)) return r;
    }
    throw new BadRequestException(
      `El archivo no corresponde al formato ${this.formatName}: falta la columna "${this.anchorHeader}"`,
    );
  }

  private mapColumns(ws: Worksheet, headerRow: number): Map<number, keyof ImportedRow> {
    const map = new Map<number, keyof ImportedRow>();
    ws.getRow(headerRow).eachCell((cell, colNumber) => {
      const field = this.columns[normalizeHeader(String(cell.text ?? ''))];
      if (field) map.set(colNumber, field);
    });
    return map;
  }

  private readRows(
    ws: Worksheet,
    headerRow: number,
    colMap: Map<number, keyof ImportedRow>,
  ): ImportedRow[] {
    const rows: ImportedRow[] = [];
    for (let r = headerRow + 1; r <= ws.rowCount; r++) {
      const excelRow = ws.getRow(r);
      const raw: Partial<Record<keyof ImportedRow, string>> = {};
      let hasAny = false;
      colMap.forEach((field, colNumber) => {
        const value = String(excelRow.getCell(colNumber).text ?? '').trim();
        if (value) hasAny = true;
        raw[field] = value;
      });
      if (!hasAny) continue;
      rows.push(this.buildRow(r, raw));
    }
    return rows;
  }

  private buildRow(
    rowNumber: number,
    raw: Partial<Record<keyof ImportedRow, string>>,
  ): ImportedRow {
    const errors: string[] = [];
    const warnings: string[] = [];

    const { vin, formatOk, checkDigitOk } = validateVin(raw.vin ?? '');
    if (!vin) errors.push('VIN vacio');
    else if (!formatOk) warnings.push('VIN no cumple el formato ISO 3779 (17 caracteres, sin I/O/Q)');
    else if (!checkDigitOk) warnings.push('Digito verificador del VIN invalido');

    const bl = (raw.bl ?? '').trim();
    if (!bl) errors.push('BL vacio');

    let quantity = 1;
    if (raw.quantity) {
      const q = Number(raw.quantity.replace(',', '.'));
      if (Number.isFinite(q) && q > 0) quantity = Math.trunc(q);
      else errors.push('Cantidad invalida');
    }

    let weight: number | null = null;
    if (raw.weight) {
      const w = Number(raw.weight.replace(',', '.'));
      // El factor normaliza a kg; el redondeo a 2 decimales evita ruido de coma flotante.
      if (Number.isFinite(w)) weight = Math.round(w * this.weightFactor * 100) / 100;
      else errors.push('Peso invalido');
    }

    return {
      rowNumber,
      vin,
      bl,
      containerNumber: raw.containerNumber?.trim() || null,
      brand: raw.brand?.trim() || null,
      model: raw.model?.trim() || null,
      weight,
      quantity,
      errors,
      warnings,
    };
  }
}
