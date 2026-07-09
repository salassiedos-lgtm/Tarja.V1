import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

// Mismo algoritmo de digito verificador que src/common/vin.util.ts, para generar
// VINs unicos por corrida que igual pasen la validacion ISO 3779.
const TRANSLITERATION: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
};
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

function makeVin(serial5: string): string {
  const base = `LEFEDDE10VTP${serial5}`; // indice 8 es placeholder del check digit
  let sum = 0;
  for (let i = 0; i < 17; i++) sum += TRANSLITERATION[base[i]] * WEIGHTS[i];
  const r = sum % 11;
  return base.slice(0, 8) + (r === 10 ? 'X' : String(r)) + base.slice(9);
}

// vin es unico global: cada corrida necesita sus propios valores.
const RUN = Date.now().toString().slice(-8);
const SUFFIX = RUN.slice(-5);
const bump = (n: number) => String((Number(SUFFIX) + n) % 100000).padStart(5, '0');

const VIN_PENDIENTE = makeVin(SUFFIX);
const VIN_TARJADO = makeVin(bump(1));
const VIN_CERRADA = makeVin(bump(2));

describe('GET /vehicles/search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let token: string;
  const vehicleIds: number[] = [];
  let activaId: number;
  let cerradaId: number;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    prisma = app.get(PrismaService);

    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'tarjador', password: 'Tarja123!' });
    token = login.body.accessToken;

    const ship = await prisma.ship.upsert({
      where: { name: 'NAVE SEARCH E2E' },
      update: {},
      create: { name: 'NAVE SEARCH E2E' },
    });

    const activa = await prisma.operation.create({
      data: {
        code: `SRCH-A-${RUN}`,
        shipId: ship.id,
        operationType: 'ROLL_ON_ROLL_OFF',
        status: 'ACTIVA',
      },
    });
    const cerrada = await prisma.operation.create({
      data: {
        code: `SRCH-C-${RUN}`,
        shipId: ship.id,
        operationType: 'ROLL_ON_ROLL_OFF',
        status: 'CERRADA',
      },
    });
    activaId = activa.id;
    cerradaId = cerrada.id;

    for (const [vin, operationId, status] of [
      [VIN_PENDIENTE, activaId, 'PENDIENTE'],
      [VIN_TARJADO, activaId, 'TARJADO'],
      [VIN_CERRADA, cerradaId, 'PENDIENTE'],
    ] as const) {
      const v = await prisma.vehicle.create({ data: { vin, operationId, status } });
      vehicleIds.push(v.id);
    }
  });

  afterAll(async () => {
    await prisma.vehicle.deleteMany({ where: { id: { in: vehicleIds } } });
    await prisma.operation.deleteMany({ where: { id: { in: [activaId, cerradaId] } } });
    await app.close();
  });

  const search = (q: string) =>
    request(app.getHttpServer())
      .get(`/vehicles/search?q=${encodeURIComponent(q)}`)
      .set('Authorization', `Bearer ${token}`);

  it('exige autenticacion', async () => {
    await request(app.getHttpServer()).get('/vehicles/search?q=00123').expect(401);
  });

  it('el sufijo encuentra el VIN pendiente y lo marca tarjable', async () => {
    const res = await search(VIN_PENDIENTE.slice(-5)).expect(200);
    const hit = res.body.find((r: { vin: string }) => r.vin === VIN_PENDIENTE);
    expect(hit).toBeDefined();
    expect(hit.blocked).toBe(false);
    expect(hit.blockedReason).toBeNull();
    expect(hit.shipName).toBe('NAVE SEARCH E2E');
  });

  it('un VIN ya tarjado aparece bloqueado, no oculto', async () => {
    const res = await search(VIN_TARJADO.slice(-5)).expect(200);
    const hit = res.body.find((r: { vin: string }) => r.vin === VIN_TARJADO);
    expect(hit).toBeDefined();
    expect(hit.blocked).toBe(true);
    expect(hit.blockedReason).toBe('Ya tarjado');
  });

  it('un VIN de operacion no ACTIVA no aparece', async () => {
    const res = await search(VIN_CERRADA.slice(-5)).expect(200);
    expect(res.body.find((r: { vin: string }) => r.vin === VIN_CERRADA)).toBeUndefined();
  });

  it('17 caracteres resuelven a una fila unica (el caso del escaner)', async () => {
    const res = await search(VIN_PENDIENTE).expect(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].vin).toBe(VIN_PENDIENTE);
  });

  it('menos de 4 caracteres devuelve lista vacia, no error', async () => {
    const res = await search('123').expect(200);
    expect(res.body).toEqual([]);
  });

  it('la ruta search no la captura vehicles/:id', async () => {
    // Si 'search' se declara despues de ':id', ParseIntPipe responde 400.
    await search('00123').expect(200);
  });
});
