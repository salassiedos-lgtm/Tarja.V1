import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Workbook } from 'exceljs';
import { AppModule } from '../src/app.module';

// vin y bl_number son unicos globales: cada corrida necesita valores propios.
const RUN = Date.now().toString().slice(-8);
const VIN_1 = `VINT4${RUN}01`;
const BL_1 = `BL-T4-${RUN}`;

async function makeExcel(): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow(['Nave', 'VIN', 'BL', 'Cantidad', 'Marca', 'Peso', 'Puerto embarque', 'Puerto descarga']);
  ws.addRow(['NAVE T4', VIN_1, BL_1, 1, 'Toyota', 1500, 'SH', 'Chancay']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('Fase 4 - Supervisor (e2e)', () => {
  let app: INestApplication;
  let adminT: string;
  let tarjadorT: string;
  let supervisorT: string;
  let operationId: number;
  let reportId: number;
  const H = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    const s = app.getHttpServer();

    adminT = (await request(s).post('/auth/login').send({ username: 'admin', password: 'Admin123!' })).body.accessToken;
    tarjadorT = (await request(s).post('/auth/login').send({ username: 'tarjador', password: 'Tarja123!' })).body.accessToken;
    supervisorT = (await request(s).post('/auth/login').send({ username: 'supervisor', password: 'Super123!' })).body.accessToken;

    const op = await request(s)
      .post('/operations')
      .set(H(adminT))
      .send({ code: `OP4-${Date.now()}`, shipName: 'Nave T4', operationType: 'ROLL_ON_ROLL_OFF' });
    operationId = op.body.id;
    await request(s)
      .post(`/operations/${operationId}/imports/confirm`)
      .set(H(adminT))
      .attach('file', await makeExcel(), 't4.xlsx');

    const start = await request(s)
      .post('/tarja/start')
      .set(H(tarjadorT))
      .send({ vin: VIN_1 });
    reportId = start.body.id;
    await request(s).post(`/tarja/${reportId}/finish`).set(H(tarjadorT)).send({ initials: 'TJ1' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('lista reportes de la operacion', async () => {
    const res = await request(app.getHttpServer())
      .get(`/reports?operationId=${operationId}`)
      .set(H(supervisorT))
      .expect(200);
    expect(res.body.some((r: { id: number }) => r.id === reportId)).toBe(true);
  });

  it('supervisor anula el reporte finalizado', async () => {
    const res = await request(app.getHttpServer())
      .post(`/reports/${reportId}/annul`)
      .set(H(supervisorT))
      .send({ reason: 'Error de registro' })
      .expect(201);
    expect(res.body.status).toBe('ANULADO');
  });

  it('tarjador no puede anular (403)', async () => {
    await request(app.getHttpServer())
      .post(`/reports/${reportId}/annul`)
      .set(H(tarjadorT))
      .send({ reason: 'intento' })
      .expect(403);
  });

  it('progreso refleja vehiculo REABIERTO', async () => {
    const res = await request(app.getHttpServer())
      .get(`/operations/${operationId}/progress`)
      .set(H(supervisorT))
      .expect(200);
    expect(res.body.byStatus.REABIERTO).toBeGreaterThanOrEqual(1);
  });

  it('dashboard supervisor responde', async () => {
    const res = await request(app.getHttpServer())
      .get('/dashboard/supervisor')
      .set(H(supervisorT))
      .expect(200);
    expect(Array.isArray(res.body.operations)).toBe(true);
    expect(Array.isArray(res.body.recent)).toBe(true);
  });

  it('tras anular, el vehiculo puede re-tarjarse', async () => {
    const start = await request(app.getHttpServer())
      .post('/tarja/start')
      .set(H(tarjadorT))
      .send({ vin: VIN_1 })
      .expect(201);
    expect(start.body.status).toBe('BORRADOR');
  });
});
