# Flujo de trabajo para importación, reconocimiento de VIN y tarja vehicular

## 1. Idea principal del flujo

El sistema debe manejar una estructura jerárquica clara, donde la información operativa se carga antes del inicio de la operación y el tarjador solo identifica el vehículo mediante VIN.

La lógica principal será:

```txt
Nave
  ↓
Operación
  ↓
BL
  ↓
VIN / Chasis
  ↓
Reporte de tarja
```

## 2. Regla principal de relación de datos

La estructura correcta del sistema debe considerar lo siguiente:

- La **nave** puede tener varios BL.
- El **BL es único** y funciona como identificador principal de la carga.
- El **VIN es único** y representa a cada vehículo.
- Cada VIN pertenece a un solo BL.
- Cada BL pertenece a una operación.
- Cada operación pertenece a una nave.
- Cada VIN genera un solo reporte de tarja activo.

Ejemplo:

```txt
Nave: Guang He Kou
Operación: Desconsolidado
Puerto descarga: Chancay

BL: COSU6502185840
  ├── VIN 1
  ├── VIN 2
  ├── VIN 3
  └── VIN N
```

## 3. Flujo general del administrador / supervisor

El administrador o supervisor será responsable de crear la operación y cargar la información base antes de que el tarjador empiece a trabajar.

Flujo:

```txt
Administrador/Supervisor ingresa al sistema
↓
Crea una nueva operación
↓
Ingresa el nombre de la nave
↓
Selecciona el tipo de operación
↓
El sistema define el importador correspondiente
↓
Carga el archivo Excel
↓
El sistema valida la información
↓
El sistema crea BL únicos
↓
El sistema registra VIN únicos
↓
Los VIN quedan disponibles para tarja
```

## 4. Formulario de creación de operación

Antes de subir el Excel, el sistema debe mostrar un formulario donde se registre la información que no necesariamente viene en el archivo.

Campos recomendados:

```txt
Nombre de nave
Tipo de operación
Fecha de operación
Puerto de descarga
Estado de operación
```

Ejemplo:

```txt
Nombre de nave: Guang He Kou
Tipo de operación: Desconsolidado
Fecha de operación: 08/07/2026
Puerto de descarga: Chancay
Estado: Programada
```

La nave se registra desde el formulario porque en algunos formatos de Excel, como el de desconsolidado, la nave no viene como columna.

## 5. Tipos de operación

El sistema deberá manejar diferentes tipos de operación:

```txt
Roll on Roll off
Desconsolidado
```

Cada tipo de operación puede tener un formato de Excel diferente.

Por eso, al seleccionar el tipo de operación, el sistema debe cambiar automáticamente el importador que utilizará.

Ejemplo:

```txt
Si operación = Roll on Roll off
    usar importador RORO

Si operación = Desconsolidado
    usar importador Desconsolidado
```

## 6. Importador de desconsolidado

El archivo de desconsolidado contiene información útil para el sistema, aunque existan campos en blanco.

Columnas detectadas en el formato de desconsolidado:

```txt
Commission number
Container number
B/L number
Goods name
Number of pieces
Weight(kg)
Volume(M3)
Cargo code
Package
Mark
Cargo space
Operation time
Staff
license plate number
Part number/chassis number
brand
model
damaged
Remark
```

## 7. Campos importantes para el sistema

Del Excel de desconsolidado, los campos más importantes para el sistema serán:

| Campo del sistema | Columna del Excel | Uso |
|---|---|---|
| BL | B/L number | Identificador único de la carga |
| Contenedor | Container number | Referencia logística |
| VIN / Chasis | Part number/chassis number | Identificador único del vehículo |
| Marca | brand | Información del vehículo |
| Modelo | model | Información del vehículo |
| Tipo de carga | Goods name | Descripción de carga |
| Cantidad | Number of pieces | Información complementaria |
| Peso | Weight(kg) | Información complementaria |
| Volumen | Volume(M3) | Información complementaria |
| Código de carga | Cargo code | Clasificación interna |
| Package | Package | Tipo de paquete |
| Daño previo | damaged | Referencia si viene informada |
| Observación | Remark | Comentarios del archivo |

