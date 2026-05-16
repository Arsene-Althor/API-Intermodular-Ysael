//Controlers para Reservas
const Reservation = require('../models/Reservation');
const User = require('../models/User');
const Room = require('../models/Room');
const { logBookingChange, actorTypeFromRole } = require('../services/auditService');
const {
  computeInvoiceBreakdown,
  loadExtraDocsForRoom,
} = require('../services/invoiceBreakdownService');
const { nextInvoiceNumber } = require('../services/invoiceNumberService');
const { evaluateReceptionCheckIn } = require('../services/receptionCheckInService');
const { syncClientLoyaltyStats } = require('../services/clientLoyaltyStatsService');
const { emitHotelInvoice } = require('../services/invoiceEmissionService');

async function syncLoyaltyForUser(userId) {
  try {
    await syncClientLoyaltyStats(userId);
  } catch (e) {
    console.error('syncClientLoyaltyStats', userId, e.message);
  }
}

// Quién puede ver o tocar una reserva concreta (dueño del cliente o personal)
function puedeVerReserva(req, reservaDoc) {
  if (!reservaDoc) return false;
  if (req.user.role === 'admin' || req.user.role === 'employee') return true;
  return reservaDoc.user_id === req.user.user_id;
}

//Función para comprobar ocupación (acepta Date ya normalizados o strings parseables)
async function checkOcupation(check_in, check_out, room_id, reservation_id) {
  const nuevaEntrada =
    check_in instanceof Date ? new Date(check_in.getTime()) : new Date(check_in);
  nuevaEntrada.setHours(12, 0, 0, 0);

  const nuevaSalida =
    check_out instanceof Date ? new Date(check_out.getTime()) : new Date(check_out);
  nuevaSalida.setHours(11, 0, 0, 0);

  //Comprobamos que la habitación no este ya reservada o cancelada exceptuando la misma habitación
  //Ya que este metodo lo vamos a utilizar para actualizar y para insertar
  let reservations = await Reservation.find({ room_id: room_id, cancelation_date: null });
  let correcto = true;
  if (reservations.length != 0) {
    for (let r of reservations) {
      if (r.reservation_id != reservation_id) {
        if (nuevaEntrada < r.check_out && nuevaSalida > r.check_in) {
          correcto = false;
          break;
        }
      }
    }
  }

  if (correcto) {
    return { error: 'correcto', respuesta: true };
  } else {
    return { error: 'La habitación ya se encuentra ocupada', respuesta: false };
  }

}
// Añadir reserva
async function addReservation(req, res) {
  try {
    const { room_id, user_id, check_in, check_out, price } = req.body;
    if (!room_id || !user_id || !check_in || !check_out || !price) {
      return res.status(400).json({ error: 'Faltan datos' });
    }

    const createdBy = req.user.user_id;

    if (req.user.role === 'client' && String(user_id).trim() !== String(req.user.user_id).trim()) {
      return res.status(403).json({ error: 'No puedes crear reservas para otro usuario' });
    }

    //Validaciones para datos introducidos
    let user = await User.findOne({ user_id });
    if (!user) return res.status(400).json({ error: 'El usuario introducido no exite' });

    let room = await Room.findOne({ room_id });
    if (!room) return res.status(400).json({ error: 'La habitación introducida no existe' });


    const precioNum = Number.parseFloat(price).valueOf();

    if (isNaN(precioNum) || precioNum <= 0) {
      return res.status(400).json({ error: 'Precio no válido' });
    }

    let nuevaEntrada = new Date(check_in);
    nuevaEntrada.setHours(12, 0, 0, 0);

    let nuevaSalida = new Date(check_out);
    nuevaSalida.setHours(11, 0, 0, 0);

    //Permitiremos reservas el mismo dia que entrada o en su defecto antes de las 12 del dia actual
    let ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    ayer.setHours(12, 0);

    if (nuevaEntrada < ayer) return res.status(400).json({ error: 'La fecha de entrada no puede ser inferior a la fecha actual'});
    if (nuevaEntrada >= nuevaSalida) return res.status(400).json({ error: 'La fecha de entrada no puede ser superiror a la de salida'})

    let new_id;
    const idRegex = /^RSV-(\d{5})$/;
    const todas = await Reservation.find({ reservation_id: { $regex: /^RSV-\d{5}$/ } })
      .select('reservation_id')
      .lean();
    let maxNum = 0;
    for (const d of todas) {
      const m = idRegex.exec(String(d.reservation_id || ''));
      if (m) {
        const n = parseInt(m[1], 10);
        if (!Number.isNaN(n) && n > maxNum) maxNum = n;
      }
    }
    new_id = `RSV-${String(maxNum + 1).padStart(5, '0')}`;

    // Misma normalización de fechas que se persiste
    let verif = await checkOcupation(nuevaEntrada, nuevaSalida, room_id);

    if (verif.respuesta) {
      let reservation = new Reservation({ reservation_id: new_id, room_id, user_id, check_in: nuevaEntrada, check_out: nuevaSalida, price: precioNum, createdBy });
      await reservation.save();

      // Auditoría: reserva nueva (middleware dejó bookingAuditPreviousState en null)
      await logBookingChange({
        booking_id: reservation.reservation_id,
        action: 'CREATED',
        actor_id: req.user.user_id,
        actor_type: actorTypeFromRole(req.user.role),
        previous_state: req.bookingAuditPreviousState ?? null,
        new_state: reservation,
      });

      await syncLoyaltyForUser(user_id);

      if (req.user.role === 'client') {
        try {
          await emitHotelInvoice({
            reservationId: reservation.reservation_id,
            type: 'reservation',
            amount: precioNum,
          });
          reservation = await Reservation.findOne({ reservation_id: new_id });
        } catch (invErr) {
          if (invErr.status !== 409) {
            console.error('emitHotelInvoice on addReservation', invErr);
          }
        }
      }

      return res.json(reservation)
    } else {
      return res.status(400).json({ error: verif.error })
    }

  } catch (err) {
    console.error(err);
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Datos de reserva no válidos',
        detalle: err.message,
        erroresValidacion: err.errors,
      });
    }
    if (err.code === 11000) {
      const key = err.keyPattern ? Object.keys(err.keyPattern)[0] : '';
      if (key === 'invoice_number') {
        return res.status(500).json({
          error: 'Índice de facturas en MongoDB desactualizado',
          detalle:
            'En la carpeta de la API ejecuta una vez: node scripts/fix-reservation-invoice-index.js y reinicia el servidor.',
        });
      }
      return res.status(409).json({
        error: 'Identificador duplicado; vuelve a intentar',
        detalle: err.message,
      });
    }
    res.status(500).json({ error: 'Error al insertar reserva', detalle: err.message, erroresValidacion: err.errors });
  }
}

