# Gestión de usuarios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar CRUD de usuarios (crear, editar, activar/desactivar, resetear contraseña) con permisos escalonados ADMIN/SUPERVISOR, backend + frontend.

**Architecture:** Se completa el módulo `users` de NestJS existente (hoy solo tiene `GET /users`) agregando `UsersService` con la regla de negocio "supervisor solo gestiona TARJADOR" y 4 endpoints nuevos. En el frontend se agrega una página `/users` calcada del patrón visual/estructural de `/accessories` (tabla en vez de tarjetas), con modal de alta/edición y modal de reseteo de contraseña.

**Tech Stack:** NestJS + Prisma + class-validator (backend), Next.js + Tailwind (frontend). Sin librerías nuevas.

Spec de referencia: `docs/superpowers/specs/2026-07-09-gestion-usuarios-design.md`.

---

### Task 1: DTOs de usuarios (backend)

**Files:**
- Create: `backend/src/users/dto/user.dto.ts`

- [ ] **Step 1: Crear el archivo de DTOs**

```typescript
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { RoleName } from '@prisma/client';

const ROLES: RoleName[] = ['ADMIN', 'SUPERVISOR', 'TARJADOR'];

export class CreateUserDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(1)
  lastname: string;

  @IsString()
  @MinLength(3)
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsIn(ROLES)
  role: RoleName;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  lastname?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(ROLES)
  role?: RoleName;
}

export class SetStatusDto {
  @IsIn(['ACTIVE', 'INACTIVE'])
  status: 'ACTIVE' | 'INACTIVE';
}

export class ResetPasswordDto {
  @IsString()
  @MinLength(8)
  password: string;
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos relacionados a `users/dto/user.dto.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/users/dto/user.dto.ts
git commit -m "feat(users): DTOs de creacion/edicion/estado/password"
```

---

### Task 2: UsersService con la regla ADMIN/SUPERVISOR

**Files:**
- Create: `backend/src/users/users.service.ts`

- [ ] **Step 1: Escribir el servicio completo**

```typescript
import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleName } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { hashPassword } from '../auth/password.util';
import {
  CreateUserDto,
  ResetPasswordDto,
  SetStatusDto,
  UpdateUserDto,
} from './dto/user.dto';

export interface ActingUser {
  userId: number;
  username: string;
  role: string;
}

