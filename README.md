# API — Propuestas P11, P5, P9 y P19

Documentación de la API para las cuatro propuestas implementadas en el Proyecto Individual. El resto del sistema (auth, usuarios, habitaciones CRUD, reseñas, mailer, etc.) corresponde al proyecto intermodular base.

Clientes: [WPF](../WPF-Intermodular-Ysael/README.md) · [Android](../APP-Intermodular-Ysael/README.md)

---

## P11 · Auditoría completa de cambios en la reserva

Cada acción relevante sobre una reserva queda registrada en un log **solo lectura** (no hay endpoints de edición ni borrado del historial).

### Colección `booking_audit_log`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `booking_id` | String | ID de la reserva (`RSV-xxxxx`; mismo valor que `reservation_id`) |
| `action` | String | `CREATED`, `UPDATED` o `CANCELED` |
| `actor_id` | String | `user_id` de quien ejecutó la acción |
| `actor_type` | String | `user` (cliente) o `employee` (empleado/admin) |
| `previous_state` | Mixed | Snapshot JSON de la reserva **antes** del cambio (`null` en alta) |
| `new_state` | Mixed | Snapshot JSON **después** del cambio |
| `timestamp` | Date | Fecha y hora del evento |

### Middleware de auditoría

`middleware/bookingAuditMiddleware.js` intercepta la petición **antes** del controlador y guarda una copia del documento actual en `req.bookingAuditPreviousState`. Tras un guardado exitoso, `services/auditService.js` → `logBookingChange()` inserta la fila.

**Rutas que generan log** (si la auditoría está activada):

| Ruta | `action` |
|------|----------|
| `POST /reservation/add` | `CREATED` |
| `PATCH /reservation/update` | `UPDATED` |
| `POST /reservation/cancel` · `DELETE /reservation/cancel/:id` | `CANCELED` |
| `POST /reservation/checkout` | `UPDATED` (asignación de factura y cierre) |
| `POST /reservation/check-in` | `UPDATED` (check-in en recepción) |

La escritura puede desactivarse con `booking_audit_enabled` en `operationalsettings` o `BOOKING_AUDIT_ENABLED` en `.env`. Si está desactivada, las reservas siguen funcionando pero no se insertan nuevas líneas.

### Endpoints (solo lectura)

| Método | Ruta | Función |
|--------|------|---------|
| `GET` | `/reservation/:reservation_id/audit` | Historial **cronológico** de una reserva. El cliente solo ve las suyas; admin/empleado ve cualquiera. Cada ítem incluye `resumen_cambios` (texto) y `detalle_cambios` (array `campo`, `etiqueta`, `antes`, `despues`) calculados al vuelo comparando `previous_state` y `new_state`. |
| `GET` | `/reservation/audits` | Mismo formato para **todas** las reservas (solo admin/empleado). |

> La propuesta cita `GET /bookings/:id/audit`. En esta implementación el historial está en `/reservation/:reservation_id/audit` (`:id` = `RSV-xxxxx`). No existe ruta de modificación ni borrado del log.

**Archivos:** `models/BookingAuditLog.js`, `middleware/bookingAuditMiddleware.js`, `services/auditService.js`, `controllers/auditController.js`.

---

## P5 · Factura en PDF descargable

Factura fiscal completa en PDF, generada al vuelo con **pdfkit** (no se guarda el archivo en disco en el servidor).

### Campos en la reserva

| Campo | Cuándo se rellena |
|-------|-------------------|
| `invoice_number` | En `POST /reservation/checkout` (recepción). Formato configurable vía `.env` (`INVOICE_NUMBER_*`, por defecto `FAC-AAAA-NNNN`). |
| `checkout_completed_at` | Misma operación de checkout |
| `invoice_breakdown` | Desglose congelado: noches, alojamiento, oferta habitación, descuento cliente, extras, IVA, total TTC |

La numeración es automática: siguiente secuencial por año/patrón configurado, con índice único en `invoice_number`.

### Endpoints

| Método | Ruta | Función |
|--------|------|---------|
| `POST` | `/reservation/checkout` | Cierra la estancia y **asigna** `invoice_number` + `invoice_breakdown`. Solo admin/empleado. Requiere que la fecha de salida ya haya pasado. |
| `GET` | `/reservation/:reservation_id/invoice` | Genera y devuelve el **PDF de factura** (`application/pdf`). Incluye datos del hotel (`.env` + `InvoiceSettings`), cliente (DNI; empresa si `billing_company_name` / `billing_company_cif`), estancia, tabla de conceptos, base imponible, IVA y total. Query opcional `?invoice_number=FAC-…` si hay varias facturas asociadas a la misma reserva. |
| `GET` | `/invoices?userId=CLI-xxxxx` | **Historial de facturas** del cliente desde la colección `hotelinvoices` (y sincronización con reservas legacy). El cliente solo puede consultar su propio `userId`. |
| `GET` | `/reservation/invoices/history` | Listado global de facturas emitidas (admin/empleado). |
| `POST` | `/reservation/:reservation_id/invoice/email` | Reenvía el PDF por correo (Nodemailer; requiere SMTP). |
| `GET` | `/settings/invoice` | Lee configuración del encabezado fiscal (nombre hotel, CIF, dirección, IVA). |
| `PUT` | `/settings/invoice` | Guarda overrides en Mongo (`InvoiceSettings`). |

> La propuesta cita `GET /bookings/:id/invoice`. La ruta implementada es `GET /reservation/:reservation_id/invoice`.

**Archivos:** `services/invoicePdfService.js`, `services/invoiceBreakdownService.js`, `services/invoiceNumberService.js`, `controllers/invoiceController.js`, `controllers/reservationController.js` (checkout), `models/HotelInvoice.js`, `models/InvoiceSettings.js`.

