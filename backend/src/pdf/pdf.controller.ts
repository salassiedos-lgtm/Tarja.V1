import { Controller, Get, Param, ParseIntPipe, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { PdfService } from './pdf.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class PdfController {
  constructor(private readonly service: PdfService) {}

  @Roles('SUPERVISOR', 'ADMIN')
  @Get('reports/:id/pdf')
  async pdf(@Param('id', ParseIntPipe) id: number, @Res() res: Response) {
    const buf = await this.service.generate(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="reporte-${id}.pdf"`,
      'Content-Length': String(buf.length),
    });
    res.end(buf);
  }
}