const SELECT = {
  id: true,
  username: true,
  name: true,
  lastname: true,
  email: true,
  status: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.user.findMany({ select: SELECT, orderBy: { id: 'asc' } });
  }

  async create(actor: ActingUser, dto: CreateUserDto) {
    this.ensureCanManageRole(actor, dto.role);
    const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
    if (!role) throw new NotFoundException('Rol no encontrado');

    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          name: dto.name,
          lastname: dto.lastname,
          username: dto.username,
          email: dto.email,
          passwordHash,
          roleId: role.id,
        },
        select: SELECT,
      });
      this.audit.record({
        userId: actor.userId,
        username: actor.username,
        role: actor.role,
        module: 'users',
        action: 'USER_CREATED',
        description: `Usuario creado: ${user.username} (${user.role.name})`,
      });
      return user;
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async update(actor: ActingUser, id: number, dto: UpdateUserDto) {
    const target = await this.findOrThrow(id);
    this.ensureCanManageRole(actor, target.role.name);
    if (dto.role) this.ensureCanManageRole(actor, dto.role);

    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.lastname !== undefined) data.lastname = dto.lastname;
    if (dto.email !== undefined) data.email = dto.email;
    if (dto.role !== undefined) {
      const role = await this.prisma.role.findUnique({ where: { name: dto.role } });
      if (!role) throw new NotFoundException('Rol no encontrado');
      data.role = { connect: { id: role.id } };
    }

    try {
      const user = await this.prisma.user.update({ where: { id }, data, select: SELECT });
      this.audit.record({
        userId: actor.userId,
        username: actor.username,
        role: actor.role,
        module: 'users',
        action: 'USER_UPDATED',
        description: `Usuario actualizado: ${user.username}`,
      });
      return user;
    } catch (err) {
      throw this.mapUniqueError(err);
    }
  }

  async setStatus(actor: ActingUser, id: number, dto: SetStatusDto) {
    if (actor.userId === id) {
      throw new ForbiddenException('No puedes desactivar tu propia cuenta');
    }
    const target = await this.findOrThrow(id);
    this.ensureCanManageRole(actor, target.role.name);

    const user = await this.prisma.user.update({
      where: { id },
      data: { status: dto.status },
      select: SELECT,
    });
    this.audit.record({
      userId: actor.userId,
      username: actor.username,
      role: actor.role,
      module: 'users',
      action: 'USER_STATUS_CHANGED',
      description: `Estado de ${user.username} cambiado a ${dto.status}`,
    });
    return user;
  }

  async resetPassword(actor: ActingUser, id: number, dto: ResetPasswordDto) {
    const target = await this.findOrThrow(id);
    this.ensureCanManageRole(actor, target.role.name);

    const passwordHash = await hashPassword(dto.password);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    this.audit.record({
      userId: actor.userId,
      username: actor.username,
      role: actor.role,
      module: 'users',
      action: 'USER_PASSWORD_RESET',
      description: `Contrasena restablecida para ${target.username}`,
    });
    return { id };
  }

  private async findOrThrow(id: number) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: SELECT });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  private ensureCanManageRole(actor: ActingUser, targetRole: RoleName | string) {
    if (actor.role === 'ADMIN') return;
    if (actor.role === 'SUPERVISOR' && targetRole === 'TARJADOR') return;
    throw new ForbiddenException('No autorizado para gestionar este usuario');
  }

  private mapUniqueError(err: unknown) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return new ConflictException('El usuario o email ya esta en uso');
    }
    return err as Error;
  }
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd backend && npx tsc --noEmit -p tsconfig.json`
Expected: sin errores nuevos relacionados a `users/users.service.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/users/users.service.ts
git commit -m "feat(users): UsersService con permisos escalonados ADMIN/SUPERVISOR"
```

---

### Task 3: Endpoints del controller y wiring del módulo

**Files:**
- Modify: `backend/src/users/users.controller.ts` (reemplazar contenido completo)
- Modify: `backend/src/users/users.module.ts` (reemplazar contenido completo)

- [ ] **Step 1: Reescribir el controller**

```typescript
import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CurrentUser, AuthUser } from '../auth/current-user.decorator';
import {
  CreateUserDto,
  ResetPasswordDto,
  SetStatusDto,
  UpdateUserDto,
} from './dto/user.dto';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Roles('ADMIN', 'SUPERVISOR')
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Post()
  create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto) {
    return this.service.create(actor, dto);
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Patch(':id')
  update(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.service.update(actor, id, dto);
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Patch(':id/status')
  setStatus(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SetStatusDto,
  ) {
    return this.service.setStatus(actor, id, dto);
  }

  @Roles('ADMIN', 'SUPERVISOR')
  @Patch(':id/password')
  resetPassword(
    @CurrentUser() actor: AuthUser,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.service.resetPassword(actor, id, dto);
  }
}
```

- [ ] **Step 2: Reescribir el módulo**

```typescript
import { Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({ controllers: [UsersController], providers: [UsersService] })
export class UsersModule {}
```

- [ ] **Step 3: Arrancar el backend y probar manualmente**

Run: `cd backend && npm run start:dev`

En otra terminal:

```bash
curl -s -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"Admin123!\"}"
```

Copiar el `accessToken` y probar creación:

```bash
curl -s -X POST http://localhost:3000/users -H "Content-Type: application/json" -H "Authorization: Bearer <TOKEN>" -d "{\"name\":\"Prueba\",\"lastname\":\"Uno\",\"username\":\"prueba1\",\"email\":\"prueba1@test.com\",\"password\":\"Prueba123!\",\"role\":\"TARJADOR\"}"
```

Expected: `201` con el usuario creado (sin `passwordHash` en la respuesta).

- [ ] **Step 4: Commit**

```bash
git add backend/src/users/users.controller.ts backend/src/users/users.module.ts
git commit -m "feat(users): endpoints POST/PATCH de creacion, edicion, estado y password"
```

---

### Task 4: e2e de backend

**Files:**
- Create: `backend/test/users.e2e-spec.ts`

- [ ] **Step 1: Escribir el archivo de tests**

```typescript
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
```

- [ ] **Step 2: Correr los tests (contra la app real, en serie)**

Run: `cd backend && npx jest --config ./test/jest-e2e.json users.e2e-spec.ts --runInBand`
Expected: todos los tests en verde (ver `[[e2e-flake-suites-paralelas]]` — correr con `--runInBand` si hay más de un archivo e2e a la vez, porque comparten la misma base de datos).

- [ ] **Step 3: Commit**

```bash
git add backend/test/users.e2e-spec.ts
git commit -m "test(users): e2e de creacion, edicion, estado y reseteo de password"
```

---

### Task 5: Cliente API del frontend

**Files:**
- Modify: `frontend/lib/api.ts` (agregar tipo y funciones al final del archivo)

- [ ] **Step 1: Agregar el tipo `ManagedUser` cerca de los otros tipos (después de `Accessory`, línea ~35 aprox.)**

Buscar el bloque:

```typescript
export interface Accessory {
  id: number;
  name: string;
  isActive: boolean;
  sortOrder: number;
}
```

Y agregar justo debajo:

```typescript
export interface ManagedUser {
  id: number;
  username: string;
  name: string;
  lastname: string;
  email: string;
  status: 'ACTIVE' | 'INACTIVE';
  role: { name: Role };
}
```

- [ ] **Step 2: Agregar las funciones de API al final del archivo, después del bloque de accesorios**

Buscar el bloque:

```typescript
export const listAccessories = () => apiGet<Accessory[]>('/accessories');
export const createAccessory = (name: string) => apiJson<Accessory>('/accessories', 'POST', { name });
export const updateAccessory = (
  id: number,
  d: { name?: string; isActive?: boolean; sortOrder?: number },
) => apiJson<Accessory>(`/accessories/${id}`, 'PATCH', d);
export const deleteAccessory = (id: number) => apiJson<{ id: number }>(`/accessories/${id}`, 'DELETE');
```

Y agregar justo debajo:

```typescript
// ---------------- usuarios ----------------
export const listUsers = () => apiGet<ManagedUser[]>('/users');
export const createUser = (d: {
  name: string;
  lastname: string;
  username: string;
  email: string;
  password: string;
  role: Role;
}) => apiJson<ManagedUser>('/users', 'POST', d);
export const updateUser = (
  id: number,
  d: { name?: string; lastname?: string; email?: string; role?: Role },
) => apiJson<ManagedUser>(`/users/${id}`, 'PATCH', d);
export const setUserStatus = (id: number, status: 'ACTIVE' | 'INACTIVE') =>
  apiJson<ManagedUser>(`/users/${id}/status`, 'PATCH', { status });
export const resetUserPassword = (id: number, password: string) =>
  apiJson<{ id: number }>(`/users/${id}/password`, 'PATCH', { password });
```

- [ ] **Step 3: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `lib/api.ts`.

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api.ts
git commit -m "feat(users): cliente API de gestion de usuarios"
```

---

### Task 6: Entrada de navegación

**Files:**
- Modify: `frontend/components/shell.tsx`

- [ ] **Step 1: Agregar el ícono `Users` al import de `lucide-react` (línea 8-21)**

Cambiar:

```typescript
import {
  Bell,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  Ship,
  ShieldCheck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
```

por:

```typescript
import {
  Bell,
  ChevronRight,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  Radar,
  Ship,
  ShieldCheck,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
```

- [ ] **Step 2: Agregar el ítem de nav en la sección "Sistema"**

Cambiar:

```typescript
  {
    section: 'Sistema',
    items: [
      { href: '/accessories', label: 'Accesorios', icon: Wrench, roles: ['ADMIN'] },
      { href: '/audit', label: 'Auditoría', icon: ShieldCheck, roles: ['ADMIN'] },
    ],
  },
```

por:

```typescript
  {
    section: 'Sistema',
    items: [
      { href: '/users', label: 'Usuarios', icon: Users, roles: ['ADMIN', 'SUPERVISOR'] },
      { href: '/accessories', label: 'Accesorios', icon: Wrench, roles: ['ADMIN'] },
      { href: '/audit', label: 'Auditoría', icon: ShieldCheck, roles: ['ADMIN'] },
    ],
  },
```

- [ ] **Step 3: Agregar la entrada en `TITLES`**

Cambiar:

```typescript
const TITLES: Record<string, { title: string; crumb: string }> = {
  '/dashboard': { title: 'Panel de control', crumb: 'Resumen operativo' },
  '/operations': { title: 'Operaciones', crumb: 'Naves, BL y vehículos' },
  '/tarja': { title: 'Tarja', crumb: 'Registro en campo' },
  '/supervisor': { title: 'Supervisión', crumb: 'Monitoreo en tiempo real' },
  '/accessories': { title: 'Accesorios', crumb: 'Catálogo del formulario' },
  '/audit': { title: 'Auditoría', crumb: 'Registro de acciones' },
};
```

por:

```typescript
const TITLES: Record<string, { title: string; crumb: string }> = {
  '/dashboard': { title: 'Panel de control', crumb: 'Resumen operativo' },
  '/operations': { title: 'Operaciones', crumb: 'Naves, BL y vehículos' },
  '/tarja': { title: 'Tarja', crumb: 'Registro en campo' },
  '/supervisor': { title: 'Supervisión', crumb: 'Monitoreo en tiempo real' },
  '/users': { title: 'Usuarios', crumb: 'Cuentas y roles' },
  '/accessories': { title: 'Accesorios', crumb: 'Catálogo del formulario' },
  '/audit': { title: 'Auditoría', crumb: 'Registro de acciones' },
};
```

- [ ] **Step 4: Commit**

```bash
git add frontend/components/shell.tsx
git commit -m "feat(users): entrada de navegacion Usuarios para ADMIN/SUPERVISOR"
```

---

### Task 7: Página `/users`

**Files:**
- Create: `frontend/app/users/page.tsx`

- [ ] **Step 1: Crear el archivo completo**

```tsx
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Shell from '@/components/shell';
import {
  listUsers,
  createUser,
  updateUser,
  setUserStatus,
  resetUserPassword,
  getUser,
  type ManagedUser,
  type Role,
} from '@/lib/api';
import { IconClose, IconEdit, IconKey, IconPlus, IconSearch } from '@/components/icons';

const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Administrador',
  SUPERVISOR: 'Supervisor',
  TARJADOR: 'Tarjador',
};

function canManage(actorRole: Role, targetRole: Role): boolean {
  if (actorRole === 'ADMIN') return true;
  return actorRole === 'SUPERVISOR' && targetRole === 'TARJADOR';
}

function assignableRoles(actorRole: Role): Role[] {
  return actorRole === 'ADMIN' ? ['ADMIN', 'SUPERVISOR', 'TARJADOR'] : ['TARJADOR'];
}

function UserModal({
  actorRole,
  editing,
  onClose,
  onSaved,
}: {
  actorRole: Role;
  editing?: ManagedUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!editing;
  const roles = assignableRoles(actorRole);
  const [name, setName] = useState(editing?.name ?? '');
  const [lastname, setLastname] = useState(editing?.lastname ?? '');
  const [username, setUsername] = useState(editing?.username ?? '');
  const [email, setEmail] = useState(editing?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>(editing?.role.name ?? roles[0]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const valid = Boolean(
    name.trim() &&
      lastname.trim() &&
      username.trim().length >= 3 &&
      email.trim() &&
      (isEdit || password.length >= 8),
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setError('');
    setSaving(true);
    try {
      if (isEdit) {
        await updateUser(editing.id, {
          name: name.trim(),
          lastname: lastname.trim(),
          email: email.trim(),
          role,
        });
      } else {
        await createUser({
          name: name.trim(),
          lastname: lastname.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
          role,
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/55 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[480px] overflow-hidden rounded-2xl bg-white shadow-[0_40px_80px_-20px_rgba(4,24,42,0.45)]"
      >
        <div className="relative flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-navy-800 via-cosco-500 to-transparent" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[14.5px] font-bold tracking-tight text-navy-900">
              {isEdit ? 'Editar usuario' : 'Nuevo usuario'}
            </h2>
            <p className="text-[11px] text-muted">
              {isEdit ? 'Actualiza sus datos o su rol' : 'Se agrega con acceso inmediato al sistema'}
            </p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-muted hover:text-navy-900">
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#455063]">
                Nombre<span className="ml-0.5 text-cosco-500">*</span>
              </label>
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-line bg-[#fbfcfe] px-3 py-2.5 text-[13px] outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#455063]">
                Apellido<span className="ml-0.5 text-cosco-500">*</span>
              </label>
              <input
                value={lastname}
                onChange={(e) => setLastname(e.target.value)}
                className="w-full rounded-lg border border-line bg-[#fbfcfe] px-3 py-2.5 text-[13px] outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10"
              />
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#455063]">
              Usuario<span className="ml-0.5 text-cosco-500">*</span>
            </label>
            <input
              value={username}
              disabled={isEdit}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="ej. jperez"
              className="w-full rounded-lg border border-line bg-[#fbfcfe] px-3 py-2.5 text-[13px] outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10 disabled:bg-canvas disabled:text-muted"
            />
            {isEdit && <p className="mt-1 text-[10.5px] text-muted">El usuario no se puede cambiar</p>}
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#455063]">
              Email<span className="ml-0.5 text-cosco-500">*</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-line bg-[#fbfcfe] px-3 py-2.5 text-[13px] outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10"
            />
          </div>

          {!isEdit && (
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#455063]">
                Contraseña<span className="ml-0.5 text-cosco-500">*</span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                className="w-full rounded-lg border border-line bg-[#fbfcfe] px-3 py-2.5 text-[13px] outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10"
              />
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#455063]">
              Rol<span className="ml-0.5 text-cosco-500">*</span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {roles.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`rounded-xl border px-2 py-2.5 text-[12px] font-semibold transition-colors ${
                    role === r
                      ? 'border-navy-700 bg-navy-50 text-navy-900 ring-1 ring-navy-700/20'
                      : 'border-line text-muted hover:border-navy-200'
                  }`}
                >
                  {ROLE_LABEL[r]}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-[12.5px] font-medium text-cosco-600">{error}</p>}
        </div>

        <div className="flex items-center justify-between border-t border-line px-5 py-3.5">
          <p className="hidden text-[10.5px] text-muted sm:block">
            Campos con <span className="font-semibold text-cosco-500">*</span> son obligatorios
          </p>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-[12.5px] font-semibold text-muted hover:text-navy-900"
            >
              Cancelar
            </button>
            <button
              disabled={saving || !valid}
              className="rounded-lg bg-navy-800 px-4 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-navy-900 disabled:opacity-50"
            >
              {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onDone,
}: {
  user: ManagedUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return;
    setError('');
    setSaving(true);
    try {
      await resetUserPassword(user.id, password);
      onDone();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-950/55 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[380px] overflow-hidden rounded-2xl bg-white shadow-[0_40px_80px_-20px_rgba(4,24,42,0.45)]"
      >
        <div className="relative flex items-center gap-3 border-b border-line px-5 py-4">
          <span className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-navy-800 via-cosco-500 to-transparent" />
          <div className="min-w-0 flex-1">
            <h2 className="text-[14.5px] font-bold tracking-tight text-navy-900">Restablecer contraseña</h2>
            <p className="truncate text-[11px] text-muted">{user.username}</p>
          </div>
          <button type="button" onClick={onClose} className="shrink-0 text-muted hover:text-navy-900">
            <IconClose className="h-4 w-4" />
          </button>
        </div>

        <div className="grid gap-4 px-5 py-5">
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.08em] text-[#455063]">
              Nueva contraseña<span className="ml-0.5 text-cosco-500">*</span>
            </label>
            <input
              autoFocus
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 8 caracteres"
              className="w-full rounded-lg border border-line bg-[#fbfcfe] px-3 py-2.5 text-[13px] outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700/10"
            />
          </div>
          {error && <p className="text-[12.5px] font-medium text-cosco-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2 text-[12.5px] font-semibold text-muted hover:text-navy-900"
          >
            Cancelar
          </button>
          <button
            disabled={saving || password.length < 8}
            className="rounded-lg bg-navy-800 px-4 py-2.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-navy-900 disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Restablecer'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function UsersPage() {
  const [items, setItems] = useState<ManagedUser[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [resettingUser, setResettingUser] = useState<ManagedUser | null>(null);
  const me = getUser();
  const actorRole: Role = me?.role ?? 'TARJADOR';

  const load = useCallback(async () => {
    try {
      setItems(await listUsers());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleStatus(u: ManagedUser) {
    const next = u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    setItems((prev) => prev.map((x) => (x.id === u.id ? { ...x, status: next } : x)));
    try {
      await setUserStatus(u.id, next);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
      load();
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        u.lastname.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q),
    );
  }, [items, query]);

  return (
    <Shell>
      <section className="rise mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[10.5px] uppercase tracking-[0.2em] text-muted">Sistema</p>
          <h1 className="mt-2 font-display text-[28px] font-extrabold leading-none tracking-tight text-navy-900 sm:text-[32px]">
            Usuarios
          </h1>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-line bg-white px-3 py-2">
          <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-jade-600" />
          <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted">
            {items.filter((u) => u.status === 'ACTIVE').length} activos · {items.length} totales
          </span>
        </div>
      </section>

      <div className="rise mb-6 flex items-center gap-3">
        <div className="flex w-full max-w-xs items-center gap-2 rounded-xl border border-line bg-white px-3 py-2.5">
          <IconSearch className="h-4 w-4 shrink-0 text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar usuario…"
            className="w-full text-[13px] outline-none"
          />
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-navy-800 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-navy-900"
        >
          <IconPlus className="h-4 w-4" />
          Agregar usuario
        </button>
      </div>

      {error && <p className="mb-4 text-[12.5px] font-medium text-cosco-600">{error}</p>}

      {loading ? (
        <p className="text-[13px] text-muted">Cargando…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-white px-5 py-10 text-center">
          <p className="text-[13px] text-muted">
            {items.length === 0 ? 'Aún no hay usuarios registrados.' : 'Sin resultados para tu búsqueda.'}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-white">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-line bg-canvas text-[10.5px] uppercase tracking-[0.1em] text-muted">
                <th className="px-4 py-3 font-semibold">Nombre</th>
                <th className="px-4 py-3 font-semibold">Usuario</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                <th className="px-4 py-3 font-semibold">Rol</th>
                <th className="px-4 py-3 font-semibold">Estado</th>
                <th className="px-4 py-3 font-semibold text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((u) => {
                const manageable = canManage(actorRole, u.role.name);
                const isSelf = me?.id === u.id;
                return (
                  <tr key={u.id} className="border-b border-line last:border-0 hover:bg-canvas/60">
                    <td className="px-4 py-3 font-medium text-navy-900">
                      {u.name} {u.lastname}
                    </td>
                    <td className="px-4 py-3 font-mono text-[12px] text-muted">{u.username}</td>
                    <td className="px-4 py-3 text-muted">{u.email}</td>
                    <td className="px-4 py-3 text-muted">{ROLE_LABEL[u.role.name]}</td>
                    <td className="px-4 py-3">
                      {manageable && !isSelf ? (
                        <button
                          onClick={() => toggleStatus(u)}
                          className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ring-1 ring-inset transition-colors ${
                            u.status === 'ACTIVE'
                              ? 'bg-jade-50 text-jade-600 ring-jade-600/15 hover:bg-jade-50/70'
                              : 'bg-canvas text-muted ring-line hover:bg-line/40'
                          }`}
                        >
                          {u.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                        </button>
                      ) : (
                        <span
                          className={`rounded-full px-2.5 py-1 text-[10.5px] font-semibold ring-1 ring-inset ${
                            u.status === 'ACTIVE'
                              ? 'bg-jade-50 text-jade-600 ring-jade-600/15'
                              : 'bg-canvas text-muted ring-line'
                          }`}
                        >
                          {u.status === 'ACTIVE' ? 'Activo' : 'Inactivo'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {manageable && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setEditingUser(u)}
                            title="Editar"
                            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-navy-50 hover:text-navy-800"
                          >
                            <IconEdit className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setResettingUser(u)}
                            title="Restablecer contraseña"
                            className="rounded-lg p-1.5 text-muted transition-colors hover:bg-navy-50 hover:text-navy-800"
                          >
                            <IconKey className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showModal && <UserModal actorRole={actorRole} onClose={() => setShowModal(false)} onSaved={load} />}
      {editingUser && (
        <UserModal
          actorRole={actorRole}
          editing={editingUser}
          onClose={() => setEditingUser(null)}
          onSaved={load}
        />
      )}
      {resettingUser && (
        <ResetPasswordModal user={resettingUser} onClose={() => setResettingUser(null)} onDone={load} />
      )}
    </Shell>
  );
}
```

- [ ] **Step 2: Verificar que compila**

Run: `cd frontend && npx tsc --noEmit`
Expected: sin errores nuevos relacionados a `app/users/page.tsx`.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/users/page.tsx
git commit -m "feat(users): pagina de gestion de usuarios"
```

