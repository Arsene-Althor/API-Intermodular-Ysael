# API Proyecto Intermodular — Sistema de Gestión Hotelera

API REST desarrollada con **Node.js**, **Express** y **MongoDB (Mongoose)** para la gestión integral de un hotel: reservas, usuarios, habitaciones y reseñas. Incorpora un **sistema de auditoría** que registra de forma automática cada operación relevante sobre las reservas.

> Esta API es consumida por dos clientes: una aplicación de escritorio (WPF/.NET) y una aplicación móvil (Android/Kotlin). Cada uno cuenta con su propia documentación en su respectivo repositorio.

---

## Tabla de contenidos

- [Puesta en marcha](#puesta-en-marcha)
- [Tecnologías utilizadas](#tecnologías-utilizadas)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Sistema de Auditoría de Reservas](#sistema-de-auditoría-de-reservas)
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
| `PORT`        | Puerto del servidor                            | `3000`                               |
| `JWT_SECRET`  | Clave secreta para la firma de tokens JWT      | `clave_secreta_segura`               |

```bash
npm start
```

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

### 1. Modelo — `BookingAuditLog.js`

**Ubicación:** `models/BookingAuditLog.js`

Define el esquema de la colección `booking_audit_log` en MongoDB. Cada documento representa un evento de auditoría.

| Campo            | Tipo   | Descripción                                                        |
|------------------|--------|--------------------------------------------------------------------|
| `booking_id`     | String | ID de negocio de la reserva (`RSV-xxxxx`)                          |
| `action`         | String | Operación realizada: `CREATED`, `UPDATED` o `CANCELED`             |
| `actor_id`       | String | ID del usuario que ejecutó la acción                               |
| `actor_type`     | String | `user` (cliente) o `employee` (empleado/administrador)             |
| `previous_state` | Mixed  | Snapshot de la reserva antes del cambio (`null` en alta)           |
| `new_state`      | Mixed  | Snapshot de la reserva después del cambio                          |
| `timestamp`      | Date   | Fecha y hora del evento                                            |

El esquema incluye un **índice compuesto** `(booking_id, timestamp)` que optimiza las consultas de historial ordenadas cronológicamente.

```javascript
bookingAuditLogSchema.index({ booking_id: 1, timestamp: 1 });
```

---

### 2. Servicio — `auditService.js`

**Ubicación:** `services/auditService.js`

Contiene la lógica reutilizable de auditoría. Exporta las siguientes funciones:

#### `actorTypeFromRole(role)`

Traduce el rol de la aplicación al tipo de actor del modelo de auditoría:

```javascript
function actorTypeFromRole(role) {
  return role === 'client' ? 'user' : 'employee';
}
```

#### `cloneState(doc)`

Genera una copia profunda e independiente de un documento Mongoose para evitar que futuras mutaciones alteren el registro almacenado:

```javascript
function cloneState(doc) {
  if (doc == null) return null;
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return JSON.parse(JSON.stringify(plain));
}
```

#### `logBookingChange({...})`

Inserta un registro en `booking_audit_log`. Si la inserción falla, el error se registra en consola sin interrumpir la operación principal:

```javascript
const logBookingChange = async ({ booking_id, action, actor_id, actor_type, previous_state, new_state }) => {
  try {
    await BookingAuditLog.create({
      booking_id, action, actor_id, actor_type,
      previous_state: cloneState(previous_state),
      new_state:      cloneState(new_state),
      timestamp:      new Date(),
    });
  } catch (error) {
    console.error(`[Auditoría] Error al guardar log (${booking_id}):`, error.message);
  }
};
```

#### `describeReservationAuditChanges(previous_state, new_state, action)`

Compara el estado anterior y el posterior campo a campo y genera un resumen legible de los cambios. Esta información **no se persiste** en MongoDB; se calcula al vuelo cuando se consulta el historial.

```javascript
function describeReservationAuditChanges(previous_state, new_state, action) {
  const resumen_cambios = [];
  const detalle_cambios = [];

  if (action === 'CREATED' || previous_state == null) {
    resumen_cambios.push('Alta de reserva (no había estado anterior).');
    return { resumen_cambios, detalle_cambios };
  }

  const keys = new Set([...Object.keys(prev), ...Object.keys(sig)]);
  for (const key of keys) {
    if (mismoValorAuditoria(antes, despues)) continue;
    const etiqueta = ETIQUETA_CAMPO[key] || key;
    detalle_cambios.push({ campo: key, etiqueta, antes, despues });
    resumen_cambios.push(`${etiqueta}: ${valorAntes} → ${valorDespues}`);
  }

  return { resumen_cambios, detalle_cambios };
}
```

El diccionario `ETIQUETA_CAMPO` traduce nombres internos a etiquetas en español (`room_id` → `"Habitación"`, `price` → `"Precio"`, etc.). La función `valorTextoAuditoria` formatea fechas, booleanos y valores nulos.

---

### 3. Middleware — `bookingAuditMiddleware.js`

**Ubicación:** `middleware/bookingAuditMiddleware.js`

Se ejecuta **antes** del controlador para capturar el estado actual de la reserva.

#### `capturePreviousReservationState`

Lee el `reservation_id` del **body** o de los **parámetros de ruta** (para soportar tanto `POST /cancel` como `DELETE /cancel/:reservation_id`):

```javascript
async function capturePreviousReservationState(req, res, next) {
  const reservation_id =
    (req.body && req.body.reservation_id) ||
    (req.params && req.params.reservation_id);

  if (!reservation_id) {
    req.bookingAuditPreviousState = undefined;
    return next();
  }

  const doc = await Reservation.findOne({ reservation_id });
  req.bookingAuditPreviousState = doc ? cloneState(doc) : null;
  next();
}
```

#### `capturePreviousForNewReservation`

Para la creación de reservas, establece `null` como estado previo:

```javascript
function capturePreviousForNewReservation(req, res, next) {
  req.bookingAuditPreviousState = null;
  next();
}
```

---

### 4. Controlador — `auditController.js`

**Ubicación:** `controllers/auditController.js`

Controlador de **solo lectura** que devuelve el historial de auditoría de una reserva.

#### `getBookingAudit(req, res)`

1. Verifica que la reserva exista.
2. Comprueba permisos: el cliente solo puede ver sus propias reservas; administradores y empleados pueden consultar cualquiera.
3. Recupera los registros de `booking_audit_log` ordenados cronológicamente.
4. **Enriquece cada registro** con `resumen_cambios` y `detalle_cambios` mediante `describeReservationAuditChanges`.

```javascript
const listaConResumen = lista.map((doc) => {
  const { resumen_cambios, detalle_cambios } = describeReservationAuditChanges(
    doc.previous_state, doc.new_state, doc.action
  );
  return { ...doc, resumen_cambios, detalle_cambios };
});
res.json(listaConResumen);
```

Ejemplo de respuesta JSON:

```json
{
  "booking_id": "RSV-00003",
  "action": "CANCELED",
  "actor_id": "USR-00001",
  "actor_type": "employee",
  "timestamp": "2026-05-11T01:18:00.000Z",
  "resumen_cambios": ["Precio: 200 → 50", "Fecha cancelación: — → 11/05/2026 01:18"],
  "detalle_cambios": [
    { "campo": "price", "etiqueta": "Precio", "antes": 200, "despues": 50 },
    { "campo": "cancelation_date", "etiqueta": "Fecha cancelación", "antes": null, "despues": "2026-05-11T01:18:00.000Z" }
  ]
}
```

---

### 5. Integración en `reservationController.js`

El controlador de reservas invoca `logBookingChange` tras cada operación exitosa:

```javascript
// Al crear
await logBookingChange({
  booking_id: reservation.reservation_id,
  action: 'CREATED',
  actor_id: req.user.user_id,
  actor_type: actorTypeFromRole(req.user.role),
  previous_state: req.bookingAuditPreviousState ?? null,
  new_state: reservation,
});

// Al cancelar → action: 'CANCELED'
// Al actualizar → action: 'UPDATED'
```

La función `cancelReservation` acepta el `reservation_id` desde el body (`POST`) o parámetros de ruta (`DELETE`), y el `price` desde el body o query string:

```javascript
const reservation_id =
  (req.body && req.body.reservation_id) || (req.params && req.params.reservation_id);
let price = req.body && req.body.price;
if (price === undefined && req.query && req.query.price !== undefined) {
  price = req.query.price;
}
```

---

## Módulo de Reseñas

### Modelo — `Review.js`

Colección `reviews` en MongoDB:

| Campo       | Tipo   | Descripción                                            |
|-------------|--------|--------------------------------------------------------|
| `review_id` | String | Identificador único (`REV-xxxxx`)                      |
| `room_id`   | String | Habitación reseñada                                    |
| `user_id`   | String | Cliente autor de la reseña                             |
| `user_name` | String | Nombre del cliente (resuelto en el servidor)           |
| `rating`    | Number | Puntuación entre 1 y 5                                 |
| `comment`   | String | Texto de la reseña (máx. 2000 caracteres)              |

### Controlador — `reviewController.js`

#### `nextReviewId()`

Genera el siguiente `review_id` consultando directamente la colección `reviews`:

```javascript
async function nextReviewId() {
  const last = await Review.findOne().sort({ review_id: -1 }).select("review_id").lean();
  let n = 0;
  if (last && last.review_id && /^REV-[0-9]{5}$/.test(last.review_id)) {
    n = parseInt(last.review_id.split("-")[1], 10);
  }
  return `REV-${String(n + 1).padStart(5, "0")}`;
}
```

#### `createReview(req, res)`

Validaciones:
1. Campos obligatorios: `room_id`, `rating`, `comment`.
2. `rating` debe ser un entero entre 1 y 5.
3. El usuario debe tener al menos una reserva en esa habitación.
4. No se permite más de una reseña por usuario y habitación.
5. Se resuelve el `user_name` automáticamente desde la colección de usuarios.

#### `deleteReview(req, res)`

Permite eliminar una reseña. Solo el autor o un administrador pueden ejecutar la acción.

---

## Endpoints y verbos HTTP

### Reservas

| Método   | Ruta                              | Descripción                          | Auth |
|----------|-----------------------------------|--------------------------------------|------|
| `POST`   | `/reservation/add`                | Crear una reserva                    | Sí   |
| `POST`   | `/reservation/cancel`             | Cancelar reserva (body)              | Sí   |
| `DELETE`  | `/reservation/cancel/:id`        | Cancelar reserva (parámetro de ruta) | Sí   |
| `PATCH`  | `/reservation/update`             | Actualizar reserva parcialmente      | Sí   |
| `GET`    | `/reservation/mine`               | Reservas del usuario autenticado     | Sí   |
| `GET`    | `/reservation/allActive`          | Todas las reservas activas           | Sí   |
| `GET`    | `/reservation/all`                | Todas las reservas                   | Sí   |
| `POST`   | `/reservation/getPrice`           | Calcular precio de una reserva       | Sí   |
| `POST`   | `/reservation/getCancelationPrice`| Calcular penalización por cancelación| Sí   |
| `GET`    | `/reservation/:id/audit`          | Historial de auditoría de una reserva| Sí   |

### Reseñas

| Método   | Ruta                    | Descripción                              | Auth |
|----------|-------------------------|------------------------------------------|------|
| `GET`    | `/review/mine`          | Reseñas del usuario autenticado          | Sí   |
| `GET`    | `/review/room/:roomId`  | Reseñas de una habitación (pública)      | No   |
| `POST`   | `/review/create`       | Crear una reseña                         | Sí   |
| `DELETE`  | `/review/delete`       | Eliminar una reseña                      | Sí   |

### Impacto en los clientes

Los cambios en verbos HTTP afectan directamente a las aplicaciones WPF y Android:

- **Cancelación**: ambos clientes utilizan `DELETE /reservation/cancel/:id?price=X` en lugar del anterior `POST /cancel`.
- **Actualización**: ambos clientes utilizan `PATCH /reservation/update` en lugar del anterior `PUT /update`.
- **Reseñas**: la API resuelve el `user_name` internamente, por lo que los clientes solo envían `room_id`, `rating` y `comment`.

---

## Cambios recientes

### Auditoría — Resumen de diferencias

Se incorporó `describeReservationAuditChanges` en `auditService.js`. El endpoint `GET /reservation/:id/audit` ahora incluye `resumen_cambios` y `detalle_cambios` en cada registro.

### Refactorización de verbos HTTP

| Operación   | Antes                 | Ahora                                      |
|-------------|-----------------------|--------------------------------------------|
| Cancelar    | `POST /cancel`        | `POST /cancel` + `DELETE /cancel/:id`      |
| Actualizar  | `PUT /update`         | `PATCH /update`                            |

### Eliminación de archivos

- **`models/Counter.js`** — Eliminado. Los IDs de reseñas se generan consultando la colección `reviews` directamente.
- **Archivos de test** — Eliminados del repositorio.

### Correcciones en reseñas

- `nextReviewId()` refactorizado sin dependencia del modelo `Counter`.
- Validación de reseña duplicada por usuario y habitación.
- Campo `user_name` resuelto en el servidor.
- Endpoint `DELETE /review/delete` para eliminación de reseñas.

---
