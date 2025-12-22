const mqtt = require('mqtt');

// --- CẤU HÌNH ---
const BROKER_URL = 'mqtt://131.153.224.169'; // <--- THAY IP VPS CỦA BẠN
const DEVICE_TOPIC = 'home/kitchen/fridge1';

let state = {
    current_temp: 5.0,  // Nhiệt độ hiện tại
    target_temp: 4.0,   // Nhiệt độ cài đặt
    door: "CLOSED"      // CLOSED hoặc OPEN
};

console.log(`❄️ Tủ lạnh đang kết nối: ${BROKER_URL}...`);
const client = mqtt.connect(BROKER_URL);

client.on('connect', () => {
    console.log(`✅ Tủ lạnh Online!`);
    client.subscribe(`${DEVICE_TOPIC}/command`);
    setInterval(physicsLoop, 2000); // Cập nhật chậm hơn bếp (2s/lần)
});

client.on('message', (topic, message) => {
    try {
        const cmdData = JSON.parse(message.toString());
        console.log(`📩 Lệnh:`, cmdData);

        if (cmdData.cmd === 'SET_DOOR') {
            state.door = cmdData.val; // "OPEN" / "CLOSED"
        } 
        else if (cmdData.cmd === 'SET_TEMP') {
            state.target_temp = parseFloat(cmdData.val);
        }
    } catch (e) { console.error(e); }
});

function physicsLoop() {
    // Logic vật lý:
    // 1. Nếu mở cửa -> Nhiệt độ tăng nhanh (tiến về nhiệt độ phòng 30 độ)
    if (state.door === "OPEN") {
        if (state.current_temp < 30) state.current_temp += 0.5;
    } 
    // 2. Nếu đóng cửa -> Nhiệt độ giảm dần về mức Target
    else {
        if (state.current_temp > state.target_temp) {
            state.current_temp -= 0.2; // Làm lạnh từ từ
        } else if (state.current_temp < state.target_temp) {
            state.current_temp += 0.1; // Hồi nhiệt nhẹ
        }
    }
    
    // Làm tròn 1 chữ số thập phân
    state.current_temp = Math.round(state.current_temp * 10) / 10;

    // Gửi status
    client.publish(`${DEVICE_TOPIC}/status`, JSON.stringify(state));
    process.stdout.write(`\r❄️ [FRIDGE] Door: ${state.door} | Curr: ${state.current_temp}°C | Target: ${state.target_temp}°C   `);
}