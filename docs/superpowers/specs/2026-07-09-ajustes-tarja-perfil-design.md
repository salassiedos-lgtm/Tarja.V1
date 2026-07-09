# Ajustes de tarja y perfil de tarjador — Design

## Contexto

Comparando el sistema actual contra el formato físico real ("UNITS STATE REPORT / REPORTE DE ESTADO DE UNIDADES", COSCO SHIPPING Ports Chancay) y el uso diario en campo, se identificaron 5 ajustes puntuales. No incluye rediseñar el apartado de daños (fuera de alcance por ahora — ya coincide en estructura con el físico).

## 1. Adicionales excedentes → texto en observaciones

**Problema:** el catálogo de accesorios (`Accessory`, ordenado por `sortOrder`) originalmente tiene 16 ítems que calzan 1:1 con la tabla de inventario del formato físico (2 columnas × 8 filas). Si un admin agrega un accesorio nuevo desde `/accessories` (ej. "Chalecos", "Triángulos"), hoy se captura bien en el formulario (check + cantidad) pero el PDF (`backend/src/pdf/report-template.ts`) solo lee `accessories.slice(0,8)` y `slice(8,16)` — cualquier accesorio 17+ desaparece silenciosamente del documento.

**Solución:**
- `report-template.ts`: mantener los primeros 16 (por `sortOrder`) en la tabla de dos columnas, igual que hoy.
- Los accesorios desde la posición 16 en adelante que tengan `hasAccessory=true` se listan como texto plano dentro del bloque "DAMAGE DETAILS" existente (el mismo recuadro de observaciones), con formato `"{cantidad} {nombre}"` separados por coma — ej. `"3 Chalecos, 2 Triángulos"`.
- Este texto aparece siempre que existan accesorios excedentes marcados, independientemente de si `hasDamage` es true o false (el bloque de observaciones ya se imprime siempre).
- No requiere cambios de esquema ni de API: es puramente lógica de armado del PDF sobre los mismos datos que ya se guardan.

## 2. Iniciales fijas y reubicadas

**Problema:** hoy el campo "Iniciales" en el paso 3 del formulario (`frontend/app/tarja/[id]/page.tsx`) es editable por el tarjador, y en el PDF esas iniciales se imprimen en la línea de firma `"Port — {iniciales}"`, ocupando el espacio reservado para la firma física del representante del puerto.

**Solución:**
- Frontend: el input de iniciales pasa a ser **de solo lectura**, mostrando siempre `getUser()?.initials` de la cuenta logueada (ya viene en el JWT/sesión). Se elimina la posibilidad de escribirlas a mano.
- Backend (`finishTarja`): sigue guardando `tarjadorInitials`, pero el valor siempre proviene del usuario autenticado, no de un campo libre del payload (si el DTO recibe `initials`, se ignora a favor del valor del `tarjador` de la sesión, o simplemente se deja de aceptar ese campo desde el cliente).
- PDF (`report-template.ts`): la línea de firma `"Port — {iniciales}"` vuelve a quedar en blanco (`"Port"` a secas, para firma física). Las iniciales del tarjador se imprimen como texto pequeño en la **esquina inferior derecha del recuadro "DAMAGE DETAILS"**, junto con (debajo de) los adicionales excedentes del punto 1.

## 3. Estado "-" para accesorios no marcados

**Problema:** cada `AccessoryCard` es un toggle binario que arranca en `false` ("No presente"). Al finalizar, `setReportAccessories` envía **todos** los accesorios del catálogo con `hasAccessory: true/false`, así el tarjador nunca los haya tocado. Resultado: el PDF siempre imprime "SI"/"NO" en cada fila, sin forma de distinguir "revisado y ausente" de "nunca revisado".

**Solución:**
- Frontend: `AccessoryCard` pasa de un solo tap-toggle a **tres estados explícitos**: `Sin marcar` (gris, estado inicial) / `Sí` (con `QtyStepper`) / `No`, mediante dos botones tipo pill pequeños (Sí / No) en vez de un solo toggle. "Todos" marca todo en Sí; "Limpiar" resetea a Sin marcar (ya no a "No").
- `setReportAccessories` solo envía los accesorios que el tarjador marcó explícitamente (Sí o No); los que quedan en "Sin marcar" no se incluyen en el payload.
- Backend: no crea fila `TarjaReportAccessory` para los accesorios omitidos del payload (comportamiento ya es upsert por ítem recibido, así que basta con no enviarlos).
- PDF/reportes: cualquier accesorio del catálogo activo sin fila asociada al reporte se imprime como `"-"` en las columnas Y/N y CANT, en vez de asumir "NO".
- Alcance confirmado: este cambio aplica **solo** a accesorios/inventario. Los `OptionGroup` de daños siguen siendo obligatorios cuando `hasDamage=true` (sin cambios).

## 4. "Mis tarjas" — vista de tarjador

**Problema:** no existe forma de que un tarjador vea su propio historial de tarjas; solo supervisores/admin tienen vistas agregadas (`/supervisor`).

**Solución:**
- Nueva entrada de navegación visible solo para rol `TARJADOR` (ej. "Mis tarjas"), nueva página `frontend/app/mis-tarjas/page.tsx`.
- Lista de solo lectura: VIN, fecha, operación, estado, si tuvo daño o no — reutilizando el patrón visual de tabla ya usado en `/users` y `/supervisor`.
- Cada fila tiene una acción "Descargar PDF" que golpea el endpoint existente `GET /reports/:id/pdf`.
- Backend:
  - `GET /reports` (reports.controller/service): cuando el caller autenticado tiene rol `TARJADOR`, se fuerza el filtro `tarjadorId = self.id` (ignora otros filtros de alcance amplio); ADMIN/SUPERVISOR mantienen su comportamiento actual sin este filtro forzado.
  - `GET /reports/:id/pdf`: hoy solo permite `SUPERVISOR`/`ADMIN`. Se amplía para permitir también `TARJADOR`, pero **solo** si `report.tarjadorId === self.id` (403 si intenta otro reporte que no es suyo).

## 5. "Mi perfil" — cambio de contraseña propio

**Problema:** el módulo de usuarios (`/users`) ya permite que ADMIN/SUPERVISOR reseteen contraseñas de otros (jerarquía de roles), pero no existe autoservicio: un tarjador (o cualquier rol) no puede cambiar su propia contraseña.

**Solución:**
- Nuevo endpoint `PATCH /users/me/password` en `UsersController`/`UsersService`, distinto del `resetPassword` existente: requiere `currentPassword` + `newPassword`, valida el hash actual contra la cuenta del propio caller (sin pasar por `ensureCanManageRole`, ya que actúa sobre sí mismo).
- Nueva página `frontend/app/perfil/page.tsx` ("Mi perfil"), accesible a los tres roles desde el menú de usuario en `Shell`. Formulario: contraseña actual, nueva contraseña, confirmación.
- Se registra en auditoría (`AuditService`) como `USER_PASSWORD_SELF_CHANGED` o similar, igual que las demás acciones de usuarios.

## Fuera de alcance

- Rediseño del apartado de daños para calzar visualmente con el papel físico (se descartó explícitamente en esta ronda).
- Cualquier cambio al layout/paginado general del PDF más allá de lo descrito arriba.
