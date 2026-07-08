# Fase 1 — Base Técnica — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el monorepo funcionando con backend NestJS conectado a PostgreSQL vía Prisma, y autenticación JWT con roles (ADMIN / SUPERVISOR / TARJADOR) protegiendo rutas, más un frontend Next.js (PWA base) con login real contra la API.

**Architecture:** Monorepo simple con `backend/` (NestJS + Prisma) y `frontend/` (Next.js App Router). Auth interna con JWT (access + refresh), contraseñas con bcrypt, RBAC por guard + decorador de roles. TDD con Jest/Supertest en el backend.

**Tech Stack:** Node 24, TypeScript, NestJS 10, Prisma 5, PostgreSQL 18, @nestjs/jwt + passport-jwt, bcrypt, Next.js 14 (App Router), Jest + Supertest.

**Referencias:** spec en `docs/superpowers/specs/2026-07-07-sistema-tarja-vehicular-design.md`; plan técnico `plan_tecnico_tarja_vehicular_v2.2.md`.

---

## Prerrequisito (input del usuario)

Antes de la Task 2 se necesita la **contraseña del usuario `postgres`** (PostgreSQL 18 ya está corriendo como servicio `postgresql-x64-18`). Con ella se arma `DATABASE_URL`. Si no está disponible, se puede crear un rol/DB dedicados (ver Task 2, opción B).

---

## File Structure

```txt
TARJA V.1/
├── backend/
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── prisma/
│   │   │   ├── prisma.module.ts
│   │   │   └── prisma.service.ts
│   │   ├── auth/
│   │   │   ├── auth.module.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.controller.ts
│   │   │   ├── password.util.ts
│   │   │   ├── jwt.strategy.ts
│   │   │   ├── jwt-auth.guard.ts
│   │   │   ├── roles.guard.ts
│   │   │   ├── roles.decorator.ts
│   │   │   ├── current-user.decorator.ts
│   │   │   └── dto/login.dto.ts
│   │   └── users/
│   │       └── users.module.ts        (se expande en fases posteriores)
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── test/
│   │   ├── auth.e2e-spec.ts
│   │   └── jest-e2e.json
│   ├── .env                            (ignorado por git)
│   ├── .env.example
│   └── package.json
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── login/page.tsx
│   │   └── dashboard/page.tsx
│   ├── lib/api.ts
│   ├── public/manifest.webmanifest
│   ├── .env.local                      (ignorado por git)
│   └── package.json
└── README.md
```

---

### Task 1: Esqueleto del monorepo y scaffold del backend NestJS

**Files:**
- Create: `README.md`
- Create: `backend/` (vía NestJS CLI)

- [ ] **Step 1: Crear el backend con NestJS CLI**

Desde la raíz `TARJA V.1/`:

Run:
```bash
npx --yes @nestjs/cli@10 new backend --package-manager npm --skip-git
```
Expected: se crea `backend/` con estructura NestJS y dependencias instaladas. Cuando pregunte el gestor de paquetes, ya va forzado a npm.

- [ ] **Step 2: Verificar que el backend arranca**

Run:
```bash
cd backend && npm run start:dev
```
Expected: log `Nest application successfully started` escuchando en `http://localhost:3000`. Detener con Ctrl+C.

- [ ] **Step 3: Crear README raíz**

```markdown
# Sistema de Tarja Vehicular (PWA) — CSPCP Chancay

Monorepo:
- `backend/` — NestJS + Prisma + PostgreSQL (API, WebSockets, PDF, auditoría).
- `frontend/` — Next.js (PWA: Admin, Supervisor, Tarjador).

Ver `docs/superpowers/specs/2026-07-07-sistema-tarja-vehicular-design.md`.

## Desarrollo local
- Node 24, PostgreSQL 18 corriendo local.
- Backend: `cd backend && npm run start:dev` (http://localhost:3000)
- Frontend: `cd frontend && npm run dev` (http://localhost:3001)
```

- [ ] **Step 4: Commit**

