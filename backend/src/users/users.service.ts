import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password.util';
import { type AuthUser } from '../auth/current-user.decorator';
import {
  CreateUserDto,
  ResetPasswordDto,
  SetStatusDto,
  UpdateUserDto,
} from './dto/user.dto';

const SELECT = {
  id: true,
  username: true,
  name: true,
  lastname: true,
  email: true,
  status: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.user.findMany({ select: SELECT, orderBy: { id: 'asc' } });
  }

  async create(actor: AuthUser, dto: CreateUserDto) {
    this.ensureCanManageRole(actor, dto.role);
    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) throw new NotFoundException('Rol no encontrado');

    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          lastname: dto.lastname,
          username: dto.username,
          email: dto.email,
          passwordHash,
          roleId: role.id,
        },
        select: SELECT,
      });
      this.audit.record({
        userId: actor.userId,
        username: actor.username,
        role: actor.role,
        module: 'users',
        action: 'USER_CREATED',
        description: `Usuario creado: ${user.username} (${user.role.name})`,
      });
      return user;
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async update(actor: AuthUser, id: number, dto: UpdateUserDto) {
    const target = await this.findOrThrow(id);
    this.ensureCanManageRole(actor, target.role.name);
    if (dto.role) this.ensureCanManageRole(actor, dto.role);

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.lastname !== undefined) data.lastname = dto.lastname;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.role !== undefined) {
      const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
      if (!role) throw new NotFoundException('Rol no encontrado');
      data.role = { connect: { id: role.id } };
    }

    try {
      const user = await this.prisma.user.update({ where: { id }, data, select: SELECT });
      this.audit.record({
        userId: actor.userId,
        username: actor.username,
        role: actor.role,
        module: 'users',
        action: 'USER_UPDATED',
        description: `Usuario actualizado: ${user.username}`,
      });
      return user;
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async setStatus(actor: AuthUser, id: number, dto: SetStatusDto) {
    if (actor.userId === id) {
      throw new ForbiddenException('No puedes desactivar tu propia cuenta');
    }
    const target = await this.findOrThrow(id);
    this.ensureCanManageRole(actor, target.role.name);

    const user = await this.prisma.user.update({
      where: { id },
      data: { status: dto.status },
      select: SELECT,
    });
    this.audit.record({
      userId: actor.userId,
      username: actor.username,
      role: actor.role,
      module: 'users',
      action: 'USER_STATUS_CHANGED',
      description: `Estado de ${user.username} cambiado a ${dto.status}`,
    });
    return user;
  }

  async resetPassword(actor: AuthUser, id: number, dto: ResetPasswordDto) {
    const target = await this.findOrThrow(id);
    this.ensureCanManageRole(actor, target.role.name);

    const passwordHash = await hashPassword(dto.password);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    this.audit.record({
      userId: actor.userId,
      username: actor.username,
      role: actor.role,
      module: 'users',
      action: 'USER_PASSWORD_RESET',
      description: `Contrasena restablecida para ${target.username}`,
    });
    return { id };
  }

  private async findOrThrow(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SELECT });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  private ensureCanManageRole(actor: AuthUser, targetRole: RoleName) {
    if (actor.role === 'ADMIN') return;
    if (actor.role === 'SUPERVISOR' && targetRole === 'TARJADOR') return;
    throw new ForbiddenException('No autorizado para gestionar este usuario');
  }

  private mapUniqueError(err: unknown): unknown {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('El usuario o email ya esta en uso');
    }
    return err;
  }
}
