# Plan técnico del sistema de tarja vehicular — v2.2 (PWA)

**Puerto de Chancay — CSPCP (COSCO SHIPPING PORTS CHANCAY PERÚ)**
**Enfoque:** Aplicación web progresiva (PWA) instalable — una sola base de código para móvil, tablet y escritorio.

> **Cambios en v2.2 respecto a la v2.1:**
> - **Relación 1:1 vehículo–tarja (una válida a la vez):** cada vehículo tiene una sola tarja válida a la vez, con código único; se conservan las tarjas anuladas como historial.
> - **Índice único parcial** sobre `tarja_reports`: único por `vehicle_id` solo para estados válidos (`BORRADOR`, `FINALIZADO`, `CON_DAÑO`); `ANULADO` y `REEMPLAZADO` quedan fuera del índice. Garantiza a nivel de base de datos que no exista un segundo reporte activo para el mismo vehículo.
> - **Cadena de reemplazo:** nuevo campo `replaced_by_report_id` en `tarja_reports` para enlazar la tarja anulada con la que la reemplazó.
>
> **Cambios en v2.1 respecto a la v2.0:**
> - **Restaurado — Catálogo de accesorios:** tabla `accessories` administrable; `tarja_report_accessories` referencia por `accessory_id`.
> - **Restaurado — VIN no planificado:** genera reporte igual, se notifica a Planeamiento y queda visible en Supervisión (`is_unplanned`, estado `NO_PLANIFICADO`).
> - **Restaurado — Auto-liberación 15 min:** si el borrador supera 15 minutos, se descarta, el vehículo vuelve a disponible desde cero y el evento queda reportado en auditoría.
> - **Daños en texto libre:** un vehículo puede tener varios daños; cada uno es una descripción textual almacenada como registro propio. Sin opciones/dropdowns.
> - **Sin cambios:** stack TypeScript (Next.js + NestJS + Prisma). Evidencia fotográfica queda fuera por decisión del proyecto.
> - **Pendiente técnico:** validar la simbología real de la etiqueta VIN (Code 39 / Data Matrix / PDF417) antes de fijar la librería de escaneo web.

---

## 1. Enfoque general del sistema

El sistema será desarrollado como una **aplicación web progresiva (PWA)**, instalable en celulares, tablets y computadoras. El personal operativo podrá acceder desde un navegador y también instalarlo como aplicación mediante la opción "Instalar aplicación".

El objetivo es evitar una app móvil nativa independiente y construir una sola solución web responsive que funcione correctamente en dispositivos móviles y escritorio, con experiencia tipo app (acceso desde ícono, comportamiento standalone, compatibilidad multi-dispositivo desde una sola base de código).

---

## 2. Decisión tecnológica principal

Stack moderno basado en **TypeScript**, tanto en frontend como en backend.

```txt
Frontend / PWA: Next.js + React + TypeScript
Backend / API:  NestJS + TypeScript
Base de datos:  PostgreSQL
ORM:            Prisma
Tiempo real:    WebSockets + Redis
Infraestructura: VPS o servidor local con Ubuntu Server + Docker + Nginx
```

El uso de TypeScript en frontend y backend busca reducir errores, mejorar la organización del código y facilitar el mantenimiento.

---

## 3. Stack final recomendado

| Capa                 | Tecnología recomendada                       |
| -------------------- | -------------------------------------------- |
| Aplicación principal | PWA web responsive                           |
| Frontend             | Next.js + React + TypeScript                 |
| Backend              | NestJS + TypeScript                          |
| Base de datos        | PostgreSQL                                   |
| ORM                  | Prisma                                       |
| Tiempo real          | WebSockets                                   |
| Cache / eventos      | Redis                                        |
| Autenticación        | JWT/RBAC o Keycloak                          |
| Validaciones         | DTOs + Zod / Class Validator                 |
| PDF                  | Playwright o Puppeteer                       |
| Excel                | ExcelJS                                      |
| Servidor             | VPS o servidor local                         |
| Sistema operativo    | Ubuntu Server LTS                            |
| Proxy / HTTPS        | Nginx                                        |
| Despliegue           | Docker / Docker Compose                      |
| Auditoría            | Logs internos + tabla `audit_logs`           |
| Backups              | Backups automáticos de PostgreSQL y archivos |