```bash
git add README.md backend
git commit -m "chore: scaffold backend NestJS + README del monorepo"
```

---

### Task 2: Prisma + conexión a PostgreSQL + modelos User/Role

**Files:**
- Create: `backend/prisma/schema.prisma`
- Create: `backend/.env`, `backend/.env.example`
- Create: `backend/src/prisma/prisma.service.ts`, `backend/src/prisma/prisma.module.ts`

- [ ] **Step 1: Instalar Prisma**

Run:
```bash
cd backend && npm install prisma --save-dev && npm install @prisma/client
npx prisma init --datasource-provider postgresql
```
Expected: se crean `prisma/schema.prisma` y `.env` con `DATABASE_URL` de ejemplo.

- [ ] **Step 2: Crear la base de datos**

Opción A (si tienes la contraseña de `postgres`), en PowerShell:
```powershell
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -U postgres tarja_dev
```
Opción B (rol dedicado), vía `psql`:
```sql
CREATE ROLE tarja WITH LOGIN PASSWORD 'tarja_local';
CREATE DATABASE tarja_dev OWNER tarja;
```
Expected: base `tarja_dev` creada.

- [ ] **Step 3: Configurar `.env` y `.env.example`**

`backend/.env` (rellenar credenciales reales):
```txt
DATABASE_URL="postgresql://postgres:TU_PASSWORD@localhost:5432/tarja_dev?schema=public"
JWT_ACCESS_SECRET="cambia-esto-access"
JWT_REFRESH_SECRET="cambia-esto-refresh"
JWT_ACCESS_TTL="15m"
JWT_REFRESH_TTL="7d"
PORT=3000
```
`backend/.env.example` (sin secretos, mismos nombres con valores vacíos/placeholder).

- [ ] **Step 4: Definir el schema Prisma (User/Role)**

Reemplazar `backend/prisma/schema.prisma`:
```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum RoleName {
  ADMIN
  SUPERVISOR
  TARJADOR
}

model Role {
  id          Int      @id @default(autoincrement())
  name        RoleName @unique
  description String?
  users       User[]
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@map("roles")
}

model User {
  id           Int       @id @default(autoincrement())
  name         String
  lastname     String
  username     String    @unique
  email        String    @unique
  passwordHash String    @map("password_hash")
  roleId       Int       @map("role_id")
  role         Role      @relation(fields: [roleId], references: [id])
  initials     String?
  status       String    @default("ACTIVE")
  lastLoginAt  DateTime? @map("last_login_at")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  @@map("users")
}
```

- [ ] **Step 5: Crear la migración inicial**

Run:
```bash
npx prisma migrate dev --name init_users_roles
```
Expected: migración aplicada, tablas `roles` y `users` creadas, cliente Prisma generado.

- [ ] **Step 6: Crear `PrismaService` y `PrismaModule`**

`backend/src/prisma/prisma.service.ts`:
```ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}
```
`backend/src/prisma/prisma.module.ts`:
```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 7: Registrar `PrismaModule` y config en `app.module.ts`**

`backend/src/app.module.ts` (agregar imports):
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule],
})
export class AppModule {}
```
Instalar config:
```bash
npm install @nestjs/config
```

- [ ] **Step 8: Verificar que arranca conectado a la BD**

Run:
```bash
npm run start:dev
```
Expected: arranca sin errores de conexión Prisma. Detener.

- [ ] **Step 9: Commit**

```bash
git add backend/prisma backend/src/prisma backend/src/app.module.ts backend/.env.example backend/package.json backend/package-lock.json
git commit -m "feat(db): Prisma + PostgreSQL con modelos User/Role y migracion inicial"
```

---

### Task 3: Seed de roles y usuario administrador inicial

**Files:**
- Create: `backend/prisma/seed.ts`
- Modify: `backend/package.json` (bloque `prisma.seed`)

- [ ] **Step 1: Escribir el seed**

