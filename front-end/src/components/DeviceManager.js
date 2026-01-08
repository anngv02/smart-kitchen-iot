import { API_URL } from '../api.js';

export function createDeviceManager(token, { addDevice, updateDevice, deleteDevice, onDeviceChange }) {
  const modal = document.createElement('div');
  modal.className = 'device-manager-modal';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="device-manager-content">
      <div class="device-manager-header">
        <h2>Quản lý Thiết bị</h2>
        <button class="close-btn">✕</button>
      </div>
      
      <div class="device-manager-tabs">
        <button class="tab-btn active" data-tab="add">➕ Thêm mới</button>
        <button class="tab-btn" data-tab="manage">📋 Danh sách</button>
      </div>
      
      <div id="tab-add" class="tab-content active">
        <form id="add-device-form">
          <div class="form-group">
            <label>📝 Tên thiết bị</label>
            <input type="text" id="device-name" required placeholder="VD: Bếp Nhà Bếp 2">
          </div>
          <div class="form-group">
            <label>🏷️ Loại thiết bị</label>
            <select id="device-type" required>
              <option value="">Chọn loại...</option>
              <option value="stove_sim">🍳 Bếp từ</option>
              <option value="fridge_sim">❄️ Tủ lạnh</option>
            </select>
          </div>
          <div class="form-group">
            <label>📡 MQTT Topic</label>
            <input type="text" id="device-topic" placeholder="home/kitchen/...">
            <small>Topic sẽ được tạo tự động, nhưng bạn có thể chỉnh sửa nếu cần</small>
          </div>
          <button type="submit" class="btn-primary">🚀 Thêm Thiết bị</button>
        </form>
      </div>
      
      <div id="tab-manage" class="tab-content">
        <div id="device-list-manage">
          <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
            <div style="font-size: 32px; margin-bottom: 12px;">🔄</div>
            <div>Đang tải...</div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Auto-generate topic
  const typeSelect = modal.querySelector('#device-type');
  const topicInput = modal.querySelector('#device-topic');
  const nameInput = modal.querySelector('#device-name');
  
  async function generateTopic(type) {
    try {
      // Get current devices to find next number
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
      // Fallback if cannot get list
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
      showNotification('Vui lòng điền đầy đủ thông tin', 'warning');
      return;
    }
    
    const submitBtn = addForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '⏳ Đang thêm...';
    
    try {
      await addDevice(token, { name, type, mqtt_topic_root: topic });
      showNotification('Thêm thiết bị thành công!', 'success');
      addForm.reset();
      topicInput.value = '';
      if (onDeviceChange) onDeviceChange();
    } catch (err) {
      showNotification('Lỗi: ' + err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '🚀 Thêm Thiết bị';
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
            <strong>${getTypeIcon(dev.type)} ${dev.name}</strong>
            <span class="device-type">${getTypeLabel(dev.type)}</span>
            <div class="device-topic">${dev.mqtt_topic_root}</div>
          </div>
          ${!isSensor ? `
            <div class="device-actions">
              <button class="btn-edit" data-id="${dev._id}" data-name="${dev.name}">✏️ Tên</button>
              <button class="btn-edit" data-action="topic" data-id="${dev._id}" data-topic="${dev.mqtt_topic_root}">📡 Topic</button>
              <button class="btn-delete" data-id="${dev._id}">🗑️</button>
            </div>
          ` : '<span class="readonly-badge">🔒 Hardware</span>'}
        `;
        
        if (!isSensor) {
          const editNameBtn = item.querySelector('.btn-edit:not([data-action])');
          const editTopicBtn = item.querySelector('.btn-edit[data-action="topic"]');
          const deleteBtn = item.querySelector('.btn-delete');
          
          editNameBtn.addEventListener('click', () => {
            const newName = prompt('Nhập tên mới:', dev.name);
            if (newName && newName.trim() && newName !== dev.name) {
              updateDeviceName(dev._id, newName.trim());
            }
          });
          
          editTopicBtn.addEventListener('click', () => {
            const newTopic = prompt('Nhập MQTT Topic mới:', dev.mqtt_topic_root);
            if (newTopic && newTopic.trim() && newTopic !== dev.mqtt_topic_root) {
              // Validate topic format
              if (!newTopic.match(/^[a-zA-Z0-9\/_-]+$/)) {
                showNotification('Topic không hợp lệ! Chỉ được chứa chữ cái, số, /, _ và -', 'error');
                return;
              }
              updateDeviceTopic(dev._id, newTopic.trim());
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
        listContainer.innerHTML = `
          <div style="text-align: center; padding: 40px 20px; color: var(--text-secondary);">
            <div style="font-size: 48px; margin-bottom: 12px;">📭</div>
            <div>Chưa có thiết bị nào</div>
            <div style="font-size: 13px; margin-top: 8px; color: var(--text-muted);">Thêm thiết bị mới ở tab "Thêm mới"</div>
          </div>
        `;
      }
    } catch (err) {
      listContainer.innerHTML = `
        <div style="text-align: center; padding: 40px 20px; color: var(--danger);">
          <div style="font-size: 48px; margin-bottom: 12px;">⚠️</div>
          <div>Lỗi tải danh sách thiết bị</div>
        </div>
      `;
    }
  }

  async function updateDeviceName(id, newName) {
    try {
      await updateDevice(token, id, { name: newName });
      showNotification('Đổi tên thành công!', 'success');
      loadDeviceList();
      if (onDeviceChange) onDeviceChange();
    } catch (err) {
      showNotification('Lỗi: ' + err.message, 'error');
    }
  }

  async function updateDeviceTopic(id, newTopic) {
    try {
      await updateDevice(token, id, { mqtt_topic_root: newTopic });
      showNotification('Đổi Topic thành công!', 'success');
      loadDeviceList();
      if (onDeviceChange) onDeviceChange();
    } catch (err) {
      showNotification('Lỗi: ' + err.message, 'error');
    }
  }

  async function deleteDeviceById(id) {
    try {
      await deleteDevice(token, id);
      showNotification('Xóa thiết bị thành công!', 'success');
      loadDeviceList();
      if (onDeviceChange) onDeviceChange();
    } catch (err) {
      showNotification('Lỗi: ' + err.message, 'error');
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

  function getTypeIcon(type) {
    const icons = {
      'stove_sim': '🍳',
      'fridge_sim': '❄️',
      'sensor_node': '🚨'
    };
    return icons[type] || '📱';
  }

  // Notification helper
  function showNotification(message, type = 'info') {
    const existingToast = document.querySelector('.toast-notification');
    if (existingToast) existingToast.remove();

    const colors = {
      info: 'var(--primary)',
      warning: 'var(--warning)',
      error: 'var(--danger)',
      success: 'var(--success)'
    };

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: ${colors[type] || colors.info};
      color: white;
      padding: 14px 28px;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      z-index: 9999;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      transition: transform 0.4s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: 'Quicksand', sans-serif;
    `;
    
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(0)';
    }, 10);
    
    setTimeout(() => {
      toast.style.transform = 'translateX(-50%) translateY(100px)';
      setTimeout(() => toast.remove(), 400);
    }, 3000);
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