---

## 4. Justificación del stack

### 4.1 Next.js + React + TypeScript

Next.js construye la interfaz principal: panel administrador, panel supervisor y vista móvil del tarjador. Usa App Router, el router más nuevo, con soporte para Server Components.

Componentes reutilizables: Login, Dashboard, Escáner de VIN, Formulario de tarja, Tabla de vehículos, Reportes, Módulo de anulación, Vista de impresión.

### 4.2 NestJS + TypeScript

Backend y API del sistema. Framework de Node.js en TypeScript, orientado a backends escalables mediante arquitectura modular e inyección de dependencias.

Módulos:

```txt
auth
users
roles
operations
imports
vehicles
tarja-reports
accessories
damages
annulments
pdf
audit
realtime
```

### 4.3 PostgreSQL

Base de datos relacional robusta, con integridad y trazabilidad para: vehículos, operaciones, BL/Booking, reportes, accesorios, daños, anulaciones, usuarios responsables, auditoría y PDFs generados.

### 4.4 Prisma

ORM para conectar NestJS con PostgreSQL. Acceso type-safe, migraciones y cliente generado desde el esquema — muy conveniente en proyectos TypeScript.

### 4.5 Redis + WebSockets

Redis para cache, coordinación de eventos y soporte al tiempo real. El supervisor debe ver el avance sin recargar la página. Escalable a varias instancias del backend.

> **Importante:** los eventos relevantes deben guardarse primero en PostgreSQL, porque Redis Pub/Sub tiene semántica de entrega *at-most-once*; si un cliente está desconectado, un mensaje puede perderse.

### 4.6 Docker

Empaqueta y despliega los servicios de forma consistente entre desarrollo, pruebas y producción.

---

## 5. Arquitectura general del sistema

```txt
Celular / Tablet / PC
        ↓
PWA Next.js (instalada o desde navegador)
        ↓
Nginx con HTTPS
        ↓
Backend NestJS
        ↓
PostgreSQL
        ↓
Redis
        ↓
PDF / Excel / Auditoría
```

Infraestructura:

```txt
VPS o servidor local
└── Ubuntu Server
    ├── Nginx
    ├── Docker
    ├── Frontend Next.js
    ├── Backend NestJS
    ├── PostgreSQL
    ├── Redis
    ├── Worker de procesos
    ├── Servicio de PDF
    └── Backups
```

---

## 6. Tipo de servidor recomendado

No se recomienda hosting compartido. Se recomienda **VPS o servidor local dedicado**.

### Opción A: VPS

Ideal en proveedor (Hostinger VPS, DigitalOcean, AWS, Azure, etc.). Mayor control, permite Docker, PostgreSQL, Redis, WebSockets, NestJS/Next.js, Nginx + HTTPS. Escalable.

### Opción B: Servidor local del puerto

Ideal para funcionar dentro de la red interna. Los datos quedan en la infraestructura del puerto, no depende de internet externo, mejor control de red privada, compatible con red local 5G o LAN.

### Opción recomendada para producción portuaria

```txt
Servidor local del puerto o VPS privado conectado por VPN
```

Si la operación depende de red interna, lo mejor es servidor local. Para administración remota o mayor flexibilidad, VPS con VPN.

---

## 7. Infraestructura recomendada en producción

### 7.1 Componentes principales

```txt
Nginx
Frontend Next.js
Backend NestJS
PostgreSQL
Redis
Servicio de generación PDF
Servicio de backups
Storage de archivos
```

### 7.2 Contenedores Docker sugeridos

```txt
nginx
frontend-next
backend-nest
postgres
redis
pdf-worker
backup-service
```

### 7.3 Distribución recomendada

