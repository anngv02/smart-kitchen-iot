import { login as apiLogin, register as apiRegister, getDevices, sendCommand, getTemperatureHistory } from './api.js';
import { initSocket } from './socket.js';
import { renderLogin } from './components/Login.js';
import { renderDashboard } from './components/Dashboard.js';

const root = document.getElementById('app');
let socket = null;
let isDashboardShown = false;

async function start() {
  const token = localStorage.getItem('token');
  if (token) return showDashboard(token);
  showLogin();
}

function showLogin() {
  isDashboardShown = false;
  renderLogin(root, 
    // onLogin callback
    async (user, pass) => {
      const data = await apiLogin(user, pass);
      localStorage.setItem('token', data.token);
      showDashboard(data.token);
    },
    // onRegister callback
    async (user, pass) => {
      await apiRegister(user, pass);
      // After successful registration, automatically log in
      const data = await apiLogin(user, pass);
      localStorage.setItem('token', data.token);
      showDashboard(data.token);
    }
  );
}

function showDashboard(token) {
  // Prevent duplicate dashboard rendering
  if (isDashboardShown) return;
  isDashboardShown = true;
  
  // Clear root first
  root.innerHTML = '';
  
  // initialize socket
  if (socket) socket.disconnect();
  socket = initSocket(() => {}); // we will wire updates inside renderDashboard via onDeviceUpdate

  renderDashboard(root, token, {
    getDevices,
    sendCommand,
    onDeviceUpdate: (cb) => {
      socket.on('device_update', cb);
    }
  });
}

start();