`backend/prisma/seed.ts`:
```ts
import { PrismaClient, RoleName } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const roles: { name: RoleName; description: string }[] = [
    { name: 'ADMIN', description: 'Administrador' },
    { name: 'SUPERVISOR', description: 'Supervisor' },
    { name: 'TARJADOR', description: 'Tarjador' },
  ];
  for (const r of roles) {
    await prisma.role.upsert({
      where: { name: r.name },
      update: { description: r.description },
      create: r,
    });
  }

  const admin = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } });
  const passwordHash = await bcrypt.hash('Admin123!', 10);
  await prisma.user.upsert({
    where: { username: 'admin' },
    update: {},
    create: {
      name: 'Administrador',
      lastname: 'Sistema',
      username: 'admin',
      email: 'admin@cspcp.local',
      passwordHash,
      initials: 'ADM',
      roleId: admin.id,
    },
  });
  console.log('Seed OK: roles + usuario admin (admin / Admin123!)');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
```

- [ ] **Step 2: Instalar bcrypt y configurar el runner del seed**

Run:
```bash
npm install bcrypt && npm install --save-dev @types/bcrypt ts-node
```
Agregar a `backend/package.json` (nivel raíz del JSON):
```json
"prisma": {
  "seed": "ts-node prisma/seed.ts"
}
```

- [ ] **Step 3: Ejecutar el seed**

Run:
```bash
npx prisma db seed
```
Expected: `Seed OK: roles + usuario admin (admin / Admin123!)`.

- [ ] **Step 4: Verificar en la BD**

Run:
```bash
npx prisma studio
```
Expected: en `users` existe `admin`; en `roles` los 3 roles. Cerrar Studio.

- [ ] **Step 5: Commit**

```bash
git add backend/prisma/seed.ts backend/package.json backend/package-lock.json
git commit -m "feat(db): seed de roles y usuario administrador inicial"
```

---

### Task 4: Utilidad de contraseñas (TDD)

**Files:**
- Create: `backend/src/auth/password.util.ts`
- Test: `backend/src/auth/password.util.spec.ts`

- [ ] **Step 1: Escribir el test que falla**

`backend/src/auth/password.util.spec.ts`:
```ts
import { hashPassword, verifyPassword } from './password.util';

describe('password.util', () => {
  it('hashea y verifica correctamente', async () => {
    const hash = await hashPassword('Secreta123!');
    expect(hash).not.toEqual('Secreta123!');
    expect(await verifyPassword('Secreta123!', hash)).toBe(true);
  });

  it('rechaza una contraseña incorrecta', async () => {
    const hash = await hashPassword('Secreta123!');
    expect(await verifyPassword('otra', hash)).toBe(false);
  });
});
```

- [ ] **Step 2: Ejecutar el test para verlo fallar**

Run:
```bash
npm test -- password.util
```
Expected: FAIL — no existe `./password.util`.

- [ ] **Step 3: Implementar la utilidad**

`backend/src/auth/password.util.ts`:
```ts
import * as bcrypt from 'bcrypt';

const ROUNDS = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Ejecutar el test para verlo pasar**

Run:
```bash
npm test -- password.util
```
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/auth/password.util.ts backend/src/auth/password.util.spec.ts
git commit -m "feat(auth): utilidad de hash/verify de contrasenas (bcrypt)"
```

---

### Task 5: AuthService + endpoint de login con JWT (TDD e2e)