```txt
Servidor Ubuntu
├── /app
│   ├── frontend
│   ├── backend
│   ├── docker-compose.yml
│   └── nginx
├── /storage
│   ├── excels
│   ├── pdfs
│   └── templates
└── /backups
    ├── database
    └── files
```

---

## 8. Seguridad de infraestructura

### 8.1 HTTPS obligatorio

El sistema debe trabajar con HTTPS, incluso en red local. La cámara del dispositivo (para escanear VIN) requiere contexto seguro: la API `getUserMedia` está limitada a contextos seguros como HTTPS.

### 8.2 Firewall

Solo exponer los puertos necesarios:

```txt
80  → redirección a HTTPS
443 → acceso seguro al sistema
22  → SSH solo para administración, restringido
```

No exponer públicamente: PostgreSQL, Redis, servicios internos, paneles de administración internos.

### 8.3 Acceso restringido

Limitable a: red local del puerto, VPN, IPs autorizadas, usuarios autenticados.

### 8.4 Certificados

Dominio público: **Let's Encrypt**. Red local: **certificado interno corporativo**. Evitar HTTP simple en producción.

---

## 9. Seguridad de aplicación

### 9.1 Autenticación

**Opción A — Interna con NestJS (recomendada para v1):** JWT, refresh tokens, contraseñas cifradas, control de sesión, roles y permisos, bloqueo por intentos fallidos.

**Opción B — Keycloak (versión empresarial):** SSO, gestión centralizada de usuarios, políticas de contraseña, MFA, integración corporativa, roles centralizados.

Se puede empezar con autenticación interna y migrar a Keycloak si el puerto exige estándares empresariales.

### 9.2 Roles

```txt
Administrador
Supervisor
Tarjador
```

> Planeamiento no es un rol operativo del sistema, sino el destino de notificación para la regularización de VIN no planificados (gestionada por el Administrador).

### 9.3 Permisos por rol

| Acción                     | Administrador |  Supervisor |               Tarjador |
| -------------------------- | ------------: | ----------: | ---------------------: |
| Cargar Excel               |            Sí |          No |                     No |
| Crear operación            |            Sí |          No |                     No |
| Ver operaciones            |            Sí |          Sí | Solo asignadas/activas |
| Registrar tarja            |            No |          No |                     Sí |
| Ver dashboard              |            Sí |          Sí |                     No |
| Anular reporte             |            Sí |          Sí |                     No |
| Liberar candado (manual)   |            Sí |          Sí |                     No |
| Regularizar no planificado |            Sí |          No |                     No |
| Generar PDF                |            Sí |          Sí |                     No |
| Gestionar usuarios         |            Sí |          No |                     No |
| Gestionar catálogo accesor.|            Sí |          No |                     No |
| Ver auditoría              |            Sí | Sí limitado |                     No |

### 9.4 Contraseñas y sesiones

Contraseñas cifradas con algoritmo seguro, bloqueo temporal por intentos fallidos, expiración de sesión, refresh token seguro, cierre de sesión remoto si es necesario, nunca contraseñas en texto plano. Seguir buenas prácticas OWASP (fortalecer autenticación, MFA cuando corresponda).

### 9.5 Validaciones

Validar siempre en backend, no solo en frontend: VIN obligatorio, VIN existente en operación (o registro como no planificado), VIN no tarjado previamente, BL obligatorio, accesorios con cantidades válidas, al menos un daño en texto si se marca "tiene daño", motivo obligatorio para anulación, Excel con estructura válida, archivos permitidos, tamaño máximo de archivo.

### 9.6 Rate limiting

Proteger rutas sensibles: `/login`, `/api/auth/refresh`, `/api/imports`, `/api/reports/pdf`. No revelar información interna en errores del servidor.

---

## 10. Auditoría y trazabilidad

Registrar acciones importantes (OWASP: logging de seguridad, fallos de autenticación, control de acceso y validaciones del lado del servidor con contexto de usuario).

