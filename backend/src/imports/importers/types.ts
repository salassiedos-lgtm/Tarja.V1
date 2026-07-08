import { OperationType } from '@prisma/client';

/** Una fila del Excel ya mapeada al vocabulario del sistema. */
export interface ImportedRow {
  rowNumber: number;
  vin: string;
  bl: string;
  containerNumber: string | null;
  brand: string | null;
  model: string | null;
  weight: number | null;
  quantity: number;
  /** Bloquean la importacion de la fila. */
  errors: string[];
  /** No bloquean. Ej: digito verificador invalido. */
  warnings: string[];
}

export interface VehicleImporter {
  readonly operationType: OperationType;
  parse(buffer: Buffer): Promise<ImportedRow[]>;
}

/** Clave normalizada del encabezado -> campo destino. */
export type ColumnMap = Record<string, keyof ImportedRow>;