La nave, tipo de operación, fecha y puerto de descarga se toman desde el formulario de creación de operación.

## 8. Puerto de descarga

Para este sistema, el puerto de descarga será:

```txt
Chancay
```

En caso el Excel no traiga una columna de puerto, el sistema deberá usar el valor del formulario o el valor fijo configurado en el sistema.

## 9. Normalización de la información importada

Aunque el Excel tenga muchas filas repitiendo el mismo BL, el sistema no debe crear el BL varias veces.

El sistema debe hacer lo siguiente:

```txt
Leer todas las filas del Excel
↓
Detectar BL únicos
↓
Crear un solo registro por cada BL
↓
Detectar VIN únicos
↓
Crear un vehículo por cada VIN
↓
Relacionar cada VIN con su BL correspondiente
```

Ejemplo:

| B/L number | VIN |
|---|---|
| COSU6502185840 | LEFEDDE15VTP04723 |
| COSU6502185840 | LEFEDDE10VTP04726 |
| COSU6502185840 | LEFEDDE10VTP04743 |

En base de datos debe quedar así:

```txt
BL:
COSU6502185840

VIN:
LEFEDDE15VTP04723 → COSU6502185840
LEFEDDE10VTP04726 → COSU6502185840
LEFEDDE10VTP04743 → COSU6502185840
```

## 10. Reglas de unicidad

El sistema debe validar dos reglas principales:

```txt
BL único
VIN único
```

### 10.1 Regla para BL

El BL no debe repetirse como nuevo registro.

Si el Excel trae muchas filas con el mismo BL, el sistema debe crear un solo BL y asociarle todos los VIN correspondientes.

### 10.2 Regla para VIN

El VIN no debe repetirse.

Si el sistema detecta un VIN duplicado dentro del mismo Excel o ya registrado en otra operación activa, debe mostrar una advertencia o bloquear la carga, según la regla de negocio definida.

Mensaje sugerido:

```txt
El VIN LEFEDDE15VTP04723 ya existe en el sistema.
Verifique el archivo antes de continuar.
```

## 11. Validación del Excel antes de guardar

Antes de confirmar la carga, el sistema debe validar el archivo.

Validaciones principales:

```txt
El BL no debe estar vacío.
El VIN no debe estar vacío.
El VIN no debe estar duplicado.
El BL debe ser único como registro maestro.
El formato debe coincidir con el tipo de operación seleccionado.
Las columnas obligatorias deben existir.
El archivo debe poder leerse correctamente.
```

Si hay errores, el sistema debe mostrar una previsualización.

Ejemplo:

```txt
Fila 8: VIN vacío.
Fila 12: BL vacío.
Fila 20: VIN duplicado.
```

## 12. Resultado después de importar

Una vez que el Excel se importa correctamente, el sistema debe crear:

```txt
Operación
Nave asociada
BL únicos
VIN únicos asociados a cada BL
Estados iniciales de los VIN
```

Cada VIN quedará en estado:

```txt
Pendiente
```

Esto significa que está disponible para ser trabajado por un tarjador.

Ejemplo de resultado:

```txt
Operación: Guang He Kou - Desconsolidado
BL: COSU6502185840
VIN cargados: 195
Pendientes: 195
Tarjados: 0
Observados: 0
```

## 13. Actualización del listado de VIN disponibles

Después de importar el Excel, el listado de VIN disponibles debe actualizarse automáticamente.

El supervisor podrá visualizar:

```txt
Total de VIN cargados
VIN pendientes
VIN en proceso
VIN tarjados
VIN observados
VIN anulados/reabiertos
```

Ejemplo:

```txt
Operación: Guang He Kou - Desconsolidado

Total VIN: 195
Pendientes: 195
En proceso: 0
Tarjados: 0
Observados: 0
```

