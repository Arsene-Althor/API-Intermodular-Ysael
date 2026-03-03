const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
    destination: function (req, file, cb) { //cb = callback
        //Null indica que no urgieron erroes en el proceso
        //'uploads/' es la carpeta donde se guardaran las imagenes
        cb(null, 'uploads/')
    },
    filename: function (req, file, cb){
        //Con esto generaremos el nombre de la imagen nosotros para evitar conflicto
        //Usamos Date.now() para asegurar que no se repitan
        //Conservamos la extencion original del archivo
        const uniqueSuffix =  Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname)
        cb(null, file.fieldname + '-' + uniqueSuffix + ext);
    }

}); //Tonto el que lo lea >:D

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/gif'
    ];

    if (allowedTypes.includes(file.mimetype)){
        cb(null, true); //sirve para aceptar el archivo
    } else {
        //Se rechaza la subida y le mandamos un mensaje de error¡¡
        cb(new Error('Tipo de archivo no válido. Solo se permiten JPG, PNG, WEBP, GIF'), false);
    }
};

const upload = multer({
    storage: storage,
    limits: {
        //Limite de bytes
        //Forma de calcular el peso: 1024 * 1024 = 1MB. Multiplicado por 5 son 5MB
        fileSize: 1024 * 1024 * 5
    },
    fileFilter: fileFilter
});

module.exports = upload