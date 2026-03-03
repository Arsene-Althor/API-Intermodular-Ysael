//Controllers/userController.js
const User = require('../models/User');
const bcrypt = require('bcrypt');
const {sendEmail} = require('../config/mailer.js');

async function generateUserId(role) {
    
    //Variable para guardar el prefijo del userid
    let prefix;

    if (role == 'client'){
        prefix = 'CLI-';

    } else{
        prefix = 'EMP-';

    }

    //Busca el ultimo usuario que tenga el prefijo asignado
    const lastUser = await User.findOne({user_id: new RegExp(`^${prefix}`)})
        .sort({createdAt: -1})
        .select('user_id');

    //Si no hay último usuario empezara poo 001
    if(!lastUser){
        return `${prefix}00001`
    }

    //Extraemos numero del ultimo user_id
    //Ej: "Client-005" → split("-") → ["Client", "005"] → parseInt("005") → 5
    const arr_id = lastUser.user_id.split("-");
    const num_id = parseInt(arr_id[1]);

    //Generar nuevo ID con número +1
    const new_id = `${prefix}${String(num_id + 1).padStart(5, '0')}`;

    return new_id

}

async function registroUser(req, res){
    try{
        const {
        name,
        surname,
        email,
        password,
        confirmPassword,
        dni,
        birthDate,
        gender,
        city
    } = req.body;

    if(!name){
        return res.status(400).json({error: 'El nombre es obligatorio'});
    }

    if(!surname){
        return res.status(400).json({error: 'El apellido es obligatorio'});
    }

    if(!password){
        return res.status(400).json({error: 'La contraseña es obligatoria'})
    }

    if (password != confirmPassword){
        return res.status(400).json({error: 'Las contraseñas no coincides'});
    }

    if(!email){
        return res.status(400).json({error: 'El email es obligatorio'});
    }

    if(!dni){
        return res.status(400).json({error: 'El DNI es obligatorio'});
    }

    //Validar que no exista ya el email o DNI
    const userExists = await User.findOne({
        $or: [{email}, {dni}]
    });

    if (userExists){
        return res.status(400).json({error: 'El email o DNI ya están registrados'});
    }

    if(!birthDate){
        return res.status(400).json({error: 'La fecha de nacimiento es obligatoria'})
    }

    if(!gender){
        return res.status(400).json({error: 'El genero es obligatorio'})
    }


    //Incriptamos la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    //Generamos el user_id de manerra automatica
    const userID = await generateUserId('client');

    let imagePath = null;
    if (req.file){
        imagePath = req.file.path.replace(/\\/g, "/");
    }

    //Cogemos los datos ingresados por el usuario para luego guardar
    const newUser = new User({
        user_id: userID,
        name,
        surname,
        email,
        password: hashedPassword,
        dni,
        birthDate: new Date(birthDate),
        gender,
        city,
        role: 'client',
        profileImage: imagePath
    });

    //Guardar en mongo
    await newUser.save();

    const asunto = "¡Bienvenido al Hotel Pere Maria!";
    const mensajeHtml = `
        <div style="font-family: Arial, sans-serif; color: #333;">
                <h1>¡Hola ${name} ${surname}!</h1>
                <p>Tu cuenta ha sido creada exitosamente.</p>
                <p>Gracias por registrarte en nuestra aplicación. Ahora puedes reservar tus habitaciones favoritas.</p>
                <br>
                <p>Atentamente,<br>El equipo del Hotel Pere María</p>
            </div>
    `;

    sendEmail(email, asunto, mensajeHtml);

    

    //Convertir el documento Mongoose a objeto plano JavaScript
    const userResponse = newUser.toObject();

    //Eliminamos la contraseña antes de enviar
    delete userResponse.password

    return res.status(201).json({
        message: 'Usuario registrado exitosamente',
        user: userResponse
    })

    } catch (err){
        return res.status(400).json({error: err.message});
        
        
    }

}

