import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsService } from './imports.service';
import { DesconsolidadoImporter } from './importers/desconsolidado.importer';
import { ImporterRegistry } from './importers/importer.registry';
import { RoroImporter } from './importers/roro.importer';

@Module({
  controllers: [ImportsController],
  providers: [ImportsService, ImporterRegistry, RoroImporter, DesconsolidadoImporter],
})
export class ImportsModule {}
