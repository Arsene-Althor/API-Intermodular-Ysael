//Controlers para Reservas
const Reservation = require('../models/Reservation');
const User = require('../models/User');
const Room = require('../models/Room');
const mongoose = require('mongoose');

//Función para comprobar ocupación
async function checkOcupation(check_in, check_out, room_id, reservation_id) {
  //Las fechas de entrada y salida siempre son de 12 a 11
  let nuevaEntrada = new Date(check_in);
  nuevaEntrada.setHours(12, 0, 0, 0);

  let nuevaSalida = new Date(check_out);
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

    //Validaciones para datos introducidos
    let user = await User.findOne({ user_id });
    if (!user) return res.status(400).json({ error: 'El usuario introducido no exite' });

    let room = await Room.findOne({ room_id });
    if (!room) return res.status(400).json({ error: 'La habitación introducida no existe' });


    const precioNum = Number.parseFloat(price).valueOf();

    if (isNaN(precioNum) || precioNum <= 0) {
      return res.status(400).json(precioNum);
    }

    let nuevaEntrada = new Date(check_in);
    nuevaEntrada.setHours(12, 0);

    let nuevaSalida = new Date(check_out);
    nuevaSalida.setHours(11, 0);

    //Permitiremos reservas el mismo dia que entrada o en su defecto antes de las 12 del dia actual
    let ayer = new Date();
    ayer.setDate(ayer.getDate() - 1);
    ayer.setHours(12, 0);

    if (nuevaEntrada < ayer) return res.status(400).json({ error: 'La fecha de entrada no puede ser inferior a la fecha actual'});
    if (nuevaEntrada >= nuevaSalida) return res.status(400).json({ error: 'La fecha de entrada no puede ser superiror a la de salida'})

    let new_id;
    let ultimo_id = await Reservation.findOne()
      .sort({ createdAt: -1 })
      .select('reservation_id');

    if (!ultimo_id) {
      // En caso de no tener ninguna reserva la creamos automaticamente con el primer id 
      new_id = "RSV-00001"
    } else {
      //Generamos el nuevo id de reserva
      let arr_id = ultimo_id.reservation_id.split("-");
      num_id = parseInt(arr_id[1])
      new_id = "RSV-" + String(num_id + 1).padStart(5, '0');
    }
    //Llamamaos al metodo para comprobar habitaciones
    let verif = await checkOcupation(check_in, check_out, room_id);

    if (verif.respuesta) {
      let reservation = new Reservation({ reservation_id: new_id, room_id, user_id, check_in: nuevaEntrada, check_out: nuevaSalida, price: precioNum, createdBy });
      await reservation.save();
      return res.json(reservation)
    } else {
      return res.status(400).json({ error: verif.error })
    }

  } catch (err) {
    console.log(err);
    res.status(500).json({ error: 'Error al insertar reserva', detalle: err.message, erroresValidacion: err.errors });
  }
}

// Cancelar una reserva
async function cancelReservation(req, res) {
  try {
    const { reservation_id, price } = req.body;
    if (!reservation_id || price === undefined) {
      return res.status(400).json({ error: 'Faltan datos' });
    }

    const reservation = await Reservation.findOne({ reservation_id });
    if (!reservation) return res.status(404).json({ error: 'Reserva no encontrado' });

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
    const reservations = await Reservation.find({cancelation_date : null, check_out: { $gte: hoy }});
    if(!reservations || reservations.length === 0){
      return res.status(200).json([]);
    }
    res.json(reservations)

  }catch(err){
    res.status(500).json({ error: 'Error al listar las reservas', detalle: err.message });
  }
}

//Obtener las reservas del usuario logeado
async function getMine(req, res) {
  try {
    const user_id = req.user.user_id;
    const reservations = await Reservation.find({ user_id })
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
        return res.status(400).json({ error: 'La reserva esta vencida no se puede modificar' });
      }
    }

    const precioNum = Number.parseFloat(price).valueOf();

    if (isNaN(precioNum) || precioNum <= 0) {
      return res.status(400).json({ error: 'El nuevo precio de la reserva no es valido' });
    }
    

    //Validación habitacion no ocupada
    let verif = await checkOcupation(check_in, check_out, room_id, reservation_id);

    if (verif.respuesta) {
      reservation.room_id = room_id;
      reservation.check_in = nuevaEntrada;
      reservation.check_out = nuevaSalida;
      reservation.user_id = user_id;
      reservation.price = precioNum;
      await reservation.save();
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

    let precioReserva = dias * room.price_per_night;

    let descuento = precioReserva * user.discount;
    precioReserva = precioReserva - descuento;

    return res.json({ precio: precioReserva })

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

module.exports = {
  addReservation,
  cancelReservation,
  getReservation,
  getMine,
  getAllReservations,
  getActiveReservations,
  updateReservation,
  calculatePrice,
  calculateCancelationPrice
};
