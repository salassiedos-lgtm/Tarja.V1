import { Module } from '@nestjs/common';
import { TarjaController } from './tarja.controller';
import { EditRequestsController } from './edit-requests.controller';
import { TarjaService } from './tarja.service';
import { EditRequestsService } from './edit-requests.service';
import { ReportCodeService } from './report-code.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [TarjaController, EditRequestsController],
  providers: [TarjaService, EditRequestsService, ReportCodeService],
})
export class TarjaModule {}
