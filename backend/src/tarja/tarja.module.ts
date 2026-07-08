import { Module } from '@nestjs/common';
import { TarjaController } from './tarja.controller';
import { TarjaService } from './tarja.service';
import { RealtimeModule } from '../realtime/realtime.module';

@Module({
  imports: [RealtimeModule],
  controllers: [TarjaController],
  providers: [TarjaService],
})
export class TarjaModule {}
