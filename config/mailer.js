const nodemailer = require('nodemailer');
require('dotenv').config();

// Creamos la conexion con el servidor de correo
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST, 
    port: process.env.EMAIL_PORT, 
    secure: false, 
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    }
});

// Verifica la conexion
transporter.verify().then(() => {
    console.log('Listo para enviar correos');
}).catch((err) => {
    console.log('Error al conectar con el servidor de correos:', err);
});

// Funcion para enviar correos
async function sendEmail(to, subject, htmlContent){
    try{
        const info = await transporter.sendMail({
            from: `"Hotel Pere Maria" <${process.env.EMAIL_USER}>`, 
            to: to, 
            subject: subject,
            html: htmlContent 
        });
        console.log("Correo enviado: %s", info.messageId);
        console.log("Vista previa URL: %s", nodemailer.getTestMessageUrl(info));
        return true;
    } catch (error){
        console.error("Error enviando correo: ", error);
        return false;
    }
}

module.exports = { sendEmail };