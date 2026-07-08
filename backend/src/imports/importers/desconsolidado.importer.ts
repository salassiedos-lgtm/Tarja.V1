import { Injectable } from '@nestjs/common';
import { OperationType } from '@prisma/client';
import { BaseImporter } from './base.importer';
import { ColumnMap, VehicleImporter } from './types';

@Injectable()
export class DesconsolidadoImporter extends BaseImporter implements VehicleImporter {
  readonly operationType = OperationType.DESCONSOLIDADO;
  protected readonly formatName = 'Desconsolidado';
  protected readonly anchorHeader = 'part number/chassis number';
  protected readonly columns: ColumnMap = {
    'part number/chassis number': 'vin',
    'b/l number': 'bl',
    'container number': 'containerNumber',
    brand: 'brand',
    model: 'model',
    'weight(kg)': 'weight',
    'number of pieces': 'quantity',
  };
}
