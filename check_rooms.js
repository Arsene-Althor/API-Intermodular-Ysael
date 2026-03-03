const mongoose = require('mongoose');
require('dotenv').config();
const Room = require('./models/Room');
const dbConnection = require('./db');

const checkRooms = async () => {
    // Wait for connection to be established within dbConnection if possible,
    // but dbConnection in db.js is async and awaits mongoose.connect, so it should be fine.
    await dbConnection();

    try {
        const rooms = await Room.find();
        console.log('Current Rooms:', JSON.stringify(rooms, null, 2));
    } catch (err) {
        console.error("Error fetching rooms:", err);
    }
    process.exit();
}

checkRooms();
