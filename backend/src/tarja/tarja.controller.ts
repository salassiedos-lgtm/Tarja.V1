import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TarjaService } from './tarja.service';
import {
  FinishTarjaDto,
  SetAccessoriesDto,
  SetDamagesDto,
  StartTarjaDto,
} from './dto/tarja.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TarjaController {
  constructor(private readonly service: TarjaService) {}

  @Roles('TARJADOR')
  @Post('tarja/start')
  start(@Body() dto: StartTarjaDto, @CurrentUser() user: AuthUser) {
    return this.service.start(dto, user.userId);
  }

  @Roles('TARJADOR')
  @Patch('tarja/:id/accessories')
  accessories(@Param('id', ParseIntPipe) id: number, @Body() dto: SetAccessoriesDto) {
    return this.service.setAccessories(id, dto);
  }

  @Roles('TARJADOR')
  @Patch('tarja/:id/damages')
  damages(@Param('id', ParseIntPipe) id: number, @Body() dto: SetDamagesDto) {
    return this.service.setDamages(id, dto);
  }

  @Roles('TARJADOR')
  @Post('tarja/:id/finish')
  finish(@Param('id', ParseIntPipe) id: number, @Body() dto: FinishTarjaDto) {
    return this.service.finish(id, dto);
  }

  @Get('tarja/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Roles('SUPERVISOR', 'ADMIN')
  @Post('vehicles/:id/release')
  release(@Param('id', ParseIntPipe) id: number) {
    return this.service.release(id);
  }
}
