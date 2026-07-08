import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly prisma: PrismaService) {}

  @Roles('ADMIN')
  @Get()
  findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        name: true,
        lastname: true,
        status: true,
        role: { select: { name: true } },
      },
      orderBy: { id: 'asc' },
    });
  }
}
