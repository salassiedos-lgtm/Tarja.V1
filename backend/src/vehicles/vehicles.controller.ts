import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { VehiclesService } from './vehicles.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

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

  @Get('vehicles/lookup')
  lookup(@Query('vin') vin: string) {
    if (!vin) throw new BadRequestException('Parametro vin requerido');
    return this.service.lookup(vin);
  }

  // Debe declararse ANTES de 'vehicles/:id': Nest empareja en orden de
  // declaracion y ':id' capturaria la cadena 'search', reventando en
  // ParseIntPipe con un 400.
  @Get('vehicles/search')
  search(@Query('q') q?: string) {
    return this.service.search(q ?? '');
  }

  // Tablero por B/L (Cuadro de Tareas). Declarado antes de 'vehicles/:id' por higiene de rutas.
  @Get('bls/board')
  blBoard() {
    return this.service.blBoard();
  }

  @Get('bls/:id/vehicles')
  blVehicles(@Param('id', ParseIntPipe) id: number) {
    return this.service.blVehicles(id);
  }

  @Get('vehicles/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Delete('vehicles/:id')
  @Roles('ADMIN', 'SUPERVISOR')
  remove(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, user.userId);
  }

  @Get('operations/:id/containers')
  containers(@Param('id', ParseIntPipe) id: number) {
    return this.service.containerProgress(id);
  }
}