Eventos a auditar:

```txt
Inicio de sesión
Cierre de sesión
Carga de Excel
Creación de operación
Edición de operación
Inicio de reporte de tarja
Finalización de reporte
Anulación de reporte
Generación de PDF
Cambio de estado de vehículo
Cambio de estado de reporte
Auto-liberación por candado vencido (15 min)
Liberación manual de vehículo
Registro de VIN no planificado (notificado a Planeamiento)
Regularización de VIN no planificado
Intentos fallidos de login
Errores de validación importantes
```

Datos mínimos:

```txt
Usuario
Rol
Acción
Módulo
Fecha y hora
IP/dispositivo
Valor anterior
Valor nuevo
Descripción
```

---

## 11. Funcionamiento PWA

Requisitos para app instalable:

```txt
manifest.json
Iconos de aplicación
Nombre corto
Nombre completo
Color de tema
Service Worker
HTTPS
Diseño responsive
Modo standalone
```

Instalable desde Chrome o navegadores compatibles con "Instalar aplicación". Se puede añadir un botón interno "Instalar sistema en este dispositivo".

---

## 12. Escaneo de VIN

Flujo:

```txt
Abrir PWA
↓
Seleccionar operación
↓
Presionar Escanear VIN
↓
Permitir acceso a cámara
↓
Leer código de barras
↓
Validar VIN en backend
```

Ingreso manual disponible para casos donde: el código está dañado, no se lee, la cámara falla, hay poca iluminación, o el VIN debe corregirse manualmente.

> **Pendiente crítico:** validar la simbología real de la etiqueta VIN (Code 39 / Data Matrix / **PDF417**) antes de fijar la librería de escaneo, dado que PDF417 es el punto débil de los escáneres basados en navegador.

### 12.1 VIN no planificado

Si el VIN escaneado o ingresado **no existe** en la operación cargada desde Excel, el sistema permite continuar y **generar el reporte igualmente**:

* Marca el vehículo con `is_unplanned = true` y estado `NO_PLANIFICADO`.
* Solicita un BL/Booking de referencia.
* El reporte se genera y queda **visible en Supervisión** como cualquier otro.
* Se **notifica a Planeamiento** para la regularización/conciliación de manifiesto.
* El vehículo queda marcado visualmente (color de alerta) en los paneles.
* Todo el evento queda en auditoría.

---

## 13. Módulos funcionales del sistema

### 13.1 Autenticación

Login, logout, recuperación de contraseña (si aplica), control de sesión, gestión de tokens, validación de roles.

### 13.2 Usuarios

Crear, editar, desactivar usuarios; asignar rol; registrar iniciales del tarjador; consultar actividad.

### 13.3 Operaciones

Crear, activar, pausar, cerrar operación; ver operaciones activas; ver avance general.

Datos: nombre de nave, tipo de operación, fecha, puerto de descarga, estado, usuario creador.

### 13.4 Importación Excel

Subir Excel, validar columnas, previsualizar registros, detectar VIN duplicados, detectar registros incompletos, confirmar carga, guardar historial de importación.

### 13.5 Vehículos

Registrar vehículos desde Excel, asociar a operación y BL, consultar estado, bloquear vehículo en proceso, reabrir por anulación, registrar VIN no planificados y regularizarlos (Admin/Planeamiento).

Estados: Pendiente, En proceso, Tarjado, Observado, Reabierto, Bloqueado, **No planificado**.

### 13.6 Catálogo de accesorios

Administrado por el Administrador. Permite crear, editar, activar/desactivar y ordenar los accesorios que aparecen en el formulario de tarja. La lista deja de estar fija en código.

Accesorios iniciales del catálogo:

```txt
Radio, Reloj, Encendedor, Cenicero, Espejo interior, Espejos laterales,
Antena, Pisos adicionales, Plumillas, Tapa de llanta, Llanta de repuesto,
Gata, Herramientas, Llaves del vehículo, Catálogos, Relays
```

### 13.7 Tarja

