import { Module } from '@nestjs/common';
import { AccessoriesController } from './accessories.controller';
import { AccessoriesService } from './accessories.service';

@Module({
  controllers: [AccessoriesController],
  providers: [AccessoriesService],
})
export class AccessoriesModule {}
