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
├── index.js                        # Punto de entrada del servidor
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
│   └── Review.js                   # Reseñas
│
├── controllers/
│   ├── auditController.js          # Consulta de auditoría (solo lectura)
│   ├── reservationController.js    # CRUD de reservas + escritura de auditoría + checkout
│   ├── invoiceController.js        # PDF factura + histórico facturas
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
│   └── invoicePdfService.js        # Modelo factura + generación PDF (pdfkit)
│
├── routes/
│   ├── reservationRoutes.js        # Rutas de reservas (incluye auditoría)
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
Petición HTTP (crear / modificar / cancelar reserva)
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

El resumen de diferencias se calcula al vuelo en cada consulta, no se almacena en la base de datos.

### Middleware — `bookingAuditMiddleware.js`

- **`capturePreviousReservationState`**: lee el `reservation_id` del body o de los parámetros de ruta y guarda el estado actual en `req.bookingAuditPreviousState`.
- **`capturePreviousForNewReservation`**: establece `null` como estado previo (para altas).

### Controlador — `auditController.js`

`getBookingAudit(req, res)`: devuelve el historial de auditoría de una reserva enriquecido con `resumen_cambios` y `detalle_cambios`.

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
| `active` | Si `false`, no se lista en `GET /room/extra-services` |

**Alta de un servicio** (`POST /room/extra-services`): el cuerpo solo necesita el nombre; el servidor genera el siguiente `EXT-xxx`:

```javascript
// controllers/extraServiceController.js (resumen)
const service_id = `EXT-${String(n).padStart(3, '0')}`;
const doc = await ExtraService.create({ service_id, name, active: true });
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
2. El servidor **guarda** un número de factura (`invoice_number`) y la fecha de emisión.  
3. Cualquier petición válida a **descargar factura** genera el **PDF al momento** (no se guarda el archivo en disco; se envía por HTTP).

### Datos nuevos en MongoDB (`Reservation`)

| Campo | Qué es | Cuándo tiene valor |
|-------|--------|---------------------|
| `invoice_number` | Identificador fiscal único, formato `FAC-AAAA-NNNNN` (año + número secuencial por año) | Después de un **checkout** correcto |
| `checkout_completed_at` | Fecha y hora en que se registró el checkout | Igual que arriba |

Mientras la reserva **no** haya pasado por checkout, `invoice_number` sigue en `null` y **no** se puede descargar factura (la API responde con error claro).

### Flujo paso a paso (orden lógico)

```
1. Existe una reserva activa (no cancelada), con precio y fechas.
2. Llega el día: la fecha/hora de salida de la reserva (check_out) ya es pasada.
3. Un usuario con rol admin o employee llama a POST /reservation/checkout
   con { "reservation_id": "RSV-xxxxx" }.
4. La API comprueba reglas (no cancelada, sin factura previa, check_out ≤ ahora),
   genera el siguiente invoice_number y guarda checkout_completed_at.
5. Se registra un evento UPDATED en la auditoría de reservas (igual que otras modificaciones).
6. El cliente (o el personal) pide GET /reservation/RSV-xxxxx/invoice con JWT.
7. La API lee reserva + usuario + habitación, monta el “modelo de factura”
   y escribe un PDF en memoria con pdfkit → el navegador o app recibe application/pdf.
