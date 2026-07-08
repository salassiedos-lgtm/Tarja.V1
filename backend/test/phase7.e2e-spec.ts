import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { Workbook } from 'exceljs';
import { AppModule } from '../src/app.module';

const HEADERS = [
  'Commission number', 'Container number', 'B/L number', 'Goods name',
  'Number of pieces', 'Weight(kg)', 'Volume(M3)', 'Cargo code', 'Package',
  'Mark', 'Cargo space', 'Operation time', 'Staff', 'license plate number',
  'Part number/\nchassis number', 'brand', 'model', 'damaged', 'Remark',
];

// Mismo algoritmo de digito verificador que src/common/vin.util.ts, para poder
// generar VINs unicos por corrida que igual pasen la validacion ISO 3779
// (rowsWithWarnings debe dar 0).
const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

function makeVin(serial5: string): string {
  const base = `LEFEDDE10VTP${serial5}`; // '0' en indice 8 es placeholder del check digit
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += TRANSLITERATION[base[i]] * WEIGHTS[i];
  const r = sum % 11;
  const digit = r === 10 ? 'X' : String(r);
  return base.slice(0, 8) + digit + base.slice(9);
}

// vin y bl_number son unicos globales: cada corrida necesita valores propios.
const STAMP = Date.now();
const RUN = STAMP.toString().slice(-8);
const BL = `COSU${RUN}`;
const SERIAL = RUN.slice(-5);
const VIN_A = makeVin(SERIAL);
const VIN_B = makeVin(String((Number(SERIAL) + 1) % 100000).padStart(5, '0'));
const VIN_UNKNOWN = makeVin(String((Number(SERIAL) + 2) % 100000).padStart(5, '0'));

function row(vin: string, container: string) {
  return ['', container, `${BL} `, 'GENERAL CARGO', '1', '1920', '0', 'C01', 'VEI',
    '', '', '', '', '', vin, 'JMC', 'Grand Vigus', '', ''];
}

async function excel(rows: string[][]): Promise<Buffer> {
  const wb = new Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(HEADERS);
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('Fase 7 - Importacion desconsolidado + lookup global (e2e)', () => {
  let app: INestApplication;
  let adminToken: string;
  let supervisorToken: string;
  let tarjadorToken: string;
  let operationId: number;
  const H = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    const srv = app.getHttpServer();

    const login = async (username: string, password: string) =>
      (await request(srv).post('/auth/login').send({ username, password })).body.accessToken;

    adminToken = await login('admin', 'Admin123!');
    supervisorToken = await login('supervisor', 'Super123!');
    tarjadorToken = await login('tarjador', 'Tarja123!');

    const op = await request(srv).post('/operations').set(H(adminToken)).send({
      code: `OP7-${STAMP}`,
      shipName: 'Guang He Kou',
      operationType: 'DESCONSOLIDADO',
    });
    operationId = op.body.id;
    // El nombre de nave se normaliza a MAYUSCULAS.
    expect(op.body.shipName).toBe('GUANG HE KOU');
  });

  afterAll(async () => { await app.close(); });

  it('el supervisor puede importar (no solo el admin)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/operations/${operationId}/imports/confirm`)
      .set(H(supervisorToken))
      .attach('file', await excel([row(VIN_A, 'FCIU1111111'), row(VIN_B, 'FCIU2222222')]), 'd.xlsx')
      .expect(201);

    expect(res.body).toMatchObject({
      newVehicles: 2, existingVehicles: 0, conflictingVehicles: 0,
      blsDetected: 1, rowsWithWarnings: 0,
    });
  });

  it('la reimportacion es aditiva: omite los existentes', async () => {
    const res = await request(app.getHttpServer())
      .post(`/operations/${operationId}/imports/confirm`)
      .set(H(adminToken))
      .attach('file', await excel([row(VIN_A, 'FCIU1111111')]), 'd.xlsx')
      .expect(201);

    expect(res.body).toMatchObject({ newVehicles: 0, existingVehicles: 1 });
  });

  it('el lookup resuelve nave, BL y modelo desde el VIN, sin operationId', async () => {
    const res = await request(app.getHttpServer())
      .get('/vehicles/lookup').query({ vin: VIN_A })
      .set(H(tarjadorToken)).expect(200);

    expect(res.body).toMatchObject({
      vin: VIN_A, brand: 'JMC', model: 'Grand Vigus',
      blNumber: BL, shipName: 'GUANG HE KOU',
      containerNumber: 'FCIU1111111', vehicleStatus: 'PENDIENTE',
      operationId,
    });
  });

  it('un VIN desconocido devuelve 404 y no crea vehiculo', async () => {
    await request(app.getHttpServer()).post('/tarja/start')
      .set(H(tarjadorToken)).send({ vin: VIN_UNKNOWN }).expect(404);

    await request(app.getHttpServer()).get('/vehicles/lookup')
      .query({ vin: VIN_UNKNOWN }).set(H(tarjadorToken)).expect(404);
  });

  it('el correlativo de tarja es numerico y creciente', async () => {
    const srv = app.getHttpServer();
    const r1 = await request(srv).post('/tarja/start').set(H(tarjadorToken)).send({ vin: VIN_A }).expect(201);
    const r2 = await request(srv).post('/tarja/start').set(H(tarjadorToken)).send({ vin: VIN_B }).expect(201);

    expect(r1.body.reportCode).toMatch(/^\d{6,}$/);
    expect(Number(r2.body.reportCode)).toBeGreaterThan(Number(r1.body.reportCode));
  });

  it('no se puede borrar un vehiculo que ya no esta PENDIENTE', async () => {
    const list = await request(app.getHttpServer())
      .get(`/operations/${operationId}/vehicles`).set(H(adminToken)).expect(200);
    const v = list.body.find((x: { vin: string }) => x.vin === VIN_A);

    await request(app.getHttpServer())
      .delete(`/vehicles/${v.id}`).set(H(supervisorToken)).expect(409);
  });

  it('el avance por contenedor agrupa correctamente', async () => {
    const res = await request(app.getHttpServer())
      .get(`/operations/${operationId}/containers`).set(H(supervisorToken)).expect(200);

    expect(res.body).toHaveLength(2);
    expect(res.body[0]).toMatchObject({ containerNumber: 'FCIU1111111', total: 1, complete: false });
  });
});