// Cancelar una reserva (POST body o DELETE /cancel/:reservation_id + price en body o query)
async function cancelReservation(req, res) {
  try {
    const reservation_id =
      (req.body && req.body.reservation_id) || (req.params && req.params.reservation_id);
    let price = req.body && req.body.price;
    if (price === undefined && req.query && req.query.price !== undefined) {
      price = req.query.price;
    }
    if (!reservation_id || price === undefined) {
      return res.status(400).json({ error: 'Faltan datos' });
    }

    const reservation = await Reservation.findOne({ reservation_id });
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrado' });

    if (!puedeVerReserva(req, reservation)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    if (reservation.cancelation_date !== null) {
      return res.status(400).json({ error: 'La reserva ya estaba cancelada anteriormente' });
    }

    let newPrice = parseFloat(price);
    if (isNaN(newPrice) || newPrice < 0) {
      return res.status(400).json({ error: "El precio debe ser un número mayor o igual a 0" });
    }

    reservation.price = newPrice;
    reservation.cancelation_date = new Date();
    await reservation.save();

    await logBookingChange({
      booking_id: reservation.reservation_id,
      action: 'CANCELED',
      actor_id: req.user.user_id,
      actor_type: actorTypeFromRole(req.user.role),
      previous_state: req.bookingAuditPreviousState,
      new_state: reservation,
    });

    await syncLoyaltyForUser(reservation.user_id);

    res.json({ mensaje: 'Cancelada correctamente', reservation });
  } catch (err) {
    res.status(500).json({ error: 'Error al cancelar la reserva ', detalle: err.message });
  }
}

// Obtener una reserva
async function getReservation(req, res) {
  try {
    const { reservation_id } = req.body;
    const reservation = await Reservation.findOne({ reservation_id })
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });
    res.json(reservation);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener la reserva', detalle: err.message });
  }
}

