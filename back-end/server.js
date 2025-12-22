require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const mqtt = require('mqtt');
const cors = require('cors'); 
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const http = require('http');
const { Server } = require("socket.io");

const User = require('./models/User');
const Device = require('./models/Device');
const TemperatureHistory = require('./models/TemperatureHistory');

// --- CẤU HÌNH ---
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const MQTT_HOST = process.env.MQTT_HOST ;
const MONGO_URI = process.env.MONGO_URI ;

// --- KHỞI TẠO APP & SERVER ---
const app = express();
const server = http.createServer(app); // Tạo HTTP Server bọc Express

app.use(cors()); 
app.use(express.json()); 
app.use(express.static(path.join(__dirname, '..', 'front-end'))); 

// --- CẤU HÌNH SOCKET.IO ---
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// --- KẾT NỐI DB & MQTT ---
// 1. Kết nối MongoDB với connection pool giới hạn
mongoose.connect(MONGO_URI, {
  maxPoolSize: 10, // Giới hạn số connections tối đa
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
})
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => console.error('❌ MongoDB Error:', err));

// Cache device info để tránh query DB mỗi lần
const deviceCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // Cache 5 phút
const MAX_CACHE_SIZE = 100; // Giới hạn cache tối đa 100 devices

async function getDeviceCached(deviceId) {
  const cacheKey = `home/kitchen/${deviceId}`;
  const cached = deviceCache.get(cacheKey);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.device;
  }
  
  const device = await Device.findOne({ mqtt_topic_root: cacheKey }).lean();
  if (device) {
    // Giới hạn cache size để tránh memory leak
    if (deviceCache.size >= MAX_CACHE_SIZE) {
      // Xóa entry cũ nhất
      const oldestKey = Array.from(deviceCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      deviceCache.delete(oldestKey);
    }
    deviceCache.set(cacheKey, { device, timestamp: Date.now() });
  }
  
  return device;
}

// Cleanup cache định kỳ (mỗi 5 phút)
setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, value] of deviceCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      deviceCache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    console.log(`🧹 Cleaned ${cleaned} expired cache entries`);
  }
}, 5 * 60 * 1000);

// 2. Kết nối MQTT
const mqttClient = mqtt.connect(MQTT_HOST);

// Track trạng thái GAS và tủ lạnh để tự động xử lý
let gasDetected = false;
let lastGasDetectionTime = null;
const fridgeStatus = new Map(); // deviceId -> { temp: number, door: string, highTempStartTime: Date | null }

mqttClient.on('connect', () => {
  console.log('✅ MQTT Connected');
  mqttClient.subscribe('home/kitchen/+/status');
});

