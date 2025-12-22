const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { 
    type: String, 
    required: true,
    enum: ['sensor_node', 'stove_sim', 'fridge_sim'] 
  },

  mqtt_topic_root: { type: String, required: true, unique: true }, 
  
  status: { type: String, default: 'offline' },
  last_state: { type: Object, default: {} },
  created_at: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Device', deviceSchema);