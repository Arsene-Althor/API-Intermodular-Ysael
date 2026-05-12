# API Proyecto Intermodular — Sistema de Gestión Hotelera

API REST desarrollada con **Node.js**, **Express** y **MongoDB (Mongoose)** para la gestión integral de un hotel: reservas, usuarios, habitaciones y reseñas. Incorpora un **sistema de auditoría** que registra de forma automática cada operación relevante sobre las reservas.

> Esta API es consumida por dos clientes: una aplicación de escritorio (WPF/.NET) y una aplicación móvil (Android/Kotlin). Cada uno cuenta con su propia documentación en su respectivo repositorio.

---

## Tabla de contenidos

- [Puesta en marcha](#puesta-en-marcha)
- [Tecnologías utilizadas](#tecnologías-utilizadas)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Sistema de Auditoría de Reservas](#sistema-de-auditoría-de-reservas)
- [Gestión de habitaciones](#gestión-de-habitaciones)
- [Módulo de Reseñas](#módulo-de-reseñas)
- [Endpoints y verbos HTTP](#endpoints-y-verbos-http)
- [Cambios recientes](#cambios-recientes)

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
│   ├── User.js                     # Usuarios
│   └── Review.js                   # Reseñas
│
├── controllers/
│   ├── auditController.js          # Consulta de auditoría (solo lectura)
│   ├── reservationController.js    # CRUD de reservas + escritura de auditoría
│   ├── authController.js           # Autenticación (login / registro)
│   ├── userController.js           # Gestión de usuarios
│   ├── roomController.js           # Gestión de habitaciones
│   └── reviewController.js         # Gestión de reseñas
│
├── middleware/
│   ├── bookingAuditMiddleware.js   # Captura del estado previo (auditoría)
│   ├── authMiddleware.js           # Verificación de JWT y roles
│   └── diskStorage.js              # Configuración de Multer
│
├── services/
│   └── auditService.js             # Lógica de escritura y resumen de auditoría
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

### Modelo — `Room.js`

| Campo             | Tipo    | Descripción                                                                 |
|-------------------|---------|-----------------------------------------------------------------------------|
| `room_id`         | String  | Identificador único de la habitación                                        |
| `type`            | String  | Tipo: `Individual`, `Doble`, `Suite`                                        |
| `description`     | String  | Descripción de la habitación                                                |
| `image`           | String  | URL de la imagen (se asigna una por defecto si no se proporciona)           |
| `price_per_night` | Number  | Precio por noche                                                            |
| `rate`            | Number  | Valoración (por defecto 0)                                                  |
| `max_occupancy`   | Number  | Capacidad máxima de huéspedes                                               |
| `isOperational`   | Boolean | Si la habitación está en servicio (`true`) o fuera de servicio (`false`)     |
| `isAvailable`     | Boolean | Campo legacy, ya no se edita manualmente                                    |

### Campo `isOperational`

Sustituye al antiguo `isAvailable` para la gestión administrativa. Representa si el hotel puede ofrecer la habitación:

- `true` → la habitación aparece en las búsquedas de clientes y puede reservarse.
- `false` → fuera de servicio; no se muestra al buscar habitaciones disponibles.

### Campos calculados en la respuesta de `GET /room/all`

La API enriquece la respuesta con dos campos calculados que no se almacenan en la base de datos:

| Campo             | Tipo    | Descripción                                                    |
|-------------------|---------|----------------------------------------------------------------|
| `is_operational`  | Boolean | Valor de `isOperational` del documento                         |
| `is_occupied_now` | Boolean | `true` si existe una reserva activa (no cancelada) en curso    |

```javascript
// roomController.js — getAllRooms
const overlapping = await Reservation.find({
  cancelation_date: null,
  check_in: { $lte: now },
  check_out: { $gt: now }
}).select('room_id').lean();
const occupiedSet = new Set(overlapping.map(r => String(r.room_id).trim()));

rooms = rooms.map(room => ({
  ...room,
  is_operational: room.isOperational !== false,
  is_occupied_now: occupiedSet.has(String(room.room_id).trim())
}));
```

### Filtro en búsqueda de disponibilidad

`GET /room/available` excluye automáticamente las habitaciones con `isOperational: false`:

```javascript
const available = await Room.find({
  isOperational: { $ne: false },
  max_occupancy: { $gte: Number(guests) },
  room_id: { $nin: occupiedIds }
}).lean();
```

### Imagen de reservas activas

`GET /reservation/allActive` ahora incluye `room_image` en cada reserva, resolviendo la imagen de la habitación asociada:

```javascript
const roomIds = [...new Set(reservations.map(r => String(r.room_id).trim()))];
const rooms = await Room.find({ room_id: { $in: roomIds } }).select('room_id image').lean();
const imgByRoom = Object.fromEntries(rooms.map(r => [String(r.room_id).trim(), r.image]));
const enriched = reservations.map(r => ({
  ...r,
  room_image: imgByRoom[String(r.room_id).trim()] || null
}));
```

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
| `POST`   | `/reservation/getPrice`           | Calcular precio de una reserva           | Sí   |
| `POST`   | `/reservation/getCancelationPrice`| Calcular penalización por cancelación    | Sí   |
| `GET`    | `/reservation/:id/audit`          | Historial de auditoría                   | Sí   |

### Habitaciones

| Método   | Ruta                 | Descripción                                              | Auth |
|----------|----------------------|----------------------------------------------------------|------|
| `GET`    | `/room/all`          | Todas las habitaciones (con `is_operational`, `is_occupied_now`) | Sí   |
| `GET`    | `/room/one?id=X`     | Una habitación por ID                                    | Sí   |
| `GET`    | `/room/available`    | Habitaciones disponibles (filtra `isOperational: false`) | Sí   |
| `POST`   | `/room/add`         | Crear habitación                                         | Sí   |
| `PUT`    | `/room/update`       | Actualizar habitación (incluye `isOperational`)          | Sí   |

### Reseñas

| Método   | Ruta                    | Descripción                              | Auth |
|----------|-------------------------|------------------------------------------|------|
| `GET`    | `/review/mine`          | Reseñas del usuario autenticado          | Sí   |
| `GET`    | `/review/room/:roomId`  | Reseñas de una habitación (pública)      | No   |
| `POST`   | `/review/create`       | Crear una reseña                         | Sí   |
| `DELETE` | `/review/delete`        | Eliminar una reseña                      | Sí   |

---

## Cambios recientes

### Habitaciones — `isOperational` e `is_occupied_now`

- El campo `isAvailable` se reemplazó por `isOperational` para representar si la habitación está en servicio.
- `GET /room/all` ahora devuelve `is_operational` e `is_occupied_now` (calculado a partir de reservas activas) para que los clientes puedan mostrar el estado real de cada habitación.
- `GET /room/available` filtra automáticamente las habitaciones fuera de servicio.

### Reservas activas — `room_image`

- `GET /reservation/allActive` enriquece cada reserva con `room_image`, resolviendo la imagen de la habitación asociada sin necesidad de una segunda petición por parte del cliente.

### Inicialización del servidor

- `dotenv` se carga al inicio del archivo `index.js` (antes de cualquier `require`) para garantizar que las variables de entorno estén disponibles desde el primer momento.
- El puerto tiene un valor por defecto (`3000`) si `PORT` no está definido en `.env`.

### Auditoría — Resumen de diferencias

- `describeReservationAuditChanges` genera resúmenes legibles campo a campo.
- El endpoint `GET /reservation/:id/audit` incluye `resumen_cambios` y `detalle_cambios`.

### Refactorización de verbos HTTP

| Operación   | Antes                 | Ahora                                      |
|-------------|-----------------------|--------------------------------------------|
| Cancelar    | `POST /cancel`        | `POST /cancel` + `DELETE /cancel/:id`      |
| Actualizar  | `PUT /update`         | `PATCH /update`                            |

### Acciones de auditoría registradas

Actualmente la API registra las siguientes acciones en `booking_audit_log`:

| Acción     | Se registra cuando…                |
|------------|------------------------------------|
| `CREATED`  | Se crea una nueva reserva          |
| `UPDATED`  | Se modifica una reserva existente  |
| `CANCELED` | Se cancela una reserva             |

En futuras versiones se prevé ampliar con acciones adicionales (`PAYMENT_RECEIVED`, `CHECK_IN`, `EXTRA_SERVICE`, entre otras). Los clientes Android y WPF ya contemplan estos valores en su lógica de mapeo.

### Correcciones en reseñas

- `nextReviewId()` sin dependencia de colección `Counter`.
- Validación de duplicados, `user_name` resuelto en servidor, endpoint `DELETE /review/delete`.

---
