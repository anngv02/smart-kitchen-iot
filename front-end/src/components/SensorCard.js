export function createSensorCard(dev) {
  const devId = dev.mqtt_topic_root.split('/').pop();
  const card = document.createElement('div');
  card.className = 'device-card';
  card.id = `card-${devId}`;

  card.innerHTML = `
    <h3>🚨 ${dev.name}</h3>
    <div class="status-row">
      <span>Khí Gas:</span>
      <strong id="gas-${devId}" style="color: green">SAFE</strong>
    </div>
    <div class="status-row">
      <span>Lửa:</span>
      <strong id="fire-${devId}" style="color: green">SAFE</strong>
    </div>
    <div style="margin-top:10px; font-size: 14px; color: gray;">*Dữ liệu cập nhật từ phần cứng</div>
  `;

  card.updateState = (data) => {
    const gasEl = card.querySelector(`#gas-${devId}`);
    const fireEl = card.querySelector(`#fire-${devId}`);
    if (gasEl && typeof data.gas !== 'undefined') {
      gasEl.innerText = data.gas;
      gasEl.style.color = data.gas === 'DETECTED' ? 'red' : 'green';
    }
    if (fireEl && typeof data.fire !== 'undefined') {
      fireEl.innerText = data.fire;
      fireEl.style.color = data.fire === 'DETECTED' ? 'red' : 'green';
    }

    // change card styling when there is an issue
    if ((data.gas === 'DETECTED') || (data.fire === 'DETECTED')) {
      card.style.backgroundColor = '#fadbd8';
      card.style.borderLeftColor = '#e74c3c';
    } else {
      card.style.backgroundColor = '#ecf0f1';
      card.style.borderLeftColor = '#bdc3c7';
    }
  };

  return card;
}
