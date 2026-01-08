import { createTemperatureChart } from './TemperatureChart.js';

export function createDeviceCard(dev, sendCommand, token, getTemperatureHistory) {
  const devId = dev.mqtt_topic_root.split('/').pop();
  const card = document.createElement('div');
  card.className = 'device-card stove-card';
  card.id = `card-${devId}`;

  card.innerHTML = `
    <h3>🍳 ${dev.name}</h3>
    <div class="status-row">
      <span>🌡️ Nhiệt độ:</span>
      <strong id="temp-${devId}">-- °C</strong>
    </div>
    <div class="status-row">
      <span>⚡ Trạng thái:</span>
      <strong id="power-${devId}" class="power-status off">OFF</strong>
    </div>
    <div class="status-row">
      <span>🔥 Mức lửa:</span>
      <strong id="level-${devId}">1</strong>
    </div>
    <div class="controls">
      <button class="btn-on">⚡ BẬT</button>
      <button class="btn-off">⏹️ TẮT</button>
    </div>
    <div class="slider-container">
      <label>Điều chỉnh mức lửa: <span id="level-display-${devId}">1</span>/9</label>
      <input type="range" min="1" max="9" value="1" id="range-${devId}">
    </div>
    <div id="chart-container-${devId}"></div>
    <style>
      .power-status.on { color: var(--success); }
      .power-status.off { color: var(--text-muted); }
    </style>
  `;

  const btnOn = card.querySelector('.btn-on');
  const btnOff = card.querySelector('.btn-off');
  const range = card.querySelector(`#range-${devId}`);
  const levelDisplay = card.querySelector(`#level-display-${devId}`);
  const chartContainer = card.querySelector(`#chart-container-${devId}`);

  btnOn.addEventListener('click', () => sendCommand(dev.mqtt_topic_root, 'POWER', 'ON'));
  btnOff.addEventListener('click', () => sendCommand(dev.mqtt_topic_root, 'POWER', 'OFF'));
  
  range.addEventListener('input', (e) => {
    levelDisplay.innerText = e.target.value;
  });
  
  range.addEventListener('change', (e) => {
    sendCommand(dev.mqtt_topic_root, 'SET_LEVEL', e.target.value);
  });

  // Create temperature chart if token and getTemperatureHistory are available
  if (token && getTemperatureHistory) {
    createTemperatureChart(chartContainer, devId, dev.type, token, getTemperatureHistory);
  }

  // Helper to update state from socket messages
  card.updateState = (data) => {
    const tempEl = card.querySelector(`#temp-${devId}`);
    const powerEl = card.querySelector(`#power-${devId}`);
    const levelEl = card.querySelector(`#level-${devId}`);

    if (tempEl && data.temperature !== undefined) {
      tempEl.innerText = `${data.temperature} °C`;
    }
    
    if (powerEl && data.power !== undefined) {
      powerEl.innerText = data.power;
      powerEl.className = `power-status ${data.power === 'ON' ? 'on' : 'off'}`;
    }
    
    if (levelEl && data.level !== undefined) {
      levelEl.innerText = data.level;
      range.value = data.level;
      levelDisplay.innerText = data.level;
    }

    if (data.power === 'ON') {
      card.classList.add('on');
    } else {
      card.classList.remove('on');
    }
  };

  return card;
}