**Files:**
- Create: `backend/src/auth/dto/login.dto.ts`
- Create: `backend/src/auth/auth.service.ts`
- Create: `backend/src/auth/auth.controller.ts`
- Create: `backend/src/auth/auth.module.ts`
- Test: `backend/test/auth.e2e-spec.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Instalar dependencias de auth**

Run:
```bash
npm install @nestjs/jwt @nestjs/passport passport passport-jwt class-validator class-transformer
npm install --save-dev @types/passport-jwt
```

- [ ] **Step 2: Escribir el test e2e que falla**

`backend/test/auth.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
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
});
```

- [ ] **Step 3: Ejecutar el test e2e para verlo fallar**

Run:
```bash
npm run test:e2e -- auth
```
Expected: FAIL — no existe la ruta `/auth/login`.

- [ ] **Step 4: Implementar DTO de login**

`backend/src/auth/dto/login.dto.ts`:
```ts
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @MinLength(3)
  username: string;

  @IsString()
  @MinLength(1)
  password: string;
}
```

- [ ] **Step 5: Implementar AuthService**

`backend/src/auth/auth.service.ts`:
```ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { verifyPassword } from './password.util';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { role: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Credenciales invalidas');
    }
    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Credenciales invalidas');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const payload = { sub: user.id, username: user.username, role: user.role.name };
    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_TTL'),
    });
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.config.get('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_TTL'),
    });

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        lastname: user.lastname,
        initials: user.initials,
        role: user.role.name,
      },
    };
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwt.verifyAsync(refreshToken, {
        secret: this.config.get('JWT_REFRESH_SECRET'),
      });
      const accessToken = await this.jwt.signAsync(
        { sub: payload.sub, username: payload.username, role: payload.role },
        {
          secret: this.config.get('JWT_ACCESS_SECRET'),
          expiresIn: this.config.get('JWT_ACCESS_TTL'),
        },
      );
      return { accessToken };
    } catch {
      throw new UnauthorizedException('Refresh token invalido');
    }
  }
}
```

- [ ] **Step 6: Implementar AuthController**

`backend/src/auth/auth.controller.ts`:
```ts
import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './current-user.decorator';

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.username, dto.password);
  }

  @Post('refresh')
  refresh(@Body('refreshToken') refreshToken: string) {
    return this.auth.refresh(refreshToken);
  }

  @Post('logout')
  logout() {
    return { ok: true };
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: any) {
    return user;
  }
}
```

> Nota: `JwtAuthGuard` y `CurrentUser` se crean en la Task 6. Si ejecutas la Task 5 aislada, comenta temporalmente el endpoint `me` y sus imports; se completa en la Task 6.

- [ ] **Step 7: Implementar AuthModule y registrarlo**

`backend/src/auth/auth.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
```
> `JwtStrategy` se crea en la Task 6. Para correr la Task 5 aislada, quita `JwtStrategy` de providers e imports temporalmente.

Agregar `AuthModule` a `backend/src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule],
})
export class AppModule {}
```

- [ ] **Step 8: Habilitar ValidationPipe global en `main.ts`**

`backend/src/main.ts` (agregar dentro de bootstrap, antes de `listen`):
```ts
import { ValidationPipe } from '@nestjs/common';
// ...
app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
app.enableCors({ origin: 'http://localhost:3001', credentials: true });
```

- [ ] **Step 9: Ejecutar el test e2e para verlo pasar**

Run:
```bash
npm run test:e2e -- auth
```
Expected: PASS (2 tests). Requiere que la BD tenga el usuario `admin` (Task 3).

- [ ] **Step 10: Commit**

```bash
git add backend/src/auth backend/src/app.module.ts backend/src/main.ts backend/test/auth.e2e-spec.ts backend/package.json backend/package-lock.json
git commit -m "feat(auth): login/refresh con JWT + validacion (TDD e2e)"
```

---

### Task 6: JwtStrategy, guard y endpoint /auth/me (TDD e2e)

**Files:**
- Create: `backend/src/auth/jwt.strategy.ts`
- Create: `backend/src/auth/jwt-auth.guard.ts`
- Create: `backend/src/auth/current-user.decorator.ts`
- Modify: `backend/test/auth.e2e-spec.ts`

- [ ] **Step 1: Agregar test e2e de /auth/me que falla**

Agregar a `backend/test/auth.e2e-spec.ts` dentro del `describe`:
```ts
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
```

- [ ] **Step 2: Ejecutar para verlo fallar**

Run:
```bash
npm run test:e2e -- auth
```
Expected: FAIL en los dos casos nuevos (falta la estrategia/guard).

- [ ] **Step 3: Implementar JwtStrategy**

`backend/src/auth/jwt.strategy.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: any) {
    return { userId: payload.sub, username: payload.username, role: payload.role };
  }
}
```

- [ ] **Step 4: Implementar guard y decorador**

`backend/src/auth/jwt-auth.guard.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```
`backend/src/auth/current-user.decorator.ts`:
```ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => ctx.switchToHttp().getRequest().user,
);
```

- [ ] **Step 5: Confirmar que `JwtStrategy` está en providers de AuthModule**

Verificar `backend/src/auth/auth.module.ts` incluye `JwtStrategy` (ver Task 5, Step 7) y que el endpoint `me` del controller está activo.

- [ ] **Step 6: Ejecutar para verlo pasar**

Run:
```bash
npm run test:e2e -- auth
```
Expected: PASS (4 tests).

- [ ] **Step 7: Commit**

```bash
git add backend/src/auth backend/test/auth.e2e-spec.ts
git commit -m "feat(auth): JwtStrategy + guard + /auth/me (TDD e2e)"
```

---

### Task 7: RBAC — guard de roles y decorador (TDD e2e)

**Files:**
- Create: `backend/src/auth/roles.decorator.ts`
- Create: `backend/src/auth/roles.guard.ts`
- Create: `backend/src/users/users.module.ts`
- Create: `backend/src/users/users.controller.ts`
- Test: agregar a `backend/test/auth.e2e-spec.ts`

- [ ] **Step 1: Escribir test e2e de ruta protegida por rol que falla**

Agregar a `backend/test/auth.e2e-spec.ts`:
```ts
it('GET /users solo permite ADMIN', async () => {
  const login = await request(app.getHttpServer())
    .post('/auth/login')
    .send({ username: 'admin', password: 'Admin123!' });
  await request(app.getHttpServer())
    .get('/users')
    .set('Authorization', `Bearer ${login.body.accessToken}`)
    .expect(200);
});
```

- [ ] **Step 2: Ejecutar para verlo fallar**

Run:
```bash
npm run test:e2e -- auth
```
Expected: FAIL — no existe la ruta `/users`.

- [ ] **Step 3: Implementar decorador y guard de roles**

`backend/src/auth/roles.decorator.ts`:
```ts
import { SetMetadata } from '@nestjs/common';
import { RoleName } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleName[]) => SetMetadata(ROLES_KEY, roles);
```
`backend/src/auth/roles.guard.ts`:
```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '@prisma/client';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<RoleName[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user || !required.includes(user.role)) {
      throw new ForbiddenException('No autorizado para esta accion');
    }
    return true;
  }
}
```

- [ ] **Step 4: Implementar users.controller y users.module**

`backend/src/users/users.controller.ts`:
```ts
import { Controller, Get, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Roles('ADMIN')
  @Get()
  findAll() {
    return this.prisma.user.findMany({
      select: { id: true, username: true, name: true, lastname: true, status: true, role: { select: { name: true } } },
    });
  }
}
```
`backend/src/users/users.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';

