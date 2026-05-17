# API Proyecto Intermodular — Sistema de Gestión Hotelera

API REST desarrollada con **Node.js**, **Express** y **MongoDB (Mongoose)** para la gestión integral de un hotel: reservas (justificante y **factura PDF** con tabla de conceptos, colección **`HotelInvoice`** con tipos `reservation` / `early_checkin` / `late_checkout` / `stay_extension`), **check-in en recepción**, **P9** estadísticas/fidelidad e **historial de estancias**, **P19** entrada anticipada / salida tardía (mismo día, €/h, modo instalaciones, ventana **12 h** para el cliente, auto-aprobación por rango), **ampliación de estancia** (`extend-stay`), usuarios, habitaciones (galería, ofertas, servicios extra), reseñas y catálogo `ExtraService`. **Auditoría** de reservas en `booking_audit_log` (activable/desactivable vía `operationalsettings`).

> Esta API es consumida por dos clientes: una aplicación de escritorio (WPF/.NET) y una aplicación móvil (Android/Kotlin). Cada uno cuenta con su propia documentación en su respectivo repositorio.

---

## Tabla de contenidos

- [Puesta en marcha](#puesta-en-marcha)
- [Tecnologías utilizadas](#tecnologías-utilizadas)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Base de datos MongoDB (colecciones y relaciones)](#base-de-datos-mongodb-colecciones-y-relaciones)
- [Sistema de Auditoría de Reservas](#sistema-de-auditoría-de-reservas)
- [Gestión de habitaciones](#gestión-de-habitaciones)
- [Módulo de Reseñas](#módulo-de-reseñas)
- [Facturación PDF (justificante y factura fiscal)](#facturación-pdf-justificante-y-factura-fiscal)
- [P9 · Estadísticas y fidelidad del cliente](#p9--estadísticas-y-fidelidad-del-cliente)
- [P9 · Historial de estancias por usuario](#p9--historial-de-estancias-por-usuario)
- [P19 · Flexibilidad (entrada anticipada / salida tardía)](#p19--flexibilidad-entrada-anticipada--salida-tardía)
- [Ampliación de estancia (extend-stay)](#ampliación-de-estancia-extend-stay)
- [Colección HotelInvoice (facturación multi-concepto)](#colección-hotelinvoice-facturación-multi-concepto)
- [Endpoints y verbos HTTP](#endpoints-y-verbos-http)
- [Ejemplos de peticiones](#ejemplos-de-peticiones)
- [Evolución del proyecto](#evolución-del-proyecto-desde-la-creación)

---

## Puesta en marcha

```bash
npm install
```

Crear un archivo `.env` en la raíz del proyecto:

| Variable      | Descripción                                   | Ejemplo                              |
|---------------|-----------------------------------------------|--------------------------------------|
| `MONGO_URI`   | Cadena de conexión a MongoDB Atlas o local     | `mongodb+srv://user:pass@cluster...` |
| `PORT`        | Puerto del servidor (por defecto `3000`)       | `3011`                               |
| `JWT_SECRET`  | Clave secreta para la firma de tokens JWT      | `clave_secreta_segura`               |
| `HOTEL_INVOICE_NAME` | (Opcional) Razón social en el PDF de factura | `Hotel Pere María` |
| `HOTEL_INVOICE_ADDRESS` | (Opcional) Dirección fiscal en el PDF | `Calle Ejemplo 1, 03001 Alicante` |
| `HOTEL_INVOICE_CIF` | (Opcional) NIF/CIF del hotel en el PDF | `B12345678` |
| `INVOICE_IVA_RATE` | (Opcional) Tipo de IVA **decimal** (ej. 10% = `0.10`) | `0.10` |
| `INVOICE_NUMBER_PREFIX` | (Opcional) Prefijo del nº de factura | `FAC` |
| `INVOICE_NUMBER_SEPARATOR` | (Opcional) Separador entre prefijo, año y secuencial | `-` |
| `INVOICE_NUMBER_SEQ_DIGITS` | (Opcional) Ancho del secuencial con ceros a la izquierda | `4` (→ `0001`) |
| `INVOICE_NUMBER_INCLUDE_YEAR` | (Opcional) Si `0` o `false`, formato `PREFIX-SEQ` sin año | `true` |
| `INVOICE_NUMBER_TEMPLATE` | (Opcional) Plantilla con `{PREFIX}`, `{YEAR}`, `{SEQ}` (anula el modo prefijo+sep+año) | `FAC-{YEAR}-{SEQ}` |
| `CHECK_IN_WINDOW_END_HOUR` | (Opcional) Hora fin ventana check-in recepción el día de entrada (tras las 12:00) | `22` |
| `CHECK_IN_LATE_FEE_EUR` | (Opcional) Recargo TTC al registrar check-in **tardío** (se suma a `price`) | `25` |
| `FLEX_EARLY_CHECKIN_BASE_FEE` | *(obsoleto)* Usar `FLEX_EARLY_RATE_PER_HOUR` | — |
| `FLEX_LATE_CHECKOUT_BASE_FEE` | *(obsoleto)* Usar `FLEX_LATE_RATE_PER_HOUR` | — |
| `FLEX_DISCOUNT_SILVER_PERCENT` | (P19) Descuento plata sobre tarifa flexibilidad | `15` |
| `FLEX_DISCOUNT_GOLD_PERCENT` | (P19) Descuento oro | `35` |
| `FLEX_EARLY_MIN_HOUR` | (P19) Hora mínima solicitud entrada anticipada (mismo día) | `8` |
| `FLEX_LATE_MAX_HOUR` | (P19) Hora máxima salida tardía (mismo día) | `18` |
| `FLEX_AUTO_APPROVE_SILVER` | (P19) Si `1`/`true`, plata + disponibilidad → `approved` automático | `true` |
| `FLEX_AUTO_APPROVE_GOLD` | (P19) Igual para oro | `true` |
| `FLEX_EARLY_RATE_PER_HOUR` | (P19) €/h de diferencia vs 12:00 (entrada anticipada) | `13.33` |
| `FLEX_LATE_RATE_PER_HOUR` | (P19) €/h de diferencia vs 11:00 (salida tardía) | `11.67` |
| `FLEX_MIN_BILLABLE_HOURS` | (P19) Mínimo de horas facturables en el suplemento | `1` |
| `FLEX_MAX_SUPPLEMENT_EUR` | (P19) Tope del suplemento antes de dto. fidelidad (`0` = sin tope) | `0` |
| `FLEX_NOTIFY_CLIENT` | (P19) Email al aprobar/rechazar (`0` desactiva) | activo |
| `LOYALTY_SILVER_NIGHTS` | (P9) Noches para rango plata | `5` |
| `LOYALTY_GOLD_NIGHTS` | (P9) Noches para rango oro | `15` |
| `LOYALTY_SILVER_SPENT_EUR` | (P9) Gasto acumulado (€) para plata | `400` |
| `LOYALTY_GOLD_SPENT_EUR` | (P9) Gasto acumulado (€) para oro | `1200` |
| `BOOKING_AUDIT_ENABLED` | (Opcional) `0`/`false` desactiva escritura en `booking_audit_log` por defecto en BD | `true` |
| `CLIENT_FLEX_REQUEST_WINDOW_HOURS` | (Opcional) Horas desde las 11:00 del día de salida para que el **cliente** solicite late/ampl. corta | `12` |

```bash
npm start
```

El servidor arranca en el puerto definido en `PORT`. Si la variable no está configurada, se utiliza el puerto `3000` por defecto.

---

## Tecnologías utilizadas

| Tecnología   | Uso                                            |
|--------------|-------------------------------------------------|
| Node.js      | Entorno de ejecución del servidor               |
| Express      | Framework web para la API REST                  |
| Mongoose     | ODM para modelado y consultas en MongoDB        |
| JWT          | Autenticación basada en tokens                  |
| bcrypt       | Cifrado de contraseñas                          |
| dotenv       | Gestión de variables de entorno                 |
| Multer       | Subida de archivos (imágenes)                   |
| Nodemailer   | Envío de correos electrónicos                   |
| **pdfkit**   | Generación de facturas en **PDF** en el servidor |

---

## Estructura del proyecto

```
API-Intermodular-Ysael/
├── index.js                        # Punto de entrada (`/auth`, `/reservation`, `/invoices`, `/settings`, …)
├── db.js                           # Conexión a MongoDB
├── package.json
├── .env                            # Variables de entorno (no versionado)
│
├── models/
│   ├── BookingAuditLog.js          # Registro de auditoría
│   ├── Reservation.js              # Reservas (+ recepción, P19, superseded_by…)
│   ├── HotelInvoice.js             # Facturas emitidas (varios tipos por reserva)
│   ├── ClientLoyaltyStats.js       # P9 · un doc por user_id (noches, gasto, rango)
│   ├── Room.js                     # Habitaciones
│   ├── ExtraService.js             # Catálogo de servicios extra (EXT-xxx)
│   ├── User.js                     # Usuarios
│   ├── Review.js                   # Reseñas
│   ├── InvoiceSettings.js         # Datos fiscales emisor (documento único; override .env)
│   ├── FlexibilitySettings.js     # P19 · €/h suplemento + notificaciones
│   └── OperationalSettings.js    # Auditoría on/off + ventana 12 h cliente (flex)
│
├── controllers/
│   ├── auditController.js          # Consulta de auditoría (solo lectura)
│   ├── reservationController.js    # CRUD reservas + checkout + check-in recepción
│   ├── flexibilityController.js    # P19 · solicitudes early/late + aprobación
│   ├── stayExtensionController.js  # PATCH extend-stay
│   ├── userStayController.js       # P9 · GET /users/:id/history|stats
│   ├── loyaltyStatsController.js   # P9 · GET /loyalty/me
│   ├── flexibilitySettingsController.js # P19 · GET/PUT /settings/flexibility
│   ├── operationalSettingsController.js # GET/PUT /settings/operational
│   ├── invoiceController.js        # PDF, confirm-payment, listados HotelInvoice
│   ├── invoiceSettingsController.js # GET/PUT `/settings/invoice`
│   ├── authController.js           # Autenticación (login / registro)
│   ├── userController.js           # Gestión de usuarios
│   ├── roomController.js           # Gestión de habitaciones
│   ├── extraServiceController.js   # Catálogo GET/POST /room/extra-services
│   └── reviewController.js         # Gestión de reseñas
│
├── middleware/
│   ├── bookingAuditMiddleware.js   # Captura del estado previo (auditoría)
│   ├── authMiddleware.js           # Verificación de JWT y roles
│   └── diskStorage.js              # Configuración de Multer
│
├── services/
│   ├── auditService.js             # Lógica de escritura y resumen de auditoría
│   ├── invoiceNumberService.js     # Numeración automática invoice_number (.env)
│   ├── invoiceBreakdownService.js  # Desglose noches / oferta habitación / dto cliente / extras
│   ├── invoicePdfService.js        # Factura fiscal + justificante PDF (pdfkit)
│   ├── invoiceEmissionService.js   # Emisión + persistencia HotelInvoice (idempotente)
│   ├── invoiceSettingsService.js   # Merge BD + `.env` para cabecera fiscal PDF
│   ├── flexibilityInvoiceHelper.js # Factura suplemento P19 al aprobar
│   ├── receptionCheckInService.js  # Ventana horaria check-in recepción + recargo tardío
│   ├── clientLoyaltyStatsService.js # P9 · agrega reservas → upsert ClientLoyaltyStats
│   ├── userStayService.js          # P9 · historial paginado + estadísticas enriquecidas
│   ├── stayExtensionService.js     # Ampliación salida + cambio habitación
│   ├── flexibilityProgramService.js # P19 · tarifas, disponibilidad efectiva, validación horas
│   ├── flexibilitySettingsService.js
│   └── flexibilityNotificationService.js # P19 · email al resolver solicitud
│
├── routes/
│   ├── reservationRoutes.js        # Reservas, facturas PDF, check-in, flexibilidad P19
│   ├── bookingRoutes.js            # P19 + extend-stay + review bajo /bookings
│   ├── usersRoutes.js              # P9 · /users/:id/history y /stats
│   ├── invoiceRoutes.js            # GET /invoices?userId= (facturas por cliente)
│   ├── settingsRoutes.js           # GET/PUT `/settings/invoice`, `/settings/flexibility`
│   ├── loyaltyRoutes.js            # P9 · GET `/loyalty/me`, POST `/loyalty/me/sync`
│   ├── authRoutes.js
│   ├── userRoutes.js
│   ├── roomRoutes.js
│   └── reviewRoutes.js
│
├── uploads/                        # Imágenes subidas (Multer)
│
└── config/
    └── mailer.js                   # Configuración de Nodemailer
```

---

## Base de datos MongoDB (colecciones y relaciones)

La API es el **único componente** que lee y escribe en MongoDB. Los clientes WPF y Android solo consumen la REST API. En Compass verás la base (p. ej. `Proyecto-Intermodular`) con las colecciones siguientes.

### Diagrama de relaciones (lógicas)

MongoDB **no usa claves foráneas** de SQL: las relaciones son por **IDs de negocio** (`user_id`, `room_id`, `reservation_id`, …). La integridad la garantiza la aplicación al validar que existan los documentos referenciados.

```mermaid
erDiagram
    users ||--o{ reservations : "user_id"
    rooms ||--o{ reservations : "room_id"
    users ||--o| clientloyaltystats : "user_id (1 doc)"
    users ||--o{ reviews : "user_id"
    rooms ||--o{ reviews : "room_id"
    reservations ||--o{ booking_audit_log : "booking_id"
    reservations ||--o{ hotelinvoices : "reservation_id"
    reservations ||--o{ reviews : "reservation_id"
    rooms }o--o{ extraservices : "extra_services[]"
    invoicesettings ||..|| hotelinvoices : "datos PDF emisor"
    flexibilitysettings ||..|| reservations : "tarifas P19"
    operationalsettings ||..|| booking_audit_log : "activar/desactivar log"
```

### Tabla de colecciones

| Colección en Compass | Modelo Mongoose | Qué guarda | Relación principal |
|----------------------|-----------------|------------|-------------------|
| **users** | `User` | Clientes, empleados y admin (login, perfil, descuento, imagen) | `user_id` → `CLI-xxxxx` / `EMP-xxxxx` |
| **rooms** | `Room` | Catálogo de habitaciones (precio, galería, oferta, servicios) | `room_id` → `HAB-xxx` |
| **reservations** | `Reservation` | Estancia: fechas, precio, check-in recepción, P19 embebido, factura, ampliaciones | `user_id` + `room_id`; puede enlazar `superseded_by_reservation_id` |
| **extraservices** | `ExtraService` | Catálogo global (TV, cuna, …) con precio | Referenciado desde `rooms.extra_services[]` |
| **reviews** | `Review` | Valoración tras estancia | `user_id` + `room_id` (+ contexto de reserva) |
| **clientloyaltystats** | `ClientLoyaltyStats` | **Un documento por cliente**: noches, gasto, rango (bronce/plata/oro) | `user_id` (sincronizado desde reservas) |
| **hotelinvoices** | `HotelInvoice` | Cada factura emitida (checkout, P19, ampliación) | `reservation_id`, `user_id`, `room_id`; `type`: reservation / early_checkin / late_checkout / stay_extension |
| **booking_audit_log** | `BookingAuditLog` | Historial de cambios en reservas (snapshots antes/después) | `booking_id` = `reservation_id` |
| **invoicesettings** | `InvoiceSettings` | Datos fiscales del hotel para el PDF (nombre, NIF, IVA) | Documento único; complementa `.env` |
| **flexibilitysettings** | `FlexibilitySettings` | Tarifas €/h P19, topes horarios, auto-aprobación por rango | Documento único de configuración |
| **operationalsettings** | `OperationalSettings` | Interruptor de auditoría + ventana horas cliente (12 h por defecto) | Documento único; se crea al guardar desde WPF |

### Colección central: `reservations`

Cada reserva enlaza **huésped** y **habitación** y concentra la lógica de negocio:

| Campo / bloque | Relación o significado |
|----------------|------------------------|
| `user_id` | Huésped en `users` |
| `room_id` | Habitación en `rooms` |
| `early_checkin_requested` / `late_checkout_requested` | Subdocumentos P19 (estado, hora, tarifa, `late_mode`: habitación o `facilities`) |
| `reception_check_in_*` | Check-in físico en recepción (WPF) |
| `invoice_number`, `invoice_breakdown` | Copia en reserva tras checkout; detalle también en `hotelinvoices` |
| `superseded_by_reservation_id` / `extended_from_reservation_id` | Cadena si la ampliación obliga a otra habitación |

### Facturación: dos sitios complementarios

1. **`reservations`**: último estado de la estancia (`price`, `invoice_number`, desglose congelado).
2. **`hotelinvoices`**: **histórico** de cada emisión (varias facturas por reserva si hay P19 o ampliación).

El PDF se genera con datos de `invoicesettings` + `.env` y el desglose de la reserva o de la fila `HotelInvoice`.

### Configuración (documentos únicos)

| Colección | Uso |
|-----------|-----|
| `invoicesettings` | Emisor en factura PDF (WPF → **Datos factura**) |
| `flexibilitysettings` | Reglas P19 (WPF → **Reglas solicitudes**; `.env` como respaldo) |
| `operationalsettings` | `booking_audit_enabled` (WPF → checkbox en **Auditorías**); `client_flex_request_window_hours` (12 h tras 11:00 para late/ampl. corta en app) |

### Auditoría: lectura siempre, escritura opcional

- **Lectura:** `GET /reservation/:id/audit` y `GET /reservation/audits` consultan `booking_audit_log`.
- **Escritura:** solo si `booking_audit_enabled` es `true` (Mongo o `.env`). Si está desactivado, las reservas siguen funcionando pero **no se insertan** nuevas líneas (ahorra recursos).

### Endpoints de configuración operativa

| Método | Ruta | Rol |
|--------|------|-----|
| `GET` | `/settings/operational` | admin / empleado |
| `PUT` | `/settings/operational` | admin / empleado — body: `{ "booking_audit_enabled": true/false, "client_flex_request_window_hours": 12 }` |

---

## Sistema de Auditoría de Reservas

### Descripción general

El sistema de auditoría registra de forma automática un historial de cada operación realizada sobre las reservas (cuando está **activado** en `operationalsettings` o `BOOKING_AUDIT_ENABLED` en `.env`). Para cada evento se almacena:

- **Quién** realizó la acción (identificador y tipo de actor).
- **Qué** operación se ejecutó (`CREATED`, `UPDATED`, `CANCELED`).
- **Cuándo** ocurrió (marca de tiempo).
- **Estado anterior y posterior** de la reserva (snapshots completos).

El historial es de **solo lectura**: no existen endpoints para modificar ni eliminar registros de auditoría.

### Flujo de operación

```
Petición HTTP (crear / modificar / cancelar / checkout de reserva)
       │
       ▼
Middleware de auditoría → captura el estado ANTERIOR en MongoDB
       │
       ▼
Controlador de reservas → valida, ejecuta el cambio en la BD
       │
       ▼
Si la operación fue exitosa → logBookingChange() guarda el registro
       │
       ▼
Respuesta al cliente
```

### Rutas que escriben en `booking_audit_log`

Solo se auditan **cambios que llegan a guardarse** en MongoDB. El middleware corre **antes** del controlador; `logBookingChange` corre **después** de un `save()` exitoso.

| Ruta HTTP | Middleware | Controlador | `action` guardada | Notas |
|-----------|------------|-------------|---------------------|--------|
| `POST /reservation/add` | `capturePreviousForNewReservation` | `addReservation` | `CREATED` | Estado previo siempre `null`; `new_state` = reserva recién creada. |
| `POST /reservation/cancel` | `capturePreviousReservationState` | `cancelReservation` | `CANCELED` | `reservation_id` en body. |
| `DELETE /reservation/cancel/:reservation_id` | igual | igual | `CANCELED` | ID en URL. |
| `PATCH /reservation/update` | igual | `updateReservation` | `UPDATED` | Cambios de habitación, fechas, cliente, precio. |
| `POST /reservation/checkout` | igual | `checkoutReservation` | `UPDATED` | **No** hay valor `CHECKOUT` aparte: fiscalmente es una modificación (factura + fecha checkout). En el historial se verán esos campos en `detalle_cambios`. |
| `POST /reservation/check-in` | igual | `registerReceptionCheckIn` | `UPDATED` | Registra `reception_check_in_at`; si tardío, recargo en `price`. |

**No** pasan por este flujo: listados (`GET /all`, `/mine`, …), cálculo de precios, descarga de factura PDF, ni `GET …/audit` (solo lectura del log).

---

### Modelo — `BookingAuditLog.js`

| Campo            | Tipo   | Descripción                                                        |
|------------------|--------|--------------------------------------------------------------------|
| `booking_id`     | String | ID de negocio de la reserva (`RSV-xxxxx`)                          |
| `action`         | String | Operación realizada: `CREATED`, `UPDATED` o `CANCELED`             |
| `actor_id`       | String | ID del usuario que ejecutó la acción                               |
| `actor_type`     | String | `user` (cliente) o `employee` (empleado/administrador)             |
| `previous_state` | Mixed  | Snapshot de la reserva antes del cambio (`null` en alta)           |
| `new_state`      | Mixed  | Snapshot de la reserva después del cambio                          |
| `timestamp`      | Date   | Fecha y hora del evento                                            |

Índice compuesto para optimizar consultas cronológicas:

```javascript
bookingAuditLogSchema.index({ booking_id: 1, timestamp: 1 });
```

### Servicio — `auditService.js`

| Función | Descripción |
|---------|-------------|
| `actorTypeFromRole(role)` | Traduce `'client'` → `'user'`, otros → `'employee'` |
| `cloneState(doc)` | Copia profunda de un documento Mongoose (`JSON.parse(JSON.stringify(...))`) |
| `logBookingChange({...})` | Inserta un registro de auditoría; si falla, registra el error sin interrumpir la operación |
| `describeReservationAuditChanges(prev, next, action)` | Compara dos estados campo a campo y genera `resumen_cambios` (textos legibles) y `detalle_cambios` (array estructurado) |

El resumen de diferencias se calcula **al vuelo** en cada `GET …/audit` y `GET /reservation/audits`, no se almacena en MongoDB: en la colección solo están `previous_state` y `new_state`.

**Campos extra en la respuesta JSON** (WPF y Android los consumen para mostrar antes/después):

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `resumen_cambios` | `string[]` | Líneas legibles, p. ej. `Precio: 120 → 150` |
| `detalle_cambios` | `object[]` | Por cada campo modificado: `campo`, `etiqueta`, `antes`, `despues` (valores JSON crudos) |

Ejemplo de ítem en `GET /reservation/audits`:

```json
{
  "booking_id": "RSV-00042",
  "action": "UPDATED",
  "actor_id": "EMP-001",
  "timestamp": "2026-05-17T10:30:00.000Z",
  "resumen_cambios": ["Precio: 120 → 150", "Salida: 2026-05-20 11:00 → 2026-05-21 11:00"],
  "detalle_cambios": [
    { "campo": "price", "etiqueta": "Precio", "antes": 120, "despues": 150 },
    { "campo": "check_out", "etiqueta": "Salida", "antes": "2026-05-20T11:00:00.000Z", "despues": "2026-05-21T11:00:00.000Z" }
  ]
}
```

**Lógica de `describeReservationAuditChanges` (sencilla):**

- Si `action === 'CREATED'` o no hay estado anterior (`null` / ausente), no compara: devuelve un único mensaje del tipo *“Alta de reserva (no había estado anterior)”* y `detalle_cambios` vacío.
- En el resto de casos toma las claves presentes en **ambos** JSON (unión de campos), **ignora** `_id` y `__v`, y para cada campo distinto (igualdad vía `JSON.stringify`) añade una línea al resumen tipo `Etiqueta: valorAntes → valorDespués`.
- Las **etiquetas** amigables vienen de un mapa fijo (`Precio`, `Fecha cancelación`, `Habitación`, …); si el campo no está mapeado, se usa el nombre técnico del campo.
- Fechas en string ISO se formatean de forma compacta para el texto del resumen; otros tipos (número, booleano, objeto) tienen reglas simples de conversión a texto.
- Si tras comparar no hubo ninguna diferencia (caso raro si los snapshots son coherentes), el resumen indica explícitamente que no hubo diferencias.

**`logBookingChange`:** antes de insertar vuelve a clonar `previous_state` y `new_state` para no guardar referencias vivas a objetos de Mongoose. Si el `create` falla, se escribe en consola y **la petición HTTP ya ha tenido éxito**: la reserva no se revierte (auditoría “best effort”).

### Middleware — `bookingAuditMiddleware.js`

- **`capturePreviousReservationState`**: obtiene `reservation_id` de `req.body.reservation_id` **o** `req.params.reservation_id` (sirve para `DELETE /cancel/:reservation_id`). Busca la reserva en Mongo y guarda una **copia profunda** del documento actual en `req.bookingAuditPreviousState`. Si no viene ID, deja `req.bookingAuditPreviousState` sin definir; si el ID no existe, guarda `null`. Si falla la lectura, responde **500** y no llega al controlador.
- **`capturePreviousForNewReservation`**: fija `req.bookingAuditPreviousState = null` (alta: no hay “antes” en base de datos).

### Controlador — `auditController.js`

`getBookingAudit(req, res)`:

1. Comprueba que la reserva exista y aplica la misma regla **`puedeVerReserva`** que el resto de la API (cliente solo la suya; admin/empleado cualquiera).
2. Lee todos los documentos de `BookingAuditLog` con ese `booking_id`, ordenados por **`timestamp` ascendente** (cronología real).
3. Para cada fila del log, llama a `describeReservationAuditChanges` y **añade** `resumen_cambios` y `detalle_cambios` al JSON de respuesta (no se persisten).

Ejemplo de respuesta:

```json
{
  "booking_id": "RSV-00003",
  "action": "CANCELED",
  "resumen_cambios": ["Precio: 200 → 50", "Fecha cancelación: — → 11/05/2026 01:18"],
  "detalle_cambios": [
    { "campo": "price", "etiqueta": "Precio", "antes": 200, "despues": 50 }
  ]
}
```

---

## Gestión de habitaciones

### Modelo — `Room.js` (persistido en MongoDB)

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `room_id` | String | Identificador único |
| `type` | String | Ej.: `Individual`, `Doble`, `Suite` |
| `description` | String | Texto para el cliente |
| `image` | String | Legacy: una o varias URLs separadas por comas |
| `images` | `[String]` | Galería explícita; la API fusiona con `image` al serializar |
| `extra_services` | `[String]` | IDs del catálogo (`EXT-001`, …) asociados a la habitación |
| `offer_active` | Boolean | Si la oferta aplica |
| `offer_percent` | Number | Descuento 0–100 sobre `price_per_night` |
| `price_per_night` | Number | Tarifa base por noche |
| `rate` | Number | Valoración media (por defecto 0) |
| `max_occupancy` | Number | Capacidad máxima |
| `isOperational` | Boolean | `false` = fuera de servicio (no sale en búsqueda cliente) |
| `isAvailable` | Boolean | Legacy; no usar como fuente de verdad |

### `isOperational`

- `true` → el hotel puede ofrecer la habitación en apps y en `GET /room/available`.
- `false` → excluida de disponibilidad y del catálogo cliente.

### Salida unificada — `normalizeRoomOut`

En `GET /room/all`, `GET /room/one`, `GET /room/available` y en la respuesta de `PUT /room/update`, cada habitación se enriquece con:

| Campo | Descripción |
|-------|-------------|
| `images` | Array de URLs (fusión de `images[]` + split de `image` legacy, sin duplicados) |
| `image` | String con todas las URLs unidas por comas (compatibilidad clientes antiguos) |
| `extra_services` | Lista de IDs de servicios |
| `is_operational` | Boolean normalizado para el cliente |
| `is_occupied_now` | `true` si hay reserva activa (no cancelada) con `check_in ≤ ahora < check_out` |
| `base_price_per_night` | Precio base almacenado |
| `effective_price_per_night` | Precio mostrado con oferta aplicada si `offer_active` y `offer_percent` válidos |

La lógica central está en `controllers/roomController.js`: primero se unen URLs (`collectImageUrls`), luego el precio efectivo y finalmente el objeto que ve el cliente:

```javascript
function effectiveNightly(room) {
  const base = Number(room.price_per_night) || 0;
  const pct = Number(room.offer_percent) || 0;
  if (room.offer_active && pct > 0 && pct <= 100) {
    return Math.round(base * (1 - pct / 100) * 100) / 100;
  }
  return base;
}

function normalizeRoomOut(room, occupiedNowSet) {
  const imgs = collectImageUrls(room);
  const imageStr = imgs.length ? imgs.join(',') : (room.image || DEFAULT_IMG);
  const base = Number(room.price_per_night) || 0;
  const eff = effectiveNightly({ ...room, price_per_night: base });
  return {
    ...room,
    images: imgs,
    image: imageStr,
    extra_services: Array.isArray(room.extra_services) ? room.extra_services.map(String) : [],
    is_operational: room.isOperational !== false,
    is_occupied_now: occupiedNowSet
      ? occupiedNowSet.has(String(room.room_id).trim())
      : false,
    effective_price_per_night: eff,
    base_price_per_night: base,
  };
}
```

### Disponibilidad — `GET /room/available`

**Query (acepta alias snake_case):**

| Parámetro | Obligatorio | Descripción |
|-----------|-------------|-------------|
| `checkIn` o `check_in` | Sí | Inicio de estancia (`YYYY-MM-DD` o `DD/MM/YYYY`) |
| `checkOut` o `check_out` | Sí | Fin de estancia |
| `guests` | No (defecto 1) | Mínimo 1; filtra `max_occupancy >= guests` |
| `services` o `service_ids` | No | Lista separada por comas de IDs `EXT-xxx`; la habitación debe incluir **todos** |

La consulta excluye habitaciones no operativas, sin capacidad suficiente y con solapamiento de reservas en el rango `[checkIn, checkOut)`.

### Catálogo — `ExtraService.js`

| Campo | Descripción |
|-------|-------------|
| `service_id` | Identificador único (`EXT-001`, …) |
| `name` | Nombre legible (ej. Desayuno, Parking) |
| `price` | Precio TTC por unidad en factura (≥ 0; por defecto `0` = aparece en PDF sin cargo explícito) |
| `active` | Si `false`, no se lista en `GET /room/extra-services` |

**Alta de un servicio** (`POST /room/extra-services`): el cuerpo necesita `name`; opcional `price`. El servidor genera el siguiente `EXT-xxx`:

```javascript
// controllers/extraServiceController.js (resumen)
const service_id = `EXT-${String(n).padStart(3, '0')}`;
const doc = await ExtraService.create({ service_id, name, active: true, price: 0 });
```

Las habitaciones guardan en `extra_services` los IDs que elijan desde ese catálogo; `GET /room/available?...&services=EXT-001,EXT-002` devuelve solo habitaciones que **incluyen todos** esos IDs.

### Reservas activas — imagen de habitación

`GET /reservation/allActive` enriquece cada reserva con `room_image` resolviendo la habitación asociada (útil para tarjetas en cliente sin segunda petición).

---

## Módulo de Reseñas

### Modelo — `Review.js`

| Campo       | Tipo   | Descripción                                            |
|-------------|--------|--------------------------------------------------------|
| `review_id` | String | Identificador único (`REV-xxxxx`)                      |
| `room_id`   | String | Habitación reseñada                                    |
| `user_id`   | String | Cliente autor de la reseña                             |
| `user_name` | String | Nombre del cliente (resuelto en el servidor)           |
| `rating`    | Number | Puntuación entre 1 y 5                                 |
| `comment`   | String | Texto de la reseña (máx. 2000 caracteres)              |

### Controlador — `reviewController.js`

- **`nextReviewId()`**: genera el siguiente ID consultando la colección `reviews` directamente.
- **`createReview`**: valida campos, verifica reserva previa, impide duplicados, resuelve `user_name`.
- **`deleteReview`**: solo el autor o un administrador pueden eliminar.

---

## Facturación PDF (justificante y factura fiscal)

Las facturas fiscales emitidas se guardan en la colección **`HotelInvoice`** (varios documentos por reserva posibles: estancia, P19, ampliación). El campo `Reservation.invoice_number` sigue reflejando la última factura principal de checkout cuando aplica.

El huésped dispone de **dos tipos de PDF** en el ciclo de vida de la reserva:

| Documento | Cuándo existe | Endpoint | Naturaleza |
|-----------|---------------|----------|------------|
| **Justificante de reserva** | Tras crear/pagar la reserva (pasarela **simulada** en apps) | `GET /reservation/:id/booking-receipt` | PDF **no fiscal**: acuse de reserva y importe TTC simulado; útil en recepción antes del checkout |
| **Factura fiscal** | Tras **checkout** en recepción (`invoice_number` asignado) | `GET /reservation/:id/invoice` | PDF con numeración, IVA desglosado y desglose económico (`invoice_breakdown`) |

Ambos se **generan al vuelo** con **pdfkit** (no se guardan en disco en el servidor).

**Formato actual de la factura fiscal** (plantilla en `invoicePdfService.js`):

- Título **Factura** + número (`FAC-…`) y **fecha**.
- Bloques **Emisor** y **Cliente** en dos columnas (nombre, NIF, dirección / email, DNI, ciudad).
- Tabla **Conceptos facturados**: Concepto · Cant. · P. unit. · Total (alojamiento con fechas y nota de descuento, líneas de extras, ajuste si aplica).
- Totales alineados a la derecha: **Base imponible**, **IVA (%)**, **Total factura**.

### Idea en una frase (factura fiscal)

1. Un empleado o administrador marca la reserva como **checkout completado**.  
2. El servidor **guarda** `invoice_number`, `checkout_completed_at` y un **`invoice_breakdown`** (desglose congelado: noches, alojamiento, descuento perfil cliente, extras con precio, ajuste al importe pactado `price`).  
3. Cualquier petición válida a **descargar factura** genera el **PDF al momento**. Las reservas antiguas sin `invoice_breakdown` recalculan el desglose al generar el PDF (misma fórmula que en checkout).

### Justificante de reserva (`booking-receipt`)

- Disponible **en cuanto existe la reserva** (no exige `invoice_number` ni checkout).
- Misma regla de autorización que la factura: **cliente** dueño de la reserva o **admin/empleado**.
- Contenido: cabecera «JUSTIFICANTE DE RESERVA», datos hotel/cliente, habitación, fechas, **importe total TTC** de `reservation.price`, aviso de pasarela ficticia y texto de que la **factura fiscal** se emitirá en checkout.
- Nombre de archivo sugerido: `Justificante-RSV-xxxxx.pdf`.
- Implementación: `writeBookingReceiptPdf` + `streamBookingReceiptPdf` en `services/invoicePdfService.js`; controlador `getBookingReceiptPdf` en `invoiceController.js`.
- `GET …/billing-info` incluye `download_booking_receipt` con método y ruta relativos para que los clientes descubran el endpoint sin hardcodear.

### Datos nuevos en MongoDB (`Reservation`)

| Campo | Qué es | Cuándo tiene valor |
|-------|--------|---------------------|
| `invoice_number` | Identificador fiscal **único** (generado en checkout; formato vía `.env`, por defecto `FAC-AAAA-NNNN`) | Tras **checkout** |
| `checkout_completed_at` | Fecha y hora en que se registró el checkout | Igual que arriba |
| `invoice_breakdown` | Objeto JSON: noches, tarifas, oferta habitación, descuento cliente, líneas de extras, subtotales, `adjustment_amount` si el total pactado no coincide con el desglose automático | Tras checkout (y opcionalmente en histórico) |
| `reception_check_in_at` | Hora real de check-in en mostrador | Tras `POST /reservation/check-in` |
| `reception_check_in_late` / `reception_check_in_late_fee` | Si hubo recargo por llegar fuera de ventana 12:00–22:00 | Check-in recepción |
| `early_checkin_requested` | Objeto P19: solicitud entrar antes de las 12:00 (`pending` / `approved` / `rejected`) | Cliente solicita; personal aprueba |
| `late_checkout_requested` | Objeto P19: solicitud salir después de las 11:00 | Igual |

**Usuario (`User`) — facturación opcional:** `billing_company_name` y `billing_company_cif` (además de DNI ya existente) salen en el bloque “Datos del cliente” del PDF si están rellenados (p. ej. vía `modifyUser`).

Mientras la reserva **no** haya pasado por checkout, `invoice_number` sigue en `null` y **no** se puede descargar la **factura fiscal** (la API responde con error claro). El **justificante** sí está disponible en ese estado.

### Numeración automática (`invoice_number`)

- El valor se **persiste solo** en el documento de la **reserva** (`Reservation.invoice_number`).
- Se asigna en **`POST /reservation/checkout`** usando el **año** de la fecha de checkout (`Date` del servidor) para reiniciar o filtrar el secuencial por año cuando el formato lleva año.
- El siguiente número es **máximo secuencial existente + 1** entre reservas cuyo `invoice_number` coincide con el patrón configurado (no es un simple conteo de documentos: soporta huecos si se borrara una reserva de prueba).
- El índice **único** en `invoice_number` evita duplicados si hubiera dos checkouts concurrentes (el segundo fallaría al guardar).
- **Formato por defecto:** `FAC-2026-0001` (prefijo `FAC`, año 4 cifras, secuencial **4** dígitos). Ajustable con variables de entorno (ver tabla **`.env`** arriba: `INVOICE_NUMBER_*`).
- **`INVOICE_NUMBER_TEMPLATE`** (opcional): por ejemplo `FAC-{YEAR}-{SEQ}` o `INV_{YEAR}_{SEQ}`; debe contener **exactamente un** `{SEQ}`. Si está definida, el número sigue **solo** esa plantilla (placeholders `{PREFIX}`, `{YEAR}`, `{SEQ}`); `INVOICE_NUMBER_INCLUDE_YEAR` y `INVOICE_NUMBER_SEPARATOR` no se usan salvo que los escribas tú como texto fijo en la plantilla.

### Flujo paso a paso (orden lógico)

```
1. Existe una reserva activa (no cancelada), con precio y fechas.
2. Llega el día: la fecha/hora de salida de la reserva (check_out) ya es pasada.
3. Un usuario con rol admin o employee llama a POST /reservation/checkout
   con { "reservation_id": "RSV-xxxxx" }.
4. La API comprueba reglas (no cancelada, sin factura previa, check_out ≤ ahora),
   calcula invoice_breakdown, genera invoice_number y guarda checkout_completed_at.
5. Se registra un evento UPDATED en la auditoría de reservas (igual que otras modificaciones).
6. El cliente (o el personal) pide GET /reservation/RSV-xxxxx/invoice con JWT.
7. La API lee reserva + usuario + habitación + extras del catálogo, monta el “modelo de factura”
   y escribe un PDF en memoria con pdfkit → el navegador o app recibe application/pdf.
```

### Quién puede hacer qué

| Acción | Roles permitidos | Motivo |
|--------|------------------|--------|
| **Checkout** (`POST /reservation/checkout`) | Solo **admin** y **employee** | Es una operación de caja / recepción |
| **Descargar PDF** (`GET /reservation/.../invoice`) | **Cliente** dueño de la reserva **o** admin/employee | El huésped ve solo sus facturas; el personal puede ayudar o revisar |
| **Histórico global** (`GET /reservation/invoices/history`) | Solo **admin** y **employee** | Todas las reservas con factura (gestión interna) |
| **Facturas por usuario** (`GET /invoices?userId=…`) | **Cliente** (solo su `userId`) o **admin/empleado** (cualquier `userId`) | Lista reservas con `invoice_number` en colección **Reservation** |
| **Reenviar factura por email** (`POST /reservation/.../invoice/email`) | Solo **admin** y **employee** | Genera el PDF en servidor y lo adjunta (Nodemailer); destino = email del cliente o `to` en body |
| **Info facturación / pasarela ficticia** (`GET /reservation/.../billing-info`) | Dueño o personal | JSON: sin cobro real, rutas de **justificante** y (si aplica) **factura** |
| **Descargar justificante** (`GET /reservation/.../booking-receipt`) | Dueño o personal | PDF no fiscal; **sin** checkout previo |

La regla de “¿puede ver esta reserva?” reutiliza la misma lógica que el resto de reservas: el cliente coincide con `user_id` de la reserva; el personal ve todas.

**Pasarela de pago:** no hay integración con banco ni TPV. El endpoint `billing-info` documenta el flujo simulado; las descargas “reales” del bloque P5 son el **justificante** (siempre que exista la reserva) y la **factura fiscal** (solo tras checkout).

### Endpoints (resumen práctico)

| Petición | Para qué sirve |
|----------|----------------|
| `POST /reservation/checkout` | Cerrar la estancia, **emitir** número de factura y guardar **`invoice_breakdown`** |
| `GET /reservation/:reservation_id/billing-info` | Pasarela **ficticia** + `download_booking_receipt` / `download_invoice` |
| `GET /reservation/:reservation_id/booking-receipt` | **Justificante** PDF no fiscal (`Justificante-RSV-xxxxx.pdf`) |
| `GET /reservation/:reservation_id/invoice` | **Factura fiscal** PDF (`Factura-FAC-2026-0001.pdf`) |
| `POST /reservation/:reservation_id/invoice/email` | **Reenviar** el PDF por correo al cliente (body opcional `{ "to": "..." }`; solo **admin/empleado**; requiere SMTP en `.env`) |
| `GET /reservation/invoices/history` | **Listar** todas las reservas con factura (admin/empleado) |
| `GET /invoices?userId=CLI-xxxxx` | **Listar** reservas con factura **de un usuario** (misma query con `user_id`) |

Las rutas bajo **`/reservation`** y **`GET /invoices`** **exigen JWT** (`Authorization: Bearer ...`). No hay colección aparte de “facturas”: los datos salen de **`Reservation`** filtrando `user_id` y `invoice_number` no vacío.

### Qué lleva cada PDF (contenido)

**Justificante (`booking-receipt`):** título «JUSTIFICANTE DE RESERVA», aviso no fiscal, hotel, cliente, nº reserva, habitación, fechas, importe TTC de la reserva, pie de pasarela simulada.

**Factura fiscal (`invoice`):** contenido mínimo tipo factura simplificada:

- **Hotel:** nombre, CIF/NIF, dirección (`.env` / valores por defecto).
- **Cliente:** nombre completo, `user_id`, DNI/NIF, email; **empresa** si existen `billing_company_name` / `billing_company_cif` en el usuario.
- **Estancia:** reserva, habitación, tipo, descripción breve, fechas, **noches** (coherentes con el desglose).
- **Desglose económico (TTC en euros):** tarifa por noche, oferta de habitación si aplica, subtotal alojamiento (noches × tarifa efectiva), **descuento perfil cliente** (% del usuario sobre el subtotal de alojamiento, misma lógica que `POST /reservation/getPrice`), **extras** (servicios de la habitación con precio en catálogo `ExtraService.price`; si el precio es 0 siguen listándose como concepto), línea de **ajuste** si el total pactado en la reserva no coincide con la suma automática.
- **Impuestos y total:** base imponible e **IVA** desglosados a partir del **total TTC** guardado en `reservation.price` y la tasa `INVOICE_IVA_RATE`, e **importe total** destacado.
- **Pie legal:** aviso de **pasarela de pago ficticia** (sin cobro real) y texto de conservación del documento.

No se almacena el PDF en `uploads/` ni en GridFS: cada descarga **regenera** el documento a partir de los datos en MongoDB (incluido `invoice_breakdown` si existe).

### Lógica técnica (pdfkit + desglose)

**`services/invoiceBreakdownService.js`** (también usado en **checkout**): calcula noches, tarifa efectiva con **oferta de habitación** (como `getPrice`), **descuento cliente** solo sobre el subtotal de alojamiento, líneas de **extras** leyendo `ExtraService` por los IDs en `room.extra_services`, y **`adjustment_amount`** = `price` de la reserva menos la suma de esas partes (para reservas con precio manual o redondeos).

**`services/invoicePdfService.js`:**

1. **`buildInvoiceModel` (async, …, extraDocs)** — Carga cabecera hotel con **`invoiceSettingsService`** (Mongo + fallback `.env`). Usa `reservation.invoice_breakdown` si existe; si no (reservas antiguas), **recalcula** el mismo objeto con `computeInvoiceBreakdown`. Añade bloques hotel/cliente/estancia, totales IVA/TTC y referencia al desglose.
2. **`writeInvoicePdf(doc, model)`** — **pdfkit**: emisor, cliente (DNI + empresa opcional), estancia, tabla de conceptos (alojamiento, descuentos, extras, ajuste), bloque impuestos/total y pie de **pasarela ficticia**.
3. **`streamInvoicePdf(..., extraDocs)`** — Cabeceras PDF, `doc.pipe(res)`, `doc.end()`; nombre de archivo sanitizado.

No hay Puppeteer ni HTML→PDF.

### Variables de entorno (todas opcionales para factura)

Si no las defines, el PDF usa textos por defecto razonables para desarrollo:

| Variable | Efecto si la configuras |
|----------|-------------------------|
| `HOTEL_INVOICE_NAME` | Nombre comercial o razón social en el encabezado |
| `HOTEL_INVOICE_ADDRESS` | Dirección fiscal |
| `HOTEL_INVOICE_CIF` | NIF/CIF del emisor |
| `INVOICE_IVA_RATE` | Decimal, p. ej. `0.21` para 21% (por defecto `0.10`) |

### Archivos del código (dónde mirar)

| Archivo | Responsabilidad |
|---------|-----------------|
| `models/Reservation.js` | `invoice_number`, `checkout_completed_at`, **`invoice_breakdown`** |
| `models/ExtraService.js` | Campo **`price`** (TTC en factura por servicio) |
| `models/InvoiceSettings.js` | Overrides opcionales de cabecera fiscal + IVA (fusionados con `.env` en PDF) |
| `controllers/invoiceSettingsController.js` | **`getInvoiceSettings`**, **`putInvoiceSettings`** |
| `services/invoiceSettingsService.js` | Lectura/escritura documento único + merge con `.env` |
| `routes/settingsRoutes.js` | Prefijo `/settings` en `index.js` |
| `controllers/reservationController.js` | **`checkoutReservation`**: desglose + **`nextInvoiceNumber`** (servicio dedicado) |
| `services/invoiceNumberService.js` | Formato configurable y siguiente `invoice_number` |
| `controllers/invoiceController.js` | **`getBookingReceiptPdf`**, **`getInvoicePdf`**, **`postInvoiceEmail`**, **`getBillingInfo`**, listados |
| `services/invoiceBreakdownService.js` | Cálculo del desglose (checkout y PDF legacy) |
| `services/invoicePdfService.js` | Factura fiscal + **justificante** (`writeBookingReceiptPdf`, `streamBookingReceiptPdf`) |
| `routes/reservationRoutes.js` | Orden: `billing-info` → `booking-receipt` → `invoice` (rutas estáticas antes de parámetros genéricos) |
| `routes/invoiceRoutes.js` | **`GET /invoices`** montado en `index.js` como `/invoices` |

### Respuestas de error habituales (sin entrar en código)

- **403 / “No autorizado”**: el JWT es de un cliente que intenta ver la factura de **otro** usuario.
- **400 / “Factura no disponible”**: aún no se ha hecho checkout (no hay `invoice_number`).
- **400 en checkout**: reserva cancelada, checkout ya hecho, o **fecha de salida aún no llegada** (no se puede facturar antes de tiempo).
- **404**: no existe esa `reservation_id`.

### Integración en apps (Android / WPF)

Los clientes implementan:

- **Justificante**: `GET /reservation/{id}/booking-receipt` en **Mis reservas**, **Historial**, **Actividad**, **Gestionar reserva**, **Mis facturas** (bloque “sin factura fiscal”) y en WPF **modificar reserva**.
- **Factura fiscal**: botón solo si `invoice_number != null`; listado en **Mis facturas** vía `GET /invoices?userId=…`.
- **Checkout** (solo personal): `POST /reservation/checkout` desde WPF cuando la estancia ha pasado y aún no hay factura.

Detalle de pantallas en los README de **APP-Intermodular-Ysael** y **WPF-Intermodular-Ysael**.

---

## P9 · Estadísticas y fidelidad del cliente

Colección **`ClientLoyaltyStats`**: **un documento por `user_id`** (`CLI-xxxxx`), actualizado al agregar/cancelar reserva, al **checkout** y cada vez que el cliente llama a `GET /loyalty/me`.

### Cálculo (desde `reservations`)

| Métrica | Regla |
|---------|--------|
| `total_spent` | Suma de `price` de **todas** las reservas no canceladas (incluye activas con pago simulado en la app) |
| `total_nights` | Noches contratadas en esas mismas reservas |
| `completed_stays_count` | Solo estancias finalizadas (`checkout_completed_at` o `check_out` ≤ ahora) |
| `loyalty_tier` | `bronze` / `silver` / `gold` según umbrales de noches **o** gasto (`.env` `LOYALTY_*`) |

### Endpoints

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| `GET` | `/loyalty/me` | Recalcula, guarda en BD y devuelve estadísticas del usuario logueado | Cliente |
| `POST` | `/loyalty/me/sync` | Fuerza recálculo (mismo resultado) | Cliente |
| `GET` | `/loyalty/user/:userId` | Estadísticas de un cliente (`?resync=0` para leer caché) | Admin, empleado |

**Respuesta JSON (ejemplo):** `loyalty_tier`, `total_nights`, `total_spent`, `completed_stays_count`, `summary` (`total_reservations`, `active_reservations`, …), `tier_thresholds`.

**Cliente Android:** pestaña **Estadísticas** en la bottom bar → `GET /loyalty/me`. **WPF:** no hay pantalla de estadísticas del huésped (solo gestión P19 en recepción).

Archivos: `services/clientLoyaltyStatsService.js`, `controllers/loyaltyStatsController.js`, `routes/loyaltyRoutes.js`.

---

## P19 · Flexibilidad (entrada anticipada / salida tardía)

Programa de fidelización (vinculado a **P9**): rango **bronce / plata / oro** en `ClientLoyaltyStats`. El cliente solicita entrar antes (12:00) o salir después (11:00). La API **comprueba disponibilidad** en la franja y aplica **aprobación automática** según rango.

> **Nota:** en MongoDB el documento sigue en la colección `reservations` con `reservation_id` tipo `RSV-xxxxx`. El prefijo REST **`/bookings/:id`** es alias semántico (`id` = `reservation_id`).

### Lógica de negocio (orden)

1. Validar hora solicitada (mismo día de entrada/salida, dentro de franja permitida; estándar **12:00** entrada / **11:00** salida).
2. **Plazo cliente (app):** desde las **11:00** del día de salida, el huésped dispone de **`client_flex_request_window_hours`** (por defecto **12 h**) para solicitar **salida tardía** (habitación o **instalaciones** con `mode: "facilities"`) o **ampliación corta** (&lt; 24 h / tras salida estándar). Recepción no tiene este límite.
3. **Disponibilidad** de la habitación en la franja (otras reservas en `room_id`, usando **check-in/out efectivos** si el vecino tiene P19 aprobado). En modo **facilities** no se comprueba hueco de habitación ni se mueve `check_out`.
4. **Fidelidad:** `ClientLoyaltyStats.loyalty_tier` (se asegura fila P9 con `ensureLoyaltyStatsRow`; si no hay documento → bronce).
5. **Decisión:**
   - Sin disponibilidad → `rejected` (todos los rangos).
   - Con disponibilidad + **oro** o **plata** → `approved` automático (`auto_approved: true`, `reviewed_by: system:auto`), suma `final_fee` y actualiza `check_in` / `check_out`.
   - Con disponibilidad + **bronce** → `pending` (recepción con `PATCH …/review`).

**Suplemento de precio:** `horas_diferencia × €/h` (config en Mongo `FlexibilitySettings` + fallback `.env`). Mínimo `min_billable_hours`. Descuento fidelidad sobre el suplemento: plata −15 %, oro −35 %.

**Notificación:** email al cliente cuando la solicitud queda `approved` o `rejected` (incluye auto-aprobación), si `notify_client_on_decision` y SMTP configurado.

### Configuración (`GET` / `PUT` `/settings/flexibility`)

| Campo | Descripción |
|-------|-------------|
| `early_checkin_rate_per_hour` | € por hora antes de las 12:00 |
| `late_checkout_rate_per_hour` | € por hora después de las 11:00 |
| `min_billable_hours` | Horas mínimas a cobrar |
| `max_supplement_eur` | Tope opcional (0 = sin tope) |
| `notify_client_on_decision` | Enviar correo al resolver |
| `free_access_tiers` | Array `bronze`/`silver`/`gold` con suplemento 0 € |
| `discount_*_percent` | Descuento sobre suplemento por rango |
| `early_min_hour` / `late_max_hour` | Ventana horaria permitida |
| `max_early_hours` / `max_late_hours` | Máx. horas vs 12:00 / 11:00 |

### Campos en `Reservation`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `early_checkin_requested` | objeto o `null` | Solicitud entrada antes de las 12:00 |
| `late_checkout_requested` | objeto o `null` | Solicitud salida después de las 11:00 |

Cada objeto: `requested_time`, `status`, `loyalty_tier`, `hours_difference`, `rate_per_hour`, `base_fee`, `final_fee`, `availability_ok`, `auto_approved`, `approval_mode`, `client_notified_at`, `review_note`, etc.

### Endpoints canónicos (P19)

| Método | Ruta | Descripción |
|--------|------|-------------|
| `PATCH` | `/bookings/:id/request-early-checkin` | Solicitar entrada anticipada |
| `PATCH` | `/bookings/:id/request-late-checkout` | Solicitar salida tardía (mismo día, después de 11:00) |
| `GET` | `/bookings/:id/flexibility` | Estado, rango, `fee_preview` y reglas auto-aprobación |
| `GET` | `/bookings/flexibility/pending` | Cola `pending` (personal) |
| `PATCH` | `/bookings/:id/flexibility/early-checkin/review` | Aprobar/rechazar (staff; **revalida** disponibilidad) |
| `PATCH` | `/bookings/:id/flexibility/late-checkout/review` | Igual para salida tardía |

**Compatibilidad:** mismos handlers en `/reservation/:reservation_id/request-early-checkin` (PATCH) y POST legacy `…/flexibility/early-checkin`. Revisión manual también en `/reservation/:id/flexibility/…/review`.

> **No confundir con `extend-stay`:** P19 solo mueve la hora de entrada/salida **el mismo día** de la fecha de la reserva. Para **añadir noches** o salir otro día con posible **cambio de habitación**, usar [Ampliación de estancia](#ampliación-de-estancia-extend-stay).

**Ejemplo (canónico):**

```http
PATCH /bookings/RSV-00043/request-early-checkin
Authorization: Bearer <token>
Content-Type: application/json

{ "requested_time": "2026-05-16T09:00:00.000Z" }
```

Respuesta típica (plata/oro + hueco libre): `status: "approved"`, `auto_approved: true`, `price` actualizado.

Archivos: `routes/bookingRoutes.js`, `services/flexibilityProgramService.js`, `controllers/flexibilityController.js`, `services/flexibilityInvoiceHelper.js`.

---

## Ampliación de estancia (extend-stay)

Flujo **distinto de P19**: el huésped (o recepción) fija una **nueva fecha/hora de salida** posterior a la actual. Si la habitación está ocupada en el tramo extra, la API marca la RSV anterior con `superseded_by_reservation_id` (apunta a la nueva) y crea una **nueva** en otra habitación libre — **sin** `cancelation_date` (no es cancelación del huésped). La app solo lista la reserva activa vía `GET /reservation/mine`.

| Caso | Cálculo suplemento | Factura `HotelInvoice` |
|------|-------------------|------------------------|
| Ampliación **&lt; 24 h** (misma franja horaria) | Horas × `late_checkout_rate_per_hour` (settings P19) | `type: stay_extension` |
| Ampliación **≥ 1 día** | Noches × tarifa efectiva habitación (con oferta) | `type: stay_extension` |

**Body:** `{ "new_check_out": "2026-05-17" }` (solo fecha → salida 11:00) o ISO con hora (`2026-05-16T18:00:00.000Z`).

| Método | Ruta | Auth |
|--------|------|------|
| `PATCH` | `/bookings/:id/extend-stay` | Cliente dueño o personal |

Archivos: `services/stayExtensionService.js`, `controllers/stayExtensionController.js`, `routes/bookingRoutes.js`.

---

## Colección HotelInvoice (facturación multi-concepto)

Además de `Reservation.invoice_number` (checkout recepción), las facturas emitidas se persisten en **`hotelinvoices`**:

| Campo | Descripción |
|-------|-------------|
| `invoice_number` | Único (misma numeración que checkout) |
| `reservation_id` | Reserva principal |
| `type` | `reservation` \| `early_checkin` \| `late_checkout` \| `stay_extension` |
| `amount` | Importe TTC del concepto |
| `description` | Texto legible |
| `linked_reservation_id` | Si `stay_extension` creó otra RSV |

**Emisión automática:**

- `POST /reservation/:id/confirm-payment` — tras pago simulado en app (`type: reservation`).
- `POST /reservation/add` con rol `client` — factura al crear reserva.
- P19 aprobado con `final_fee > 0` — `flexibilityInvoiceHelper`.
- `extend-stay` — suplemento de ampliación.

**Listados:** `GET /invoices?userId=CLI-xxxxx` y `GET /reservation/invoices/history` leen **`HotelInvoice`** (con `syncLegacyInvoicesFromReservations` y backfill de reservas activas sin factura al abrir histórico).

**PDF:** `GET /reservation/:id/invoice?invoice_number=FAC-…` descarga el PDF del número indicado (varias facturas por reserva).

Archivos: `models/HotelInvoice.js`, `services/invoiceEmissionService.js`, `controllers/invoiceController.js`.

---

## P9 · Historial de estancias por usuario

Complementa `GET /loyalty/me` con historial paginado y estadísticas enriquecidas para **WPF** (ficha cliente) y futuras vistas.

| Método | Ruta | Descripción | Auth |
|--------|------|-------------|------|
| `GET` | `/users/:id/history` | Estancias completadas/pasadas con habitación, valoración, filtros `page`, `limit`, fechas | Dueño o admin/employee |
| `GET` | `/users/:id/stats` | Totales, temporada favorita, habitación más usada, racha, etc. | Igual |
| `GET` | `/user/:userId/history` | Alias (mismo handler) | Igual |
| `GET` | `/user/:userId/stats` | Alias | Igual |

`GET /loyalty/me` incluye campos P9 extra (`favorite_season`, `top_room_id`, `current_streak`, …) tras recálculo.

Archivos: `services/userStayService.js`, `controllers/userStayController.js`, `routes/usersRoutes.js`, `routes/userRoutes.js`.

---

## Endpoints y verbos HTTP

### Reservas

| Método   | Ruta                              | Descripción                              | Auth |
|----------|-----------------------------------|------------------------------------------|------|
| `POST`   | `/reservation/add`                | Crear una reserva                        | Sí   |
| `POST`   | `/reservation/cancel`             | Cancelar reserva (body)                  | Sí   |
| `DELETE` | `/reservation/cancel/:id`         | Cancelar reserva (parámetro de ruta)     | Sí   |
| `PATCH`  | `/reservation/update`             | Actualizar reserva parcialmente          | Sí   |
| `GET`    | `/reservation/mine`               | Reservas activas del usuario (`cancelation_date` nulo y sin `superseded_by_reservation_id`) | Sí   |
| `GET`    | `/loyalty/me`                     | P9: estadísticas + rango (recalcula y guarda) | Sí (cliente) |
| `POST`   | `/loyalty/me/sync`                | P9: forzar recálculo desde reservas     | Sí (cliente) |
| `GET`    | `/loyalty/user/:userId`           | P9: estadísticas de un cliente           | Sí (admin, employee) |
| `GET`    | `/reservation/allActive`          | Reservas activas (incluye `room_image`)  | Sí   |
| `GET`    | `/reservation/all`                | Todas las reservas                       | Sí   |
| `POST`   | `/reservation/getPrice`           | Calcular precio (usa **precio nocturno con oferta** de la habitación) | Sí   |
| `POST`   | `/reservation/getCancelationPrice`| Calcular penalización por cancelación    | Sí   |
| `POST`   | `/reservation/check-in`           | Check-in en **recepción** (hora real; recargo opcional si tardío) | Sí (admin, employee) |
| `GET`    | `/reservation/:id/check-in-status` | Estado ventana horaria y si puede registrarse | Sí (admin, employee) |
| `POST`   | `/reservation/checkout`           | Checkout: `invoice_number`, `checkout_completed_at`, **`invoice_breakdown`** | Sí (admin, employee) |
| `GET`    | `/reservation/invoices/history`    | Histórico **HotelInvoice** (admin/employee; sync legacy al listar) | Sí (admin, employee) |
| `POST`   | `/reservation/:id/confirm-payment` | Emite factura `reservation` tras pago simulado (app) | Sí (dueño o personal) |
| `GET`    | `/reservation/:reservation_id/billing-info` | Pasarela **ficticia** + rutas de justificante y factura | Sí   |
| `GET`    | `/reservation/:reservation_id/booking-receipt` | Descarga **PDF** justificante (no fiscal) | Sí   |
| `GET`    | `/reservation/:reservation_id/invoice` | Descarga **PDF** factura fiscal (post-checkout) | Sí   |
| `POST`   | `/reservation/:reservation_id/invoice/email` | Reenviar factura por **correo** (PDF adjunto; solo admin/empleado) | Sí (admin, employee) |
| `GET`    | `/reservation/:id/audit`          | Historial de auditoría                   | Sí   |
| `PATCH`  | `/bookings/:id/request-early-checkin` | P19: solicitud entrada anticipada (+ auto-aprobación) | Sí   |
| `PATCH`  | `/bookings/:id/request-late-checkout` | P19: solicitud salida tardía | Sí   |
| `PATCH`  | `/bookings/:id/extend-stay` | Ampliación salida (+ cambio habitación si conflicto) | Sí   |
| `GET`    | `/bookings/:id/flexibility` | P19: estado + preview tarifas | Sí   |
| `GET`    | `/bookings/flexibility/pending` | P19: cola pendientes (bronce) | Sí (admin, employee) |
| `PATCH`  | `/bookings/:id/flexibility/early-checkin/review` | P19: aprobar/rechazar entrada | Sí (admin, employee) |
| `PATCH`  | `/bookings/:id/flexibility/late-checkout/review` | P19: aprobar/rechazar salida | Sí (admin, employee) |
| `GET`    | `/users/:id/history` | P9: historial estancias paginado | Sí   |
| `GET`    | `/users/:id/stats` | P9: estadísticas enriquecidas | Sí   |
| `GET`    | `/settings/flexibility` | P19: tarifas €/h y notificaciones | Sí (admin, employee) |
| `PUT`    | `/settings/flexibility` | P19: guardar configuración suplemento | Sí (admin, employee) |
| `GET`    | `/reservation/:id/flexibility`    | Igual que arriba (alias) | Sí   |
| `PATCH`  | `/reservation/:id/request-early-checkin` | Alias PATCH solicitud | Sí   |
| `POST`   | `/reservation/:id/flexibility/early-checkin` | Legacy (mismo flujo) | Sí   |
| `PATCH`  | `/reservation/:id/flexibility/early-checkin/review` | P19: aprobar/rechazar | Sí (admin, employee) |
| `PATCH`  | `/reservation/:id/flexibility/late-checkout/review` | P19: aprobar/rechazar | Sí (admin, employee) |
| `GET`    | `/reservation/flexibility/pending` | P19: cola pendientes | Sí (admin, employee) |

### Facturas (`/invoices`)

| Método   | Ruta                    | Descripción | Auth |
|----------|-------------------------|-------------|------|
| `GET`    | `/invoices?userId=…`    | Lista documentos **HotelInvoice** del usuario (tipos `reservation`, P19, `stay_extension`, …). Cliente solo el propio id | Sí   |

### Habitaciones

| Método   | Ruta                    | Descripción | Auth |
|----------|-------------------------|-------------|------|
| `GET`    | `/room/all`             | Listado con `normalizeRoomOut` (galería, oferta, flags) | Sí   |
| `GET`    | `/room/one?id=…`        | Detalle por `id` o `room_id` en query (o `body.room_id`) | Sí   |
| `GET`    | `/room/available`       | Disponibles por fechas, huéspedes y opcionalmente `services` | Sí   |
| `GET`    | `/room/extra-services`  | Catálogo de servicios extra activos | Sí   |
| `POST`   | `/room/extra-services`  | Crear servicio (`name`, opcional `price`); responde `service_id` tipo `EXT-xxx` | Sí   |
| `POST`   | `/room/create`          | Crear habitación (incluye `images`, `extra_services`, oferta) | Sí   |
| `PUT`    | `/room/update`          | Actualizar habitación | Sí   |
| `DELETE` | `/room/delete`          | Eliminar habitación (`room_id` en body) | Sí   |

### Reseñas

| Método   | Ruta                    | Descripción                              | Auth |
|----------|-------------------------|------------------------------------------|------|
| `GET`    | `/review/mine`          | Reseñas del usuario autenticado          | Sí   |
| `GET`    | `/review/room/:roomId`  | Reseñas de una habitación (pública)      | No   |
| `POST`   | `/review/create`       | Crear una reseña                         | Sí   |
| `DELETE` | `/review/delete`        | Eliminar una reseña                      | Sí   |

---

## Ejemplos de peticiones

**Habitación por GET (recomendado para clientes):**

```http
GET /room/one?id=HAB-001
Authorization: Bearer <token>
```

**Disponibilidad con filtro de servicios extra:**

```http
GET /room/available?checkIn=2026-06-01&checkOut=2026-06-05&guests=2&services=EXT-001,EXT-002
Authorization: Bearer <token>
```

**Crear servicio en catálogo:**

```http
POST /room/extra-services
Content-Type: application/json
Authorization: Bearer <token>

{ "name": "Desayuno buffet" }
```

**Respuesta típica** (fragmento) de habitación ya normalizada:

```json
{
  "room_id": "HAB-001",
  "price_per_night": 120,
  "base_price_per_night": 120,
  "effective_price_per_night": 96,
  "offer_active": true,
  "offer_percent": 20,
  "images": ["https://...", "https://..."],
  "extra_services": ["EXT-001"],
  "is_operational": true,
  "is_occupied_now": false
}
```

**Checkout y factura PDF:**

```http
POST /reservation/checkout
Content-Type: application/json
Authorization: Bearer <token empleado/admin>

{ "reservation_id": "RSV-00001" }
```

La respuesta incluye `invoice_breakdown` (desglose congelado). Para pantallas de “pago simulado”:

```http
GET /reservation/RSV-00001/billing-info
Authorization: Bearer <token>
```

Respuesta (fragmento): incluye `download_booking_receipt` y, si procede, `download_invoice`.

```http
GET /reservation/RSV-00001/booking-receipt
Authorization: Bearer <token>
```

```http
GET /reservation/RSV-00001/invoice
Authorization: Bearer <token>
```

**Reenvío de factura por correo** (personal; requiere `EMAIL_*` en `.env` del servidor):

```http
POST /reservation/RSV-00001/invoice/email
Authorization: Bearer <token empleado/admin>
Content-Type: application/json

{}
```

Opcional: `{ "to": "otro@correo.com" }` para anular el email del cliente.

**Listado de facturas por cliente** (colección `Reservation`, no hay colección `invoices` aparte):

```http
GET /invoices?userId=CLI-00001
Authorization: Bearer <token>
```

Respuesta JSON: `{ "user_id", "count", "reservations": [ ... ] }` (mismos campos útiles que el histórico admin por ítem).

Variables opcionales en `.env`: `HOTEL_INVOICE_NAME`, `HOTEL_INVOICE_ADDRESS`, `HOTEL_INVOICE_CIF`, `INVOICE_IVA_RATE` (por defecto `0.10`). Si existen valores en la colección **`InvoiceSettings`** (documento único), **tienen prioridad** sobre el `.env` para nombre, CIF, dirección, notas fiscales e IVA (WPF: pantalla *Datos factura*).

**Configuración fiscal del emisor** (admin/empleado; persiste en MongoDB, usada al generar PDF):

```http
GET /settings/invoice
Authorization: Bearer <token empleado/admin>
```

Respuesta: `{ "hotel_commercial_name", "hotel_cif", "hotel_address", "fiscal_notes", "iva_rate" }` (valores **efectivos** tras fusionar BD + `.env`).

```http
PUT /settings/invoice
Authorization: Bearer <token empleado/admin>
Content-Type: application/json

{
  "hotel_commercial_name": "Hotel Ejemplo S.L.",
  "hotel_cif": "B12345678",
  "hotel_address": "Calle Mayor 1, 03001 Alicante",
  "fiscal_notes": "Inscripción RM de Alicante, Tomo X...",
  "iva_rate": 0.10
}
```

Respuesta: `{ "ok": true, "settings": { ...misma forma que GET... } }`. Campos de texto vacíos en BD hacen fallback a `.env` para nombre/CIF/dirección; `fiscal_notes` solo sale en el PDF si no está vacío. `iva_rate` en `null` en BD (no enviar o borrar en futuras extensiones) usa solo `INVOICE_IVA_RATE` del `.env`; el WPF siempre envía un decimal (p. ej. `0.10`).

---

## Evolución del proyecto (desde la creación)

Esta sección resume **qué se fue añadiendo** al backend a lo largo del proyecto y **para qué sirve**, con referencias de código cuando ayuda a entenderlo.

### 1. Núcleo inicial

- **Autenticación JWT** (`authRoutes`, `authController`), usuarios y habitaciones con CRUD básico.
- **Reservas**: alta, listados y operaciones sobre `Reservation` con Mongoose.
- Montaje en `index.js` con prefijos claros, por ejemplo `app.use('/room', roomRoutes)` y `app.use('/invoices', invoiceRoutes)`.

### 2. Habitaciones “en servicio” y ocupación en tiempo real

**Problema:** hacía falta distinguir “habitación rota / cerrada” de “habitación libre u ocupada ahora”.

**Solución:** campo `isOperational` en el modelo y, en las respuestas JSON, flags `is_operational` e `is_occupied_now` calculados cruzando con reservas no canceladas cuya estancia cubre la fecha actual. Así Android y WPF pueden mostrar badges coherentes sin duplicar lógica en el cliente.

`GET /room/available` excluye siempre `isOperational: false` y habitaciones solapadas con otras reservas en el rango pedido.

### 3. Reservas activas con imagen (`room_image`)

**Problema:** las apps mostraban listas de reservas pero obligaban a un segundo fetch por habitación para la foto.

**Solución:** `GET /reservation/allActive` enriquece cada ítem con `room_image` resolviendo `room_id` → documento `Room` (campo `image` / galería unificada en servidor).

### 4. Auditoría de reservas e historial “legible”

**Qué se añadió:** colección `booking_audit_log`, middleware que captura el estado **antes** del cambio (`bookingAuditMiddleware.js`), y tras éxito `logBookingChange` en `auditService.js`.

**Qué gana el usuario final:** `GET /reservation/:id/audit` devuelve cada evento con `resumen_cambios` y `detalle_cambios` generados por `describeReservationAuditChanges` (comparación campo a campo entre snapshots). Un ejemplo de JSON de respuesta aparece en la sección **Controlador — `auditController.js`** de este mismo README. **Tabla de rutas que escriben log, checkout como `UPDATED` y lógica del resumen:** ver **[Sistema de Auditoría de Reservas](#sistema-de-auditoría-de-reservas)**.

Acciones persistidas en `action`: `CREATED`, `UPDATED`, `CANCELED` (el checkout fiscal también se guarda como `UPDATED`: ver tabla *Rutas que escriben en `booking_audit_log`* arriba).

### 5. Verbos HTTP y contrato REST más claro

- **Cancelar:** además del body legacy, se soporta `DELETE /reservation/cancel/:id` con el precio de cancelación en query.
- **Actualizar:** `PATCH /reservation/update` para cambios parciales (más idiomático que un `PUT` completo).

Los clientes se actualizaron para usar esos verbos.

### 6. Reseñas sin colección `Counter`

**Qué se añadió:** `nextReviewId()` consultando la colección `reviews`; validación de duplicados por usuario + habitación; `user_name` resuelto en servidor; borrado con `DELETE /review/delete` restringido a autor o admin.

### 7. Galería, ofertas, servicios extra y precio alineado

**Problema:** una sola URL en `image`, sin ofertas ni extras reutilizables entre habitaciones, y el precio de reserva no reflejaba descuentos.

**Solución en modelo y rutas:**

- `Room`: `images[]`, `extra_services[]`, `offer_active`, `offer_percent`.
- Modelo `ExtraService` + `GET/POST /room/extra-services` para catálogo centralizado (`EXT-001`, …).
- **`normalizeRoomOut`**: una sola forma de serializar habitación hacia apps (galería, precio efectivo, flags).
- **`GET /room/one`**: lectura por query `?id=` o `?room_id=` (adecuado para GET desde HttpClient/Retrofit).
- **`GET /room/available`**: fechas flexibles (`checkIn`/`check_out`, etc.), `guests`, filtro opcional `services`.
- **`POST /reservation/getPrice`**: usa la misma regla de **precio nocturno con oferta** que la habitación en BD, para que el total coincida con lo mostrado en catálogo.

### 8. Arranque y configuración

- Carga de **`dotenv` al inicio** de `index.js` para que `MONGO_URI` y `JWT_SECRET` existan antes de cualquier `require` que los use.
- **`PORT`** con valor por defecto `3000` si no viene en `.env`.

### 9. Facturación PDF (checkout)

Resumen: campos `invoice_number`, `checkout_completed_at` e **`invoice_breakdown`**; **checkout** solo personal; **PDF** con desglose P5; **`POST /reservation/:id/invoice/email`** reenvío del PDF por **SMTP** (Nodemailer, adjunto); **`GET /invoices?userId=`** facturas por usuario en **`Reservation`**; **`GET …/billing-info`** pasarela ficticia; **`GET /reservation/invoices/history`** histórico global admin/empleado. **Detalle:** ver **[Facturación PDF (justificante y factura fiscal)](#facturación-pdf-justificante-y-factura-fiscal)**.

### 10. Justificante PDF tras pago simulado

**Problema:** el huésped pagaba (simulado) en la app pero no tenía ningún PDF hasta el checkout en recepción.

**Solución:** `GET /reservation/:reservation_id/booking-receipt` genera un **justificante no fiscal** con datos de reserva e importe TTC. `billing-info` expone `download_booking_receipt`. La factura con `invoice_number` sigue siendo exclusiva del checkout. Índice único en `invoice_number` como **parcial** (`sparse`) para permitir muchas reservas con `null` sin colisión E11000.

### 11. Check-in en recepción (WPF)

**Problema:** no había forma de registrar la llegada del huésped en recepción (distinto del campo `check_in` de la reserva).

**Solución:** campos `reception_check_in_at`, `reception_check_in_late`, `reception_check_in_late_fee`; `POST /reservation/check-in` y `GET …/check-in-status`; ventana horaria 12:00–22:00 del día de entrada; fuera de ventana → check-in tardío con recargo (`CHECK_IN_LATE_FEE_EUR`). `GET /allActive` devuelve `guest_name` y `guest_dni` para el panel de control.

### 12. P9 · Estadísticas y fidelidad (API + Android)

**Objetivo:** agregar datos de todas las reservas del cliente en una colección propia y mostrar rango/noches/gasto en la app.

**Solución:** `clientLoyaltyStatsService` recalcula desde `reservations`, hace upsert en `ClientLoyaltyStats`, expone `GET /loyalty/me`. Gasto y noches incluyen reservas activas (pago al reservar). Sincronización tras alta/cancelación/checkout.

### 13. P19 · Programa flexibilidad (API + clientes)

**Objetivo:** entrada anticipada y salida tardía con suplemento por horas y rango de fidelidad (P9).

**Solución:** `PATCH /bookings/:id/request-*`, disponibilidad con horarios efectivos de vecinos, `ClientLoyaltyStats.loyalty_tier`, auto-aprobación plata/oro; bronce `pending` + revisión WPF (revalida hueco al aprobar). Suplemento `horas × €/h`, settings en Mongo, email al resolver, factura `HotelInvoice` si hay cargo. UI: Android (botones separados check-in anticipado / check-out tardío), WPF (panel inicio + detalle reserva + reglas; sin etiqueta «P19» en pantalla).

### 14. Colección HotelInvoice y confirm-payment

**Problema:** facturas solo en `Reservation.invoice_number` tras checkout; suplementos P19/ampliación sin trazabilidad unificada.

**Solución:** modelo `HotelInvoice`, `invoiceEmissionService` idempotente, `POST /reservation/:id/confirm-payment` y emisión al reservar como cliente; listados `/invoices` e histórico WPF desde la colección; PDF con query `invoice_number`.

### 15. Ampliación de estancia (extend-stay)

**Problema:** huésped necesita más noches u horas de salida sin mezclar con P19 (mismo día).

**Solución:** `PATCH /bookings/:id/extend-stay` con tarifa horaria (&lt;24 h) o por noches; conflicto → nueva habitación + `superseded_by_reservation_id` en la anterior (sin `cancelation_date`); factura `stay_extension`.

### 16. P9 historial de estancias (API + WPF)

**Solución:** `GET /users/:id/history` y `/stats`; ficha **Estancias** en gestión de usuarios WPF; Android **Mis estancias** + insights en **Estadísticas**.

### 17. Configuración operativa, PDF de factura y UX recepción (estado actual)

- **`operationalsettings`:** activar/desactivar escritura en `booking_audit_log` (`GET/PUT /settings/operational`); WPF → checkbox en **Auditorías**.
- **Factura PDF:** diseño tipo factura hotel (emisor/cliente, tabla de conceptos, totales) en `invoicePdfService.js`.
- **P19 cliente:** límite **12 h** tras 11:00; salida tardía en modo **instalaciones** (`late_mode: facilities`, hasta 20:00).
- **Cola WPF:** pestañas Activas/Inactivas, orden por fecha; diálogo de rechazo ampliado.
- **Panel Inicio WPF:** scroll completo de tarjetas, filtro y orden de reservas activas.

### 18. Limpieza y auditoría enriquecida

- Eliminados `express-session`, script `check_rooms.js`, exports muertos en servicios.
- Respuesta de auditoría documentada: `detalle_cambios` con **antes/después** por campo (WPF: columnas y tabla desplegable).
- App Android: paquetes `core` / `data` / `feature` (reorganización).

---