```

### Quién puede hacer qué

| Acción | Roles permitidos | Motivo |
|--------|------------------|--------|
| **Checkout** (`POST /reservation/checkout`) | Solo **admin** y **employee** | Es una operación de caja / recepción |
| **Descargar PDF** (`GET /reservation/.../invoice`) | **Cliente** dueño de la reserva **o** admin/employee | El huésped ve solo sus facturas; el personal puede ayudar o revisar |
| **Histórico de facturas** (`GET /reservation/invoices/history`) | Solo **admin** y **employee** | Listado interno para gestión |

La regla de “¿puede ver esta reserva?” reutiliza la misma lógica que el resto de reservas: el cliente coincide con `user_id` de la reserva; el personal ve todas.

### Endpoints (resumen práctico)

| Petición | Para qué sirve |
|----------|----------------|
| `POST /reservation/checkout` | Cerrar la estancia y **emitir** número de factura |
| `GET /reservation/:reservation_id/invoice` | **Descargar** el PDF (nombre de archivo tipo `Factura-FAC-2026-00001.pdf`) |
| `GET /reservation/invoices/history` | **Listar** reservas que ya tienen `invoice_number` (más recientes primero) |

Todas van bajo el prefijo global **`/reservation`** (ver `index.js`) y **exigen JWT** (`Authorization: Bearer ...`), igual que el resto de rutas de reservas.

### Qué lleva el PDF (contenido)

El PDF está pensado como **factura simplificada** legible en papel o móvil:

- Datos del **hotel** (nombre, CIF, dirección — configurables por `.env`).
- Datos del **cliente** (nombre, apellidos, email, `user_id`).
- Datos de la **estancia**: código de reserva, habitación, tipo de habitación, fechas de entrada/salida, noches calculadas.
- **Importes**: se interpreta el campo `price` de la reserva como **total con IVA incluido**. A partir de ahí se calculan **base imponible** e **IVA** usando el tipo configurado (`INVOICE_IVA_RATE`, por defecto 10%).

No se almacena el PDF en `uploads/` ni en GridFS: cada descarga **regenera** el documento a partir de los datos actuales en MongoDB.

### Lógica técnica (pdfkit / `invoicePdfService.js`)

Todo vive en un solo servicio. Resumen alineado con el código:

1. **`buildInvoiceModel(reservation, clientUser, room)`**  
   Arma un objeto “factura” en memoria (no escribe bytes todavía):
   - **IVA**: se lee `INVOICE_IVA_RATE` del `.env`, se parsea a número y se **acota entre 0 y 0,99** (evita división absurda o tipos negativos).
   - **Total TTC**: `reservation.price` numérico; si falta o no es número, se trata como **0**.
   - **Base e IVA** (asumiendo que el total **ya lleva IVA**):  
     `base = redondeo( (total / (1 + tasa)) * 100 ) / 100` (dos decimales);  
     `iva = redondeo( (total − base) * 100 ) / 100`. Así el desglose cuadra con el total guardado.
   - **Noches**: diferencia en ms entre `check_out` y `check_in`, dividida por un día; **techo** (`ceil`), mínimo **1** noche.
   - **Fecha de emisión en el PDF**: `checkout_completed_at` de la reserva; si por algún motivo no hubiera valor, cae a `new Date()` en el momento de generar.
   - Incluye datos de **habitación** (`type`, `description` en el modelo; el dibujo actual usa sobre todo tipo y fechas).

2. **`writeInvoicePdf(doc, model)`**  
   Usa la API imperativa de **pdfkit**: tamaños de fuente, colores, `moveDown`, bloques en orden (título “FACTURA”, emisor, cliente, estancia, importes, pie de texto legal). No hay plantilla HTML: es texto/posición directa sobre el lienzo PDF.

3. **`streamInvoicePdf(res, filename, reservation, clientUser, room)`**  
   Punto de entrada que usa el controlador:
   - Si **no** hay `invoice_number`, lanza error interno `NO_INVOICE` (el controlador lo traduce a respuesta HTTP adecuada).
   - Construye el **modelo**, **sanitiza** el nombre de archivo (solo caracteres seguros para `Content-Disposition`).
   - Fija cabeceras **`Content-Type: application/pdf`** y **`Content-Disposition: attachment`** con el nombre acordado.
   - Crea `new PDFDocument({ margin: 48, info: { Title, Author } })`, hace **`doc.pipe(res)`** para volcar el stream al cuerpo de la respuesta Express, llama a `writeInvoicePdf`, y **`doc.end()`** para cerrar el documento.

En conjunto: **pdfkit** genera un **stream** hacia la respuesta HTTP; no se usa Puppeteer ni HTML→PDF. La “lógica completa” de negocio (IVA, noches, emisión) está en `buildInvoiceModel`; la de presentación, en `writeInvoicePdf`.

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
| `models/Reservation.js` | Campos `invoice_number`, `checkout_completed_at` |
| `controllers/reservationController.js` | Función **`checkoutReservation`** + generación secuencial `FAC-AAAA-NNNNN` |
| `controllers/invoiceController.js` | **`getInvoicePdf`** y **`listInvoiceHistory`** |
| `services/invoicePdfService.js` | Construcción del modelo de datos y **dibujo del PDF** con **pdfkit** |
| `routes/reservationRoutes.js` | Registro de rutas (`/checkout`, `/invoices/history`, `/:reservation_id/invoice`) |

### Respuestas de error habituales (sin entrar en código)

- **403 / “No autorizado”**: el JWT es de un cliente que intenta ver la factura de **otro** usuario.
- **400 / “Factura no disponible”**: aún no se ha hecho checkout (no hay `invoice_number`).
- **400 en checkout**: reserva cancelada, checkout ya hecho, o **fecha de salida aún no llegada** (no se puede facturar antes de tiempo).
- **404**: no existe esa `reservation_id`.

### Integración en apps (Android / WPF)

Hoy la lógica vive **solo en la API**. Los clientes móvil y escritorio pueden:

- Mostrar un botón “Descargar factura” si `invoice_number != null` en el JSON de la reserva.
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
| `POST`   | `/reservation/checkout`           | Checkout: asigna `invoice_number` y `checkout_completed_at` | Sí (admin, employee) |
| `GET`    | `/reservation/invoices/history`    | Histórico de reservas con factura emitida | Sí (admin, employee) |
| `GET`    | `/reservation/:reservation_id/invoice` | Descarga **PDF** de factura (dueño o personal) | Sí   |
| `GET`    | `/reservation/:id/audit`          | Historial de auditoría                   | Sí   |

### Habitaciones

| Método   | Ruta                    | Descripción | Auth |
|----------|-------------------------|-------------|------|
| `GET`    | `/room/all`             | Listado con `normalizeRoomOut` (galería, oferta, flags) | Sí   |
| `GET`    | `/room/one?id=…`        | Detalle por `id` o `room_id` en query (o `body.room_id`) | Sí   |
| `GET`    | `/room/available`       | Disponibles por fechas, huéspedes y opcionalmente `services` | Sí   |
| `GET`    | `/room/extra-services`  | Catálogo de servicios extra activos | Sí   |
| `POST`   | `/room/extra-services`  | Crear servicio (`name`); responde `service_id` tipo `EXT-xxx` | Sí   |
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

```http
GET /reservation/RSV-00001/invoice
Authorization: Bearer <token>
```

Variables opcionales en `.env`: `HOTEL_INVOICE_NAME`, `HOTEL_INVOICE_ADDRESS`, `HOTEL_INVOICE_CIF`, `INVOICE_IVA_RATE` (por defecto `0.10`).

---

## Evolución del proyecto (desde la creación)

Esta sección resume **qué se fue añadiendo** al backend a lo largo del proyecto y **para qué sirve**, con referencias de código cuando ayuda a entenderlo.

### 1. Núcleo inicial

- **Autenticación JWT** (`authRoutes`, `authController`), usuarios y habitaciones con CRUD básico.
- **Reservas**: alta, listados y operaciones sobre `Reservation` con Mongoose.
- Montaje en `index.js` con prefijos claros, por ejemplo `app.use('/room', roomRoutes)`.

### 2. Habitaciones “en servicio” y ocupación en tiempo real

**Problema:** hacía falta distinguir “habitación rota / cerrada” de “habitación libre u ocupada ahora”.

**Solución:** campo `isOperational` en el modelo y, en las respuestas JSON, flags `is_operational` e `is_occupied_now` calculados cruzando con reservas no canceladas cuya estancia cubre la fecha actual. Así Android y WPF pueden mostrar badges coherentes sin duplicar lógica en el cliente.

`GET /room/available` excluye siempre `isOperational: false` y habitaciones solapadas con otras reservas en el rango pedido.

### 3. Reservas activas con imagen (`room_image`)

**Problema:** las apps mostraban listas de reservas pero obligaban a un segundo fetch por habitación para la foto.

**Solución:** `GET /reservation/allActive` enriquece cada ítem con `room_image` resolviendo `room_id` → documento `Room` (campo `image` / galería unificada en servidor).

### 4. Auditoría de reservas e historial “legible”

**Qué se añadió:** colección `booking_audit_log`, middleware que captura el estado **antes** del cambio (`bookingAuditMiddleware.js`), y tras éxito `logBookingChange` en `auditService.js`.

**Qué gana el usuario final:** `GET /reservation/:id/audit` devuelve cada evento con `resumen_cambios` y `detalle_cambios` generados por `describeReservationAuditChanges` (comparación campo a campo entre snapshots). Un ejemplo de JSON de respuesta aparece en la sección **Controlador — `auditController.js`** de este mismo README.

Acciones registradas hoy: `CREATED`, `UPDATED`, `CANCELED` (el diseño permite ampliar más tipos en el futuro).

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

Resumen: campos `invoice_number` y `checkout_completed_at` en `Reservation`; **checkout** solo personal; **PDF bajo demanda** con **pdfkit**; **histórico** para admin/empleado. **Guía paso a paso, permisos, contenido del PDF y variables `.env`:** ver la sección **[Facturación PDF (factura descargable)](#facturación-pdf-factura-descargable)**.

---
