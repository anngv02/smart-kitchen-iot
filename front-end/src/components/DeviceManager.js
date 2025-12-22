import { API_URL } from '../api.js';

export function createDeviceManager(token, { addDevice, updateDevice, deleteDevice, onDeviceChange }) {
  const modal = document.createElement('div');
  modal.className = 'device-manager-modal';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="device-manager-content">
      <div class="device-manager-header">
        <h2>Quản lý Thiết bị</h2>
        <button class="close-btn">&times;</button>
      </div>
      
      <div class="device-manager-tabs">
        <button class="tab-btn active" data-tab="add">Thêm Thiết bị</button>
        <button class="tab-btn" data-tab="manage">Quản lý Thiết bị</button>
      </div>
      
      <div id="tab-add" class="tab-content active">
        <form id="add-device-form">
          <div class="form-group">
            <label>Tên thiết bị:</label>
            <input type="text" id="device-name" required placeholder="VD: Bếp Nhà Bếp 2">
          </div>
          <div class="form-group">
            <label>Loại thiết bị:</label>
            <select id="device-type" required>
              <option value="">Chọn loại...</option>
              <option value="stove_sim">Bếp từ</option>
              <option value="fridge_sim">Tủ lạnh</option>
            </select>
          </div>
          <div class="form-group">
            <label>MQTT Topic (tự động tạo):</label>
            <input type="text" id="device-topic" readonly placeholder="home/kitchen/...">
          </div>
          <button type="submit" class="btn-primary">Thêm Thiết bị</button>
        </form>
      </div>
      
      <div id="tab-manage" class="tab-content">
        <div id="device-list-manage">Đang tải...</div>
      </div>
    </div>
  `;

  // Tạo topic tự động
  const typeSelect = modal.querySelector('#device-type');
  const topicInput = modal.querySelector('#device-topic');
  const nameInput = modal.querySelector('#device-name');
  
  async function generateTopic(type) {
    try {
      // Lấy danh sách thiết bị hiện có để tìm số tiếp theo
      const res = await fetch(`${API_URL}/api/devices`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const devices = await res.json();
      
      const prefix = type === 'stove_sim' ? 'stove' : 'fridge';
      const existing = devices
        .filter(d => d.type === type)
        .map(d => {
          const parts = d.mqtt_topic_root.split('/');
          const last = parts[parts.length - 1];
          const match = last.match(new RegExp(`^${prefix}(\\d+)$`));
          return match ? parseInt(match[1]) : 0;
        });
      
      const nextNum = existing.length > 0 ? Math.max(...existing) + 1 : 1;
      return `home/kitchen/${prefix}${nextNum}`;
    } catch (err) {
      // Fallback nếu không lấy được danh sách
      const prefix = type === 'stove_sim' ? 'stove' : 'fridge';
      return `home/kitchen/${prefix}1`;
    }
  }
  
  typeSelect.addEventListener('change', async (e) => {
    if (e.target.value) {
      topicInput.value = await generateTopic(e.target.value);
    } else {
      topicInput.value = '';
    }
  });

  // Tab switching
  const tabBtns = modal.querySelectorAll('.tab-btn');
  const tabContents = modal.querySelectorAll('.tab-content');
  
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      tabBtns.forEach(b => b.classList.remove('active'));
      tabContents.forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      modal.querySelector(`#tab-${tab}`).classList.add('active');
      
      if (tab === 'manage') {
        loadDeviceList();
      }
    });
  });

  // Close modal
  modal.querySelector('.close-btn').addEventListener('click', () => {
    modal.style.display = 'none';
  });
  
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.style.display = 'none';
    }
  });

  // Add device form
  const addForm = modal.querySelector('#add-device-form');
  addForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const type = typeSelect.value;
    const topic = topicInput.value;
    
    if (!name || !type || !topic) {
      alert('Vui lòng điền đầy đủ thông tin');
      return;
    }
    
    try {
      await addDevice(token, { name, type, mqtt_topic_root: topic });
      alert('Thêm thiết bị thành công!');
      addForm.reset();
      topicInput.value = '';
      if (onDeviceChange) onDeviceChange();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  });

  // Load device list for management
  async function loadDeviceList() {
    const listContainer = modal.querySelector('#device-list-manage');
    try {
      const res = await fetch(`${API_URL}/api/devices`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const devices = await res.json();
      
      listContainer.innerHTML = '';
      
      devices.forEach(dev => {
        const isSensor = dev.type === 'sensor_node';
        const item = document.createElement('div');
        item.className = 'device-manage-item';
        item.innerHTML = `
          <div class="device-info">
            <strong>${dev.name}</strong>
            <span class="device-type">${getTypeLabel(dev.type)}</span>
          </div>
          ${!isSensor ? `
            <div class="device-actions">
              <button class="btn-edit" data-id="${dev._id}" data-name="${dev.name}">Đổi tên</button>
              <button class="btn-delete" data-id="${dev._id}">Xóa</button>
            </div>
          ` : '<span class="readonly-badge">Chỉ đọc</span>'}
        `;
        
        if (!isSensor) {
          const editBtn = item.querySelector('.btn-edit');
          const deleteBtn = item.querySelector('.btn-delete');
          
          editBtn.addEventListener('click', () => {
            const newName = prompt('Nhập tên mới:', dev.name);
            if (newName && newName.trim() && newName !== dev.name) {
              updateDeviceName(dev._id, newName.trim());
            }
          });
          
          deleteBtn.addEventListener('click', () => {
            if (confirm(`Bạn có chắc muốn xóa "${dev.name}"?`)) {
              deleteDeviceById(dev._id);
            }
          });
        }
        
        listContainer.appendChild(item);
      });
      
      if (devices.length === 0) {
        listContainer.innerHTML = '<p style="text-align:center; color:#999;">Chưa có thiết bị nào</p>';
      }
    } catch (err) {
      listContainer.innerHTML = '<p style="color:red;">Lỗi tải danh sách thiết bị</p>';
    }
  }

  async function updateDeviceName(id, newName) {
    try {
      await updateDevice(token, id, { name: newName });
      alert('Đổi tên thành công!');
      loadDeviceList();
      if (onDeviceChange) onDeviceChange();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  }

  async function deleteDeviceById(id) {
    try {
      await deleteDevice(token, id);
      alert('Xóa thiết bị thành công!');
      loadDeviceList();
      if (onDeviceChange) onDeviceChange();
    } catch (err) {
      alert('Lỗi: ' + err.message);
    }
  }

  function getTypeLabel(type) {
    const labels = {
      'stove_sim': 'Bếp từ',
      'fridge_sim': 'Tủ lạnh',
      'sensor_node': 'Cảm biến'
    };
    return labels[type] || type;
  }

  return {
    modal,
    show: () => {
      modal.style.display = 'flex';
      // Reset form
      addForm.reset();
      topicInput.value = '';
    },
    hide: () => {
      modal.style.display = 'none';
    }
  };
}