async function addEmployee(req, res){
    try{
        const {
        name,
        surname,
        email,
        password,
        confirmPassword,
        dni,
        birthDate,
        gender,
        city,
        role
    } = req.body;

    if(!name){
        return res.status(400).json({error: 'El nombre es obligatorio'});
    }
    if(!surname){
        return res.status(400).json({error: 'El apellido es obligatorio'});
    }
    if(!password){
        return res.status(400).json({error: 'La contraseña es obligatoria'})
    }
    if(!email){
        return res.status(400).json({error: 'El email es obligatorio'});
    }
    if(!dni){
        return res.status(400).json({error: 'El DNI es obligatorio'});
    }
    if(!birthDate){
        return res.status(400).json({error: 'La fecha de nacimiento es obligatorio'});
    }
    if(!gender){
        return res.status(400).json({error: 'El genero es obligatorio'});
    }

    //Comparar contraseñas
    if (password != confirmPassword){
        return res.status(400).json({error: 'Las contraseñas no coincides'});
    }

    //Solo permitimos crear 'employee' o 'admin'
    if(role !== 'employee' && role !== 'admin' && role !== 'client'){
        return res.status(400).json({error: 'Desde esta aplicaion solo se puede crear o Empleados o Administradores.'});
    }

    //Seguridad: Solo Admin puede crear otro Admin
    //req.user viene del middleware 'requireLogin' (token decodificado)
    if (role === 'admin'){
        if (req.user.role !== 'admin'){
            return res.status(403).json({error: 'Permisos insufucientes: solo un administrador puede crear otro Administrador.'});
        }
    }

    //Validar que no exista ya el email o DNI
    const userExists = await User.findOne({
        $or: [{email}, {dni}]
    });

    if (userExists){
        return res.status(400).json({error: 'El email o DNI ya están registrados'});
    }

    if(!birthDate){
        return res.status(400).json({error: 'La fecha de nacimiento es obligatoria'})
    }

    if(!gender){
        return res.status(400).json({error: 'El genero es obligatorio'})
    }

    //Incriptamos la contraseña
    const hashedPassword = await bcrypt.hash(password, 10);

    //Generamos el user_id de manerra automatica
    const userID = await generateUserId(role);

    //Si Multer guardó una imagen, req.file existirá.
    let imagePath = null;
    if (req.file){
        imagePath = req.file.path.replace(/\\/g, "/");
    }


    //Cogemos los datos ingresados por el usuario para luego guardar
    const newUser = new User({
        user_id: userID,
        name,
        surname,
        email,
        password: hashedPassword,
        dni,
        birthDate: new Date(birthDate),
        gender,
        city,
        role: role,
        profileImage: imagePath
    });

    //Guardar en mongo
    await newUser.save();

    //Convertir el documento Mongoose a objeto plano JavaScript
    const userResponse = newUser.toObject();

    //Eliminamos la contraseña antes de enviar
    delete userResponse.password

    return res.status(201).json({
        message: 'Usuario registrado exitosamente',
        user: userResponse
    })

    } catch (err){
        return res.status(400).json({error: err.message});
    }
}

async function getAllUsers(req, res){
    try{

    let users = await User.find().select('-password');
    return res.status(200).json(users);

    } catch (err){
        return res.status(400).json({error: err.message});
    }
}

