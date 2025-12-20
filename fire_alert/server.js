const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const mqtt = require('mqtt');

const MQTT_BROKER = 'mqtt://10.17.13.220'; // Thay IP 
const MQTT_TOPIC = 'home/safety/status';

// Kết nối MQTT
const client = mqtt.connect(MQTT_BROKER);

app.use(express.static('public')); // Cho phép truy cập thư mục public

client.on('connect', () => {
    console.log('✅ Backend connected to MQTT Broker at ' + MQTT_BROKER);
    client.subscribe(MQTT_TOPIC, (err) => {
        if (!err) console.log(`📡 Subscribed to topic: ${MQTT_TOPIC}`);
    });
});

client.on('message', (topic, message) => {
    const msgString = message.toString();
    console.log('📩 Received:', msgString);

    try {
        const data = JSON.parse(msgString);
        io.emit('sensor_data', data);
    } catch (e) {
        console.error('Lỗi format JSON từ ESP32:', e);
    }
});

io.on('connection', (socket) => {
    console.log('👤 Frontend connected via Socket.io');
});

// Chạy Server
const PORT = 3000;
http.listen(PORT, () => {
    console.log(`🚀 Web Server running at http://localhost:${PORT}`);
});