// Obtener todas las reservas
async function getAllReservations(req, res) {
  try {
    const reservations = await Reservation.find();
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: 'Error al listar las reservas', detalle: err.message });
  }
}

//Obtener reservas Activas
async function getActiveReservations(req, res) {
  try{
    let hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const reservations = await Reservation.find({cancelation_date : null, check_out: { $gte: hoy }}).lean();
    if(!reservations || reservations.length === 0){
      return res.status(200).json([]);
    }
    const roomIds = [...new Set(reservations.map(r => String(r.room_id).trim()))];
    const rooms = await Room.find({ room_id: { $in: roomIds } }).select('room_id image').lean();
    const imgByRoom = Object.fromEntries(rooms.map(r => [String(r.room_id).trim(), r.image]));

    const userIds = [...new Set(reservations.map(r => String(r.user_id).trim()))];
    const users = await User.find({ user_id: { $in: userIds } })
      .select('user_id name surname dni')
      .lean();
    const userById = Object.fromEntries(users.map(u => [String(u.user_id).trim(), u]));

    const enriched = reservations.map(r => {
      const rid = String(r.room_id).trim();
      const img = imgByRoom[rid];
      const u = userById[String(r.user_id).trim()];
      const guestName = u ? `${u.name || ''} ${u.surname || ''}`.trim() : null;
      return {
        ...r,
        room_image: img || null,
        guest_name: guestName || null,
        guest_dni: u?.dni || null,
      };
    });
    res.json(enriched)

  }catch(err){
    res.status(500).json({ error: 'Error al listar las reservas', detalle: err.message });
  }
}

//Obtener las reservas del usuario logeado
async function getMine(req, res) {
  try {
    const user_id = req.user.user_id;
    const reservations = await Reservation.find({
      user_id,
      cancelation_date: null,
      $or: [
        { superseded_by_reservation_id: null },
        { superseded_by_reservation_id: '' },
        { superseded_by_reservation_id: { $exists: false } },
      ],
    }).lean();
    if (!reservations) return res.status(404).json({ error: 'El usuario no dispone de reservas' });
    res.json(reservations);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener reservas', detalle: err.message });
  }
}

