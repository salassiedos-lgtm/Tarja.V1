import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportsService } from './imports.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, type AuthUser } from '../auth/current-user.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller('operations/:id/imports')
export class ImportsController {
  constructor(private readonly service: ImportsService) {}

  @Get()
  list(@Param('id', ParseIntPipe) id: number) {
    return this.service.list(id);
  }

  @Post('preview')
  @UseInterceptors(FileInterceptor('file'))
  preview(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('Archivo Excel requerido');
    return this.service.preview(id, file.buffer);
  }

  @Post('confirm')
  @UseInterceptors(FileInterceptor('file'))
  confirm(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: AuthUser,
  ) {
    if (!file) throw new BadRequestException('Archivo Excel requerido');
    return this.service.confirm(id, file.buffer, user.userId, file.originalname);
  }
}
