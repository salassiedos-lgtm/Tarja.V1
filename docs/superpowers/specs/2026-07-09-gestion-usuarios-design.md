# Gestión de usuarios (crear / editar / activar-desactivar / resetear contraseña)

## Contexto

El módulo `users` solo tenía `GET /users` (listado, ADMIN-only). No existía forma de crear
usuarios desde la app — el único alta posible era el seed (`admin`, `supervisor`, `tarjador`).
Se agrega el CRUD completo de usuarios con permisos escalonados entre ADMIN y SUPERVISOR.

## Alcance

- Backend: nuevos endpoints en el módulo `users` existente.
- Frontend: nueva página `/users`, agregada al nav bajo "Sistema", visible para `ADMIN` y
  `SUPERVISOR`.
- No se toca el flujo de login/JWT existente.

## Permisos

- `ADMIN`: puede crear/editar/activar-desactivar/resetear password de cualquier usuario
  (cualquier rol).
- `SUPERVISOR`: puede crear/editar/activar-desactivar/resetear password **solo** de usuarios
  con rol `TARJADOR`. Si intenta actuar sobre un `ADMIN` o `SUPERVISOR`, o intenta asignar
  esos roles, el backend responde `403 Forbidden`.
- El decorador `@Roles('ADMIN','SUPERVISOR')` filtra por el rol del actor (igual que en
  `accessories`/`operations`); la restricción "supervisor → solo tarjador" se valida a mano en
  `UsersService`, comparando el rol objetivo, porque `RolesGuard` no conoce el recurso sobre el
  que se actúa.
- Nadie puede desactivarse a sí mismo (`PATCH /users/:id/status` con `id` = usuario actual →
  `403`), para evitar bloquearse fuera del sistema.

## Endpoints

Todos bajo `@UseGuards(JwtAuthGuard, RolesGuard)`, prefijo `/users`.

- `GET /users` — listado (ya existe). Se amplía de `@Roles('ADMIN')` a
  `@Roles('ADMIN', 'SUPERVISOR')` para que el supervisor pueda ver la tabla completa (necesita
  contexto de todos los usuarios aunque solo pueda actuar sobre los TARJADOR).
- `POST /users` — crea usuario. Body: `name, lastname, username, email, password, role`.
- `PATCH /users/:id` — edita `name, lastname, email, role`. El `username` **no** es editable
  tras la creación (es el identificador de login usado en `AuthService.login`).
- `PATCH /users/:id/status` — cambia `status` a `ACTIVE` / `INACTIVE`.
- `PATCH /users/:id/password` — el admin/supervisor escribe una contraseña nueva directamente
  (sin flujo de email ni token de reset).

Hasheo con `hashPassword` de `backend/src/auth/password.util.ts` (bcryptjs), igual que hoy.
Colisión de `username`/`email` únicos → catch de Prisma `P2002` → `409 ConflictException` con
mensaje legible ("El usuario o email ya está en uso").

## Auditoría

Cada acción registra vía `AuditService.record` (mismo patrón que `auth`/`operations`/`tarja`),
`module: 'users'`:

- `USER_CREATED`
- `USER_UPDATED`
- `USER_STATUS_CHANGED`
- `USER_PASSWORD_RESET`

## Validación (DTOs, `class-validator`, mismo estilo que `accessory.dto.ts`)

- `CreateUserDto`: `name`, `lastname` (`@IsString @MinLength(1)`), `username`
  (`@IsString @MinLength(3)`), `email` (`@IsEmail`), `password` (`@MinLength(8)`), `role`
  (`@IsIn(['ADMIN','SUPERVISOR','TARJADOR'])`).
- `UpdateUserDto`: `name?`, `lastname?`, `email?`, `role?` — todos opcionales, mismas reglas.
- `SetStatusDto`: `status` (`@IsIn(['ACTIVE','INACTIVE'])`).
- `ResetPasswordDto`: `password` (`@MinLength(8)`).

## Frontend

- Página `/users` calcada del patrón de `/accessories`: tabla (nombre, usuario, email, rol,
  estado) + modal para crear/editar + acción rápida activar/desactivar + botón "Restablecer
  contraseña" (modal chico con un campo de contraseña).
- El selector de rol en el formulario se limita a `TARJADOR` cuando el usuario logueado es
  `SUPERVISOR` (además del guard real en backend). Las filas de usuarios ADMIN/SUPERVISOR se
  muestran sin acciones (solo lectura) cuando el actor es SUPERVISOR.
- `lib/api.ts`: se agrega tipo `User` y funciones `listUsers`, `createUser`, `updateUser`,
  `setUserStatus`, `resetUserPassword`.
- Nav (`shell.tsx`): ítem "Usuarios" en sección "Sistema", `roles: ['ADMIN', 'SUPERVISOR']`.
  `TITLES` gana entrada `/users`.

## Testing

- e2e de backend (mismo estilo que los existentes de `accessories`/`vehicles`): crear como
  ADMIN, crear como SUPERVISOR (éxito con rol TARJADOR, 403 con rol ADMIN/SUPERVISOR), editar,
  cambiar status, resetear password, colisión de username/email → 409, auto-desactivación → 403.
