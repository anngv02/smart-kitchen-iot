export function createSensorCard(dev) {
  const devId = dev.mqtt_topic_root.split('/').pop();
  const card = document.createElement('div');
  card.className = 'device-card sensor-card';
  card.id = `card-${devId}`;

  card.innerHTML = `
    <h3>🚨 ${dev.name}</h3>
    <div class="status-row">
      <span>💨 Khói:</span>
      <strong id="gas-${devId}" class="status-safe">SAFE</strong>
    </div>
    <div class="status-row">
      <span>🔥 Lửa:</span>
      <strong id="fire-${devId}" class="status-safe">SAFE</strong>
    </div>
    <div style="margin-top:14px; font-size: 13px; color: var(--text-muted); display: flex; align-items: center; gap: 6px;">
      <span style="display: inline-block; width: 8px; height: 8px; background: var(--accent); border-radius: 50%; animation: pulse 2s infinite;"></span>
      Dữ liệu cập nhật từ phần cứng
    </div>
    <style>
      @keyframes pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50% { opacity: 0.5; transform: scale(0.8); }
      }
      .status-safe { color: var(--success) !important; }
      .status-danger { color: var(--danger) !important; font-weight: 700; }
      .sensor-card.danger {
        background: linear-gradient(135deg, rgba(231, 76, 60, 0.2) 0%, var(--bg-input) 100%) !important;
        border-left-color: var(--danger) !important;
      }
      .sensor-card.danger::before {
        background: linear-gradient(90deg, var(--danger), transparent) !important;
      }
    </style>
  `;

  card.updateState = (data) => {
    const gasEl = card.querySelector(`#gas-${devId}`);
    const fireEl = card.querySelector(`#fire-${devId}`);
    
    if (gasEl && typeof data.gas !== 'undefined') {
      gasEl.innerText = data.gas;
      if (data.gas === 'DETECTED') {
        gasEl.className = 'status-danger';
      } else {
        gasEl.className = 'status-safe';
      }
    }
    
    if (fireEl && typeof data.fire !== 'undefined') {
      fireEl.innerText = data.fire;
      if (data.fire === 'DETECTED') {
        fireEl.className = 'status-danger';
      } else {
        fireEl.className = 'status-safe';
      }
    }

    // Change card styling when there is danger
    if ((data.gas === 'DETECTED') || (data.fire === 'DETECTED')) {
      card.classList.add('danger');
    } else {
      card.classList.remove('danger');
    }
  };

  return card;
}