@Module({ controllers: [UsersController] })
export class UsersModule {}
```
Registrar `UsersModule` en `backend/src/app.module.ts` `imports`.

- [ ] **Step 5: Ejecutar para verlo pasar**

Run:
```bash
npm run test:e2e -- auth
```
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add backend/src/auth/roles.decorator.ts backend/src/auth/roles.guard.ts backend/src/users backend/src/app.module.ts backend/test/auth.e2e-spec.ts
git commit -m "feat(auth): RBAC con roles guard + decorador y ruta /users (ADMIN)"
```

---

### Task 8: Frontend Next.js (PWA base) con login real

**Files:**
- Create: `frontend/` (vía create-next-app)
- Create: `frontend/lib/api.ts`, `frontend/app/login/page.tsx`, `frontend/app/dashboard/page.tsx`
- Create: `frontend/public/manifest.webmanifest`
- Modify: `frontend/app/layout.tsx`

- [ ] **Step 1: Crear el frontend**

Desde la raíz `TARJA V.1/`:
```bash
npx --yes create-next-app@14 frontend --ts --app --eslint --no-tailwind --no-src-dir --import-alias "@/*"
```
Expected: se crea `frontend/`. Ajustar el puerto de dev a 3001 en `frontend/package.json`:
```json
"scripts": { "dev": "next dev -p 3001" }
```

