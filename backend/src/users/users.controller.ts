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
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';
import {
  CreateUserDto,
  ResetPasswordDto,
  SetStatusDto,
  UpdateUserDto,
} from './dto/user.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Roles('ADMIN', 'SUPERVISOR')
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return this.service.create(actor, dto);
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.service.update(actor, id, dto);
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Patch(':id/status')
  setStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetStatusDto,
  ) {
    return this.service.setStatus(actor, id, dto);
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Patch(':id/password')
  resetPassword(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.service.resetPassword(actor, id, dto);
  }
}
