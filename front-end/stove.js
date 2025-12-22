const mqtt = require('mqtt');

// --- CẤU HÌNH QUAN TRỌNG ---
const BROKER_URL = 'mqtt://131.153.224.169'; 

// Topic phải KHỚP với cái bạn vừa tạo trong Database (mqtt_topic_root)
const DEVICE_TOPIC = 'home/kitchen/stove1';

// --- TRẠNG THÁI BẾP ẢO ---
let state = {
    power: "OFF",       
    temperature: 30.0,  
    target_temp: 30.0,  
    mode: "NONE",       
    level: 0            
};

console.log(`⏳ Đang kết nối tới MQTT Broker: ${BROKER_URL}...`);
const client = mqtt.connect(BROKER_URL);

client.on('connect', () => {
    console.log(`✅ KẾT NỐI THÀNH CÔNG! Bếp ảo đang chạy...`);
    
    // Đăng ký nhận lệnh từ Server
    // Server sẽ gửi vào topic: home/kitchen/stove1/command
    client.subscribe(`${DEVICE_TOPIC}/command`, (err) => {
        if(!err) console.log(`📡 Đang lắng nghe lệnh tại: ${DEVICE_TOPIC}/command`);
    });

    // Bắt đầu vòng lặp vật lý (1 giây chạy 1 lần)
    setInterval(physicsLoop, 1000);
});

// Xử lý khi nhận lệnh từ Server (Do Postman gọi API -> Server -> MQTT -> Bếp)
client.on('message', (topic, message) => {
    const msgString = message.toString();
    console.log(`\n📩 NHẬN LỆNH MỚI: ${msgString}`);

    try {
        const cmdData = JSON.parse(msgString);
        
        // Xử lý logic điều khiển
        if (cmdData.cmd === 'POWER') {
            state.power = cmdData.val; // "ON" hoặc "OFF"
        } 
        else if (cmdData.cmd === 'SET_LEVEL') {
            state.level = parseInt(cmdData.val);
        }
        else if (cmdData.cmd === 'SET_MODE') {
            state.mode = cmdData.val;
        }
        
        console.log(`👉 Trạng thái mới -> Power: ${state.power} | Level: ${state.level}`);
        
    } catch (e) {
        console.error("Lỗi format JSON:", e);
    }
});

// Hàm mô phỏng nhiệt độ tăng giảm
function physicsLoop() {
    if (state.power === "ON") {
        // Giả lập: Level càng cao nóng càng nhanh
        let target = 30 + (state.level * 25);
        if (state.temperature < target) state.temperature += 2.5;
    } else {
        // Tắt bếp thì nguội dần
        if (state.temperature > 30) state.temperature -= 1.0;
    }
    
    // Làm tròn
    state.temperature = Math.round(state.temperature * 10) / 10;

    // Gửi trạng thái hiện tại lên Server (để App hiển thị)
    const payload = JSON.stringify(state);
    client.publish(`${DEVICE_TOPIC}/status`, payload);
    
    // In ra màn hình console (ghi đè dòng cũ cho đẹp)
    process.stdout.write(`\r🔥 [STOVE SIM] Temp: ${state.temperature}°C | Power: ${state.power} | Level: ${state.level}   `);
}