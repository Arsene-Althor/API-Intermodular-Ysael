# API Proyecto Intermodular — Sistema de Gestión Hotelera

API REST desarrollada con **Node.js**, **Express** y **MongoDB (Mongoose)** para la gestión integral de un hotel: reservas (incluida **facturación en PDF tras checkout**), usuarios, habitaciones (con **galería**, **ofertas** y **servicios extra**), reseñas y catálogo `ExtraService`. Incorpora un **sistema de auditoría** que registra de forma automática cada operación relevante sobre las reservas.

> Esta API es consumida por dos clientes: una aplicación de escritorio (WPF/.NET) y una aplicación móvil (Android/Kotlin). Cada uno cuenta con su propia documentación en su respectivo repositorio.

---

## Tabla de contenidos

- [Puesta en marcha](#puesta-en-marcha)
- [Tecnologías utilizadas](#tecnologías-utilizadas)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Sistema de Auditoría de Reservas](#sistema-de-auditoría-de-reservas)
- [Gestión de habitaciones](#gestión-de-habitaciones)
- [Módulo de Reseñas](#módulo-de-reseñas)
- [Facturación PDF (factura descargable)](#facturación-pdf-factura-descargable)
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
│   ├── Reservation.js              # Reservas
│   ├── Room.js                     # Habitaciones
│   ├── ExtraService.js             # Catálogo de servicios extra (EXT-xxx)
│   ├── User.js                     # Usuarios
│   ├── Review.js                   # Reseñas
│   └── InvoiceSettings.js         # Datos fiscales emisor (documento único; override .env)
│
├── controllers/
│   ├── auditController.js          # Consulta de auditoría (solo lectura)
│   ├── reservationController.js    # CRUD de reservas + escritura de auditoría + checkout
│   ├── invoiceController.js        # PDF factura + listados (`/invoices`, histórico)
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
│   ├── invoicePdfService.js        # Modelo factura + generación PDF (pdfkit)
│   └── invoiceSettingsService.js   # Merge BD + `.env` para cabecera fiscal PDF
│
├── routes/
│   ├── reservationRoutes.js        # Rutas de reservas (incluye auditoría)
│   ├── invoiceRoutes.js            # GET /invoices?userId= (facturas por cliente)
│   ├── settingsRoutes.js           # GET/PUT `/settings/invoice`
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

## Sistema de Auditoría de Reservas

### Descripción general

El sistema de auditoría registra de forma automática un historial de cada operación realizada sobre las reservas. Para cada evento se almacena:

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

El resumen de diferencias se calcula **al vuelo** en cada `GET …/audit`, no se almacena en MongoDB: en la colección solo están `previous_state` y `new_state`.

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

## Facturación PDF (factura descargable)

Esta parte del sistema responde a dos necesidades: que el **cliente** pueda **descargar la factura en PDF** cuando la estancia ya está cerrada fiscalmente, y que el **personal del hotel** pueda **registrar el checkout** y **consultar el histórico** de facturas emitidas.

### Idea en una frase

1. Un empleado o administrador marca la reserva como **checkout completado**.  
2. El servidor **guarda** `invoice_number`, `checkout_completed_at` y un **`invoice_breakdown`** (desglose congelado: noches, alojamiento, descuento perfil cliente, extras con precio, ajuste al importe pactado `price`).  
3. Cualquier petición válida a **descargar factura** genera el **PDF al momento** (no se guarda el archivo en disco; se envía por HTTP). Las reservas antiguas sin `invoice_breakdown` recalculan el desglose al generar el PDF (misma fórmula que en checkout).

### Datos nuevos en MongoDB (`Reservation`)

| Campo | Qué es | Cuándo tiene valor |
|-------|--------|---------------------|
| `invoice_number` | Identificador fiscal **único** (generado en checkout; formato vía `.env`, por defecto `FAC-AAAA-NNNN`) | Tras **checkout** |
| `checkout_completed_at` | Fecha y hora en que se registró el checkout | Igual que arriba |
| `invoice_breakdown` | Objeto JSON: noches, tarifas, oferta habitación, descuento cliente, líneas de extras, subtotales, `adjustment_amount` si el total pactado no coincide con el desglose automático | Tras checkout (y opcionalmente en histórico) |

**Usuario (`User`) — facturación opcional:** `billing_company_name` y `billing_company_cif` (además de DNI ya existente) salen en el bloque “Datos del cliente” del PDF si están rellenados (p. ej. vía `modifyUser`).

Mientras la reserva **no** haya pasado por checkout, `invoice_number` sigue en `null` y **no** se puede descargar factura (la API responde con error claro).

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
| **Info facturación / pasarela ficticia** (`GET /reservation/.../billing-info`) | Dueño o personal | JSON: sin cobro real, si hay factura y ruta relativa de descarga |

La regla de “¿puede ver esta reserva?” reutiliza la misma lógica que el resto de reservas: el cliente coincide con `user_id` de la reserva; el personal ve todas.

**Pasarela de pago:** no hay integración con banco ni TPV. El endpoint `billing-info` documenta el flujo simulado; la única operación “real” del bloque P5 es la **descarga del PDF** tras checkout.

### Endpoints (resumen práctico)

| Petición | Para qué sirve |
|----------|----------------|
| `POST /reservation/checkout` | Cerrar la estancia, **emitir** número de factura y guardar **`invoice_breakdown`** |
| `GET /reservation/:reservation_id/billing-info` | Estado de factura y mensaje de pasarela **ficticia** (sin cobro) |
| `GET /reservation/:reservation_id/invoice` | **Descargar** el PDF (nombre de archivo tipo `Factura-FAC-2026-0001.pdf`) |
| `POST /reservation/:reservation_id/invoice/email` | **Reenviar** el PDF por correo al cliente (body opcional `{ "to": "..." }`; solo **admin/empleado**; requiere SMTP en `.env`) |
| `GET /reservation/invoices/history` | **Listar** todas las reservas con factura (admin/empleado) |
| `GET /invoices?userId=CLI-xxxxx` | **Listar** reservas con factura **de un usuario** (misma query con `user_id`) |

Las rutas bajo **`/reservation`** y **`GET /invoices`** **exigen JWT** (`Authorization: Bearer ...`). No hay colección aparte de “facturas”: los datos salen de **`Reservation`** filtrando `user_id` y `invoice_number` no vacío.

### Qué lleva el PDF (contenido)

El PDF cumple un **contenido mínimo** tipo factura simplificada:

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
| `controllers/invoiceController.js` | **`getInvoicePdf`**, **`postInvoiceEmail`**, **`getBillingInfo`**, **`listInvoicesByUser`**, **`listInvoiceHistory`** |
| `services/invoiceBreakdownService.js` | Cálculo del desglose (checkout y PDF legacy) |
| `services/invoicePdfService.js` | Modelo + **pdfkit** |
| `routes/reservationRoutes.js` | `billing-info` antes de `invoice` (orden de rutas) |
| `routes/invoiceRoutes.js` | **`GET /invoices`** montado en `index.js` como `/invoices` |

### Respuestas de error habituales (sin entrar en código)

- **403 / “No autorizado”**: el JWT es de un cliente que intenta ver la factura de **otro** usuario.
- **400 / “Factura no disponible”**: aún no se ha hecho checkout (no hay `invoice_number`).
- **400 en checkout**: reserva cancelada, checkout ya hecho, o **fecha de salida aún no llegada** (no se puede facturar antes de tiempo).
- **404**: no existe esa `reservation_id`.

### Integración en apps (Android / WPF)

Hoy la lógica vive **solo en la API**. Los clientes móvil y escritorio pueden:

- Mostrar un botón “Descargar factura” si `invoice_number != null` en el JSON de la reserva.
- Pantalla “Mis facturas”: `GET /invoices?userId=<user_id del JWT>` (el cliente solo puede el suyo).
- Abrir el PDF con una petición GET autenticada o guardar el binario como archivo.

Los detalles de UI quedan en el README de cada cliente cuando se implementen.

---

## Endpoints y verbos HTTP

### Reservas

| Método   | Ruta                              | Descripción                              | Auth |
|----------|-----------------------------------|------------------------------------------|------|
| `POST`   | `/reservation/add`                | Crear una reserva                        | Sí   |
| `POST`   | `/reservation/cancel`             | Cancelar reserva (body)                  | Sí   |
| `DELETE` | `/reservation/cancel/:id`         | Cancelar reserva (parámetro de ruta)     | Sí   |
| `PATCH`  | `/reservation/update`             | Actualizar reserva parcialmente          | Sí   |
| `GET`    | `/reservation/mine`               | Reservas del usuario autenticado         | Sí   |
| `GET`    | `/reservation/allActive`          | Reservas activas (incluye `room_image`)  | Sí   |
| `GET`    | `/reservation/all`                | Todas las reservas                       | Sí   |
| `POST`   | `/reservation/getPrice`           | Calcular precio (usa **precio nocturno con oferta** de la habitación) | Sí   |
| `POST`   | `/reservation/getCancelationPrice`| Calcular penalización por cancelación    | Sí   |
| `POST`   | `/reservation/checkout`           | Checkout: `invoice_number`, `checkout_completed_at`, **`invoice_breakdown`** | Sí (admin, employee) |
| `GET`    | `/reservation/invoices/history`    | Histórico de reservas con factura emitida | Sí (admin, employee) |
| `GET`    | `/reservation/:reservation_id/billing-info` | Pasarela **ficticia**: JSON con estado de factura y ruta de descarga | Sí   |
| `GET`    | `/reservation/:reservation_id/invoice` | Descarga **PDF** de factura (dueño o personal) | Sí   |
| `POST`   | `/reservation/:reservation_id/invoice/email` | Reenviar factura por **correo** (PDF adjunto; solo admin/empleado) | Sí (admin, employee) |
| `GET`    | `/reservation/:id/audit`          | Historial de auditoría                   | Sí   |

### Facturas (`/invoices`)

| Método   | Ruta                    | Descripción | Auth |
|----------|-------------------------|-------------|------|
| `GET`    | `/invoices?userId=…`    | Reservas con `invoice_number` del usuario (`user_id` en query válido igual). Cliente solo el propio id | Sí   |

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

Resumen: campos `invoice_number`, `checkout_completed_at` e **`invoice_breakdown`**; **checkout** solo personal; **PDF** con desglose P5; **`POST /reservation/:id/invoice/email`** reenvío del PDF por **SMTP** (Nodemailer, adjunto); **`GET /invoices?userId=`** facturas por usuario en **`Reservation`**; **`GET …/billing-info`** pasarela ficticia; **`GET /reservation/invoices/history`** histórico global admin/empleado. **Detalle:** ver **[Facturación PDF (factura descargable)](#facturación-pdf-factura-descargable)**.

---
