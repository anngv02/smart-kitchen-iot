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
const { exec } = require('child_process');

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

async function getDeviceCached(topicRoot) {
  // topicRoot có thể là: "home/kitchen/stove1" hoặc bất kỳ format nào user đặt
  const cached = deviceCache.get(topicRoot);
  
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL) {
    return cached.device;
  }
  
  // Tìm device bằng mqtt_topic_root chính xác
  const device = await Device.findOne({ mqtt_topic_root: topicRoot }).lean();
  if (device) {
    // Giới hạn cache size để tránh memory leak
    if (deviceCache.size >= MAX_CACHE_SIZE) {
      // Xóa entry cũ nhất
      const oldestKey = Array.from(deviceCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0];
      deviceCache.delete(oldestKey);
    }
    deviceCache.set(topicRoot, { device, timestamp: Date.now() });
    console.log(`✅ Found device: ${device.name} (${device.type}) for topic: ${topicRoot}`);
  } else {
    // Log để debug nếu không tìm thấy device
    console.log(`⚠️  Device not found for topic: ${topicRoot}`);
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
    
    // Extract topic root từ MQTT topic
    // Ví dụ: home/kitchen/stove1/status -> home/kitchen/stove1
    // Hoặc: home/kitchen/myStove/status -> home/kitchen/myStove
    const topicParts = topic.split('/');
    const topicRoot = topicParts.slice(0, -1).join('/'); // Bỏ phần cuối (status/command)
    const deviceId = topicParts[topicParts.length - 2]; // Phần trước status/command
    
    // Gửi realtime xuống Web (dùng deviceId để frontend match)
    io.emit('device_update', { deviceId, data });
    
    // ===== LOGIC 1: TỰ ĐỘNG TẮT BẾP KHI PHÁT HIỆN GAS =====
    setImmediate(async () => {
      try {
        const device = await getDeviceCached(topicRoot);
        
        // Nếu là sensor_node và phát hiện GAS
        if (device && device.type === 'sensor_node' && data.gas === 'DETECTED') {
          // Tạo key riêng cho mỗi user để track gas detection
          const userGasKey = `user_${device.user_id}_gas`;
          if (!gasDetected || lastGasDetectionTime === null) {
            gasDetected = true;
            lastGasDetectionTime = new Date();
            console.log(`⚠️  GAS DETECTED for user ${device.user_id}! Tự động tắt tất cả bếp từ của user này...`);
            
            // Chỉ tắt bếp từ của cùng user với sensor
            const userStoves = await Device.find({ 
              type: 'stove_sim', 
              user_id: device.user_id 
            }).lean();
            
            for (const stove of userStoves) {
              const stoveTopic = stove.mqtt_topic_root;
              const command = JSON.stringify({ cmd: 'POWER', val: 'OFF' });
              mqttClient.publish(`${stoveTopic}/command`, command);
              console.log(`🔴 Đã gửi lệnh TẮT đến ${stove.name} (${stoveTopic}) của user ${device.user_id}`);
            }
            
            // Thông báo qua Socket.IO (chỉ gửi cho user đó)
            io.emit('safety_alert', {
              type: 'gas_detected',
              userId: device.user_id.toString(),
              message: '⚠️ Phát hiện khí GAS! Đã tự động tắt tất cả bếp từ.',
              timestamp: new Date()
            });
          }
        } else if (device && device.type === 'sensor_node' && data.gas === 'SAFE') {
          // Reset khi GAS an toàn (chỉ reset cho user đó)
          if (gasDetected) {
            gasDetected = false;
            lastGasDetectionTime = null;
            console.log(`✅ GAS SAFE for user ${device.user_id} - Đã reset trạng thái`);
          }
        }
      } catch (err) {
        console.error('Error in gas detection logic:', err.message);
      }
    });
    
    // ===== LOGIC 2: TỰ ĐỘNG ĐÓNG TỦ LẠNH KHI NHIỆT ĐỘ CAO =====
    setImmediate(async () => {
      try {
        const device = await getDeviceCached(topicRoot);
        
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
            
            // Nếu cửa đang mở
            if (doorStatus === 'OPEN') {
              // Bắt đầu đếm thời gian
              if (!status.highTempStartTime) {
                status.highTempStartTime = now;
                console.log(`🌡️  Tủ lạnh ${deviceId}: cửa mở. Bắt đầu đếm 15 phút...`);
              } else {
                // Kiểm tra đã qua 15 phút chưa
                const elapsedMinutes = (now - status.highTempStartTime) / (60 * 1000);
                if (elapsedMinutes >= 15) {
                  // Tự động đóng cửa
                  const fridgeTopic = device.mqtt_topic_root;
                  const command = JSON.stringify({ cmd: 'SET_DOOR', val: 'CLOSED' });
                  mqttClient.publish(`${fridgeTopic}/command`, command);
                  console.log(`❄️  Tự động đóng cửa tủ lạnh ${device.name} (${deviceId}) trong ${elapsedMinutes.toFixed(1)} phút`);
                  
                  // Reset timer
                  status.highTempStartTime = null;
                  status.door = 'CLOSED';
                  
                  // Thông báo qua Socket.IO
                  io.emit('safety_alert', {
                    type: 'fridge_auto_close',
                    deviceId: deviceId,
                    deviceName: device.name,
                    message: `Tủ lạnh ${device.name} đã tự động đóng cửa do mở cửa trong 15 phút.`,
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
        const device = await getDeviceCached(topicRoot);
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
    // Tự động gán user_id từ token (không cho phép user tự set user_id)
    // Convert string ID từ JWT thành MongoDB ObjectId
    const userId = new mongoose.Types.ObjectId(req.user.id);
    
    const deviceData = {
      ...req.body,
      user_id: userId // Lấy user_id từ JWT token và convert sang ObjectId
    };
    
    const newDevice = new Device(deviceData);
    await newDevice.save();
    
    // Xóa cache để đảm bảo device mới được nhận diện ngay
    deviceCache.delete(deviceData.mqtt_topic_root);
    
    console.log(`✅ Device added: ${newDevice.name} (${newDevice.type}) with topic: ${newDevice.mqtt_topic_root}`);
    
    // Tự động khởi động simulator nếu là stove_sim hoặc fridge_sim
    if (newDevice.type === 'stove_sim' || newDevice.type === 'fridge_sim') {
      const scriptPath = path.join(__dirname, 'scripts', 'manage-simulators.js');
      exec(`node ${scriptPath}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Failed to start simulator for ${newDevice.name}:`, error.message);
        } else {
          console.log(`✅ Simulator management script executed for ${newDevice.name}`);
          if (stdout) console.log(stdout);
        }
      });
    }
    
    res.json(newDevice);
  } catch (err) {
    // Handle duplicate key error (same mqtt_topic_root for same user)
    if (err.code === 11000) {
      return res.status(400).json({ error: 'Device with this topic already exists for your account' });
    }
    // Log lỗi chi tiết để debug
    console.error('Error adding device:', err);
    res.status(500).json({ error: err.message });
  }
});

// 5. API Lấy danh sách thiết bị (chỉ lấy devices của user hiện tại)
app.get('/api/devices', authMiddleware, async (req, res) => {
  try {
    // Chỉ lấy devices của user hiện tại (từ JWT token)
    // Convert string ID từ JWT thành MongoDB ObjectId
    const userId = new mongoose.Types.ObjectId(req.user.id);
    const devices = await Device.find({ user_id: userId });
    res.json(devices);
  } catch (err) { 
    console.error('Error getting devices:', err);
    res.status(500).json({ error: err.message }); 
  }
});

// 6. API Cập nhật thiết bị (đổi tên)
app.put('/api/devices/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const device = await Device.findById(id);
    if (!device) return res.status(404).json({ msg: 'Thiết bị không tồn tại' });
    
    // Kiểm tra ownership: chỉ cho phép user sở hữu device mới được sửa
    // Convert cả hai về string để so sánh
    const userId = new mongoose.Types.ObjectId(req.user.id);
    if (device.user_id.toString() !== userId.toString()) {
      return res.status(403).json({ msg: 'Bạn không có quyền sửa thiết bị này' });
    }
    
    // Không cho phép sửa sensor_node
    if (device.type === 'sensor_node') {
      return res.status(403).json({ msg: 'Không thể sửa thiết bị cảm biến' });
    }
    
    // Cho phép cập nhật tên và mqtt_topic_root
    let hasChanges = false;
    if (req.body.name && req.body.name !== device.name) {
      device.name = req.body.name;
      hasChanges = true;
    }
    
    if (req.body.mqtt_topic_root && req.body.mqtt_topic_root !== device.mqtt_topic_root) {
      // Validate topic format
      if (!req.body.mqtt_topic_root.match(/^[a-zA-Z0-9\/_-]+$/)) {
        return res.status(400).json({ msg: 'Topic không hợp lệ! Chỉ được chứa chữ cái, số, dấu gạch chéo (/), gạch dưới (_) và gạch ngang (-)' });
      }
      
      // Kiểm tra xem topic mới đã tồn tại cho user này chưa
      const existingDevice = await Device.findOne({ 
        mqtt_topic_root: req.body.mqtt_topic_root,
        user_id: userId,
        _id: { $ne: id } // Loại trừ device hiện tại
      });
      
      if (existingDevice) {
        return res.status(400).json({ msg: 'Topic này đã được sử dụng bởi thiết bị khác của bạn' });
      }
      
      // Xóa cache của topic cũ (nếu có trong cache)
      const oldTopic = device.mqtt_topic_root;
      // Cache key format: home/kitchen/{deviceId}
      // Nếu topic cũ là home/kitchen/stove1, cache key sẽ là home/kitchen/stove1
      // Nhưng getDeviceCached sử dụng deviceId từ topic, nên cần extract deviceId
      const oldDeviceId = oldTopic.split('/').pop();
      const oldCacheKey = `home/kitchen/${oldDeviceId}`;
      deviceCache.delete(oldCacheKey);
      
      device.mqtt_topic_root = req.body.mqtt_topic_root;
      hasChanges = true;
    }
    
    if (hasChanges) {
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
    
    // Kiểm tra ownership: chỉ cho phép user sở hữu device mới được xóa
    // Convert cả hai về string để so sánh
    const userId = new mongoose.Types.ObjectId(req.user.id);
    if (device.user_id.toString() !== userId.toString()) {
      return res.status(403).json({ msg: 'Bạn không có quyền xóa thiết bị này' });
    }
    
    // Không cho phép xóa sensor_node
    if (device.type === 'sensor_node') {
      return res.status(403).json({ msg: 'Không thể xóa thiết bị cảm biến' });
    }
    
    const deviceName = device.name;
    const deviceType = device.type;
    
    await Device.findByIdAndDelete(id);
    
    // Tự động dừng simulator nếu là stove_sim hoặc fridge_sim
    if (deviceType === 'stove_sim' || deviceType === 'fridge_sim') {
      const scriptPath = path.join(__dirname, 'scripts', 'manage-simulators.js');
      exec(`node ${scriptPath}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`❌ Failed to stop simulator for ${deviceName}:`, error.message);
        } else {
          console.log(`✅ Simulator stopped for deleted device: ${deviceName}`);
          if (stdout) console.log(stdout);
        }
      });
    }
    
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