import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Fase 6 - Auditoria (e2e)', () => {
  let app: INestApplication;
  let adminT: string;
  let tarjadorT: string;
  const H = (t: string) => ({ Authorization: `Bearer ${t}` });

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    const s = app.getHttpServer();
    adminT = (await request(s).post('/auth/login').send({ username: 'admin', password: 'Admin123!' })).body.accessToken;
    tarjadorT = (await request(s).post('/auth/login').send({ username: 'tarjador', password: 'Tarja123!' })).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('registra el login en auditoria y lo lista (ADMIN)', async () => {
    await new Promise((r) => setTimeout(r, 400)); // dar tiempo al registro fire-and-forget
    const res = await request(app.getHttpServer()).get('/audit').set(H(adminT)).expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((l: { action: string }) => l.action === 'LOGIN')).toBe(true);
  });

  it('tarjador no puede ver auditoria (403)', async () => {
    await request(app.getHttpServer()).get('/audit').set(H(tarjadorT)).expect(403);
  });
});
