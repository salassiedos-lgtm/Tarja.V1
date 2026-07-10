import { Module } from '@nestjs/common';
import { TarjaController } from './tarja.controller';
import { EditRequestsController } from './edit-requests.controller';
import { TarjaService } from './tarja.service';
import { EditRequestsService } from './edit-requests.service';
import { ReportCodeService } from './report-code.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  // EditRequestsController va PRIMERO: su ruta literal `/tarja/edit-requests`
  // debe registrarse antes que el comodín `GET /tarja/:id` de TarjaController,
  // que si no la ensombrece (ParseIntPipe -> 400 "numeric string expected").
  controllers: [EditRequestsController, TarjaController],
  providers: [TarjaService, EditRequestsService, ReportCodeService],
})
export class TarjaModule {}
