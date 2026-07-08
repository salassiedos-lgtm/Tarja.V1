import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login devuelve tokens con credenciales validas', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'Admin123!' })
      .expect(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    expect(res.body.user.username).toBe('admin');
    expect(res.body.user.role).toBe('ADMIN');
  });

  it('POST /auth/login rechaza credenciales invalidas', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'mala' })
      .expect(401);
  });

  it('GET /auth/me devuelve el usuario con token valido', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'Admin123!' });
    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(res.body.username).toBe('admin');
    expect(res.body.role).toBe('ADMIN');
  });

  it('GET /auth/me rechaza sin token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('GET /users solo permite ADMIN', async () => {
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'Admin123!' });
    const res = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});