mqttClient.on('message', async (topic, message) => {
  try {
    const msgString = message.toString();
    const data = JSON.parse(msgString);
    const deviceId = topic.split('/')[2];
    
    // Gửi realtime xuống Web
    io.emit('device_update', { deviceId, data });
    
    // ===== LOGIC 1: TỰ ĐỘNG TẮT BẾP KHI PHÁT HIỆN GAS =====
    setImmediate(async () => {
      try {
        const device = await getDeviceCached(deviceId);
        
        // Nếu là sensor_node và phát hiện GAS
        if (device && device.type === 'sensor_node' && data.gas === 'DETECTED') {
          if (!gasDetected) {
            gasDetected = true;
            lastGasDetectionTime = new Date();
            console.log('⚠️  GAS DETECTED! Tự động tắt tất cả bếp từ...');
            
            // Tìm tất cả bếp từ và gửi lệnh tắt
            const allDevices = await Device.find({ type: 'stove_sim' }).lean();
            for (const stove of allDevices) {
              const stoveTopic = stove.mqtt_topic_root;
              const command = JSON.stringify({ cmd: 'POWER', val: 'OFF' });
              mqttClient.publish(`${stoveTopic}/command`, command);
              console.log(`🔴 Đã gửi lệnh TẮT đến ${stove.name} (${stoveTopic})`);
            }
            
            // Thông báo qua Socket.IO
            io.emit('safety_alert', {
              type: 'gas_detected',
              message: '⚠️ Phát hiện khí GAS! Đã tự động tắt tất cả bếp từ.',
              timestamp: new Date()
            });
          }
        } else if (device && device.type === 'sensor_node' && data.gas === 'SAFE') {
          // Reset khi GAS an toàn
          if (gasDetected) {
            gasDetected = false;
            lastGasDetectionTime = null;
            console.log('✅ GAS SAFE - Đã reset trạng thái');
          }
        }
      } catch (err) {
        console.error('Error in gas detection logic:', err.message);
      }
    });
    
    // ===== LOGIC 2: TỰ ĐỘNG ĐÓNG TỦ LẠNH KHI NHIỆT ĐỘ CAO =====
    setImmediate(async () => {
      try {
        const device = await getDeviceCached(deviceId);
        
        if (device && device.type === 'fridge_sim') {
          const currentTemp = data.current_temp;
          const doorStatus = data.door;
          
          if (typeof currentTemp !== 'undefined' && typeof doorStatus !== 'undefined') {
            // Cập nhật trạng thái tủ lạnh
            if (!fridgeStatus.has(deviceId)) {
              fridgeStatus.set(deviceId, { temp: currentTemp, door: doorStatus, highTempStartTime: null });
            } else {
              const status = fridgeStatus.get(deviceId);
              status.temp = currentTemp;
              status.door = doorStatus;
            }
            
            const status = fridgeStatus.get(deviceId);
            const now = new Date();
            
            // Nếu nhiệt độ > 15°C và cửa đang mở
            if (currentTemp > 15 && doorStatus === 'OPEN') {
              // Bắt đầu đếm thời gian
              if (!status.highTempStartTime) {
                status.highTempStartTime = now;
                console.log(`🌡️  Tủ lạnh ${deviceId}: Nhiệt độ ${currentTemp}°C > 15°C, cửa mở. Bắt đầu đếm 15 phút...`);
              } else {
                // Kiểm tra đã qua 15 phút chưa
                const elapsedMinutes = (now - status.highTempStartTime) / (60 * 1000);
                if (elapsedMinutes >= 15) {
                  // Tự động đóng cửa
                  const fridgeTopic = device.mqtt_topic_root;
                  const command = JSON.stringify({ cmd: 'SET_DOOR', val: 'CLOSED' });
                  mqttClient.publish(`${fridgeTopic}/command`, command);
                  console.log(`❄️  Tự động đóng cửa tủ lạnh ${device.name} (${deviceId}) - Nhiệt độ ${currentTemp}°C > 15°C trong ${elapsedMinutes.toFixed(1)} phút`);
                  
                  // Reset timer
                  status.highTempStartTime = null;
                  status.door = 'CLOSED';
                  
                  // Thông báo qua Socket.IO
                  io.emit('safety_alert', {
                    type: 'fridge_auto_close',
                    deviceId: deviceId,
                    deviceName: device.name,
                    message: `Tủ lạnh ${device.name} đã tự động đóng cửa do nhiệt độ cao (${currentTemp}°C) trong 15 phút.`,
                    timestamp: now
                  });
                }
              }
            } else {
              // Reset timer nếu nhiệt độ giảm hoặc cửa đã đóng
              if (status.highTempStartTime) {
                status.highTempStartTime = null;
                console.log(`✅ Tủ lạnh ${deviceId}: Điều kiện không còn thỏa mãn, reset timer`);
              }
            }
          }
        }
      } catch (err) {
        console.error('Error in fridge auto-close logic:', err.message);
      }
    });
    
    // Lưu lịch sử nhiệt độ vào database (non-blocking)
    // Sử dụng setImmediate để không block MQTT message handler
    setImmediate(async () => {
      try {
        // Tìm device từ cache (tránh query DB mỗi lần)
        const device = await getDeviceCached(deviceId);
        if (device && (device.type === 'stove_sim' || device.type === 'fridge_sim')) {
          let temperature = null;
          
          // Lấy nhiệt độ tùy theo loại thiết bị
          if (device.type === 'stove_sim' && typeof data.temperature !== 'undefined') {
            temperature = data.temperature;
          } else if (device.type === 'fridge_sim' && typeof data.current_temp !== 'undefined') {
            temperature = data.current_temp;
          }
          
          // Lưu vào database (chỉ lưu mỗi 1 phút để tránh quá nhiều dữ liệu)
          if (temperature !== null) {
            // Kiểm tra xem đã có record trong 1 phút gần nhất chưa
            const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
            const recentRecord = await TemperatureHistory.findOne({
              device_id: deviceId,
              timestamp: { $gte: oneMinuteAgo }
            });
            
            // Chỉ lưu nếu chưa có record trong 1 phút qua
            if (!recentRecord) {
              await TemperatureHistory.create({
                device_id: deviceId,
                device_type: device.type,
                temperature: temperature,
                timestamp: new Date()
              });
            }
          }
        }
      } catch (dbError) {
        // Không làm gián đoạn flow nếu lưu history lỗi
        console.error('Error saving temperature history:', dbError.message);
      }
    });
  } catch (e) {
    // console.error('MQTT JSON Error', e.message);
  }
});

