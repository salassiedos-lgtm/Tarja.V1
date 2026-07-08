# Revisión de UX del cliente — 2026-07-08

Feedback dado por el dueño del proyecto tras recorrer el sistema. Fuente autoritativa
para el plan de frontend. Lo que dice aquí manda sobre cualquier suposición de diseño.

---

## Principio general

> "Panel principal correcto, se realiza un seguimiento real, visual y auditable."

La estructura y la información son correctas. **Lo que falta es la capa de diseño.**
No estamos rediseñando el flujo: estamos vistiendo un sistema que ya funciona.

---

## Vistas de Administrador / Supervisor

### Dashboard principal
**Estado:** correcto. Seguimiento real, visual y auditable.
**Acción:** ninguna estructural.

### Operaciones
**Estado:** mal estructurado.
**Diagnóstico del cliente:** son operaciones pasadas, funciona como **repositorio de
información**. Debe estar "mejor estructurado, mejor plasmado".
**Acción:** rediseñar como archivo consultable, no como lista plana. Implica agrupación,
jerarquía visual, y probablemente filtros por nave / fecha / estado.

### Supervisión
**Estado:** correcto. "Control eficiente, operaciones en tiempo real, me gusta."
**Acción:** solo capa de diseño. **No tocar el comportamiento.**

### Accesorios
**Estado:** **cambio completo de interfaz.**
**Diagnóstico del cliente:** "muy pobre... una tabla sin estilo, prácticamente limpia."
**Acción:** rehacer la vista entera.

### Auditoría
**Estado:** funcionalmente bien, visualmente pobre.
**Acción:** mejora de diseño **más filtros**, que hoy no existen:
- por personal / usuario
- por rango de fechas
- por acción

---

## Vistas de Tarjador

### Panel principal
**Estado:** casi correcto.
**Correcto:** sus actividades; operaciones en curso y su avance.
**Defecto:** los indicadores muestran datos globales. **Deben ser por persona.**
> "ellos serán testigos de lo que hacen"

El tarjador ve **sus** métricas, no las de la operación completa.

### Operaciones
**Estado:** **no debe existir para el tarjador.**
> "el tarjador no debería poder verlo, porque es información diferente"

**Acción:** ocultar en el frontend **y bloquear en el backend por rol.** Esconder un link
no es control de acceso.

### Tarja
**Estado:** "debe estar mejorada completamente."
**Acción:** rediseño completo. Es la pantalla que el tarjador usa en el patio, con una
mano, con guantes, bajo sol. Prioridad de usabilidad sobre estética.

---

## Orden de ejecución (decidido por el cliente)

1. Terminar los bloques del backend (importación jerárquica, VIN único, correlativo).
2. **Luego**, los cambios de frontend **puramente visuales**.
3. **Diferido** hasta nuevo aviso: todo lo que exija backend nuevo.

### Se hace en la pasada visual

| Vista | Trabajo |
|---|---|
| Accesorios | Rehacer la interfaz completa |
| Operaciones | Reestructurar como repositorio consultable |
| Auditoría | Rediseño + filtros (client-side sobre los datos que el endpoint ya devuelve) |
| Supervisión | Solo capa de diseño, sin tocar comportamiento |
| Dashboard | Solo capa de diseño |
| Tarja (tarjador) | Rediseño de usabilidad |
| Nav del tarjador | Ocultar el ítem "Operaciones" |

### Se difiere (necesita backend)

1. **Indicadores por tarjador.** No existe endpoint de métricas por usuario. Hay que
   crearlo (reportes finalizados por ese usuario, duración media, vehículos observados).
   Hasta entonces, el panel del tarjador seguirá mostrando cifras globales.

2. **Cerrar Operaciones al tarjador de verdad.** Ocultar el ítem del menú es cosmético;
   el endpoint sigue abierto y cualquiera con el token puede llamarlo. Requiere
   `@Roles('ADMIN','SUPERVISOR')` en `operations.controller.ts`.
   **Mientras no se haga, esto es una vulnerabilidad de control de acceso, no un
   detalle visual.** Es una línea de código; conviene no dejarla mucho tiempo.

---

## Pendiente de definir

El cliente cerró con: *"Ahora agregaremos ciertos detalles principales."* — y no llegaron.
El plan de frontend **no se cierra** hasta tener esos detalles. Hasta entonces:

- ¿Qué indicadores exactos ve el tarjador en su panel?
- ¿Qué campos filtra la auditoría, y con qué granularidad de fecha?
- ¿Qué debe cambiar concretamente en la vista de tarja, más allá de "mejorarla"?
- ¿Hay identidad de marca (colores, logo del CSPCP / puerto de Chancay) que respetar?
