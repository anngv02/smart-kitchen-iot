import { createTemperatureChart } from './TemperatureChart.js';

export function createDeviceCard(dev, sendCommand, token, getTemperatureHistory) {
  const devId = dev.mqtt_topic_root.split('/').pop();
  const card = document.createElement('div');
  card.className = 'device-card';
  card.id = `card-${devId}`;

  card.innerHTML = `
    <h3>${dev.name}</h3>
    <div class="status-row">
      <span>Nhiệt độ:</span>
      <strong id="temp-${devId}">-- °C</strong>
    </div>
    <div class="status-row">
      <span>Trạng thái:</span>
      <strong id="power-${devId}">OFF</strong>
    </div>
    <div class="controls">
      <button class="btn-on">BẬT</button>
      <button class="btn-off">TẮT</button>
    </div>
    <div class="slider-container">
      <label>Mức lửa (1-9): </label>
      <input type="range" min="1" max="9" value="1">
    </div>
    <div id="chart-container-${devId}"></div>
  `;

  const btnOn = card.querySelector('.btn-on');
  const btnOff = card.querySelector('.btn-off');
  const range = card.querySelector('input[type=range]');
  const chartContainer = card.querySelector(`#chart-container-${devId}`);

  btnOn.addEventListener('click', () => sendCommand(dev.mqtt_topic_root, 'POWER', 'ON'));
  btnOff.addEventListener('click', () => sendCommand(dev.mqtt_topic_root, 'POWER', 'OFF'));
  range.addEventListener('change', (e) => sendCommand(dev.mqtt_topic_root, 'SET_LEVEL', e.target.value));

  // Tạo biểu đồ nhiệt độ nếu có token và getTemperatureHistory
  if (token && getTemperatureHistory) {
    createTemperatureChart(chartContainer, devId, dev.type, token, getTemperatureHistory);
  }

  // Helper to update state from socket messages
  card.updateState = (data) => {
    const tempEl = card.querySelector(`#temp-${devId}`);
    const powerEl = card.querySelector(`#power-${devId}`);

    if (tempEl) tempEl.innerText = `${data.temperature} °C`;
    if (powerEl) powerEl.innerText = data.power;

    if (data.power === 'ON') card.classList.add('on');
    else card.classList.remove('on');
  };

  return card;
}
