import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Usuarios (e2e)', () => {
  let app: INestApplication;
  let adminT: string;
  let supervisorT: string;
  let tarjadorT: string;
  const H = (t: string) => ({ Authorization: `Bearer ${t}` });
  const RUN = Date.now().toString().slice(-8);

  beforeAll(async () => {
    const m = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = m.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    const s = app.getHttpServer();
    adminT = (
      await request(s).post('/auth/login').send({ username: 'admin', password: 'Admin123!' })
    ).body.accessToken;
    supervisorT = (
      await request(s)
        .post('/auth/login')
        .send({ username: 'supervisor', password: 'Super123!' })
    ).body.accessToken;
    tarjadorT = (
      await request(s)
        .post('/auth/login')
        .send({ username: 'tarjador', password: 'Tarja123!' })
    ).body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  it('TARJADOR no puede listar usuarios (403)', async () => {
    await request(app.getHttpServer()).get('/users').set(H(tarjadorT)).expect(403);
  });

  it('ADMIN crea un TARJADOR', async () => {
    const res = await request(app.getHttpServer())
      .post('/users')
      .set(H(adminT))
      .send({
        name: 'Ana',
        lastname: 'Lopez',
        username: `ana.${RUN}`,
        email: `ana.${RUN}@test.com`,
        password: 'AnaClave123',
        role: 'TARJADOR',
      })
      .expect(201);
    expect(res.body.username).toBe(`ana.${RUN}`);
    expect(res.body.role.name).toBe('TARJADOR');
    expect(res.body.passwordHash).toBeUndefined();
  });

  it('SUPERVISOR crea un TARJADOR (permitido)', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .set(H(supervisorT))
      .send({
        name: 'Beto',
        lastname: 'Ramos',
        username: `beto.${RUN}`,
        email: `beto.${RUN}@test.com`,
        password: 'BetoClave123',
        role: 'TARJADOR',
      })
      .expect(201);
  });

  it('SUPERVISOR no puede crear un SUPERVISOR ni un ADMIN (403)', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .set(H(supervisorT))
      .send({
        name: 'Carlos',
        lastname: 'Diaz',
        username: `carlos.${RUN}`,
        email: `carlos.${RUN}@test.com`,
        password: 'CarlosClave123',
        role: 'SUPERVISOR',
      })
      .expect(403);
  });

  it('username duplicado devuelve 409', async () => {
    await request(app.getHttpServer())
      .post('/users')
      .set(H(adminT))
      .send({
        name: 'Ana',
        lastname: 'Duplicada',
        username: `ana.${RUN}`,
        email: `otra.${RUN}@test.com`,
        password: 'OtraClave123',
        role: 'TARJADOR',
      })
      .expect(409);
  });

  it('ADMIN edita datos de un usuario', async () => {
    const created = await request(app.getHttpServer())
      .post('/users')
      .set(H(adminT))
      .send({
        name: 'Dana',
        lastname: 'Perez',
        username: `dana.${RUN}`,
        email: `dana.${RUN}@test.com`,
        password: 'DanaClave123',
        role: 'TARJADOR',
      });
    const id = created.body.id;

    const res = await request(app.getHttpServer())
      .patch(`/users/${id}`)
      .set(H(adminT))
      .send({ lastname: 'Perez Actualizado' })
      .expect(200);
    expect(res.body.lastname).toBe('Perez Actualizado');
  });

  it('SUPERVISOR no puede editar a un ADMIN (403)', async () => {
    const admin = await request(app.getHttpServer())
      .get('/users')
      .set(H(adminT));
    const adminUser = admin.body.find((u: { username: string }) => u.username === 'admin');

    await request(app.getHttpServer())
      .patch(`/users/${adminUser.id}`)
      .set(H(supervisorT))
      .send({ lastname: 'Hackeado' })
      .expect(403);
  });

  it('ADMIN desactiva y reactiva un usuario', async () => {
    const created = await request(app.getHttpServer())
      .post('/users')
      .set(H(adminT))
      .send({
        name: 'Eva',
        lastname: 'Soto',
        username: `eva.${RUN}`,
        email: `eva.${RUN}@test.com`,
        password: 'EvaClave123',
        role: 'TARJADOR',
      });
    const id = created.body.id;

    const off = await request(app.getHttpServer())
      .patch(`/users/${id}/status`)
      .set(H(adminT))
      .send({ status: 'INACTIVE' })
      .expect(200);
    expect(off.body.status).toBe('INACTIVE');

    const on = await request(app.getHttpServer())
      .patch(`/users/${id}/status`)
      .set(H(adminT))
      .send({ status: 'ACTIVE' })
      .expect(200);
    expect(on.body.status).toBe('ACTIVE');
  });

  it('un usuario no puede desactivarse a si mismo (403)', async () => {
    const me = await request(app.getHttpServer()).get('/users').set(H(adminT));
    const adminUser = me.body.find((u: { username: string }) => u.username === 'admin');

    await request(app.getHttpServer())
      .patch(`/users/${adminUser.id}/status`)
      .set(H(adminT))
      .send({ status: 'INACTIVE' })
      .expect(403);
  });

  it('ADMIN restablece contrasena y el usuario puede loguear con la nueva', async () => {
    const created = await request(app.getHttpServer())
      .post('/users')
      .set(H(adminT))
      .send({
        name: 'Fabio',
        lastname: 'Nunez',
        username: `fabio.${RUN}`,
        email: `fabio.${RUN}@test.com`,
        password: 'FabioClave123',
        role: 'TARJADOR',
      });
    const id = created.body.id;
    const username = created.body.username;

    await request(app.getHttpServer())
      .patch(`/users/${id}/password`)
      .set(H(adminT))
      .send({ password: 'NuevaClave456' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password: 'NuevaClave456' })
      .expect(201);
  });
});