// Modificar reserva
async function updateReservation(req, res) {
  try {
    const { reservation_id, room_id, user_id, check_in, check_out, price } = req.body;

    const reservation = await Reservation.findOne({ reservation_id });
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (reservation.cancelation_date != null) return res.status(404).json({ error: 'No es posible modificar reservas canceladas' });

    if (!puedeVerReserva(req, reservation)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    let user = await User.findOne({ user_id });
    if (!user) return res.status(400).json({ error: 'El usuario introducido no exite' });

    let room = await Room.findOne({ room_id });
    if (!room) return res.status(400).json({ error: 'La habitación introducida no existe' });

    //Falta validación para que no se pueda modifcar la fecha de entrada una vez pasada la fecha de entrada
    let nuevaEntrada = new Date(check_in);
    nuevaEntrada.setHours(12, 0, 0, 0);

    let nuevaSalida = new Date(check_out);
    nuevaSalida.setHours(11, 0, 0, 0);

    let hoy = new Date();

    if(hoy >= reservation.check_in && nuevaEntrada > reservation.check_in ) return res.status(400).json({ error: 'No es posible modificar la entrada de una reserva en curso' });
    if(nuevaEntrada >= nuevaSalida) return res.status(400).json({ error: 'La fecha de entrada no puede superar la fecha de salida' });

    if (reservation.check_in <= hoy || !check_in) {
      nuevaEntrada = reservation.check_in;
      if (nuevaSalida < hoy) {
        return res.status(400).json({ error: 'La reserva está vencida; no se puede modificar' });
      }
    }

    const precioNum = Number.parseFloat(price).valueOf();

    if (isNaN(precioNum) || precioNum <= 0) {
      return res.status(400).json({ error: 'El nuevo precio de la reserva no es valido' });
    }
    

    //Validación habitacion no ocupada (mismas fechas normalizadas que se guardan)
    let verif = await checkOcupation(nuevaEntrada, nuevaSalida, room_id, reservation_id);

    if (verif.respuesta) {
      reservation.room_id = room_id;
      reservation.check_in = nuevaEntrada;
      reservation.check_out = nuevaSalida;
      reservation.user_id = user_id;
      reservation.price = precioNum;
      await reservation.save();

      await logBookingChange({
        booking_id: reservation.reservation_id,
        action: 'UPDATED',
        actor_id: req.user.user_id,
        actor_type: actorTypeFromRole(req.user.role),
        previous_state: req.bookingAuditPreviousState,
        new_state: reservation,
      });

      return res.json({ mensaje: 'Reserva modificada correctamente', reservation });
    } else {
      return res.status(400).json({ error: verif.error })
    }

  } catch (err) {
    res.status(500).json({ error: 'Error al realizar la actualización ', detalle: err.message });
  }
}

//Funcion para calcular Precio 
async function calculatePrice(req, res) {
  try {
    const { room_id, user_id, check_in, check_out } = req.body;
    if (!user_id || !room_id || !check_in || !check_out) return res.status(404).json({ error: 'Faltan datos' });

    //Validamos que los datos sean correctos

    const user = await User.findOne({ user_id });
    const room = await Room.findOne({ room_id });

    if (!user || !room) return res.status(404).json({ error: 'Los datos introducidos no son validos' });

    let nuevaEntrada = new Date(check_in);
    nuevaEntrada.setHours(12, 0, 0, 0);

    let nuevaSalida = new Date(check_out);
    nuevaSalida.setHours(11, 0, 0, 0);

    const diferencia = nuevaSalida - nuevaEntrada;

    const dias = Math.ceil(diferencia / (1000 * 60 * 60 * 24));
    if (!Number.isFinite(dias) || dias < 1) {
      return res.status(400).json({ error: 'Rango de fechas inválido (se requiere al menos 1 noche)' });
    }

    const base = Number(room.price_per_night) || 0;
    let nightly = base;
    if (room.offer_active && room.offer_percent > 0 && room.offer_percent <= 100) {
      nightly = Math.round(base * (1 - room.offer_percent / 100) * 100) / 100;
    }

    let precioReserva = dias * nightly;

    const discountRate = Math.min(1, Math.max(0, Number(user.discount) || 0));
    const descuento = precioReserva * discountRate;
    precioReserva = precioReserva - descuento;

    const precioFinal = Number.isFinite(precioReserva) ? Number(precioReserva.toFixed(2)) : 0;
    return res.json({ precio: precioFinal })

  } catch (err) {
    res.status(500).json({ error: 'Error al obtener precio', detalle: err.message });
  }

}
//Función para calcular el precio de la reserva tras la cancelación
async function calculateCancelationPrice(req, res) {
  try {
    const { reservation_id, cancelation_date } = req.body;
    if (!reservation_id || !cancelation_date) return res.status(404).json({ error: 'Faltan datos' });

    //Validamos que los datos sean correctos

    const reservation = await Reservation.findOne({ reservation_id });

    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });

    let fechacancelacion = new Date(cancelation_date);
    let fechaReserva = new Date(reservation.check_in);

    const diferenciaMs = fechaReserva - fechacancelacion;

    const diasFaltantes = Math.ceil(diferenciaMs / (1000 * 60 * 60 * 24));

    let precioCancel = reservation.price;
    let discount = 0;

    if (diasFaltantes <= 0) {
      return res.status(404).json({ error: 'No es posible cancelar la reserva en la fecha actual' });
    } else if (diasFaltantes >= 7) {
      discount = precioCancel * 1;
    } else if (diasFaltantes >= 3) {
      discount = precioCancel * 0.5;
    } else if (diasFaltantes >= 1) {
      discount = precioCancel * 0.15;
    }

    precioCancel = precioCancel - discount;
    let conDosDecimales = Number(precioCancel.toFixed(2));

    return res.json({ precio: conDosDecimales })

  } catch (err) {
    res.status(500).json({ error: 'Error al obtener precio', detalle: err.message });
  }

}