// --- MIDDLEWARE AUTH ---
const authMiddleware = (req, res, next) => {
  const token = req.header('Authorization')?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ msg: 'Thiếu Token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ msg: 'Token lỗi' });
  }
};

// --- API ROUTES ---

// 1. Phục vụ trang chủ (Frontend)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'front-end', 'index.html'));
});

// 2. API Đăng ký (Register)
app.post('/api/register', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const existingUser = await User.findOne({ username });
    if (existingUser) return res.status(400).json({ msg: 'User đã tồn tại' });

    // Lưu ý: Models/User.js phải bỏ 'next' trong pre('save') thì dòng dưới mới chạy được
    const newUser = new User({ username, password, role });
    await newUser.save(); 
    res.json({ msg: 'Tạo user thành công' });
  } catch (err) {
    console.error(err); // In lỗi ra log để debug
    res.status(500).json({ error: err.message });
  }
});

// 3. API Đăng nhập (Login)
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await user.comparePassword(password)))
      return res.status(400).json({ msg: 'Sai thông tin đăng nhập' });

    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '1d' });
    res.json({ token, user: { username: user.username } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 4. API Thêm thiết bị
app.post('/api/devices', authMiddleware, async (req, res) => {
  try {
    // Lưu ý: Models/Device.js phải có trường 'mqtt_topic_root' thay vì 'topic'
    const newDevice = new Device(req.body);
    await newDevice.save();
    res.json(newDevice);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. API Lấy danh sách thiết bị
app.get('/api/devices', authMiddleware, async (req, res) => {
  try {
    const devices = await Device.find();
    res.json(devices);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 6. API Cập nhật thiết bị (đổi tên)
app.put('/api/devices/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const device = await Device.findById(id);
    if (!device) return res.status(404).json({ msg: 'Thiết bị không tồn tại' });
    
    // Không cho phép sửa sensor_node
    if (device.type === 'sensor_node') {
      return res.status(403).json({ msg: 'Không thể sửa thiết bị cảm biến' });
    }
    
    // Chỉ cho phép cập nhật tên
    if (req.body.name) {
      device.name = req.body.name;
      await device.save();
    }
    res.json(device);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. API Xóa thiết bị
app.delete('/api/devices/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const device = await Device.findById(id);
    if (!device) return res.status(404).json({ msg: 'Thiết bị không tồn tại' });
    
    // Không cho phép xóa sensor_node
    if (device.type === 'sensor_node') {
      return res.status(403).json({ msg: 'Không thể xóa thiết bị cảm biến' });
    }
    
    await Device.findByIdAndDelete(id);
    res.json({ msg: 'Đã xóa thiết bị' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. API Điều khiển
app.post('/api/device/command', authMiddleware, (req, res) => {
  const { topic, command } = req.body;
  if (!topic || !command) return res.status(400).json({ msg: 'Thiếu dữ liệu' });

  mqttClient.publish(`${topic}/command`, JSON.stringify(command));
  res.json({ status: 'Sent' });
});

// 9. API Lấy lịch sử nhiệt độ (mặc định 5 ngày gần nhất)
app.get('/api/devices/:deviceId/temperature-history', authMiddleware, async (req, res) => {
  try {
    const { deviceId } = req.params;
    const sampleInterval = parseInt(req.query.interval) || 5; // minutes
    const range = (req.query.range || '').toLowerCase();      // '8h' | '24h' | '3d'
    const daysParam = parseInt(req.query.days) || 5;          // fallback days

    // Determine time window
    let fromTime = null;
    let windowLabel = '5d';
    let limitRecords = 8000; // default safety cap

    if (range === '8h') {
      fromTime = new Date(Date.now() - 8 * 60 * 60 * 1000);
      windowLabel = '8h';
      limitRecords = 2000; // 8h at 1/min ~480; safe cap
    } else if (range === '24h') {
      fromTime = new Date(Date.now() - 24 * 60 * 60 * 1000);
      windowLabel = '24h';
      limitRecords = 3000; // 24h at 1/min ~1440; safe cap
    } else if (range === '3d') {
      fromTime = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      windowLabel = '3d';
      limitRecords = 6000; // 3d at 1/min ~4320; safe cap
    } else {
      fromTime = new Date(Date.now() - daysParam * 24 * 60 * 60 * 1000);
      windowLabel = `${daysParam}d`;
      limitRecords = 8000; // default
    }

    const allHistory = await TemperatureHistory.find({
      device_id: deviceId,
      timestamp: { $gte: fromTime }
    })
      .sort({ timestamp: 1 })
      .select('temperature timestamp')
      .limit(limitRecords)
      .lean();
    
    // Sample dữ liệu để giảm số điểm hiển thị
    // Nếu có quá nhiều điểm, chỉ lấy mỗi N phút một điểm
    let sampledData = [];
    
    if (allHistory.length > 0) {
      // Nếu số điểm <= 200, giữ nguyên (không cần sample)
      if (allHistory.length <= 200) {
        sampledData = allHistory;
      } else {
        // Sample: chỉ lấy điểm đầu tiên trong mỗi khoảng thời gian
        const intervalMs = sampleInterval * 60 * 1000; // Chuyển phút sang milliseconds
        let lastSampledTime = 0;
        
        for (const item of allHistory) {
          const itemTime = new Date(item.timestamp).getTime();
          
          // Lấy điểm đầu tiên trong mỗi khoảng thời gian
          if (itemTime - lastSampledTime >= intervalMs || sampledData.length === 0) {
            sampledData.push(item);
            lastSampledTime = itemTime;
          }
        }
        
        // Đảm bảo luôn có điểm đầu và cuối
        if (sampledData.length > 0) {
          const firstPoint = allHistory[0];
          const lastPoint = allHistory[allHistory.length - 1];
          
          if (sampledData[0].timestamp.getTime() !== firstPoint.timestamp.getTime()) {
            sampledData.unshift(firstPoint);
          }
          if (sampledData[sampledData.length - 1].timestamp.getTime() !== lastPoint.timestamp.getTime()) {
            sampledData.push(lastPoint);
          }
        }
      }
    }
    
    // Format dữ liệu cho Chart.js
    const formattedData = sampledData.map(item => ({
      x: item.timestamp,
      y: item.temperature
    }));
    
    res.json({
      deviceId,
      data: formattedData,
      count: formattedData.length,
      totalRecords: allHistory.length,
      sampled: allHistory.length > formattedData.length,
      window: windowLabel
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Memory monitoring (log memory usage mỗi 30 phút)
setInterval(() => {
  const used = process.memoryUsage();
  const memoryMB = Math.round(used.heapUsed / 1024 / 1024);
  const memoryLimitMB = 1024; // 1GB limit
  
  console.log(`📊 Memory Usage: ${memoryMB}MB / ${memoryLimitMB}MB (${Math.round(memoryMB/memoryLimitMB*100)}%)`);
  
  // Warning nếu memory > 80%
  if (memoryMB > memoryLimitMB * 0.8) {
    console.warn(`⚠️  Memory usage high: ${memoryMB}MB (${Math.round(memoryMB/memoryLimitMB*100)}%)`);
  }
}, 30 * 60 * 1000); // Mỗi 30 phút

// --- CHẠY SERVER ---
server.listen(PORT, '0.0.0.0', () => {
  const used = process.memoryUsage();
  const memoryMB = Math.round(used.heapUsed / 1024 / 1024);
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`💾 Initial Memory: ${memoryMB}MB`);
});