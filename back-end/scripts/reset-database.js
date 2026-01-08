require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const MONGO_URI = process.env.MONGO_URI;

// Import models
const User = require('../models/User');
const Device = require('../models/Device');
const TemperatureHistory = require('../models/TemperatureHistory');

async function resetDatabase() {
  try {
    // Kết nối MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    // 1. Xóa tất cả dữ liệu
    console.log('🗑️  Deleting all data...');
    await User.deleteMany({});
    console.log('   - Deleted all users');
    await Device.deleteMany({});
    console.log('   - Deleted all devices');
    await TemperatureHistory.deleteMany({});
    console.log('   - Deleted all temperature history');

    // 2. Tạo user admin123
    console.log('👤 Creating user admin123...');
    const newUser = new User({
      username: 'admin123',
      password: 'admin123', // Sẽ được hash bởi pre('save') hook trong User model
      role: 'admin'
    });
    await newUser.save();
    console.log(`   - User created with ID: ${newUser._id}`);

    // 3. Tạo device Cụm Cảm Biến Bếp
    console.log('📱 Creating device: Cụm Cảm Biến Bếp...');
    const newDevice = new Device({
      name: 'Cụm Cảm Biến Bếp',
      type: 'sensor_node',
      mqtt_topic_root: 'home/kitchen/sensor1',
      user_id: newUser._id,
      status: 'offline'
    });
    await newDevice.save();
    console.log(`   - Device created with ID: ${newDevice._id}`);

    console.log('\n✅ Database reset completed!');
    console.log('----------------------------');
    console.log('User: admin123 / admin123');
    console.log('Device: Cụm Cảm Biến Bếp (sensor_node)');
    console.log('Topic: home/kitchen/sensor1');
    console.log('----------------------------');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    await mongoose.connection.close();
    process.exit(1);
  }
}

resetDatabase();

