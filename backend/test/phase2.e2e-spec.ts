import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Workbook } from 'exceljs';
import { AppModule } from '../src/app.module';

async function makeExcel(): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Hoja1');
  ws.addRow([
    'Nave',
    'VIN',
    'BL',
    'Cantidad',
    'Marca',
    'Peso',
    'Puerto embarque',
    'Puerto descarga',
  ]);
  ws.addRow(['NAVE TEST', 'VINTEST0000000001', 'BL-001', 1, 'Toyota', 1500, 'Shanghai', 'Chancay']);
  ws.addRow(['NAVE TEST', 'VINTEST0000000002', 'BL-001', 1, 'Kia', 1200, 'Shanghai', 'Chancay']);
  ws.addRow(['NAVE TEST', '', 'BL-002', 1, 'SinVin', 1000, 'Shanghai', 'Chancay']);
  const arr = await wb.xlsx.writeBuffer();
  return Buffer.from(arr);
}

describe('Fase 2 (e2e)', () => {
  let app: INestApplication;
  let token: string;
  let operationId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'Admin123!' });
    token = login.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /accessories devuelve al menos 16 accesorios', async () => {
    const res = await request(app.getHttpServer())
      .get('/accessories')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.length).toBeGreaterThanOrEqual(16);
  });

  it('crea una operacion (solo ADMIN)', async () => {
    const code = `OP-${Date.now()}`;
    const res = await request(app.getHttpServer())
      .post('/operations')
      .set('Authorization', `Bearer ${token}`)
      .send({ code, shipName: 'Nave Test', operationType: 'ROLL_ON_ROLL_OFF' })
      .expect(201);
    operationId = res.body.id;
    expect(operationId).toBeDefined();
  });

  it('preview del Excel detecta filas validas e invalidas', async () => {
    const buffer = await makeExcel();
    const res = await request(app.getHttpServer())
      .post(`/operations/${operationId}/imports/preview`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'test.xlsx')
      .expect(201);
    expect(res.body.totalRows).toBe(3);
    expect(res.body.validRows).toBe(2);
    expect(res.body.invalidRows).toBe(1);
  });

  it('confirm importa los vehiculos validos', async () => {
    const buffer = await makeExcel();
    const res = await request(app.getHttpServer())
      .post(`/operations/${operationId}/imports/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .attach('file', buffer, 'test.xlsx')
      .expect(201);
    expect(res.body.vehiclesCreated).toBe(2);

    const vehicles = await request(app.getHttpServer())
      .get(`/operations/${operationId}/vehicles`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(vehicles.body.length).toBe(2);
  });
});