async function modifyUser(req, res){
    try{

        const {userId} = req.params;
        //Con esto creamos una copia superficial para poder manipular el objeto sin problemas
        const updates = {...req.body};

        //Comprobamos si existe
        const userExists = await User.findOne({user_id: userId});

        if(req.file){
            updates.profileImage= req.file.path.replace(/\\/g, "/");
        }

        if (!userExists){
            return res.status(404).json({error: 'Usuario no encontrado'});
        }

        //Implementamos medidas para evitar que se borre el ID o el rol del usuario
        if (updates.user_id) delete updates.user_id;

        //Cambiar contraseña (con validacion)
        //Si la contraseña es null, undefined o string vacio, se borrara del objeto updates.
        //Sin esto saltara error al cambiar datos de usuario
        if (!updates.password || updates.password.trim() === ""){
            delete updates.password;
            delete updates.confirmPassword;

        } else {

            //Si viene contraseña, aplicamos la validacion y hash
            if (updates.password !== updates.confirmPassword){
                return res.status(400).json({error: 'Las contraseñas no coinciden'});
            }

            //Expresiones regulares para validar el dormato de contraseña
            const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;
            if(!passwordRegex.test(updates.password)){
                return res.status(400).json({error: 'Contraseña debil'});
            }

            updates.password = await bcrypt.hash(updates.password, 10);
            delete updates.confirmPassword; //Borramos confirmación tras validar

        }

        //Validar email/dni duplicados
        if (updates.email || updates.dni){
            const duplicateCheck = await User.findOne({
                $or: [{email: updates.email}, {dni: updates.dni}],
                user_id: {$ne: userId} // <- Sirve para excluir usuario actual
            });

            if (duplicateCheck){
                const field = duplicateCheck.email === updates.email ? 'email': 'dni';

                return res.status(400).json({
                    error: `El ${field} ya esta registrado por otro usuario`
                });
            }
        }
        
        //Actualizar
        updates.updatedAt = new Date();
        const updatedUser = await User.findOneAndUpdate(
            {user_id: userId},
            updates,
            {new: true, runValidators: true}
        ).select('-password');

        return res.status(200).json({
            message: 'Usuario actualizado exitosamente',
            user: updatedUser
        });


    } catch (err){
        return res.status(404).json({error: 'Error al modificar usuario ', detalle:err.message});
    }
}

async function removeUsers(req, res){
    try{
        const { userId } = req.params; 

        if (!userId){
            return res.status(400).json({error: 'Debes proporcionar el user_id del usuario a eliminar'});
        }

        // Buscar y desactivar
        const userDeleted = await User.findOneAndUpdate(
            { user_id: userId }, 
            { isActive: false, updatedAt: new Date() },
            { new: true }
        );

        if (!userDeleted){
            return res.status(404).json({error: 'Usuario no encontrado'});
        }

        return res.status(200).json({
            message: 'Usuario desactivado correctamente',
            user: {
                user_id: userDeleted.user_id,
                email: userDeleted.email,
                isActive: userDeleted.isActive
            }
        });

    } catch (err){
        return res.status(500).json({error: 'Error al eliminar usuario', detalle: err.message});
    }
}

async function updateDiscount(req, res){
    try{
        const {userId} = req.params;
        const {newDiscount} = req.body;

        //Validar que el valor sea tipo numerico
        if(typeof newDiscount !== 'number'){
            return res.status(400).json({error: 'El descuento debe ser un número (ej: 0.2 para 20%)'});
        }

        const user = await User.findOne({user_id: userId})

        if(!user){
            return res.status(404).json({error: 'Usuario no encontrado'});
        }

        //Logica oara limitar el descuento segun es VIP o no
        //Si es VIP: Limite 0.5 Si NO es VIP: Limite 0.3
        const maxAllowed = user.isVIP ? 0.5: 0.3;

        if (newDiscount < 0 || newDiscount > maxAllowed){
            return res.status(400).json({error: `Descuento invalido. Para usuarios ${user.isVIP ? 'VIP': 'Normal'}, el rango es entre 0 y ${maxAllowed}`})
        }

        //Actualizar usuario
        user.discount = newDiscount;
        user.updatedAt = new Date();

        await user.save()

        return res.status(200).json({
            message: 'Descuento actualizado correctamente',
            user_id: user.user_id,
            new_discount: user.discount,
            isVIP: user.isVIP
        });

    } catch (err){
        return res.status(500).json({error: 'Error al actualizar decuento'})
    }
}

module.exports = {registroUser,addEmployee, getAllUsers, removeUsers, modifyUser, updateDiscount};