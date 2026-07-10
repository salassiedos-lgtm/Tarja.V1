import { EditRequestsService } from './edit-requests.service';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';
import type { RealtimeService } from '../realtime/realtime.service';

function make(over: Partial<Record<string, unknown>> = {}) {
  const prisma = {
    tarjaReport: { findUnique: jest.fn() },
    tarjaEditRequest: { findFirst: jest.fn(), create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    vehicle: { update: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => unknown) => fn(prismaTx)),
    ...over,
  } as unknown as PrismaService;
  const prismaTx = prisma;
  const audit = { record: jest.fn() } as unknown as AuditService;
  const realtime = { emit: jest.fn() } as unknown as RealtimeService;
  return { svc: new EditRequestsService(prisma, audit, realtime), prisma, audit };
}

describe('EditRequestsService.create', () => {
  it('rechaza si no es el dueño', async () => {
    const { svc, prisma } = make();
    (prisma.tarjaReport.findUnique as jest.Mock).mockResolvedValue({
      id: 1, tarjadorId: 5, status: 'FINALIZADO', finishedAt: new Date(Date.now() - 20 * 60_000),
    });
    await expect(svc.create(1, 9, { reason: 'me equivoqué' })).rejects.toThrow('dueñ');
  });

  it('rechaza si aún está dentro de la ventana (no necesita autorización)', async () => {
    const { svc, prisma } = make();
    (prisma.tarjaReport.findUnique as jest.Mock).mockResolvedValue({
      id: 1, tarjadorId: 5, status: 'FINALIZADO', finishedAt: new Date(),
    });
    await expect(svc.create(1, 5, { reason: 'x' })).rejects.toThrow('ventana');
  });

  it('rechaza solicitud duplicada activa', async () => {
    const { svc, prisma } = make();
    (prisma.tarjaReport.findUnique as jest.Mock).mockResolvedValue({
      id: 1, tarjadorId: 5, status: 'FINALIZADO', finishedAt: new Date(Date.now() - 20 * 60_000),
    });
    (prisma.tarjaEditRequest.findFirst as jest.Mock).mockResolvedValue({ id: 99, status: 'PENDIENTE' });
    await expect(svc.create(1, 5, { reason: 'x' })).rejects.toThrow('existe');
  });
});

describe('EditRequestsService.resolve', () => {
  it('rechaza si la solicitud ya fue resuelta', async () => {
    const { svc, prisma } = make();
    (prisma.tarjaEditRequest.findUnique as jest.Mock).mockResolvedValue({ id: 5, status: 'APROBADA' });
    await expect(svc.resolve(5, 9, { approve: true })).rejects.toThrow('resuelta');
  });
});

describe('EditRequestsService.cancel', () => {
  it('rechaza si la solicitud no está APROBADA', async () => {
    const { svc, prisma } = make();
    (prisma.tarjaEditRequest.findUnique as jest.Mock).mockResolvedValue({
      id: 5, status: 'PENDIENTE', report: { id: 1, vehicleId: 2, hasDamage: false, reportCode: '000001' },
    });
    await expect(svc.cancel(5, 9)).rejects.toThrow('en curso');
  });
});