## 14. Flujo del tarjador

El tarjador no debe ingresar manualmente la nave, el BL, la operación, la marca ni el modelo.

El flujo correcto será:

```txt
Tarjador inicia sesión
↓
Selecciona operación activa
↓
Escanea código de barras, usa OCR o ingresa VIN manualmente
↓
Sistema busca el VIN
↓
Sistema reconoce automáticamente:
    Nave
    Operación
    BL
    Puerto
    Marca
    Modelo
    Estado del vehículo
↓
Tarjador inicia la tarja
↓
Tarjador llena accesorios y daños
↓
Finaliza reporte
↓
VIN cambia de estado
```

## 15. Métodos para capturar el VIN

El sistema puede tener tres métodos de captura:

### 15.1 Escaneo de código de barras

Método principal.

El tarjador usa la cámara del celular para escanear el código de barras del VIN.

### 15.2 OCR

Método secundario.

El sistema intenta leer el VIN desde texto visible usando la cámara.

Este método debe considerarse como apoyo, porque puede fallar por iluminación, ángulo, reflejo o deterioro del texto.

### 15.3 Ingreso manual

Método de respaldo.

El tarjador escribe el VIN manualmente cuando el escaneo o el OCR no funcionen correctamente.

## 16. Reconocimiento automático del VIN

Cuando el tarjador escanea, usa OCR o ingresa manualmente el VIN, el sistema debe consultar la base de datos.

La búsqueda debe responder:

```txt
¿Existe este VIN?
¿A qué BL pertenece?
¿A qué operación pertenece?
¿A qué nave pertenece?
¿Cuál es su marca?
¿Cuál es su modelo?
¿Cuál es su estado actual?
¿Está pendiente?
¿Ya fue tarjado?
¿Está en proceso por otro usuario?
¿Fue anulado y está disponible nuevamente?
```

Ejemplo:

El tarjador escanea:

```txt
LEFEDDE15VTP04723
```

El sistema responde automáticamente:

```txt
VIN: LEFEDDE15VTP04723
BL: COSU6502185840
Nave: Guang He Kou
Operación: Desconsolidado
Puerto de descarga: Chancay
Marca: JMC
Modelo: Grand Vigus
Estado: Pendiente
```

El tarjador solo confirma e inicia el registro.

## 17. Flujo técnico de búsqueda del VIN

Cuando se recibe un VIN:

```txt
1. Sistema recibe el VIN.
2. Busca el VIN en la tabla vehicles.
3. Obtiene el BL asociado.
4. Obtiene la operación asociada.
5. Obtiene la nave asociada.
6. Obtiene marca y modelo.
7. Valida el estado del VIN.
8. Devuelve la información al tarjador.
```

Respuesta esperada del backend:

```json
{
  "vehicle_id": 1,
  "vin": "LEFEDDE15VTP04723",
  "brand": "JMC",
  "model": "Grand Vigus",
  "bl_number": "COSU6502185840",
  "operation_id": 10,
  "operation_type": "DESCONSOLIDADO",
  "ship_name": "Guang He Kou",
  "port_discharge": "Chancay",
  "vehicle_status": "PENDIENTE"
}
```

## 18. Validaciones al escanear VIN

### 18.1 VIN encontrado y pendiente

El sistema permite iniciar la tarja.

```txt
Estado: Pendiente
Acción: Iniciar tarja
```

### 18.2 VIN no encontrado

El sistema bloquea el registro.

Mensaje sugerido:

```txt
VIN no encontrado.
Verifique el código escaneado o consulte con el supervisor.
```

### 18.3 VIN ya tarjado

El sistema no permite duplicar reporte.

Mensaje sugerido:

```txt
Este VIN ya cuenta con reporte de tarja.
```

### 18.4 VIN en proceso

El sistema avisa que otro tarjador ya lo está trabajando.

Mensaje sugerido:

```txt
Este VIN está siendo procesado por otro tarjador.
```

### 18.5 VIN reabierto

Si el reporte fue anulado, el VIN vuelve a estar disponible.

```txt
Estado: Reabierto
Acción: Permitir nueva tarja
```

## 19. Estados del VIN

Estados recomendados:

| Estado | Descripción |
|---|---|
| Pendiente | El VIN fue cargado desde Excel y está disponible |
| En proceso | Un tarjador inició el reporte |
| Tarjado | Reporte finalizado sin daños |
| Observado | Reporte finalizado con daño o hallazgo |
| Anulado | El reporte fue anulado |
| Reabierto | El VIN vuelve a estar disponible por anulación |
| Bloqueado | El VIN está retenido por revisión operativa |

## 20. Flujo cuando se finaliza la tarja

Cuando el tarjador finaliza el reporte:

```txt
Sistema guarda accesorios.
Sistema guarda daños si existen.
Sistema guarda iniciales.
Sistema registra hora de fin.
Sistema calcula duración.
Sistema genera código de reporte.
Sistema cambia estado del VIN.
Sistema actualiza dashboard del supervisor.
```

Si no tiene daño:

```txt
VIN → Tarjado
Reporte → Finalizado
```

Si tiene daño:

```txt
VIN → Observado
Reporte → Con daño
```

## 21. Flujo de anulación

Si el supervisor detecta error en el reporte:

```txt
Supervisor abre reporte
↓
Selecciona Anular
↓
Sistema solicita motivo obligatorio
↓
Supervisor registra motivo
↓
Reporte pasa a Anulado
↓
VIN pasa a Reabierto
↓
VIN vuelve a estar disponible para nuevo registro
↓
Se guarda auditoría del error
```

Motivos sugeridos:

```txt
Error de tarjeo
VIN incorrecto
Accesorios mal registrados
Daño mal registrado
Reporte generado por error
Reporte duplicado
Otro
```

## 22. Estructura recomendada de base de datos

Tablas principales:

```txt
ships
operations
import_templates
operation_imports
bills_of_lading
vehicles
tarja_reports
tarja_report_accessories
tarja_report_damages
tarja_report_annulments
audit_logs
```

## 23. Tabla ships

Guarda las naves.

```txt
id
name
status
created_at
updated_at
```

Ejemplo:

```txt
Guang He Kou
```

## 24. Tabla operations

Guarda la operación creada.

```txt
id
ship_id
operation_code
operation_type
operation_date
port_discharge
status
created_by
created_at
updated_at
```

Ejemplo:

```txt
Nave: Guang He Kou
Tipo: Desconsolidado
Puerto: Chancay
```

## 25. Tabla import_templates

Guarda los tipos de formatos de importación.

```txt
id
operation_type
template_name
required_columns
status
created_at
updated_at
```

Ejemplo:

```txt
ROLL_ON_ROLL_OFF → Formato RORO
DESCONSOLIDADO → Formato Desconsolidado
```

## 26. Tabla operation_imports

Guarda el historial de archivos cargados.

