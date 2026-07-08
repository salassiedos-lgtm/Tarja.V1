import { BadRequestException, Injectable } from '@nestjs/common';
import { OperationType } from '@prisma/client';
import { DesconsolidadoImporter } from './desconsolidado.importer';
import { RoroImporter } from './roro.importer';
import { VehicleImporter } from './types';

@Injectable()
export class ImporterRegistry {
  private readonly importers: VehicleImporter[];

  constructor(roro: RoroImporter, desconsolidado: DesconsolidadoImporter) {
    this.importers = [roro, desconsolidado];
  }

  get(operationType: OperationType): VehicleImporter {
    const importer = this.importers.find((i) => i.operationType === operationType);
    if (!importer) {
      throw new BadRequestException(`No hay importador para el tipo ${operationType}`);
    }
    return importer;
  }
}