---

### Task 8: Verificación manual end-to-end

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Levantar backend y frontend**

Run: `cd backend && npm run start:dev` (puerto 3000)
Run: `cd frontend && npm run dev` (puerto 3001)

- [ ] **Step 2: Probar en el navegador como ADMIN**

1. Loguear como `admin` / `Admin123!`.
2. Ir a "Usuarios" en el nav (sección Sistema).
3. Crear un usuario TARJADOR nuevo → debe aparecer en la tabla.
4. Crear un usuario SUPERVISOR nuevo → debe aparecer en la tabla.
5. Editar el usuario TARJADOR (cambiar apellido) → debe reflejarse.
6. Desactivar y reactivar el usuario TARJADOR con el badge de estado.
7. Restablecer su contraseña y verificar que el login viejo falla y el nuevo funciona (cerrar sesión, loguear con el usuario y la contraseña nueva).

- [ ] **Step 3: Probar en el navegador como SUPERVISOR**

1. Loguear como `supervisor` / `Super123!`.
2. Ir a "Usuarios" → debe ver la tabla completa, pero las filas de ADMIN/SUPERVISOR sin acciones.
3. Crear un usuario TARJADOR → debe funcionar.
4. Confirmar que no hay opción de crear con rol ADMIN o SUPERVISOR en el modal (el selector de rol solo debe ofrecer TARJADOR).

- [ ] **Step 4: Probar como TARJADOR**

1. Loguear como `tarjador` / `Tarja123!`.
2. Confirmar que "Usuarios" no aparece en el nav.
3. Confirmar que `GET /users` a mano (o navegando a `/users` directo) no rompe la sesión (la página cargaría pero el fetch devolvería 403 → mostrar el mensaje de error, comportamiento aceptable ya que no hay guard de ruta en frontend, solo se oculta del nav).

- [ ] **Step 5: Registrar en memoria si hay hallazgos relevantes**

Si algo del comportamiento difiere de lo esperado, anotarlo y corregir antes de cerrar la tarea. No es necesario un paso de commit adicional si no hubo cambios de código.