```txt
id
operation_id
template_id
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

## 27. Tabla bills_of_lading

Guarda los BL asociados a la operación.

```txt
id
operation_id
bl_number
booking_number
status
created_at
updated_at
```

Regla:

```txt
bl_number debe ser único.
```

## 28. Tabla vehicles

Guarda los VIN.

```txt
id
operation_id
bill_of_lading_id
container_number
vin
chassis_number
brand
model
goods_name
pieces
weight_kg
volume_m3
cargo_code
package_type
imported_damage_status
imported_remark
status
current_report_id
locked_by
locked_at
created_at
updated_at
```

Regla:

```txt
vin debe ser único.
```

## 29. Importador de desconsolidado

Mapeo recomendado:

| Columna Excel | Campo del sistema | Obligatorio |
|---|---|---:|
| B/L number | bl_number | Sí |
| Container number | container_number | Sí |
| Part number/chassis number | vin / chassis_number | Sí |
| brand | brand | Sí |
| model | model | Sí |
| Goods name | goods_name | Opcional |
| Number of pieces | pieces | Opcional |
| Weight(kg) | weight_kg | Opcional |
| Volume(M3) | volume_m3 | Opcional |
| Cargo code | cargo_code | Opcional |
| Package | package_type | Opcional |
| damaged | imported_damage_status | Opcional |
| Remark | imported_remark | Opcional |

## 30. Pantalla recomendada para cargar información

### 30.1 Formulario previo

```txt
Nombre de nave: [Guang He Kou]
Tipo de operación: [Desconsolidado]
Fecha operación: [08/07/2026]
Puerto descarga: [Chancay]
```

### 30.2 Carga de archivo

```txt
Seleccionar archivo Excel
Botón: Validar archivo
```

### 30.3 Resultado de validación

```txt
BL detectados: 1
VIN detectados: 195
VIN duplicados: 0
Registros con error: 0
Marca detectada: JMC
Modelo detectado: Grand Vigus
```

### 30.4 Confirmación

```txt
Confirmar importación
```

Una vez confirmado:

```txt
Se actualiza el listado de VIN disponibles.
```

## 31. Pantallas necesarias

### Administrador / Supervisor

```txt
Crear operación
Seleccionar nave
Seleccionar tipo de operación
Cargar Excel
Previsualizar importación
Confirmar carga
Listado de BL
Listado de VIN
Dashboard de avance
Detalle de reporte
Anular reporte
Generar PDF
```

### Tarjador

```txt
Login
Operaciones activas
Escanear VIN
Ingreso manual de VIN
Confirmación de datos encontrados
Formulario de accesorios
Formulario de daños
Resumen
Finalizar reporte
```

## 32. Ejemplo de experiencia del tarjador

El tarjador abre la PWA instalada.

Selecciona:

```txt
Operación: Guang He Kou - Desconsolidado
```

Escanea:

```txt
LEFEDDE15VTP04723
```

El sistema muestra:

```txt
VIN encontrado

Nave: Guang He Kou
Operación: Desconsolidado
BL: COSU6502185840
Puerto de descarga: Chancay
Marca: JMC
Modelo: Grand Vigus
Estado: Pendiente
```

El tarjador presiona:

```txt
Iniciar tarja
```

Luego llena:

```txt
Accesorios
Daños
Detalle
Iniciales
```

Finaliza.

El sistema genera:

```txt
REP-CHY-2026-000001
```

Y el VIN pasa a:

```txt
Tarjado
```

## 33. Flujo completo corregido

```txt
Administrador/Supervisor crea operación
↓
Ingresa nombre de nave
↓
Selecciona tipo de operación
↓
Sistema selecciona importador correspondiente
↓
Carga Excel
↓
Sistema valida BL único
↓
Sistema valida VIN únicos
↓
Sistema crea BL
↓
Sistema crea VIN asociados al BL
↓
VIN quedan pendientes
↓
Tarjador escanea VIN / usa OCR / ingreso manual
↓
Sistema reconoce automáticamente nave, operación, BL, marca y modelo
↓
Tarjador llena accesorios y daños
↓
Finaliza reporte
↓
VIN cambia a Tarjado u Observado
↓
Supervisor monitorea avance
```

## 34. Conclusión

La lógica correcta es que el administrador o supervisor cargue previamente toda la información operativa desde el Excel, completando desde el formulario los datos que el archivo no contiene, como la nave.

El BL debe tratarse como un identificador único de carga y el VIN como identificador único del vehículo. El tarjador no debe registrar manualmente datos como nave, BL, operación, marca o modelo. El sistema debe reconocerlos automáticamente al momento de escanear, leer por OCR o ingresar manualmente el VIN.

Esto reduce errores, acelera la operación, evita duplicidad de reportes y permite al supervisor monitorear el avance real de la operación.
