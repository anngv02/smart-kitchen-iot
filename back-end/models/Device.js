const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { 
    type: String, 
    required: true,
    enum: ['sensor_node', 'stove_sim', 'fridge_sim'] 
  },

  mqtt_topic_root: { type: String, required: true }, 
  user_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  status: { type: String, default: 'offline' },
  last_state: { type: Object, default: {} },
  created_at: { type: Date, default: Date.now }
});

// Compound index: mqtt_topic_root + user_id must be unique together
// This allows same topic name for different users, but unique per user
deviceSchema.index({ mqtt_topic_root: 1, user_id: 1 }, { unique: true });

module.exports = mongoose.model('Device', deviceSchema);