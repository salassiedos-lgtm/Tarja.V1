import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ShipsController } from './ships.controller';
import { ShipsService } from './ships.service';

@Module({
  imports: [PrismaModule],
  controllers: [ShipsController],
  providers: [ShipsService],
  exports: [ShipsService],
})
export class ShipsModule {}
