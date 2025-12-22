import { API_URL } from './api.js';

export function initSocket(onDeviceUpdate) {
  // socket.io client is loaded via CDN in index.html
  // If frontend is served from localhost, prefer the local test server at 3001
  const localSocket = (location.hostname === 'localhost' || location.hostname === '127.0.0.1') ? 'http://localhost:3001' : null;
  const socketUrl = localSocket || API_URL;
  const socket = io(socketUrl);
  socket.on('device_update', (msg) => onDeviceUpdate(msg));
  return socket;
}

export function disconnectSocket(socket) {
  if (socket && socket.disconnect) socket.disconnect();
}