Escanear VIN, validar disponibilidad, crear reporte, registrar accesorios (desde catálogo), registrar daños, registrar iniciales, finalizar reporte, calcular duración.

### 13.8 Daños

El daño se registra **en texto libre**, no mediante opciones ni dropdowns.

* Un vehículo puede tener **más de un daño**.
* Cada daño es una **descripción textual independiente** y se almacena como registro propio.
* Se puede agregar, editar o eliminar cada daño antes de finalizar el reporte.

Ejemplo (dos daños en el mismo vehículo, dos registros):

```txt
1) "Rayadura en puerta delantera derecha"
2) "Rayadura en puerta trasera derecha"
```

### 13.9 Anulación

Anular reporte, exigir motivo obligatorio, guardar comentario, asociar error al tarjador, reabrir vehículo, registrar supervisor responsable.

Al anular una tarja y generar una nueva para el mismo vehículo, la tarja anterior pasa a `REEMPLAZADO` (o queda `ANULADO` si no se re-tarja), y la nueva se enlaza mediante `replaced_by_report_id`. Así el historial conserva ambas filas sin violar la regla de una sola tarja válida por vehículo, y queda trazable qué tarja reemplazó a cuál.

### 13.10 PDF

Generar PDF desde plantilla, insertar datos del reporte, descargar, imprimir, guardar historial. Se recomienda **Playwright o Puppeteer** para convertir vista HTML/CSS en PDF respetando el diseño de la plantilla.

### 13.11 Monitoreo

Dashboard en tiempo real: vehículos pendientes, en proceso, tarjados, observados; reportes anulados; avance por operación; tiempo promedio por reporte; reportes por tarjador; vehículos no planificados; eventos de auto-liberación.

---

## 14. Flujo operativo general

```txt
Administrador ingresa al sistema
↓
Crea o selecciona operación
↓
Carga Excel con nave, BL y VIN
↓
Sistema valida información
↓
Sistema registra vehículos como pendientes
↓
Tarjador abre la PWA instalada
↓
Selecciona operación activa
↓
Escanea VIN o lo ingresa manualmente
↓
Sistema valida si el VIN existe y está disponible
↓
Si el VIN no existe → se genera reporte como NO_PLANIFICADO y se notifica a Planeamiento
↓
Tarjador inicia reporte (vehículo pasa a EN_PROCESO / candado)
↓
Sistema registra hora de inicio
↓
Tarjador llena accesorios (desde catálogo)
↓
Tarjador registra uno o varios daños en texto, si existen
↓
Tarjador coloca iniciales
↓
Tarjador finaliza reporte
↓
Sistema registra hora de fin
↓
Sistema calcula duración
↓
Vehículo pasa a Tarjado u Observado
↓
Supervisor ve avance en tiempo real
↓
Supervisor genera PDF si se solicita
↓
Si hay error, supervisor anula con motivo
↓
Vehículo vuelve a estar disponible
```

---

## 15. Control de concurrencia

Punto crítico. Evitar que dos tarjadores registren el mismo vehículo simultáneamente.

```txt
Cuando un tarjador inicia reporte, el vehículo pasa a EN_PROCESO
(se registran locked_by y locked_at).
```

Si otro usuario escanea el mismo VIN:

```txt
Este vehículo está siendo procesado por otro usuario.
```

Reglas:

* **Bloqueo** del vehículo al iniciar reporte (`locked_by`, `locked_at`).
* **Auto-liberación a los 15 minutos:** si el borrador supera 15 minutos sin finalizarse, el sistema lo marca como vencido, **descarta el borrador** y **auto-libera** el vehículo, que vuelve a estado disponible **desde cero**. El siguiente tarjador inicia un reporte nuevo y limpio.
* El evento de auto-liberación queda **reportado** en auditoría: tarjador responsable, hora de inicio del borrador, hora de vencimiento y datos parciales que hubiera alcanzado a cargar; visible en el panel del supervisor.
* **Liberación manual** por el supervisor también disponible (queda en auditoría).
* **No** permitir dos reportes finalizados activos para el mismo VIN.

