import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { verifyPassword } from './password.util';

type UserWithRole = Prisma.UserGetPayload<{ include: { role: true } }>;

const MAX_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { role: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Credenciales invalidas');
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedException(
        'Cuenta bloqueada temporalmente por intentos fallidos. Intente mas tarde.',
      );
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      await this.registerFailedAttempt(user);
      this.audit.record({ username, module: 'auth', action: 'LOGIN_FAILED' });
      throw new UnauthorizedException('Credenciales invalidas');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    this.audit.record({
      userId: user.id,
      username: user.username,
      role: user.role.name,
      module: 'auth',
      action: 'LOGIN',
    });
    return this.issueTokens(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      const accessToken = await this.jwt.signAsync(
        { sub: payload.sub, username: payload.username, role: payload.role },
        {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
          expiresIn: this.config.getOrThrow<string>(
            'JWT_ACCESS_TTL',
          ) as JwtSignOptions['expiresIn'],
        },
      );
      return { accessToken };
    } catch {
      throw new UnauthorizedException('Refresh token invalido');
    }
  }

  private async registerFailedAttempt(user: UserWithRole) {
    const attempts = user.failedLoginAttempts + 1;
    const shouldLock = attempts >= MAX_ATTEMPTS;
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: shouldLock ? 0 : attempts,
        lockedUntil: shouldLock
          ? new Date(Date.now() + LOCK_MINUTES * 60_000)
          : null,
      },
    });
  }

  private async issueTokens(user: UserWithRole) {
    const role = user.role.name;
    const payload = { sub: user.id, username: user.username, role };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.getOrThrow<string>(
        'JWT_ACCESS_TTL',
      ) as JwtSignOptions['expiresIn'],
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.getOrThrow<string>(
        'JWT_REFRESH_TTL',
      ) as JwtSignOptions['expiresIn'],
    });
    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        lastname: user.lastname,
        initials: user.initials,
        role,
      },
    };
  }
}
