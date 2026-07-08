import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class VehiclesController {
  constructor(private readonly service: VehiclesService) {}

  @Get('operations/:id/vehicles')
  findByOperation(
    @Param('id', ParseIntPipe) id: number,
    @Query('vin') vin?: string,
  ) {
    return this.service.findByOperation(id, vin);
  }

  @Get('vehicles/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }
}