---

## 16. Estrategia frente a pérdida de conexión

Enfoque **online-first** (red local 5G del puerto con cobertura total). El sistema trabaja conectado al servidor para evitar duplicidades.

Soporte básico de reconexión:

* Guardar temporalmente el formulario en el navegador.
* Mostrar alerta si no hay conexión.
* Bloquear finalización si no se puede confirmar con servidor.
* Reintentar consulta automáticamente.
* No permitir finalizar tarja sin confirmación del backend.

No se recomienda operación completamente offline, por riesgo de duplicidad de VIN o conflicto de reportes.

---

## 17. Base de datos propuesta

```txt
users
roles
permissions
operations
operation_imports
bills_of_lading
vehicles
accessories
tarja_reports
tarja_report_accessories
tarja_report_damages
tarja_report_annulments
tarja_templates
generated_pdfs
audit_logs
```

> **Nota de modelado — FK circular:** `vehicles.current_report_id` apunta al reporte activo y `tarja_reports.vehicle_id` apunta al vehículo. En Prisma esto exige una **relación con nombre explícito** y campo **nullable**, o la migración fallará.
>
> **Nota de modelado — relación 1:1 (una tarja válida por vehículo):** cada vehículo tiene una sola tarja válida a la vez, con código único; nunca un vehículo con dos tarjas activas ni una tarja con dos vehículos. Se conservan las tarjas anuladas como historial. Se garantiza con un **índice único parcial** sobre `tarja_reports (vehicle_id)` limitado a estados válidos (`BORRADOR`, `FINALIZADO`, `CON_DAÑO`), excluyendo `ANULADO` y `REEMPLAZADO`. En Prisma este índice parcial **no** se declara en `schema.prisma`; se agrega con una migración SQL manual:
>
> ```sql
> CREATE UNIQUE INDEX uniq_valid_tarja_per_vehicle
> ON tarja_reports (vehicle_id)
> WHERE status IN ('BORRADOR', 'FINALIZADO', 'CON_DANO');
> ```
>
> El campo `replaced_by_report_id` enlaza la tarja anulada con la nueva que la reemplazó, dejando la cadena trazable.

---

## 18. Modelo principal de datos

### 18.1 users

```txt
id
name
lastname
username
email
password_hash
role_id
initials
status
last_login_at
created_at
updated_at
```

### 18.2 roles

```txt
id
name
description
created_at
updated_at
```

Roles: `ADMIN`, `SUPERVISOR`, `TARJADOR`.

### 18.3 operations

```txt
id
code
ship_name
operation_type
operation_date
port_discharge
status
created_by
created_at
updated_at
```

Tipos: `ROLL_ON_ROLL_OFF`, `DESCONSOLIDADO`.

### 18.4 operation_imports

```txt
id
operation_id
file_name
file_path
total_rows
valid_rows
invalid_rows
uploaded_by
uploaded_at
created_at
updated_at
```

### 18.5 bills_of_lading

```txt
id
operation_id
bl_number
booking_number
port_loading
port_discharge
created_at
updated_at
```

### 18.6 vehicles

```txt
id
operation_id
bill_of_lading_id
vin
chassis_number
status
is_unplanned
current_report_id
locked_by
locked_at
created_at
updated_at
```

Estados: `PENDIENTE`, `EN_PROCESO`, `TARJADO`, `OBSERVADO`, `REABIERTO`, `BLOQUEADO`, `NO_PLANIFICADO`.

### 18.7 accessories

Catálogo administrable de accesorios.

```txt
id
name
is_active
sort_order
created_at
updated_at
```

### 18.8 tarja_reports

```txt
id
report_code
operation_id
vehicle_id
bill_of_lading_id
tarjador_id
started_at
finished_at
duration_seconds
has_damage
details
tarjador_initials
status
replaced_by_report_id   (nullable; FK a tarja_reports — tarja que reemplazó a esta)
created_at
updated_at
```

