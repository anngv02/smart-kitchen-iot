export function createTemperatureChart(container, deviceId, deviceType, token, getTemperatureHistory) {
  const chartContainer = document.createElement('div');
  chartContainer.className = 'temperature-chart-container';
  chartContainer.innerHTML = `
    <div class="chart-header">
      <h4>📊 Biểu đồ nhiệt độ  </h4>
      <div style="display:flex; gap:8px; align-items:center;">
        <select class="chart-range-select">
          <option value="8h">8 giờ</option>
          <option value="24h" selected>24 giờ</option>
          <option value="3d">3 ngày</option>
          <option value="5d">5 ngày</option>
        </select>
        <button class="chart-toggle-btn">Hiện/Ẩn</button>
      </div>
    </div>
    <div class="chart-wrapper" style="display: none;">
      <canvas id="chart-${deviceId}"></canvas>
    </div>
  `;
  
  container.appendChild(chartContainer);
  
  const chartWrapper = chartContainer.querySelector('.chart-wrapper');
  const toggleBtn = chartContainer.querySelector('.chart-toggle-btn');
  const rangeSelect = chartContainer.querySelector('.chart-range-select');
  const titleEl = chartContainer.querySelector('.chart-header h4');
  let chart = null;
  let isVisible = false;
  let currentRange = '24h';
  
  // Toggle chart visibility
  toggleBtn.addEventListener('click', () => {
    isVisible = !isVisible;
    chartWrapper.style.display = isVisible ? 'block' : 'none';
    
    if (isVisible && !chart) {
      loadAndRenderChart();
    } else if (isVisible && chart) {
      chart.resize();
    }
  });
  // Thay đổi khoảng thời gian hiển thị
  rangeSelect.addEventListener('change', () => {
    currentRange = rangeSelect.value;
    if (isVisible) {
      loadAndRenderChart();
    }
  });
  
  async function loadAndRenderChart() {
    try {
      const historyData = await getTemperatureHistory(token, deviceId, { range: currentRange });
      
      if (!historyData.data || historyData.data.length === 0) {
        chartWrapper.innerHTML = '<p style="text-align:center; color:#999; padding:20px;">Chưa có dữ liệu</p>';
        return;
      }
      
      // Cập nhật tiêu đề theo khoảng thời gian
      const windowLabel = historyData.window || currentRange || '5d';
      if (titleEl) {
        titleEl.textContent = `📊 Biểu đồ nhiệt độ (${windowLabel})`;
      }
      
      // Format dữ liệu cho Chart.js (bao gồm ngày + giờ)
      const labels = historyData.data.map(item => {
        const date = new Date(item.x);
        return date.toLocaleString('vi-VN', { 
          weekday: 'short', 
          hour: '2-digit', 
          minute: '2-digit' 
        });
      });
      
      const temperatures = historyData.data.map(item => item.y);
      
      // Tạo canvas nếu chưa có
      if (!chartWrapper.querySelector('canvas')) {
        chartWrapper.innerHTML = `<canvas id="chart-${deviceId}"></canvas>`;
      }
      
      const ctx = chartWrapper.querySelector(`#chart-${deviceId}`).getContext('2d');
      
      // Xóa chart cũ nếu có
      if (chart) {
        chart.destroy();
      }
      
      // Tạo chart mới
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: deviceType === 'stove_sim' ? 'Nhiệt độ bếp (°C)' : 'Nhiệt độ tủ lạnh (°C)',
            data: temperatures,
            borderColor: deviceType === 'stove_sim' ? 'rgb(231, 76, 60)' : 'rgb(52, 152, 219)',
            backgroundColor: deviceType === 'stove_sim' ? 'rgba(231, 76, 60, 0.1)' : 'rgba(52, 152, 219, 0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 2,
            pointHoverRadius: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2,
          plugins: {
            legend: {
              display: true,
              position: 'top'
            },
            tooltip: {
              mode: 'index',
              intersect: false
            }
          },
          scales: {
            y: {
              beginAtZero: false,
              title: {
                display: true,
                text: 'Nhiệt độ (°C)'
              }
            },
            x: {
              title: {
                display: true,
                text: 'Thời gian'
              },
              ticks: {
                maxTicksLimit: 15 // Giới hạn tick để tránh quá dày
              }
            }
          },
          interaction: {
            mode: 'nearest',
            axis: 'x',
            intersect: false
          }
        }
      });
      
      // Auto-resize khi window resize
      window.addEventListener('resize', () => {
        if (chart && isVisible) {
          chart.resize();
        }
      });
      
    } catch (error) {
      chartWrapper.innerHTML = `<p style="text-align:center; color:#e74c3c; padding:20px;">Lỗi tải dữ liệu: ${error.message}</p>`;
    }
  }
  
  // Public method để refresh chart
  chartContainer.refreshChart = () => {
    if (isVisible && chart) {
      loadAndRenderChart();
    }
  };
  
  return chartContainer;
}

