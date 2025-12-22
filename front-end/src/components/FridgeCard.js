import { createTemperatureChart } from './TemperatureChart.js';

export function createFridgeCard(dev, sendCommand, token, getTemperatureHistory) {
  const devId = dev.mqtt_topic_root.split('/').pop();
  const card = document.createElement('div');
  card.className = 'device-card';
  card.id = `card-${devId}`;

  card.innerHTML = `
    <h3>❄️ ${dev.name}</h3>

    <div class="status-row">
      <span>Nhiệt độ khoang:</span>
      <strong id="curr-${devId}" style="color: #2980b9">-- °C</strong>
    </div>

    <div class="status-row">
      <span>Cửa tủ:</span>
      <strong id="door-${devId}">CLOSED</strong>
    </div>

    <div class="controls">
      <button class="btn-off" id="open-btn-${devId}" style="background:#e67e22">MỞ CỬA</button>
      <button class="btn-on" id="close-btn-${devId}" style="background:#3498db">ĐÓNG CỬA</button>
    </div>

    <div class="slider-container">
      <label>Đặt nhiệt độ (0 - 10°C): <span id="target-label-${devId}">4</span>°C</label>
      <input id="target-range-${devId}" type="range" min="0" max="10" step="0.5" value="4">
    </div>
    <div id="chart-container-${devId}"></div>
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
  range.addEventListener('change', (e) => {
    const v = e.target.value;
    if (targetLabel) targetLabel.innerText = v;
    sendCommand(dev.mqtt_topic_root, 'SET_TEMP', v);
  });

  // Tạo biểu đồ nhiệt độ nếu có token và getTemperatureHistory
  if (token && getTemperatureHistory) {
    createTemperatureChart(chartContainer, devId, dev.type, token, getTemperatureHistory);
  }

  // Called by Dashboard when socket update arrives
  card.updateState = (data) => {
    const tempEl = card.querySelector(`#curr-${devId}`);
    const doorEl = card.querySelector(`#door-${devId}`);

    if (tempEl && typeof data.current_temp !== 'undefined') tempEl.innerText = `${data.current_temp} °C`;
    if (doorEl && typeof data.door !== 'undefined') {
      doorEl.innerText = data.door;
      if (data.door === 'OPEN') {
        doorEl.style.color = 'red';
        card.style.backgroundColor = '#fdf2e9'; // light orange
        card.style.borderLeftColor = '#e67e22';
      } else {
        doorEl.style.color = 'green';
        card.style.backgroundColor = '#ebf5fb'; // light blue
        card.style.borderLeftColor = '#3498db';
      }
    }

    // If server sends a target_temp, reflect it
    if (typeof data.target_temp !== 'undefined' && targetLabel) {
      targetLabel.innerText = data.target_temp;
      range.value = data.target_temp;
    }
  };

  return card;
}
