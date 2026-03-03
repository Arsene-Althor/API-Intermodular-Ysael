const mongoose = require('mongoose');
const Room = require('./models/Room');
const roomController = require('./controllers/roomController');
const dbConnection = require('./db');
require('dotenv').config();

// Mock Response Object
const mockRes = () => {
    const res = {};
    res.json = (data) => {
        res.data = data;
        return res;
    };
    res.status = (s) => {
        res.statusCode = s;
        return res;
    };
    return res;
};

// Mock Request Object
const mockReq = (body) => ({ body });

const runTest = async () => {
    // 1. Connect to DB
    await dbConnection();

    console.log("--- Starting Test: Default Room Images ---");

    // Helper to test creation
    const testCreation = async (type, expectedImage) => {
        const roomId = `TEST_${type.toUpperCase()}_${Date.now()}`;
        console.log(`Testing creation for type: ${type}...`);

        const req = mockReq({
            room_id: roomId,
            type: type,
            description: `Test Description for ${type}`,
            price_per_night: 100,
            max_occupancy: 2
            // No image provided
        });

        const res = mockRes();
        await roomController.createRoom(req, res);

        if (res.statusCode === 201) {
            const createdRoom = res.data.room;
            if (createdRoom.image === expectedImage) {
                console.log(`✅ PASS: ${type} Room got correct default image.`);
            } else {
                console.error(`❌ FAIL: ${type} Room got wrong image.`);
                console.error(`Expected: ${expectedImage}`);
                console.error(`Received: ${createdRoom.image}`);
            }
            // Cleanup
            await Room.findByIdAndDelete(createdRoom._id);
        } else {
            console.error(`❌ FAIL: Could not create room. Status: ${res.statusCode}`, res.data);
        }
    };

    // 2. Run Tests
    await testCreation("Individual", "https://tse4.mm.bing.net/th/id/OIP.X32afwtV0tN6vSo4lgs2agHaE8?rs=1&pid=ImgDetMain");
    await testCreation("Doble", "https://tse1.mm.bing.net/th/id/OIP.6WkIi7teiTfbXuocSg4vTQHaEc?rs=1&pid=ImgDetMain");
    await testCreation("Suite", "https://tse1.mm.bing.net/th/id/OIP.DSZNYXrN85ABgV-13uSSKgHaEK?rs=1&pid=ImgDetMain");

    // 3. Test Manual Override
    console.log("Testing creation with manual image...");
    const manualImage = "https://example.com/manual.jpg";
    const reqManual = mockReq({
        room_id: `TEST_MANUAL_${Date.now()}`,
        type: "Individual",
        description: "Test Manual",
        price_per_night: 100,
        max_occupancy: 1,
        image: manualImage
    });
    const resManual = mockRes();
    await roomController.createRoom(reqManual, resManual);

    if (resManual.statusCode === 201) {
        if (resManual.data.room.image === manualImage) {
            console.log("✅ PASS: Manual image was preserved.");
        } else {
            console.error("❌ FAIL: Manual image was overridden.");
        }
        await Room.findByIdAndDelete(resManual.data.room._id);
    } else {
        console.error("❌ FAIL: Could not create manual room.", resManual.data);
    }

    console.log("--- Test Completed ---");
    process.exit(0);
};

runTest();
