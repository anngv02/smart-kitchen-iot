import { createDeviceCard } from './DeviceCard.js';
import { createSensorCard } from './SensorCard.js';
import { createFridgeCard } from './FridgeCard.js';
import { createDeviceManager } from './DeviceManager.js';
import { addDevice, updateDevice, deleteDevice, getTemperatureHistory } from '../api.js';

let deviceManager = null;
let currentCards = new Map();
let currentOnDeviceUpdate = null;
let isRendering = false;

async function loadAndRenderDevices(container, token, { getDevices, sendCommand, onDeviceUpdate }) {
  const list = container.querySelector('#device-list');
  
  try {
    const devices = await getDevices(token);
    list.innerHTML = '';
    currentCards.clear();

    devices.forEach(dev => {
      const devId = dev.mqtt_topic_root.split('/').pop();

      if (dev.type === 'stove_sim') {
        const card = createDeviceCard(
          dev, 
          (topic, cmd, val) => sendCommand(token, topic, cmd, val),
          token,
          getTemperatureHistory
        );
        list.appendChild(card);
        currentCards.set(devId, card);
      }

      else if (dev.type === 'sensor_node') {
        const card = createSensorCard(dev);
        list.appendChild(card);
        currentCards.set(devId, card);
      }

      else if (dev.type === 'fridge_sim') {
        const card = createFridgeCard(
          dev, 
          (topic, cmd, val) => sendCommand(token, topic, cmd, val),
          token,
          getTemperatureHistory
        );
        list.appendChild(card);
        currentCards.set(devId, card);
      }
    });

    // subscribe updates
    if (currentOnDeviceUpdate) {
      currentOnDeviceUpdate((msg) => {
        const { deviceId, data } = msg;
        const card = currentCards.get(deviceId);
        if (card && card.updateState) card.updateState(data);
      });
    }

  } catch (e) {
    list.innerText = 'Không thể tải thiết bị.';
  }
}

export async function renderDashboard(container, token, { getDevices, sendCommand, onDeviceUpdate }) {
  // Prevent duplicate rendering
  if (isRendering) return;
  isRendering = true;
  
  // Clear container first to prevent duplicates
  container.innerHTML = '';
  
  container.innerHTML = `
    <div class="container">
      <div id="dashboard">
        <h2>🔥 Bếp Thông Minh</h2>
        <button id="manage-devices-btn" style="margin-bottom:15px; background:#9b59b6; width:100%">Quản lý Thiết bị</button>
        <div id="device-list">Đang tải thiết bị...</div>
        <button id="logout-btn" style="margin-top:20px; background:#95a5a6; width:100%">Đăng xuất</button>
      </div>
    </div>
  `;

  const list = container.querySelector('#device-list');
  const logoutBtn = container.querySelector('#logout-btn');
  const manageBtn = container.querySelector('#manage-devices-btn');
  
  currentOnDeviceUpdate = onDeviceUpdate;

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('token');
    location.reload();
  });

  // Initialize Device Manager only once
  if (!deviceManager) {
    deviceManager = createDeviceManager(token, {
      addDevice,
      updateDevice,
      deleteDevice,
      onDeviceChange: () => {
        loadAndRenderDevices(container, token, { getDevices, sendCommand, onDeviceUpdate });
      }
    });
    // Only append if not already in DOM
    if (!document.body.contains(deviceManager.modal)) {
      document.body.appendChild(deviceManager.modal);
    }
  }

  manageBtn.addEventListener('click', () => {
    deviceManager.show();
  });

  // Load devices initially
  await loadAndRenderDevices(container, token, { getDevices, sendCommand, onDeviceUpdate });
  
  isRendering = false;
}
