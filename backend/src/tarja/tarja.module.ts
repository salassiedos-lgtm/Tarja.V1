import { Module } from '@nestjs/common';
import { TarjaController } from './tarja.controller';
import { TarjaService } from './tarja.service';

@Module({
  controllers: [TarjaController],
  providers: [TarjaService],
})
export class TarjaModule {}
