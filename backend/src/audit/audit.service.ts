import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

export interface AuditQuery {
  module?: string;
  action?: string;
  userId?: number;
  from?: string;
  to?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

/** Cota de seguridad para la exportación: evita volcar la tabla entera de golpe. */
const EXPORT_CAP = 5000;

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

  /** Construye el filtro Prisma común a la consulta paginada y a la exportación. */
  private buildWhere(query: AuditQuery): Prisma.AuditLogWhereInput {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.module) where.module = query.module;
    if (query.action) where.action = query.action;
    if (typeof query.userId === 'number' && !Number.isNaN(query.userId)) {
      where.userId = query.userId;
    }

    const createdAt: Prisma.DateTimeFilter = {};
    const from = query.from ? new Date(`${query.from}T00:00:00`) : null;
    const to = query.to ? new Date(`${query.to}T23:59:59.999`) : null;
    if (from && !Number.isNaN(from.getTime())) createdAt.gte = from;
    if (to && !Number.isNaN(to.getTime())) createdAt.lte = to;
    if (createdAt.gte || createdAt.lte) where.createdAt = createdAt;

    const q = query.q?.trim();
    if (q) {
      where.OR = [
        { username: { contains: q, mode: 'insensitive' } },
        { description: { contains: q, mode: 'insensitive' } },
        { action: { contains: q, mode: 'insensitive' } },
        { module: { contains: q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  /** Consulta paginada con filtros. Devuelve la ventana y el total que casa. */
  async query(query: AuditQuery): Promise<{ rows: Prisma.AuditLogGetPayload<object>[]; total: number }> {
    const where = this.buildWhere(query);
    const take = Math.min(Math.max(query.limit ?? 200, 1), 1000);
    const skip = Math.max(query.offset ?? 0, 0);
    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, orderBy: { id: 'desc' }, take, skip }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { rows, total };
  }

  /** Exporta a CSV (con BOM para Excel) las filas que casan con el filtro. */
  async exportCsv(query: AuditQuery): Promise<string> {
    const where = this.buildWhere(query);
    const rows = await this.prisma.auditLog.findMany({
      where,
      orderBy: { id: 'desc' },
      take: EXPORT_CAP,
    });

    const header = [
      'Fecha',
      'Hora',
      'Usuario',
      'Rol',
      'Modulo',
      'Accion',
      'Descripcion',
      'Valor anterior',
      'Valor nuevo',
      'IP',
    ];
    const lines = [header.map(csvCell).join(',')];
    for (const r of rows) {
      const d = r.createdAt;
      const p = (n: number) => String(n).padStart(2, '0');
      const fecha = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
      const hora = `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
      lines.push(
        [
          fecha,
          hora,
          r.username ?? (r.userId != null ? `#${r.userId}` : 'Sistema'),
          r.role ?? '',
          r.module,
          r.action,
          r.description ?? '',
          r.oldValue ?? '',
          r.newValue ?? '',
          r.ipAddress ?? '',
        ]
          .map(csvCell)
          .join(','),
      );
    }
    // BOM para que Excel respete los acentos.
    return '﻿' + lines.join('\r\n');
  }
}

/** Escapa una celda CSV: comillas dobladas y envuelto si contiene separadores. */
function csvCell(value: string | number): string {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
