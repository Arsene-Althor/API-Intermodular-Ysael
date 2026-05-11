# API Proyecto Intermodular — Sistema de Gestión Hotelera

API REST desarrollada con **Node.js**, **Express** y **MongoDB (Mongoose)** para la gestión integral de un hotel: reservas, usuarios, habitaciones y reseñas. Incorpora un **sistema de auditoría** que registra de forma automática cada operación relevante sobre las reservas.

---

## Tabla de contenidos

- [Puesta en marcha](#puesta-en-marcha)
- [Tecnologías utilizadas](#tecnologías-utilizadas)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Sistema de Auditoría de Reservas](#sistema-de-auditoría-de-reservas)
- [Módulo de Reseñas](#módulo-de-reseñas)
- [Endpoints consumidos por los clientes](#endpoints-consumidos-por-los-clientes)
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

### 1. Modelo — `BookingAuditLog.js`

Define el esquema de la colección `booking_audit_log` en MongoDB.

| Campo            | Tipo   | Descripción                                                        |
|------------------|--------|--------------------------------------------------------------------|
| `booking_id`     | String | ID de negocio de la reserva (`RSV-xxxxx`)                          |
| `action`         | String | Operación realizada: `CREATED`, `UPDATED` o `CANCELED`             |
| `actor_id`       | String | ID del usuario que ejecutó la acción                               |
| `actor_type`     | String | `user` (cliente) o `employee` (empleado/administrador)             |
| `previous_state` | Mixed  | Snapshot de la reserva antes del cambio (`null` en alta)           |
| `new_state`      | Mixed  | Snapshot de la reserva después del cambio                          |
| `timestamp`      | Date   | Fecha y hora del evento                                            |

Índice compuesto `(booking_id, timestamp)` para consultas eficientes.

### 2. Servicio — `auditService.js`

Funciones reutilizables de auditoría:

- **`actorTypeFromRole(role)`** — Convierte el rol de la aplicación (`client` → `user`, resto → `employee`).
- **`cloneState(doc)`** — Copia profunda de un documento Mongoose para congelar el estado en el registro.
- **`logBookingChange({...})`** — Inserta un registro en `booking_audit_log`. Si falla, no interrumpe la operación principal.
- **`describeReservationAuditChanges(previous, new, action)`** — Compara ambos estados campo a campo y genera `resumen_cambios` (texto legible) y `detalle_cambios` (datos estructurados). Esta información se calcula al vuelo al consultar, no se persiste.

### 3. Middleware — `bookingAuditMiddleware.js`

- **`capturePreviousReservationState`** — Antes de cancelar o actualizar, lee la reserva actual desde MongoDB y la guarda en `req.bookingAuditPreviousState`. Soporta `reservation_id` desde body o parámetros de ruta.
- **`capturePreviousForNewReservation`** — Para creación de reservas, establece `null` como estado previo.

### 4. Controlador — `auditController.js`

- **`getBookingAudit(req, res)`** — Endpoint de consulta. Verifica permisos (cliente dueño o personal), recupera los registros ordenados cronológicamente y los enriquece con `resumen_cambios` y `detalle_cambios`.

### 5. Rutas de auditoría

```javascript
router.post('/add',    capturePreviousForNewReservation,   reservationController.addReservation);
router.post('/cancel', capturePreviousReservationState,    reservationController.cancelReservation);
router.delete('/cancel/:reservation_id', capturePreviousReservationState, reservationController.cancelReservation);
router.patch('/update', capturePreviousReservationState,   reservationController.updateReservation);
router.get('/:reservation_id/audit', auditController.getBookingAudit);
```

### 6. Integración en `reservationController.js`

El controlador invoca `logBookingChange` tras cada operación exitosa (crear, cancelar, actualizar). La función `cancelReservation` acepta `reservation_id` desde body (`POST`) o parámetros de ruta (`DELETE`), y `price` desde body o query string.

---

## Módulo de Reseñas

### Modelo — `Review.js`

Colección `reviews` en MongoDB:

| Campo       | Tipo   | Descripción                                            |
|-------------|--------|--------------------------------------------------------|
| `review_id` | String | Identificador único (`REV-xxxxx`)                      |
| `room_id`   | String | Habitación reseñada                                    |
| `user_id`   | String | Cliente autor de la reseña                             |
| `user_name` | String | Nombre completo del cliente (resuelto en el servidor)  |
| `rating`    | Number | Puntuación entre 1 y 5                                 |
| `comment`   | String | Texto de la reseña (máx. 2000 caracteres)              |

### Controlador — `reviewController.js`

- **`nextReviewId()`** — Genera el siguiente ID consultando directamente la colección `reviews`, sin colección auxiliar `counters`.
- **`createReview`** — Valida campos, rating 1-5, existencia de reserva previa, duplicados, y resuelve `user_name` desde la BD.
- **`deleteReview`** — Solo el autor o un administrador pueden eliminar.
- **`getMyReviews`** — Reseñas del usuario autenticado.
- **`getReviewsByRoom`** — Reseñas de una habitación (público, sin autenticación).

### Rutas — `reviewRoutes.js`

```javascript
router.get("/mine",          requireLogin, reviewController.getMyReviews);
router.get("/room/:roomId",                reviewController.getReviewsByRoom);
router.post("/create",       requireLogin, reviewController.createReview);
router.delete("/delete",     requireLogin, reviewController.deleteReview);
```

---

## Endpoints consumidos por los clientes

Referencia de los endpoints que utilizan las aplicaciones cliente (WPF y Android). Cada proyecto cliente cuenta con su propio README con documentación específica.

### Autenticación

| Método | Ruta              | Descripción         | Auth |
|--------|--------------------|----------------------|------|
| POST   | `/auth/login`      | Inicio de sesión     | No   |
| POST   | `/auth/register`   | Registro de usuario  | No   |

### Reservas

| Método | Ruta                               | Descripción                  | Auth    |
|--------|-------------------------------------|-------------------------------|---------|
| POST   | `/reservation/add`                  | Crear reserva                | Login   |
| POST   | `/reservation/cancel`               | Cancelar (body)              | Login   |
| DELETE | `/reservation/cancel/:id`           | Cancelar (ruta + query)      | Login   |
| PATCH  | `/reservation/update`               | Actualizar reserva           | Login   |
| GET    | `/reservation/mine`                 | Reservas del usuario         | Login   |
| GET    | `/reservation/all`                  | Todas las reservas           | Admin   |
| GET    | `/reservation/allActive`            | Reservas activas             | Admin   |
| POST   | `/reservation/getPrice`             | Calcular precio              | Login   |
| POST   | `/reservation/getCancelationPrice`  | Precio de cancelación        | Login   |
| GET    | `/reservation/:id/audit`            | Historial de auditoría       | Login   |

### Reseñas

| Método | Ruta                  | Descripción                    | Auth    |
|--------|-----------------------|---------------------------------|---------|
| GET    | `/review/mine`        | Reseñas del usuario            | Login   |
| GET    | `/review/room/:roomId`| Reseñas de una habitación      | Público |
| POST   | `/review/create`      | Crear reseña                   | Login   |
| DELETE | `/review/delete`      | Eliminar reseña                | Login   |

### Habitaciones y Usuarios

Documentados en sus respectivos archivos de rutas (`roomRoutes.js`, `userRoutes.js`).

---

## Cambios recientes

### Auditoría — Resumen de diferencias

Se incorporó `describeReservationAuditChanges` en `auditService.js`. La respuesta del endpoint de auditoría ahora incluye `resumen_cambios` y `detalle_cambios`, calculados al vuelo sin persistirse en la base de datos.

### Refactorización de verbos HTTP

| Operación   | Antes              | Ahora                                 |
|-------------|---------------------|----------------------------------------|
| Cancelar    | `POST /cancel`      | `POST /cancel` + `DELETE /cancel/:id` |
| Actualizar  | `PUT /update`       | `PATCH /update`                       |

### Eliminación de archivos

- **`models/Counter.js`** — Eliminado. Los IDs de reseñas se generan consultando la colección `reviews`.
- **Archivos de test** — Eliminados del repositorio.

### Correcciones en reseñas

- Eliminada la dependencia del modelo `Counter`.
- Validación de reseña duplicada por usuario y habitación.
- Campo `user_name` resuelto en el servidor.
- Nuevo endpoint `DELETE /review/delete`.

---
