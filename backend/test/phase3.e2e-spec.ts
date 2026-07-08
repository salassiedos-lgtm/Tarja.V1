import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Workbook } from 'exceljs';
import { AppModule } from '../src/app.module';

// vin y bl_number son unicos globales: cada corrida necesita valores propios,
// si no la segunda ejecucion los ve como "de otra operacion" y los rechaza.
const RUN = Date.now().toString().slice(-8);
const VIN_1 = `VINT3${RUN}01`;
const VIN_2 = `VINT3${RUN}02`;
const VIN_NOPLAN = `NOPLAN3${RUN}`;
const BL_1 = `BL-T3-${RUN}`;

async function makeExcel(): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow(['Nave', 'VIN', 'BL', 'Cantidad', 'Marca', 'Peso', 'Puerto embarque', 'Puerto descarga']);
  ws.addRow(['NAVE T3', VIN_1, BL_1, 1, 'Toyota', 1500, 'SH', 'Chancay']);
  ws.addRow(['NAVE T3', VIN_2, BL_1, 1, 'Kia', 1200, 'SH', 'Chancay']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('Fase 3 - Tarja (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let tarjadorToken: string;
  let operationId: number;
  const H = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    const srv = app.getHttpServer();
    adminToken = (
      await request(srv).post('/auth/login').send({ username: 'admin', password: 'Admin123!' })
    ).body.accessToken;
    tarjadorToken = (
      await request(srv).post('/auth/login').send({ username: 'tarjador', password: 'Tarja123!' })
    ).body.accessToken;

    const op = await request(srv)
      .post('/operations')
      .set(H(adminToken))
      .send({ code: `OP3-${Date.now()}`, shipName: 'Nave T3', operationType: 'ROLL_ON_ROLL_OFF' });
    operationId = op.body.id;

    await request(srv)
      .post(`/operations/${operationId}/imports/confirm`)
      .set(H(adminToken))
      .attach('file', await makeExcel(), 't3.xlsx');
  });

  afterAll(async () => {
    await app.close();
  });

  it('tarjador inicia, registra daños=false y finaliza (FINALIZADO)', async () => {
    const srv = app.getHttpServer();
    const start = await request(srv)
      .post('/tarja/start')
      .set(H(tarjadorToken))
      .send({ operationId, vin: VIN_1 })
      .expect(201);
    const reportId = start.body.id;
    expect(start.body.status).toBe('BORRADOR');

    await request(srv)
      .patch(`/tarja/${reportId}/damages`)
      .set(H(tarjadorToken))
      .send({ hasDamage: false })
      .expect(200);

    const finish = await request(srv)
      .post(`/tarja/${reportId}/finish`)
      .set(H(tarjadorToken))
      .send({ initials: 'TJ1' })
      .expect(201);
    expect(finish.body.status).toBe('FINALIZADO');
  });

  it('no permite re-tarjar un vehiculo ya tarjado (409)', async () => {
    await request(app.getHttpServer())
      .post('/tarja/start')
      .set(H(tarjadorToken))
      .send({ operationId, vin: VIN_1 })
      .expect(409);
  });

  it('bloquea doble proceso concurrente del mismo vehiculo (409)', async () => {
    const srv = app.getHttpServer();
    await request(srv)
      .post('/tarja/start')
      .set(H(tarjadorToken))
      .send({ operationId, vin: VIN_2 })
      .expect(201);
    await request(srv)
      .post('/tarja/start')
      .set(H(tarjadorToken))
      .send({ operationId, vin: VIN_2 })
      .expect(409);
  });

  it('supervisor/admin libera el candado', async () => {
    const srv = app.getHttpServer();
    const vehicles = await request(srv)
      .get(`/operations/${operationId}/vehicles?vin=${VIN_2}`)
      .set(H(adminToken));
    const vId = vehicles.body[0].id;
    await request(srv).post(`/vehicles/${vId}/release`).set(H(adminToken)).expect(201);
  });

  it('VIN no planificado genera reporte igualmente', async () => {
    const start = await request(app.getHttpServer())
      .post('/tarja/start')
      .set(H(tarjadorToken))
      .send({ operationId, vin: VIN_NOPLAN })
      .expect(201);
    expect(start.body.id).toBeDefined();
  });
});