/** GET /reservation/:reservation_id/check-in-status — ventana horaria y si puede registrarse (personal). */
async function getReceptionCheckInStatus(req, res) {
  try {
    const { reservation_id } = req.params;
    const reservation = await Reservation.findOne({ reservation_id }).lean();
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (!puedeVerReserva(req, reservation)) {
      return res.status(403).json({ error: 'No autorizado' });
    }

    const clientUser = await User.findOne({ user_id: reservation.user_id })
      .select('name surname dni email user_id')
      .lean();

    const evalResult = evaluateReceptionCheckIn(reservation);
    const guestName = clientUser
      ? `${clientUser.name || ''} ${clientUser.surname || ''}`.trim()
      : null;

    let message = '';
    switch (evalResult.status) {
      case 'already':
        message = 'Check-in ya registrado en recepción.';
        break;
      case 'cancelled':
        message = 'Reserva cancelada.';
        break;
      case 'expired':
        message = 'La estancia ya ha finalizado; no se puede registrar check-in.';
        break;
      case 'too_early':
        message = `Fuera de horario: el check-in en recepción abre el ${evalResult.window_start.toISOString().slice(0, 16).replace('T', ' ')}.`;
        break;
      case 'normal':
        message = 'Dentro del horario estándar de check-in (recepción).';
        break;
      case 'late':
        message = `Check-in fuera de horario. Se puede registrar con recargo de ${evalResult.late_fee} €.`;
        break;
      default:
        message = '';
    }

    return res.json({
      reservation_id,
      status: evalResult.status,
      message,
      can_register: evalResult.status === 'normal' || evalResult.status === 'late',
      requires_late_confirmation: evalResult.status === 'late',
      late_fee: evalResult.late_fee ?? 0,
      window_start: evalResult.window_start ?? null,
      window_end: evalResult.window_end ?? null,
      reception_check_in_at: reservation.reception_check_in_at ?? null,
      reception_check_in_late: Boolean(reservation.reception_check_in_late),
      reception_check_in_late_fee: reservation.reception_check_in_late_fee ?? 0,
      guest_name: guestName,
      guest_dni: clientUser?.dni ?? null,
      guest_email: clientUser?.email ?? null,
      check_in: reservation.check_in,
      check_out: reservation.check_out,
      room_id: reservation.room_id,
      price: reservation.price,
    });
  } catch (err) {
    console.error('getReceptionCheckInStatus', err);
    return res.status(500).json({ error: 'Error al consultar check-in', detalle: err.message });
  }
}

