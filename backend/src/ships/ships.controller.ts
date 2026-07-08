import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ShipsService } from './ships.service';

@UseGuards(JwtAuthGuard)
@Controller('ships')
export class ShipsController {
  constructor(private readonly service: ShipsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
