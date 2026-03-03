const mongoose = require('mongoose');

const roomSchema = new mongoose.Schema({
    price_per_night: {
        type: Number,
        required: true
    }
});

const Room = mongoose.model('RoomTest', roomSchema);

async function test() {
    const doc = new Room({ price_per_night: 0 });
    try {
        await doc.validate();
        console.log("Validation passed for 0");
    } catch (err) {
        console.log("Validation failed for 0:", err.message);
    }
}

test();
