import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ReportsService } from './reports.service';
import { AnnulDto } from './dto/annul.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class ReportsController {
  constructor(private readonly service: ReportsService) {}

  @Get('reports')
  list(@Query('operationId') operationId?: string) {
    return this.service.listReports(operationId ? Number(operationId) : undefined);
  }

  @Get('reports/annulments')
  annulments() {
    return this.service.listAnnulments();
  }

  @Roles('SUPERVISOR', 'ADMIN')
  @Post('reports/:id/annul')
  annul(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: AnnulDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.annul(id, dto, user.userId);
  }

  @Get('operations/:id/progress')
  progress(@Param('id', ParseIntPipe) id: number) {
    return this.service.progress(id);
  }

  @Get('dashboard/supervisor')
  dashboard() {
    return this.service.dashboard();
  }
}
