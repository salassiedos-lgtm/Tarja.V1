import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';
import { EditRequestsService } from './edit-requests.service';
import { ResolveEditRequestDto } from './dto/edit-request.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tarja/edit-requests')
export class EditRequestsController {
  constructor(private readonly service: EditRequestsService) {}

  @Roles('SUPERVISOR', 'ADMIN')
  @Get()
  list(@Query('status') status?: string) {
    return this.service.list(status ?? 'PENDIENTE');
  }

  @Roles('SUPERVISOR', 'ADMIN')
  @Post(':id/resolve')
  resolve(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResolveEditRequestDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.resolve(id, user.userId, dto);
  }

  @Roles('SUPERVISOR', 'ADMIN')
  @Post(':id/cancel')
  cancel(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.service.cancel(id, user.userId);
  }
}
