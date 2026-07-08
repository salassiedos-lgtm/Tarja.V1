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
import { OperationStatus } from '@prisma/client';
import { OperationsService } from './operations.service';
import { CreateOperationDto, UpdateOperationDto } from './dto/operation.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('operations')
export class OperationsController {
  constructor(private readonly service: OperationsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Roles('ADMIN')
  @Post()
  create(@Body() dto: CreateOperationDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, user.userId);
  }

  @Roles('ADMIN')
  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOperationDto) {
    return this.service.update(id, dto);
  }

  @Roles('ADMIN')
  @Post(':id/activate')
  activate(@Param('id', ParseIntPipe) id: number) {
    return this.service.setStatus(id, OperationStatus.ACTIVA);
  }

  @Roles('ADMIN')
  @Post(':id/pause')
  pause(@Param('id', ParseIntPipe) id: number) {
    return this.service.setStatus(id, OperationStatus.PAUSADA);
  }

  @Roles('ADMIN')
  @Post(':id/close')
  close(@Param('id', ParseIntPipe) id: number) {
    return this.service.setStatus(id, OperationStatus.CERRADA);
  }
}
