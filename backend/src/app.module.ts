import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ShipsModule } from './ships/ships.module';
import { OperationsModule } from './operations/operations.module';
import { VehiclesModule } from './vehicles/vehicles.module';
import { AccessoriesModule } from './accessories/accessories.module';
import { ImportsModule } from './imports/imports.module';
import { TarjaModule } from './tarja/tarja.module';
import { ReportsModule } from './reports/reports.module';
import { PdfModule } from './pdf/pdf.module';
import { AuditModule } from './audit/audit.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({ throttlers: [{ ttl: 60_000, limit: 100 }] }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    ShipsModule,
    OperationsModule,
    VehiclesModule,
    AccessoriesModule,
    ImportsModule,
    TarjaModule,
    ReportsModule,
    PdfModule,
    MonitoringModule,
    ScheduleModule.forRoot(),
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
