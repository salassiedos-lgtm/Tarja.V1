import { Injectable } from '@nestjs/common';
import { OperationType } from '@prisma/client';
import { BaseImporter } from './base.importer';
import { ColumnMap, VehicleImporter } from './types';

@Injectable()
export class RoroImporter extends BaseImporter implements VehicleImporter {
  readonly operationType = OperationType.ROLL_ON_ROLL_OFF;
  protected readonly formatName = 'RORO';
  protected readonly anchorHeader = 'vin';
  protected readonly columns: ColumnMap = {
    vin: 'vin',
    bl: 'bl',
    marca: 'brand',
    modelo: 'model',
    peso: 'weight',
    cantidad: 'quantity',
  };
}
