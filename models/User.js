// models/User.js
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

//Expresiones regulares para validaciones
const regex = {
  email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  dni: /^[0-9]{8}[A-Z]$/, // 8 numeros + una letra mayuscula
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/ //Al menos 1 mayuscula, minuscula, numero y caracter especial, minimo 8 caracteres

};

//Modelo del user
const userSchema = new mongoose.Schema({
  user_id:{
    type: String,
    unique: true,
    minlength: [9, "El ID debe tener al menos 9 caracteres"],
    match: [
      /^(CLI|EMP)-[0-9]{5}$/,
      "El formato debe ser CLI- o EMP- seguido de 5 números (Ej: EMP-00001)",
    ],
    immutable: true,
  },
  name:{
    type: String,
    required: [true, 'El nombre del usuario es algo obligatorio'],
    trim: true,
    maxlength: [100, 'El nombre excede los 100 caracteres'],
    minlength: [1, 'El nombre no puede estar vacio']
  },
  surname:{
    type: String,
    required: [true, 'El Apellido del usuario es algo obligatorio'],
    trim: true,
    maxlength: [100, 'El apellido no puede exceder 100 caracteres'],
    minlength: [1, 'El apellido no puede estar vacío']
  },
  email:{
    type: String,
    required: [true, 'El email del usuario es algo obligatorio'],
    unique: true,
    trim: true,
    lowercase: true,
    sparse: true, //Permite null sin violar unique
    validate: { //Validador para formato del email
      validator: function (value){
        return regex.email.test(value);
      },
      message: 'El formato del email no es válido (ej: usuario@dominio.com)'
    }
  },
  password:{
    type: String,
    required: [true, 'La contraseña del usuario es algo obligatorio'],
    trim: true,
    minlength: [8, 'La contraseña debe tener mínimo 8 caracteres'],
    validate: { //Validador para formato de la contraseña
      validator: function (value){
        return regex.password.test(value);
      },
      message: 'La contraseña debe contener al menos: 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial (@$!%*&)'
    },
    select: false, //No devuelve la constraseña en queries por defecto
  },
  dni:{
    type: String,
    required: [true, 'El dni del usuario es algo obligatorio'],
    trim: true,
    unique: true,
    uppercase: true,
    sparse: true,
    validate: {
      validator: function (value) {
        // Primero verificamos el formato básico: 8 números + 1 letra
        if (!regex.dni.test(value)) {
          return false;
        }

        // Algoritmo de validación del DNI español
        // La letra se calcula dividiendo los 8 números entre 23
        // El resto indica la posición en la tabla de letras
        const letrasValidas = 'TRWAGMYFPDXBNJZSQVHLCKE';

        // Extraemos los números y la letra del DNI
        const numeros = parseInt(value.substring(0, 8), 10);
        const letraProporcionada = value.charAt(8).toUpperCase();

        // Calculamos la letra correcta
        const resto = numeros % 23;
        const letraCorrecta = letrasValidas.charAt(resto);

        // Comparamos si coinciden
        return letraProporcionada === letraCorrecta;
      },
      message: 'El DNI no es válido. Verifica que la letra corresponda a los números (formato: 12345678X)'
    },
  },
  birthDate: {
    type: Date,
    required: [true, "La fecha de nacimiento del usuario es algo obligatorio"],
    validate: {
      validator: function (value) {
        const hoy = new Date();
        // No permitir fechas futuras
        if (value > hoy) return false;

        // Calcular edad: mínimo 18 años
        let edad = hoy.getFullYear() - value.getFullYear();
        const mesDiff = hoy.getMonth() - value.getMonth();
        if (mesDiff < 0 || (mesDiff === 0 && hoy.getDate() < value.getDate())) {
          edad--;
        }
        return edad >= 18;
      },
      message:
        "El usuario debe tener al menos 18 años y la fecha no puede ser futura",
    },
  },
  city: {
    type: String,
    default: null,
    trim: true,
  },
  gender: {
    type: String,
    enum: ["M", "F", "Other"],
    required: [true, "El genero del usuario es algo obligatorio"],
  },
  profileImage: {
    type: String,
    default: null,
    // Validación de tipo y tamaño se gestiona en middleware/diskStorage.js (fileFilter + limits)
  },
  role: {
    type: String,
    enum: ["admin", "employee", "client"],
    required: [true, "El rol del usuario es algo obligatorio"],
    default: "client",
  },
  isVIP: {
    type: Boolean,
    default: false,
  },
  discount: {
    type: Number,
    minimum: [0, "El descuento no puede ser negativo"],
    maximum: [0.5, "El descuento máximo permitido es del 50% (0.5)"],
    default: 0.0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Método para comparar contraseñas
userSchema.methods.comparePassword = async function (plain) {
  const res = await bcrypt.compare(plain, this.password);
  return res;
};

const User = mongoose.model("User", userSchema);
module.exports = User;
