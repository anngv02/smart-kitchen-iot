const mongoose = require('mongoose');

const temperatureHistorySchema = new mongoose.Schema({
  device_id: { 
    type: String, 
    required: true,
    index: true 
  },
  device_type: {
    type: String,
    enum: ['stove_sim', 'fridge_sim'],
    required: true
  },
  temperature: { 
    type: Number, 
    required: true 
  },
  timestamp: { 
    type: Date, 
    default: Date.now,
    index: true 
  }
});

temperatureHistorySchema.index({ device_id: 1, timestamp: -1 });

// Tự động xóa dữ liệu cũ hơn 7 ngày (tùy chọn, để tránh DB quá lớn)
temperatureHistorySchema.index({ timestamp: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

module.exports = mongoose.model('TemperatureHistory', temperatureHistorySchema);

