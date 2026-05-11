# API Proyecto Intermodular

---

## Puesta en marcha

```bash
npm install
```

Crear `.env` en la raíz del proyecto (copiar de un ejemplo propio) con al menos:

| Variable     | Uso |
|-------------|-----|
| `MONGO_URI` | Cadena de conexión Atlas (o Mongo local). |
| `PORT`      | Puerto del servidor (por defecto 3000). |
| `JWT_SECRET`| Firma de tokens JWT. |

```bash
npm start
```

---

## Auditoría de reservas (desde el modelo hasta lectura HTTP)

Objetivo (requisitos P11): registrar cada cambio relevante sobre una reserva y poder consultar el historial **solo lectura**.

### 1. Modelo `BookingAuditLog` (`models/BookingAuditLog.js`)

Define la colección Mongo **`booking_audit_log`**. Cada documento guarda:

| Campo             | Significado |
|-------------------|-------------|
| `booking_id`      | ID de negocio de la reserva (`RSV-xxxxx`), no el `_id` interno. |
| `action`          | Tipo de operación (`CREATED`, `UPDATED`, `CANCELED`, etc.). |
| `actor_id`        | `user_id` de quien hizo la acción. |
| `actor_type`      | `'user'` (cliente) o `'employee'` (empleado/admin). |
| `previous_state`  | Snapshot JSON del estado **antes** del cambio (o `null` en alta). |
| `new_state`       | Snapshot JSON del estado **después** del cambio. |
| `timestamp`       | Fecha/hora del evento (índice para ordenar). |

Índice compuesto `(booking_id, timestamp)` para listados ordenados por tiempo.

### 2. Servicio `auditService` (`services/auditService.js`)

Lógica reutilizable:

- **`actorTypeFromRole(role)`** — Mapea roles de la app al enum del modelo: `client` → `'user'`, el resto → `'employee'`.
- **`cloneState(doc)`** — Convierte el documento Mongoose (u objeto) en un **clon profundo** con `JSON`, para no guardar referencias mutables en el log.
- **`logBookingChange(...)`** — Inserta un registro en `booking_audit_log`. Vuelve a clonar `previous_state` y `new_state` por seguridad. Si falla el insert, escribe error en consola **sin tumbar** la petición principal de reserva.

### 3. Middleware `bookingAuditMiddleware` (`middleware/bookingAuditMiddleware.js`)

Cumple la parte “**leer estado anterior desde Mongo antes de la operación**”:

- **`capturePreviousReservationState`** — Antes de **cancelar** o **actualizar**, lee `req.body.reservation_id`, busca la reserva y guarda una copia en **`req.bookingAuditPreviousState`**. Si no hay `reservation_id` en el body, deja el campo sin definir; si no existe la reserva, `null`.
- **`capturePreviousForNewReservation`** — En **alta** de reserva no hay documento previo: fuerza **`req.bookingAuditPreviousState = null`**.

El controlador de reservas usa ese valor como `previous_state` al llamar a `logBookingChange` **después** de guardar con éxito (así no se registra auditoría si la validación falla).

### 4. Controlador `auditController` (`controllers/auditController.js`)

- **`getBookingAudit`** — Endpoint de **consulta**: comprueba que la reserva exista y que el usuario sea **dueño** (cliente) o **admin/empleado**; luego devuelve todos los logs de `booking_audit_log` para ese `booking_id`, ordenados por `timestamp` ascendente. No hay endpoints para borrar ni editar logs.

### 5. Rutas y cableado

- Escritura del log: dentro de **`reservationController`** tras crear / actualizar / cancelar reserva, llamando a `logBookingChange` con estados coherente con el middleware.
- Lectura: **`GET /reservation/:reservation_id/audit`** (requiere login), definida en `routes/reservationRoutes.js` y delegada en `auditController.getBookingAudit`.

### Flujo resumido

1. Petición que modifica reserva pasa por middleware → queda el **estado previo** en `req` cuando aplica.
2. El controlador valida, actualiza Mongo y, si todo va bien, llama a **`logBookingChange`** con `previous_state` y `new_state`.
3. Consulta del historial con **`GET .../audit`** sin alterar la colección de auditoría.

---

## Estructura de carpetas relevante

```
models/BookingAuditLog.js
services/auditService.js
middleware/bookingAuditMiddleware.js
controllers/auditController.js
controllers/reservationController.js   # llamadas a logBookingChange
routes/reservationRoutes.js
db.js
index.js
```
