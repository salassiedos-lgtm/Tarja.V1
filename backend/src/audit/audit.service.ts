import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEvent {
  userId?: number | null;
  username?: string | null;
  role?: string | null;
  module: string;
  action: string;
  description?: string;
  oldValue?: string;
  newValue?: string;
  ip?: string;
  device?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  // Fire-and-forget: la auditoria nunca debe romper el flujo principal.
  record(e: AuditEvent): void {
    void this.prisma.auditLog
      .create({
        data: {
          userId: e.userId ?? null,
          username: e.username ?? null,
          role: e.role ?? null,
          module: e.module,
          action: e.action,
          description: e.description ?? null,
          oldValue: e.oldValue ?? null,
          newValue: e.newValue ?? null,
          ipAddress: e.ip ?? null,
          deviceInfo: e.device ?? null,
        },
      })
      .catch(() => undefined);
  }

  list(limit = 200) {
    return this.prisma.auditLog.findMany({ orderBy: { id: 'desc' }, take: limit });
  }
}