Estados: `BORRADOR`, `FINALIZADO`, `CON_DAÑO`, `ANULADO`, `REEMPLAZADO`.

Relación 1:1 con el vehículo: solo una tarja válida (`BORRADOR` / `FINALIZADO` / `CON_DAÑO`) por `vehicle_id`, forzada por índice único parcial (ver nota de modelado en la sección 17). Las tarjas `ANULADO` / `REEMPLAZADO` permanecen como historial y no cuentan para el índice.

### 18.9 tarja_report_accessories

```txt
id
report_id
accessory_id          (FK a accessories; reemplaza el texto libre)
has_accessory
quantity
created_at
updated_at
```

### 18.10 tarja_report_damages

Un reporte puede tener varios registros de daño; cada uno es una descripción en texto.

```txt
id
report_id
description           (texto libre del daño)
created_at
updated_at
```

### 18.11 tarja_report_annulments

```txt
id
report_id
vehicle_id
tarjador_id
supervisor_id
reason
comment
previous_report_status
new_report_status
annulled_at
created_at
updated_at
```

### 18.12 generated_pdfs

```txt
id
report_id
file_path
generated_by
generated_at
created_at
updated_at
```

### 18.13 audit_logs

```txt
id
user_id
module
action
description
old_value
new_value
ip_address
device_info
created_at
```

---

## 19. API propuesta

### 19.1 Auth

```txt
POST /auth/login
POST /auth/logout
POST /auth/refresh
GET  /auth/me
```

### 19.2 Operaciones

```txt
GET    /operations
POST   /operations
GET    /operations/:id
PATCH  /operations/:id
POST   /operations/:id/activate
POST   /operations/:id/close
```

### 19.3 Importación Excel

```txt
POST /operations/:id/imports/preview
POST /operations/:id/imports/confirm
GET  /operations/:id/imports
```

### 19.4 Vehículos

```txt
GET  /operations/:id/vehicles
GET  /operations/:id/vehicles/search?vin=
GET  /vehicles/:id
POST /vehicles/unplanned            (registro de VIN no planificado + notifica a Planeamiento)
POST /vehicles/:id/reconcile        (regularización por Admin/Planeamiento)
POST /vehicles/:id/release          (liberación manual por supervisor)
```

### 19.5 Accesorios (catálogo)

```txt
GET   /accessories
POST  /accessories
PATCH /accessories/:id
```

### 19.6 Tarja

```txt
POST  /tarja/start
PATCH /tarja/:id/accessories
PATCH /tarja/:id/damages            (uno o varios daños en texto)
POST  /tarja/:id/finish
GET   /tarja/:id
```

### 19.7 Reportes

```txt
GET  /reports
GET  /reports/:id
GET  /reports/:id/pdf
POST /reports/:id/generate-pdf
```

### 19.8 Anulación

```txt
POST /reports/:id/annul
GET  /reports/annulments
```

### 19.9 Dashboard

```txt
GET /dashboard/admin
GET /dashboard/supervisor
GET /operations/:id/progress
```

---

## 20. Tiempo real

Eventos WebSocket sugeridos:

```txt
vehicle.status.changed
report.started
report.finished
report.annulled
report.unplanned.created
vehicle.auto_released
operation.progress.updated
pdf.generated
```

Ejemplo:

```txt
Tarjador finaliza reporte
↓
Backend guarda en PostgreSQL
↓
Backend emite evento report.finished
↓
Supervisor ve actualización inmediata
```

---

## 21. Reporte PDF de tarja

Se genera desde una plantilla HTML/CSS que representa el formato físico. Ventajas: fácil de modificar, permite ubicar datos en posiciones específicas, imprimir, generar historial e insertar campos dinámicos.

El PDF debe incluir:

```txt
Código de reporte
Nave
Fecha
BL / Booking
Puerto de descarga: Chancay
VIN / Chasis
Accesorios
Cantidades
Daños (uno o varios, en texto)
Iniciales del tarjador
Usuario tarjador
Hora inicio
Hora fin
Duración
Estado del reporte
```