- [ ] **Step 2: Configurar la URL de la API**

`frontend/.env.local`:
```txt
NEXT_PUBLIC_API_URL=http://localhost:3000
```

- [ ] **Step 3: Cliente API mínimo**

`frontend/lib/api.ts`:
```ts
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function login(username: string, password: string) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) throw new Error('Credenciales invalidas');
  return res.json();
}
```

- [ ] **Step 4: Página de login**

`frontend/app/login/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { login } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    try {
      const data = await login(username, password);
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('user', JSON.stringify(data.user));
      router.push('/dashboard');
    } catch {
      setError('Usuario o contraseña incorrectos');
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: '80px auto', fontFamily: 'system-ui' }}>
      <h1>Tarja Vehicular — Ingreso</h1>
      <form onSubmit={onSubmit}>
        <input placeholder="Usuario" value={username} onChange={(e) => setUsername(e.target.value)} style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }} />
        <input placeholder="Contraseña" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ display: 'block', width: '100%', margin: '8px 0', padding: 8 }} />
        <button type="submit" style={{ padding: '8px 16px' }}>Entrar</button>
      </form>
      {error && <p style={{ color: 'crimson' }}>{error}</p>}
    </main>
  );
}
```

- [ ] **Step 5: Página de dashboard protegida (cliente)**

`frontend/app/dashboard/page.tsx`:
```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    const raw = localStorage.getItem('user');
    if (!raw) {
      router.replace('/login');
      return;
    }
    setUser(JSON.parse(raw));
  }, [router]);

  if (!user) return null;
  return (
    <main style={{ maxWidth: 600, margin: '40px auto', fontFamily: 'system-ui' }}>
      <h1>Bienvenido, {user.name} ({user.role})</h1>
      <button onClick={() => { localStorage.clear(); router.push('/login'); }}>Cerrar sesión</button>
    </main>
  );
}
```

- [ ] **Step 6: Manifest PWA base y enlace en layout**

`frontend/public/manifest.webmanifest`:
```json
{
  "name": "Tarja Vehicular CSPCP",
  "short_name": "Tarja",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#0b3d6b",
  "icons": []
}
```
En `frontend/app/layout.tsx`, dentro del `<html>`, agregar metadata:
```tsx
export const metadata = {
  title: 'Tarja Vehicular CSPCP',
  manifest: '/manifest.webmanifest',
};
```

- [ ] **Step 7: Redirigir la home al login**

`frontend/app/page.tsx`:
```tsx
import { redirect } from 'next/navigation';
export default function Home() {
  redirect('/login');
}
```

- [ ] **Step 8: Probar el flujo end-to-end manualmente**

Con el backend corriendo (`cd backend && npm run start:dev`) y el frontend (`cd frontend && npm run dev`):
1. Abrir `http://localhost:3001` → redirige a `/login`.
2. Ingresar `admin` / `Admin123!` → redirige a `/dashboard` mostrando "Bienvenido, Administrador (ADMIN)".
3. Credenciales incorrectas → muestra el error.
Expected: los 3 comportamientos ocurren.

- [ ] **Step 9: Commit**

```bash
git add frontend
git commit -m "feat(frontend): scaffold Next.js PWA base + login real contra la API"
```

---

## Cierre de la Fase 1

Al terminar todas las tasks:
- Backend con auth JWT + RBAC probado (5 tests e2e + 2 unit en verde).
- Frontend con login funcional y dashboard protegido por rol.
- Base lista para la Fase 2 (Operaciones + Importación Excel + catálogo de accesorios).

**Verificación final:**
```bash
cd backend && npm test && npm run test:e2e
```
Expected: todos los tests en verde.
