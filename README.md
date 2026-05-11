# 🏨 API Proyecto Intermodular — Sistema de Gestión Hotelera

API REST construida con **Node.js**, **Express** y **MongoDB (Mongoose)** para gestionar reservas de hotel, usuarios, habitaciones y reseñas. Incluye un **sistema de auditoría** que registra automáticamente cada cambio realizado sobre las reservas.

---

## 📋 Tabla de contenidos

- [Puesta en marcha](#-puesta-en-marcha)
- [Tecnologías utilizadas](#-tecnologías-utilizadas)
- [Estructura del proyecto](#-estructura-del-proyecto)
- [Sistema de Auditoría de Reservas](#-sistema-de-auditoría-de-reservas)
  - [¿Qué es y para qué sirve?](#qué-es-y-para-qué-sirve)
  - [Diagrama del flujo completo](#diagrama-del-flujo-completo)
  - [1. Modelo — BookingAuditLog.js](#1-modelo--bookingauditlogjs)
  - [2. Servicio — auditService.js](#2-servicio--auditservicejs)
  - [3. Middleware — bookingAuditMiddleware.js](#3-middleware--bookingauditmiddlewarejs)
  - [4. Controlador — auditController.js](#4-controlador--auditcontrollerjs)
  - [5. Rutas — reservationRoutes.js](#5-rutas--reservationroutesjs)
  - [6. Integración en reservationController.js](#6-integración-en-reservationcontrollerjs)
- [Ejemplo completo de flujo](#-ejemplo-completo-de-flujo)

---

## 🚀 Puesta en marcha

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

Crea un archivo `.env` en la raíz del proyecto con las siguientes variables:

| Variable      | Descripción                                          | Ejemplo                              |
|---------------|------------------------------------------------------|--------------------------------------|
| `MONGO_URI`   | Cadena de conexión a MongoDB Atlas o local            | `mongodb+srv://user:pass@cluster...` |
| `PORT`        | Puerto donde escuchará el servidor                    | `3000`                               |
| `JWT_SECRET`  | Clave secreta para firmar los tokens de autenticación | `mi_clave_super_secreta`             |

### 3. Iniciar el servidor

```bash
npm start
```

El servidor arrancará en `http://localhost:3000` (o el puerto que hayas configurado).

---

## 🛠 Tecnologías utilizadas

| Tecnología   | Versión | Uso                                          |
|--------------|---------|----------------------------------------------|
| Node.js      | —       | Entorno de ejecución del servidor             |
| Express      | 5.x     | Framework web para crear la API REST          |
| Mongoose     | 9.x     | ODM para modelar y consultar datos en MongoDB |
| JWT          | 9.x     | Autenticación mediante tokens                 |
| bcrypt       | 6.x     | Cifrado de contraseñas                        |
| dotenv       | 17.x   | Carga de variables de entorno desde `.env`    |
| Multer       | 2.x     | Subida de archivos (imágenes)                 |
| Nodemailer   | 8.x     | Envío de correos electrónicos                 |

---

## 📁 Estructura del proyecto

```
API-Intermodular-Ysael/
├── index.js                          # Punto de entrada: arranca Express y conecta la BD
├── db.js                             # Función de conexión a MongoDB
├── package.json                      # Dependencias y scripts del proyecto
├── .env                              # Variables de entorno (no se sube a Git)
│
├── models/                           # Esquemas de datos (Mongoose)
│   ├── BookingAuditLog.js            # 📝 Modelo del registro de auditoría
│   ├── Reservation.js                # Modelo de reservas
│   ├── Room.js                       # Modelo de habitaciones
│   ├── User.js                       # Modelo de usuarios
│   ├── Review.js                     # Modelo de reseñas
│   └── Counter.js                    # Contador auxiliar para IDs
│
├── controllers/                      # Lógica de cada endpoint
│   ├── auditController.js            # 📝 Consultar historial de auditoría
│   ├── reservationController.js      # 📝 CRUD de reservas (llama a auditoría)
│   ├── authController.js             # Login y registro
│   ├── userController.js             # Gestión de usuarios
│   ├── roomController.js             # Gestión de habitaciones
│   └── reviewController.js           # Gestión de reseñas
│
├── middleware/                       # Funciones intermedias (se ejecutan antes del controlador)
│   ├── bookingAuditMiddleware.js     # 📝 Captura estado previo para auditoría
│   ├── authMiddleware.js             # Verificación de JWT y roles
│   └── diskStorage.js               # Configuración de Multer (subida de archivos)
│
├── services/                         # Lógica de negocio reutilizable
│   └── auditService.js              # 📝 Funciones para guardar registros de auditoría
│
├── routes/                           # Definición de rutas HTTP
│   ├── reservationRoutes.js          # 📝 Rutas de reservas (incluye ruta de auditoría)
│   ├── authRoutes.js                 # Rutas de autenticación
│   ├── userRoutes.js                 # Rutas de usuarios
│   ├── roomRoutes.js                 # Rutas de habitaciones
│   └── reviewRoutes.js              # Rutas de reseñas
│
└── config/
    └── mailer.js                     # Configuración de Nodemailer
```

> Los archivos marcados con 📝 participan en el sistema de auditoría.

---

## 🔍 Sistema de Auditoría de Reservas

### ¿Qué es y para qué sirve?

El sistema de auditoría es un mecanismo que **registra automáticamente** un historial de todos los cambios que se hacen sobre las reservas. Funciona como un "diario" que anota:

- **Quién** hizo el cambio (el usuario o empleado).
- **Qué** se hizo (crear, modificar o cancelar).
- **Cuándo** se hizo (fecha y hora exacta).
- **Cómo estaba antes** y **cómo quedó después** del cambio.

**¿Por qué es útil?** Imagina que un cliente dice: *"Mi reserva tenía un precio diferente"*. Con la auditoría, el administrador puede consultar el historial completo y ver exactamente qué cambió, quién lo cambió y cuándo.

> **Importante:** El historial de auditoría es de **solo lectura**. Nadie puede borrar ni editar estos registros, lo que garantiza la integridad del historial.

---

### Diagrama del flujo completo

Este diagrama muestra qué pasa paso a paso cuando un usuario crea, modifica o cancela una reserva:

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        FLUJO DE AUDITORÍA                               │
│                                                                          │
│  1. El usuario envía una petición HTTP (crear/modificar/cancelar)        │
│                           │                                              │
│                           ▼                                              │
│  2. MIDDLEWARE de auditoría: captura el estado ANTERIOR de la reserva    │
│     en MongoDB y lo guarda en req.bookingAuditPreviousState             │
│                           │                                              │
│                           ▼                                              │
│  3. CONTROLADOR de reservas: valida los datos, ejecuta el cambio        │
│     en la base de datos                                                  │
│                           │                                              │
│                           ▼                                              │
│  4. Si todo fue bien → llama a logBookingChange() del SERVICIO          │
│     pasando el estado anterior y el nuevo                                │
│                           │                                              │
│                           ▼                                              │
│  5. SERVICIO de auditoría: guarda un registro en la colección           │
│     booking_audit_log de MongoDB                                         │
│                           │                                              │
│                           ▼                                              │
│  6. Se responde al usuario con el resultado de su operación             │
└──────────────────────────────────────────────────────────────────────────┘

Para CONSULTAR el historial:

  GET /reservation/RSV-00001/audit  →  auditController  →  devuelve todos
                                        los registros ordenados por fecha
```

---

### 1. Modelo — `BookingAuditLog.js`

📄 **Ubicación:** `models/BookingAuditLog.js`

**¿Para qué sirve este archivo?**
Define la **estructura de datos** (esquema) que tendrá cada registro de auditoría en MongoDB. Es como un molde que dice: *"Cada registro debe tener estos campos con este formato"*. MongoDB creará una colección llamada `booking_audit_log` donde se almacenan todos los registros.

**Campos del esquema:**

| Campo            | Tipo     | Descripción                                                       |
|------------------|----------|-------------------------------------------------------------------|
| `booking_id`     | String   | ID de negocio de la reserva (`RSV-00001`), no el `_id` de MongoDB |
| `action`         | String   | Tipo de operación: `CREATED`, `UPDATED` o `CANCELED`              |
| `actor_id`       | String   | ID del usuario que realizó la acción (`CLI-00001` o `EMP-00001`)  |
| `actor_type`     | String   | Tipo de actor: `user` (cliente) o `employee` (empleado/admin)     |
| `previous_state` | Mixed    | Copia completa de la reserva **antes** del cambio (o `null` si es nueva) |
| `new_state`      | Mixed    | Copia completa de la reserva **después** del cambio               |
| `timestamp`      | Date     | Fecha y hora exacta en que ocurrió el evento                      |

**Código completo del archivo:**

```javascript
const mongoose = require('mongoose');

const bookingAuditLogSchema = new mongoose.Schema(
  {
    booking_id: {
      type: String,
      required: true,    // Obligatorio: siempre debe indicar a qué reserva pertenece
      trim: true,
      index: true,        // Índice para búsquedas rápidas por reserva
    },
    action: {
      type: String,       // 'CREATED', 'UPDATED' o 'CANCELED'
      required: true,
      trim: true,
    },
    actor_id: {
      type: String,       // Quién hizo la acción (ej: 'CLI-00001')
      required: true,
      trim: true,
    },
    actor_type: {
      type: String,
      required: true,
      enum: ['user', 'employee'],  // Solo estos dos valores son válidos
    },
    previous_state: {
      type: mongoose.Schema.Types.Mixed,  // Acepta cualquier estructura JSON
      default: null,                       // null cuando se crea una reserva nueva
    },
    new_state: {
      type: mongoose.Schema.Types.Mixed,  // Snapshot de la reserva después del cambio
      default: null,
    },
    timestamp: {
      type: Date,
      default: Date.now,   // Se genera automáticamente con la fecha actual
      index: true,
    },
  },
  { collection: 'booking_audit_log' }  // Nombre de la colección en MongoDB
);

// Índice compuesto: permite buscar los logs de una reserva ordenados por fecha
bookingAuditLogSchema.index({ booking_id: 1, timestamp: 1 });

module.exports = mongoose.model('Booking_Audit_Log', bookingAuditLogSchema);
```

**¿Qué es el índice compuesto?**
La línea `bookingAuditLogSchema.index({ booking_id: 1, timestamp: 1 })` le dice a MongoDB: *"Organiza los datos de forma que sea muy rápido buscar por `booking_id` y a la vez ordenar por `timestamp`"*. Sin este índice, las consultas serían más lentas conforme crezca el historial.

---

### 2. Servicio — `auditService.js`

📄 **Ubicación:** `services/auditService.js`

**¿Para qué sirve este archivo?**
Contiene las **funciones reutilizables** que se encargan de guardar los registros de auditoría. Está separado del controlador para poder llamarlo desde cualquier parte del código sin duplicar lógica. Es el "motor" que graba cada entrada del diario.

**Funciones que contiene:**

#### `actorTypeFromRole(role)` — Traducir el rol al tipo de actor

Convierte el rol del usuario de la aplicación (`client`, `admin`, `employee`) al formato que espera el modelo de auditoría (`user` o `employee`).

```javascript
function actorTypeFromRole(role) {
  return role === 'client' ? 'user' : 'employee';
}
```

**Lógica:** Si el rol es `client`, devuelve `'user'`. Para cualquier otro rol (`admin` o `employee`), devuelve `'employee'`. Así el modelo de auditoría solo necesita distinguir entre dos tipos de actor.

---

#### `cloneState(doc)` — Crear una copia independiente del documento

Crea una **copia profunda** (clon) de un documento de reserva para guardarlo en el log sin que cambios futuros afecten al registro.

```javascript
function cloneState(doc) {
  if (doc == null) return null;
  // Si es un documento Mongoose, lo convierte a objeto plano
  const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  // JSON.parse + JSON.stringify crea una copia totalmente independiente
  return JSON.parse(JSON.stringify(plain));
}
```

**¿Por qué es necesario clonar?** En JavaScript, los objetos se pasan por referencia. Si guardamos directamente el documento de la reserva y luego alguien lo modifica, nuestro registro de auditoría también se modificaría. Al clonar, nos aseguramos de que el registro queda "congelado" tal como estaba en ese momento.

---

#### `logBookingChange({...})` — Guardar un registro de auditoría

Esta es la función principal que **inserta un nuevo registro** en la colección `booking_audit_log`.

```javascript
const logBookingChange = async ({
  booking_id,      // ID de la reserva (ej: 'RSV-00001')
  action,          // Qué se hizo: 'CREATED', 'UPDATED' o 'CANCELED'
  actor_id,        // Quién lo hizo (ej: 'EMP-00001')
  actor_type,      // Tipo de actor: 'user' o 'employee'
  previous_state,  // Estado anterior de la reserva (null si es nueva)
  new_state,       // Estado nuevo de la reserva tras el cambio
}) => {
  try {
    await BookingAuditLog.create({
      booking_id,
      action,
      actor_id,
      actor_type,
      previous_state: cloneState(previous_state),  // Clona por seguridad
      new_state: cloneState(new_state),
      timestamp: new Date(),                        // Marca de tiempo actual
    });
    console.log(`[Auditoría] '${action}' → reserva ${booking_id}`);
  } catch (error) {
    // Si falla, solo muestra error en consola pero NO interrumpe la operación principal
    console.error(`[Auditoría] Error al guardar log (${booking_id}):`, error.message);
  }
};
```

**Detalle importante:** Si ocurre un error al guardar el registro de auditoría (por ejemplo, un problema temporal de conexión con la base de datos), la operación principal de la reserva **no se ve afectada**. Esto es intencional: es preferible que la reserva se procese correctamente y perder un registro de auditoría, a que toda la operación falle.

---

### 3. Middleware — `bookingAuditMiddleware.js`

📄 **Ubicación:** `middleware/bookingAuditMiddleware.js`

**¿Para qué sirve este archivo?**
Un middleware es una función que se ejecuta **antes** de que la petición llegue al controlador. Este middleware se encarga de **leer y guardar una foto del estado actual de la reserva** antes de que se modifique. De esta forma, cuando el controlador termine de hacer el cambio, tendremos tanto el "antes" como el "después" para registrar en auditoría.

**Funciones que contiene:**

#### `capturePreviousReservationState` — Para cancelar y actualizar

Se usa **antes** de cancelar o actualizar una reserva. Busca la reserva en la base de datos, la clona, y la deja disponible en `req.bookingAuditPreviousState` para que el controlador la use después.

```javascript
async function capturePreviousReservationState(req, res, next) {
  try {
    // Obtiene el ID de la reserva del cuerpo de la petición
    const reservation_id = req.body && req.body.reservation_id;

    if (!reservation_id) {
      // Si no hay ID, no hay estado previo que capturar
      req.bookingAuditPreviousState = undefined;
      return next();  // Continúa al siguiente paso (el controlador)
    }

    // Busca la reserva actual en MongoDB
    const doc = await Reservation.findOne({ reservation_id });

    // Guarda una copia del estado actual en el objeto req
    req.bookingAuditPreviousState = doc ? cloneState(doc) : null;

    next();  // Continúa al controlador
  } catch (err) {
    return res.status(500).json({
      error: 'Error al preparar auditoría',
      detalle: err.message,
    });
  }
}
```

**¿Qué es `req`?** El objeto `req` (request) viaja por toda la cadena de middlewares y controladores. Al guardar datos en `req.bookingAuditPreviousState`, estamos "adjuntando" esa información a la petición para que el controlador pueda usarla más adelante.

---

#### `capturePreviousForNewReservation` — Para crear reservas nuevas

Se usa **antes** de crear una reserva nueva. Como la reserva aún no existe, no hay estado previo que capturar, así que simplemente establece `null`.

```javascript
function capturePreviousForNewReservation(req, res, next) {
  req.bookingAuditPreviousState = null;  // No hay estado previo
  next();  // Continúa al controlador
}
```

---

### 4. Controlador — `auditController.js`

📄 **Ubicación:** `controllers/auditController.js`

**¿Para qué sirve este archivo?**
Es el encargado de **devolver el historial de auditoría** cuando alguien lo consulta. Este es un controlador de **solo lectura**: no crea ni modifica registros de auditoría (eso lo hace `auditService.js`), solo los devuelve.

**Funciones que contiene:**

#### `puedeVerReserva(req, reservaDoc)` — Comprobar permisos

Determina si el usuario que hace la petición tiene permiso para ver la auditoría de una reserva:
- **Administradores y empleados:** Pueden ver la auditoría de cualquier reserva.
- **Clientes:** Solo pueden ver la auditoría de sus propias reservas.

```javascript
function puedeVerReserva(req, reservaDoc) {
  if (!reservaDoc) return false;
  // Admin y empleados pueden ver todo
  if (req.user.role === 'admin' || req.user.role === 'employee') return true;
  // Un cliente solo puede ver sus propias reservas
  return reservaDoc.user_id === req.user.user_id;
}
```

---

#### `getBookingAudit(req, res)` — Obtener el historial de auditoría

Recibe un `reservation_id` como parámetro en la URL, verifica que la reserva exista y que el usuario tenga permisos, y devuelve todos los registros de auditoría de esa reserva ordenados cronológicamente.

```javascript
async function getBookingAudit(req, res) {
  try {
    // 1. Extraer el ID de la reserva de la URL (ej: /reservation/RSV-00001/audit)
    const { reservation_id } = req.params;

    // 2. Verificar que la reserva existe
    const reserva = await Reservation.findOne({ reservation_id });
    if (!reserva) {
      return res.status(404).json({ error: 'Reserva no encontrada' });
    }

    // 3. Verificar permisos (dueño o personal)
    if (!puedeVerReserva(req, reserva)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    // 4. Buscar todos los registros de auditoría para esta reserva
    const lista = await BookingAuditLog.find({ booking_id: reservation_id })
      .sort({ timestamp: 1 })   // Ordenar del más antiguo al más reciente
      .lean();                    // .lean() devuelve objetos JS planos (más rápido)

    // 5. Devolver la lista
    res.json(lista);
  } catch (err) {
    res.status(500).json({ error: 'Error al leer auditoría', detalle: err.message });
  }
}
```

---

### 5. Rutas — `reservationRoutes.js`

📄 **Ubicación:** `routes/reservationRoutes.js`

**¿Para qué sirve este archivo?**
Define las **rutas HTTP** (URLs) que el servidor acepta y conecta cada ruta con su middleware y controlador correspondiente. Aquí se "cablea" todo el sistema de auditoría.

**Fragmento relevante para auditoría:**

```javascript
const {
  capturePreviousReservationState,
  capturePreviousForNewReservation,
} = require('../middleware/bookingAuditMiddleware');

// Todas las rutas de reservas requieren estar autenticado
router.use(requireLogin);

// CREAR reserva → middleware marca previous_state como null → controlador
router.post(
  '/add',
  capturePreviousForNewReservation,    // Middleware: no hay estado previo
  reservationController.addReservation, // Controlador: crea y registra auditoría
);

// CANCELAR reserva → middleware captura estado actual → controlador
router.post(
  '/cancel',
  capturePreviousReservationState,          // Middleware: guarda estado previo
  reservationController.cancelReservation,  // Controlador: cancela y registra auditoría
);

// ACTUALIZAR reserva → middleware captura estado actual → controlador
router.put(
  '/update',
  capturePreviousReservationState,          // Middleware: guarda estado previo
  reservationController.updateReservation,  // Controlador: actualiza y registra auditoría
);

// CONSULTAR historial de auditoría → controlador de auditoría
// Ejemplo: GET /reservation/RSV-00001/audit
router.get('/:reservation_id/audit', auditController.getBookingAudit);
```

**¿Cómo funciona el encadenamiento?**
Cada ruta puede tener varios pasos en cadena. Por ejemplo, al cancelar:
1. `requireLogin` → Verifica que el usuario esté autenticado.
2. `capturePreviousReservationState` → Lee la reserva actual y la guarda.
3. `cancelReservation` → Ejecuta la cancelación y registra la auditoría.

Cada paso llama a `next()` para pasar al siguiente. Si alguno falla, la cadena se detiene.

---

### 6. Integración en `reservationController.js`

📄 **Ubicación:** `controllers/reservationController.js`

**¿Cómo se conecta el controlador de reservas con la auditoría?**
El controlador importa las funciones `logBookingChange` y `actorTypeFromRole` del servicio de auditoría, y las llama **después** de que la operación sobre la reserva se complete con éxito.

```javascript
const { logBookingChange, actorTypeFromRole } = require('../services/auditService');
```

**Al crear una reserva (`addReservation`):**

```javascript
// Después de guardar la nueva reserva exitosamente...
await logBookingChange({
  booking_id: reservation.reservation_id,  // 'RSV-00001'
  action: 'CREATED',                       // Se creó una nueva reserva
  actor_id: req.user.user_id,              // Quién la creó
  actor_type: actorTypeFromRole(req.user.role),  // 'user' o 'employee'
  previous_state: req.bookingAuditPreviousState ?? null,  // null (no existía antes)
  new_state: reservation,                  // La reserva recién creada
});
```

**Al cancelar una reserva (`cancelReservation`):**

```javascript
// Después de marcar la reserva como cancelada...
await logBookingChange({
  booking_id: reservation.reservation_id,
  action: 'CANCELED',
  actor_id: req.user.user_id,
  actor_type: actorTypeFromRole(req.user.role),
  previous_state: req.bookingAuditPreviousState,  // Estado antes de cancelar
  new_state: reservation,                          // Estado con cancelation_date
});
```

**Al actualizar una reserva (`updateReservation`):**

```javascript
// Después de guardar los cambios...
await logBookingChange({
  booking_id: reservation.reservation_id,
  action: 'UPDATED',
  actor_id: req.user.user_id,
  actor_type: actorTypeFromRole(req.user.role),
  previous_state: req.bookingAuditPreviousState,  // Estado antes de actualizar
  new_state: reservation,                          // Estado con los nuevos datos
});
```

> **Patrón clave:** La auditoría solo se registra **después** de que la operación se complete con éxito. Si la validación falla (por ejemplo, la habitación está ocupada), no se crea ningún registro de auditoría.

---

## 📘 Ejemplo completo de flujo

### Escenario: Un empleado cancela la reserva `RSV-00003`

**1. Petición HTTP:**
```
POST /reservation/cancel
Headers: { Authorization: "Bearer <token_del_empleado>" }
Body: { "reservation_id": "RSV-00003", "price": 50 }
```

**2. Middleware `capturePreviousReservationState`:**
- Lee `RSV-00003` de MongoDB.
- Guarda una copia del estado actual (con `price: 200`, sin `cancelation_date`) en `req.bookingAuditPreviousState`.

**3. Controlador `cancelReservation`:**
- Valida que la reserva existe y no está ya cancelada.
- Actualiza `price` a `50` y establece `cancelation_date` con la fecha actual.
- Guarda los cambios en MongoDB.

**4. Llamada a `logBookingChange`:**
- Crea un nuevo documento en `booking_audit_log`:

```json
{
  "booking_id": "RSV-00003",
  "action": "CANCELED",
  "actor_id": "EMP-00001",
  "actor_type": "employee",
  "previous_state": {
    "reservation_id": "RSV-00003",
    "room_id": "HAB-101",
    "user_id": "CLI-00002",
    "check_in": "2026-06-01T12:00:00.000Z",
    "check_out": "2026-06-05T11:00:00.000Z",
    "price": 200,
    "cancelation_date": null
  },
  "new_state": {
    "reservation_id": "RSV-00003",
    "room_id": "HAB-101",
    "user_id": "CLI-00002",
    "check_in": "2026-06-01T12:00:00.000Z",
    "check_out": "2026-06-05T11:00:00.000Z",
    "price": 50,
    "cancelation_date": "2026-05-11T01:18:00.000Z"
  },
  "timestamp": "2026-05-11T01:18:00.000Z"
}
```

**5. Consultar el historial después:**
```
GET /reservation/RSV-00003/audit
Headers: { Authorization: "Bearer <token>" }
```

Devuelve un array con **todos** los registros de esa reserva (creación, modificaciones y cancelación), ordenados del más antiguo al más reciente.

---