---

## P9 · Historial de estancias y estadísticas personales

Permite al huésped (y a recepción sobre un cliente) ver estancias pasadas y métricas agregadas. Complemento en app: `GET /loyalty/me` para rango de fidelidad usado también por P19.

### Endpoints de historial y estadísticas

| Método | Ruta | Función |
|--------|------|---------|
| `GET` | `/users/:id/history` | Reservas **paginadas** con datos de habitación, importe (`total_paid`), noches y valoración si existe. Por defecto estancias `completed`. |
| `GET` | `/users/:id/stats` | Totales: noches, gasto, temporada favorita, habitación más reservada, racha máxima, última estancia, etc. |
| `GET` | `/user/:userId/history` | Alias de `history` (mismo handler). |
| `GET` | `/user/:userId/stats` | Alias de `stats`. |
| `GET` | `/loyalty/me` | Cliente autenticado: recalcula y devuelve `loyalty_tier`, `total_nights`, `total_spent`, `completed_stays_count` y umbrales (persistido en `ClientLoyaltyStats`). |
| `GET` | `/loyalty/user/:userId` | Mismas métricas de un cliente (admin/empleado). |

**Autorización:** el cliente solo puede acceder a su propio `:id` / `:userId`; admin y empleado a cualquiera.

### Filtros opcionales (`GET …/history` y `…/stats`)

| Query | Efecto |
|-------|--------|
| `?year=2026` | Estancias con `check_in` en ese año |
| `?room_type=Suite` | Filtra por tipo de habitación (coincidencia parcial en `Room.type`) |
| `?status=completed` | `completed` (defecto), `active`, `cancelled` o `all` |
| `?page=1&limit=10` | Paginación (`limit` máx. 50) |
| `?from=` · `?to=` | Rango de fechas adicional |

**Archivos:** `services/userStayService.js`, `services/clientLoyaltyStatsService.js`, `controllers/userStayController.js`, `controllers/loyaltyStatsController.js`, `routes/usersRoutes.js`, `routes/loyaltyRoutes.js`, `models/ClientLoyaltyStats.js`.

---

## P19 · Check-in anticipado y check-out tardío

Programa de flexibilidad horaria ligado al **nivel de fidelidad** (P9). Los campos viven en el documento de reserva (`reservations`), no en una colección aparte.

### Campos en `Reservation`

| Campo | Descripción |
|-------|-------------|
| `early_checkin_requested` | Objeto o `null`: hora solicitada, `status` (`pending` / `approved` / `rejected`), tarifas, `final_fee`, `auto_approved`, etc. |
| `late_checkout_requested` | Igual para salida después de las 11:00 el **mismo día** de `check_out` |

### Endpoints

| Método | Ruta | Función |
|--------|------|---------|
| `PATCH` | `/bookings/:id/request-early-checkin` | Solicita entrada antes de las 12:00 el día de `check_in`. Body: `{ "requested_time": "ISO" }`. Comprueba disponibilidad de la habitación en la franja. |
| `PATCH` | `/bookings/:id/request-late-checkout` | Solicita salida tardía el día de `check_out`. Body: hora y opcional `"mode": "facilities"`. |
| `GET` | `/bookings/:id/flexibility` | Estado de solicitudes, rango del cliente y vista previa del suplemento (`fee_preview`). |
| `GET` | `/bookings/flexibility/pending` | Cola de solicitudes `pending` del día (recepción). Query `?day=YYYY-MM-DD`. |
| `PATCH` | `/bookings/:id/flexibility/early-checkin/review` | Admin/empleado: aprueba o rechaza; **revalida** disponibilidad al aprobar. |
| `PATCH` | `/bookings/:id/flexibility/late-checkout/review` | Igual para salida tardía. |
| `GET` | `/settings/flexibility` | Lee reglas: €/h, descuentos por rango, niveles con acceso gratuito, auto-aprobación plata/oro. |
| `PUT` | `/settings/flexibility` | Guarda reglas en `FlexibilitySettings`. |

Existen **alias** bajo `/reservation/:reservation_id/…` (mismos controladores).

### Lógica de negocio

1. **Disponibilidad:** si la habitación está ocupada en la franja solicitada → `rejected` (todos los rangos).
2. **Fidelidad** (`ClientLoyaltyStats.loyalty_tier`): **plata** y **oro** → `approved` automático si hay hueco (`auto_approved: true`). **Bronce** → `pending` hasta revisión en WPF.
3. **Suplemento:** horas de diferencia × €/h (configurable); descuento % según rango; mínimo de horas facturables; tope opcional.
4. **Notificación al cliente:** email al aprobar/rechazar si SMTP configurado (`flexibilityNotificationService.js`). Si hay cargo, se puede emitir factura en `hotelinvoices`.

**Archivos:** `controllers/flexibilityController.js`, `services/flexibilityProgramService.js`, `services/flexibilitySettingsService.js`, `services/flexibilityNotificationService.js`, `routes/bookingRoutes.js`.

---

## Variables de entorno (propuestas)

| Variable | Propuesta |
|--------|-----------|
| `BOOKING_AUDIT_ENABLED` | P11 — activar log por defecto |
| `HOTEL_INVOICE_*`, `INVOICE_*`, `INVOICE_IVA_RATE` | P5 — PDF y numeración |
| `LOYALTY_*` | P9 / P19 — umbrales bronce/plata/oro |
| `FLEX_*` | P19 — tarifas €/h y auto-aprobación (fallback si no hay doc en Mongo) |
| `EMAIL_*` | P19 (y reenvío factura P5) — notificaciones por correo |

```bash
npm install && npm start
```
