require('dotenv').config();
const mongoose = require('mongoose');
const pm2 = require('pm2');
const path = require('path');
const Device = require('../models/Device');

const MONGO_URI = process.env.MONGO_URI;
const PROJECT_ROOT = path.join(__dirname, '..', '..');

// Kết nối MongoDB
mongoose.connect(MONGO_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => {
    console.error('❌ MongoDB Error:', err);
    process.exit(1);
  });

// Kết nối PM2
pm2.connect((err) => {
  if (err) {
    console.error('❌ PM2 Connection Error:', err);
    process.exit(1);
  }
  console.log('✅ Connected to PM2');
  startSimulators();
});

async function startSimulators() {
  try {
    // 1. Lấy tất cả devices từ DB (chỉ stove_sim và fridge_sim)
    const devices = await Device.find({
      type: { $in: ['stove_sim', 'fridge_sim'] }
    }).lean();

    console.log(`📋 Found ${devices.length} simulator devices`);

    if (devices.length === 0) {
      console.log('ℹ️  No simulator devices found. Exiting.');
      pm2.disconnect();
      mongoose.connection.close();
      process.exit(0);
    }

    // 2. Lấy danh sách PM2 processes hiện tại
    const pm2List = await new Promise((resolve, reject) => {
      pm2.list((err, list) => {
        if (err) reject(err);
        else resolve(list);
      });
    });

    const runningSimulators = pm2List
      .filter(p => p.name && p.name.startsWith('sim-'))
      .map(p => p.name);

    console.log(`🔄 Currently running simulators: ${runningSimulators.length}`);

    // 3. Khởi động simulator cho mỗi device
    for (const device of devices) {
      const simulatorName = `sim-${device._id}`;
      const simulatorType = device.type === 'stove_sim' ? 'stove' : 'fridge';
      const simulatorScript = path.join(PROJECT_ROOT, 'front-end', `${simulatorType}.js`);

      // Kiểm tra xem simulator đã chạy chưa
      if (runningSimulators.includes(simulatorName)) {
        console.log(`⏭️  Simulator ${simulatorName} already running`);
        continue;
      }

      // Khởi động simulator với topic từ DB
      await new Promise((resolve, reject) => {
        pm2.start({
          name: simulatorName,
          script: simulatorScript,
          cwd: path.join(PROJECT_ROOT, 'front-end'),
          args: [device.mqtt_topic_root], // Truyền topic làm argument
          autorestart: true,
          watch: false,
          env: {
            DEVICE_TOPIC: device.mqtt_topic_root,
            DEVICE_ID: device._id.toString(),
            NODE_ENV: 'production'
          },
          error_file: `/home/ubuntu/.pm2/logs/${simulatorName}-error.log`,
          out_file: `/home/ubuntu/.pm2/logs/${simulatorName}-out.log`,
          log_date_format: 'YYYY-MM-DD HH:mm:ss Z'
        }, (err, apps) => {
          if (err) {
            console.error(`❌ Failed to start ${simulatorName}:`, err);
            reject(err);
          } else {
            console.log(`✅ Started simulator: ${simulatorName} (${device.name}) - Topic: ${device.mqtt_topic_root}`);
            resolve();
          }
        });
      });
    }

    // 4. Dừng simulators không còn trong DB
    for (const runningName of runningSimulators) {
      const deviceId = runningName.replace('sim-', '');
      const deviceExists = devices.some(d => d._id.toString() === deviceId);
      
      if (!deviceExists) {
        await new Promise((resolve, reject) => {
          pm2.delete(runningName, (err) => {
            if (err) {
              console.error(`❌ Failed to stop ${runningName}:`, err);
              reject(err);
            } else {
              console.log(`🛑 Stopped simulator: ${runningName}`);
              resolve();
            }
          });
        });
      }
    }

    // 5. Lưu PM2 process list
    pm2.save((err) => {
      if (err) {
        console.error('❌ Failed to save PM2 process list:', err);
      } else {
        console.log('💾 Saved PM2 process list');
      }
      pm2.disconnect();
      mongoose.connection.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Error:', error);
    pm2.disconnect();
    mongoose.connection.close();
    process.exit(1);
  }
}

