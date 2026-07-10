import { Injectable } from '@nestjs/common';
import { OperationType } from '@prisma/client';
import { BaseImporter } from './base.importer';
import { ColumnMap, VehicleImporter } from './types';

/**
 * Importador RO-RO / Transbordo. Formato del Excel "CHASIS TRANSBORDO":
 *   NRO | B/L | CHASIS NUMBER | TIPO CARGA | BULTOS | TONS | MARCA | DAMAGE | BAR CODE | ZONA
 * Solo se toman los campos utiles: BL, chasis (como VIN), tipo de carga (-> modelo),
 * bultos (-> cantidad), tons (-> peso, convertido a kg) y marca. DAMAGE/BAR CODE/ZONA se ignoran.
 */
@Injectable()
export class RoroImporter extends BaseImporter implements VehicleImporter {
  readonly operationType = OperationType.ROLL_ON_ROLL_OFF;
  protected readonly formatName = 'RO-RO (Transbordo)';
  protected readonly anchorHeader = 'chasis number';
  protected readonly weightFactor = 1000; // TONS -> kg
  protected readonly columns: ColumnMap = {
    'chasis number': 'vin',
    'chassis number': 'vin',
    'b/l': 'bl',
    bl: 'bl',
    marca: 'brand',
    'tipo carga': 'model',
    'tipo de carga': 'model',
    bultos: 'quantity',
    cantidad: 'quantity',
    tons: 'weight',
    toneladas: 'weight',
  };
}