---

## 22. Backups

### 22.1 Base de datos

Frecuencia: **diario**. Guardar: `PostgreSQL dump`.

### 22.2 Archivos

Respaldar: Excels cargados, PDFs generados, plantillas de tarja, logs importantes.

### 22.3 Política recomendada

```txt
Backups diarios por 7 días
Backups semanales por 1 mes
Backups mensuales por 6 meses
```

---

## 23. Monitoreo y mantenimiento

Monitorear: CPU, RAM, disco, estado de contenedores, conexiones activas, errores de backend/frontend, tiempo de respuesta, espacio de backups, base de datos.

Herramientas: Docker logs, Nginx logs, NestJS logs, PostgreSQL logs, y Grafana + Prometheus en versión avanzada.

---

## 24. Escalabilidad

### 24.1 Primera etapa (MVP)

```txt
1 VPS o servidor local
Docker Compose
PostgreSQL en el mismo servidor
Redis en el mismo servidor
Frontend y backend en el mismo servidor
```

### 24.2 Segunda etapa

```txt
Separar base de datos
Separar Redis
Separar storage de archivos
Agregar balanceador
Ejecutar varias instancias de backend
```

### 24.3 Tercera etapa

```txt
Cluster de backend
PostgreSQL dedicado
Redis dedicado
Storage tipo MinIO/S3
Monitoreo avanzado
CI/CD automatizado
```

---

## 25. Plan de desarrollo recomendado

### Fase 1: Base técnica

```txt
Configurar repositorio
Configurar Docker
Configurar NestJS
Configurar Next.js
Configurar PostgreSQL
Configurar Prisma
Configurar autenticación
Configurar roles
```

### Fase 2: Operaciones e importación

```txt
Crear operaciones
Cargar Excel
Validar Excel
Registrar BL
Registrar VIN
Mostrar vehículos
Catálogo de accesorios
```

### Fase 3: Tarja móvil PWA

```txt
Diseño mobile-first
Escaneo de VIN
Ingreso manual
Validación de vehículo
Flujo de VIN no planificado
Registro de accesorios (desde catálogo)
Registro de daños en texto (múltiples por vehículo)
Finalización de reporte
```

### Fase 4: Supervisor

```txt
Dashboard en tiempo real
Filtros por operación
Reportes recientes
Vehículos pendientes
Vehículos observados
Vehículos no planificados
Anulación de reportes
Auto-liberación por candado vencido (15 min) y liberación manual
```

### Fase 5: PDF

```txt
Crear plantilla HTML
Mapear campos
Generar PDF
Guardar historial
Descargar/imprimir
```

### Fase 6: Auditoría y seguridad

```txt
Audit logs
Control de acciones
Backups
Rate limiting
Logs de errores
Permisos finos
```

---

## 26. Recomendación final

```txt
Frontend/PWA:  Next.js + React + TypeScript
Backend:       NestJS + TypeScript
Base de datos: PostgreSQL
ORM:           Prisma
Tiempo real:   WebSockets + Redis
PDF:           Playwright o Puppeteer
Excel:         ExcelJS
Infraestructura: Ubuntu Server + Docker + Nginx
Servidor:      VPS o servidor local del puerto
```

Este enfoque permite una solución moderna, instalable, segura y mantenible, evitando app móvil separada y sistema web separado. El tarjador la usa como app desde el celular, el supervisor monitorea desde tablet o PC, y el administrador gestiona operaciones y el catálogo de accesorios desde el panel web. Queda preparada para operar dentro de la red local del puerto, con control de usuarios, catálogo de accesorios administrable, manejo de VIN no planificados (con reporte y notificación a Planeamiento), auto-liberación de candados vencidos, registro de daños en texto libre (múltiples por vehículo), auditoría, trazabilidad de errores, generación de PDF, carga de Excel y monitoreo en tiempo real.
