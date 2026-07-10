import { TarjaService } from './tarja.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { RealtimeService } from '../realtime/realtime.service';
import type { AuditService } from '../audit/audit.service';
import type { ReportCodeService } from './report-code.service';

function makeService(reportFindUnique: jest.Mock, editReqCount: jest.Mock) {
  const prisma = {
    tarjaReport: { findUnique: reportFindUnique },
    tarjaEditRequest: { count: editReqCount },
  } as unknown as PrismaService;
  const realtime = { emit: jest.fn() } as unknown as RealtimeService;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const reportCode = { next: jest.fn() } as unknown as ReportCodeService;
  return new TarjaService(prisma, realtime, audit, reportCode);
}

describe('TarjaService.reopen guardas', () => {
  const finished = {
    id: 1,
    tarjadorId: 5,
    status: 'FINALIZADO',
    finishedAt: new Date(Date.now() - 20 * 60_000), // hace 20 min (ventana vencida)
    vehicleId: 10,
    operationId: 3,
  };

  it('no-dueño → ForbiddenException', async () => {
    const svc = makeService(jest.fn().mockResolvedValue(finished), jest.fn().mockResolvedValue(0));
    await expect(svc.reopen(1, 9)).rejects.toThrow('tarjador');
  });

  it('ventana vencida sin aprobación → BadRequest REQUIERE_AUTORIZACION', async () => {
    const svc = makeService(jest.fn().mockResolvedValue(finished), jest.fn().mockResolvedValue(0));
    await expect(svc.reopen(1, 5)).rejects.toThrow('autoriz');
  });
});
