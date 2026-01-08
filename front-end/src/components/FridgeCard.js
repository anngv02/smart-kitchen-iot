import { createTemperatureChart } from './TemperatureChart.js';

export function createFridgeCard(dev, sendCommand, token, getTemperatureHistory) {
  const devId = dev.mqtt_topic_root.split('/').pop();
  const card = document.createElement('div');
  card.className = 'device-card fridge-card';
  card.id = `card-${devId}`;

  card.innerHTML = `
    <h3>❄️ ${dev.name}</h3>

    <div class="status-row">
      <span>🌡️ Nhiệt độ khoang:</span>
      <strong id="curr-${devId}" class="temp-display">-- °C</strong>
    </div>

    <div class="status-row">
      <span>🚪 Cửa tủ:</span>
      <strong id="door-${devId}" class="door-status closed">CLOSED</strong>
    </div>

    <div class="controls">
      <button class="btn-door-open" id="open-btn-${devId}">🔓 MỞ CỬA</button>
      <button class="btn-door-close" id="close-btn-${devId}">🔒 ĐÓNG CỬA</button>
    </div>

    <div class="slider-container">
      <label>🎯 Đặt nhiệt độ: <span id="target-label-${devId}">4</span>°C</label>
      <input id="target-range-${devId}" type="range" min="0" max="10" step="0.5" value="4">
    </div>
    <div id="chart-container-${devId}"></div>
    <style>
      .fridge-card .temp-display { color: var(--accent); }
      .fridge-card .door-status.closed { color: var(--success); }
      .fridge-card .door-status.open { color: var(--warning); font-weight: 700; }
      .fridge-card.door-open {
        background: linear-gradient(135deg, rgba(241, 196, 15, 0.15) 0%, var(--bg-input) 100%) !important;
        border-left-color: var(--warning) !important;
      }
      .fridge-card.door-open::before {
        background: linear-gradient(90deg, var(--warning), transparent) !important;
      }
      .fridge-card.door-closed {
        background: linear-gradient(135deg, rgba(26, 188, 156, 0.1) 0%, var(--bg-input) 100%);
        border-left-color: var(--accent);
      }
      .fridge-card.door-closed::before {
        background: linear-gradient(90deg, var(--accent), transparent);
      }
      .btn-door-open {
        background: linear-gradient(135deg, var(--warning) 0%, #e67e22 100%) !important;
      }
      .btn-door-open:hover {
        box-shadow: 0 0 20px rgba(241, 196, 15, 0.4) !important;
      }
      .btn-door-close {
        background: linear-gradient(135deg, var(--accent) 0%, var(--accent-dark) 100%) !important;
      }
      .btn-door-close:hover {
        box-shadow: 0 0 20px rgba(26, 188, 156, 0.4) !important;
      }
    </style>
  `;

  // Elements
  const openBtn = card.querySelector(`#open-btn-${devId}`);
  const closeBtn = card.querySelector(`#close-btn-${devId}`);
  const range = card.querySelector(`#target-range-${devId}`);
  const targetLabel = card.querySelector(`#target-label-${devId}`);
  const chartContainer = card.querySelector(`#chart-container-${devId}`);

  // Events -> call sendCommand(topic, cmd, val)
  openBtn.addEventListener('click', () => sendCommand(dev.mqtt_topic_root, 'SET_DOOR', 'OPEN'));
  closeBtn.addEventListener('click', () => sendCommand(dev.mqtt_topic_root, 'SET_DOOR', 'CLOSED'));
  
  range.addEventListener('input', (e) => {
    targetLabel.innerText = e.target.value;
  });
  
  range.addEventListener('change', (e) => {
    const v = e.target.value;
    sendCommand(dev.mqtt_topic_root, 'SET_TEMP', v);
  });

  // Create temperature chart if token and getTemperatureHistory are available
  if (token && getTemperatureHistory) {
    createTemperatureChart(chartContainer, devId, dev.type, token, getTemperatureHistory);
  }

  // Called by Dashboard when socket update arrives
  card.updateState = (data) => {
    const tempEl = card.querySelector(`#curr-${devId}`);
    const doorEl = card.querySelector(`#door-${devId}`);

    if (tempEl && typeof data.current_temp !== 'undefined') {
      tempEl.innerText = `${data.current_temp} °C`;
    }
    
    if (doorEl && typeof data.door !== 'undefined') {
      doorEl.innerText = data.door;
      if (data.door === 'OPEN') {
        doorEl.className = 'door-status open';
        card.classList.remove('door-closed');
        card.classList.add('door-open');
      } else {
        doorEl.className = 'door-status closed';
        card.classList.remove('door-open');
        card.classList.add('door-closed');
      }
    }

    // If server sends a target_temp, reflect it
    if (typeof data.target_temp !== 'undefined' && targetLabel) {
      targetLabel.innerText = data.target_temp;
      range.value = data.target_temp;
    }
  };

  // Set initial state
  card.classList.add('door-closed');

  return card;
}