/** POST /reservation/check-in — solo personal. Registra llegada en recepción. */
async function registerReceptionCheckIn(req, res) {
  try {
    const { reservation_id, accept_late } = req.body;
    if (!reservation_id) return res.status(400).json({ error: 'Falta reservation_id' });

    const reservation = await Reservation.findOne({ reservation_id });
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });

    const evalResult = evaluateReceptionCheckIn(reservation);
    if (evalResult.status === 'already') {
      return res.status(400).json({
        error: 'Check-in ya registrado',
        reception_check_in_at: reservation.reception_check_in_at,
      });
    }
    if (evalResult.status === 'cancelled') {
      return res.status(400).json({ error: 'Reserva cancelada' });
    }
    if (evalResult.status === 'expired') {
      return res.status(400).json({ error: 'La estancia ya ha finalizado' });
    }
    if (evalResult.status === 'too_early') {
      return res.status(400).json({
        error: 'Fuera del horario de check-in',
        detalle: `Ventana desde ${evalResult.window_start.toISOString()}`,
        window_start: evalResult.window_start,
        window_end: evalResult.window_end,
      });
    }
    if (evalResult.status === 'late') {
      if (!accept_late) {
        return res.status(400).json({
          error: 'Check-in tardío: confirme el recargo',
          late_fee: evalResult.late_fee,
          requires_late_confirmation: true,
        });
      }
      const fee = evalResult.late_fee;
      reservation.reception_check_in_late = true;
      reservation.reception_check_in_late_fee = fee;
      reservation.price = Math.round((Number(reservation.price) + fee) * 100) / 100;
    } else {
      reservation.reception_check_in_late = false;
      reservation.reception_check_in_late_fee = 0;
    }

    const now = new Date();
    reservation.reception_check_in_at = now;
    await reservation.save();

    await logBookingChange({
      booking_id: reservation.reservation_id,
      action: 'UPDATED',
      actor_id: req.user.user_id,
      actor_type: actorTypeFromRole(req.user.role),
      previous_state: req.bookingAuditPreviousState,
      new_state: reservation,
    });

    return res.json({
      mensaje: evalResult.status === 'late' ? 'Check-in tardío registrado' : 'Check-in registrado',
      reservation,
    });
  } catch (err) {
    console.error('registerReceptionCheckIn', err);
    return res.status(500).json({ error: 'Error al registrar check-in', detalle: err.message });
  }
}

/** POST /reservation/checkout — solo personal. Asigna invoice_number y checkout_completed_at. */
async function checkoutReservation(req, res) {
  try {
    const { reservation_id } = req.body;
    if (!reservation_id) return res.status(400).json({ error: 'Falta reservation_id' });

    const reservation = await Reservation.findOne({ reservation_id });
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrada' });
    if (reservation.cancelation_date != null) {
      return res.status(400).json({ error: 'No se puede hacer checkout de una reserva cancelada' });
    }
    if (reservation.invoice_number) {
      return res.status(400).json({
        error: 'Checkout ya registrado',
        invoice_number: reservation.invoice_number,
      });
    }

    const endStay = new Date(reservation.check_out);
    const now = new Date();
    if (endStay > now) {
      return res.status(400).json({
        error: 'No se puede completar el checkout antes de la fecha/hora de salida de la reserva',
      });
    }

    const clientUser = await User.findOne({ user_id: reservation.user_id }).lean();
    const roomDoc = await Room.findOne({ room_id: reservation.room_id }).lean();
    const extraDocs = await loadExtraDocsForRoom(roomDoc);
    reservation.invoice_breakdown = computeInvoiceBreakdown(reservation, clientUser, roomDoc, extraDocs);

    reservation.invoice_number = await nextInvoiceNumber(now);
    reservation.checkout_completed_at = now;
    await reservation.save();

    await syncLoyaltyForUser(reservation.user_id);

    await logBookingChange({
      booking_id: reservation.reservation_id,
      action: 'UPDATED',
      actor_id: req.user.user_id,
      actor_type: actorTypeFromRole(req.user.role),
      previous_state: req.bookingAuditPreviousState,
      new_state: reservation,
    });

    return res.json({
      mensaje: 'Checkout completado',
      reservation_id: reservation.reservation_id,
      invoice_number: reservation.invoice_number,
      checkout_completed_at: reservation.checkout_completed_at,
      invoice_breakdown: reservation.invoice_breakdown,
    });
  } catch (err) {
    console.error('checkoutReservation', err);
    return res.status(500).json({ error: 'Error en checkout', detalle: err.message });
  }
}

module.exports = {
  addReservation,
  cancelReservation,
  getReservation,
  getMine,
  getAllReservations,
  getActiveReservations,
  updateReservation,
  calculatePrice,
  calculateCancelationPrice,
  checkoutReservation,
  getReceptionCheckInStatus,
  registerReceptionCheckIn,
};
