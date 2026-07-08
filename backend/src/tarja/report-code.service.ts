import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Correlativo continuo de tarja fisica, ej. "055536". Nunca se reinicia. */
@Injectable()
export class ReportCodeService {
  constructor(private readonly prisma: PrismaService) {}

  async next(tx?: Prisma.TransactionClient): Promise<string> {
    const client = tx ?? this.prisma;
    const [{ nextval }] = await client.$queryRaw<[{ nextval: bigint }]>(
      Prisma.sql`SELECT nextval('tarja_report_code_seq') AS nextval`,
    );
    return nextval.toString().padStart(6, '0');
  }
}
