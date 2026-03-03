const mongoose = require('mongoose');
require('dotenv').config();
const Room = require('./models/Room');
const dbConnection = require('./db');
// Mocking controller logic partially for verification if needed, or just fetch via Mongoose
// But the controller logic fills the default if missing in DB. 
// So I should test the Controller logic, not just the DB.

// To test controller logic without running the full server, I can import the controller.
const roomController = require('./controllers/roomController');

const mockRes = () => {
    const res = {};
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        console.log("Response Data (First 2 items):", JSON.stringify(Array.isArray(data) ? data.slice(0, 2) : data, null, 2));
        if (Array.isArray(data)) {
            const missingImage = data.find(r => !r.image);
            if (missingImage) {
                console.error("FAIL: Found room without image:", missingImage.room_id);
            } else {
                console.log("SUCCESS: All rooms have images.");
            }
        } else {
            if (!data.image) console.error("FAIL: Room without image");
            else console.log("SUCCESS: Room has image:", data.image);
        }
        return res;
    };
    return res;
};

const runTest = async () => {
    await dbConnection();

    console.log("Testing getAllRooms...");
    await roomController.getAllRooms({}, mockRes());

    console.log("Testing getAvailableRooms (mocking query)...");
    // Mock query for next week
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(today.getDate() + 7);

    const req = {
        query: {
            checkIn: today.toISOString().split('T')[0],
            checkOut: nextWeek.toISOString().split('T')[0],
            guests: 1
        }
    };
    await roomController.getAvailableRooms(req, mockRes());

    process.exit();
}

runTest();
