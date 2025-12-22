// Tự động detect API URL dựa trên hostname hiện tại
// export const API_URL = window.location.origin; // Sẽ là http://131.153.224.169:3000 nếu truy cập từ đó

// Hoặc nếu muốn hardcode:
export const API_URL = 'http://131.153.224.169:3000';

export async function login(username, password) {
  try {
    const res = await fetch(`${API_URL}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    if (!res.ok) throw new Error('Login failed');
    return res.json();
  } catch (e) {
    // Local dev fallback (no server): accept admin/admin
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      if (username === 'admin' && password === 'admin') return { token: 'local-dev-token' };
      throw new Error('Invalid credentials (local mock)');
    }
    throw e;
  }
}

export async function getDevices(token) {
  try {
    const res = await fetch(`${API_URL}/api/devices`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to load devices');
    return res.json();
  } catch (e) {
    // Local dev fallback: return sample devices so UI can be tested without a server
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      return [
        { id: 'stove1', name: 'Bếp Nhà Bếp', type: 'stove_sim', mqtt_topic_root: 'home/kitchen/stove1' },
        { id: 'sensor1', name: 'Cảm biến Bếp', type: 'sensor_node', mqtt_topic_root: 'home/kitchen/sensor1' },
        { id: 'fridge1', name: 'Tủ Lạnh Nhà Bếp', type: 'fridge_sim', mqtt_topic_root: 'home/kitchen/fridge1' }
      ];
    }
    throw e;
  }
}

export async function sendCommand(token, topic, cmd, val) {
  try {
    await fetch(`${API_URL}/api/device/command`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ topic, command: { cmd, val } })
    });
  } catch (e) {
    // Local dev fallback: just log when running on localhost
    if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
      console.log('[local-mock] sendCommand', { topic, cmd, val });
      return;
    }
    throw e;
  }
}

export async function addDevice(token, deviceData) {
  try {
    const res = await fetch(`${API_URL}/api/devices`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(deviceData)
    });
    if (!res.ok) throw new Error('Failed to add device');
    return res.json();
  } catch (e) {
    throw e;
  }
}

export async function updateDevice(token, deviceId, updates) {
  try {
    const res = await fetch(`${API_URL}/api/devices/${deviceId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('Failed to update device');
    return res.json();
  } catch (e) {
    throw e;
  }
}

export async function deleteDevice(token, deviceId) {
  try {
    const res = await fetch(`${API_URL}/api/devices/${deviceId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) throw new Error('Failed to delete device');
    return res.json();
  } catch (e) {
    throw e;
  }
}

export async function getTemperatureHistory(token, deviceId, options = {}) {
  try {
    const params = new URLSearchParams();

    // Ưu tiên range (8h, 24h, 3d, ...)
    if (options.range) {
      params.append('range', options.range);
    } else if (options.days) {
      params.append('days', String(options.days));
    } else {
      // Mặc định: 5 ngày gần nhất
      params.append('days', '5');
    }

    const res = await fetch(`${API_URL}/api/devices/${deviceId}/temperature-history?${params.toString()}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    if (!res.ok) throw new Error('Failed to load temperature history');
    return res.json();
  } catch (e) {
    throw e;
  }
}
