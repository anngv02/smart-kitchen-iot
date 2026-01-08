export function createTemperatureChart(container, deviceId, deviceType, token, getTemperatureHistory) {
  const chartContainer = document.createElement('div');
  chartContainer.className = 'temperature-chart-container';
  chartContainer.innerHTML = `
    <div class="chart-header">
      <h4>📈 Biểu đồ nhiệt độ</h4>
      <div style="display:flex; gap:8px; align-items:center;">
        <select class="chart-range-select">
          <option value="8h">8 giờ</option>
          <option value="24h" selected>24 giờ</option>
          <option value="3d">3 ngày</option>
          <option value="5d">5 ngày</option>
        </select>
        <button class="chart-toggle-btn">📊 Xem</button>
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
    toggleBtn.textContent = isVisible ? '📉 Ẩn' : '📊 Xem';
    
    if (isVisible && !chart) {
      loadAndRenderChart();
    } else if (isVisible && chart) {
      chart.resize();
    }
  });
  
  // Change time range
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
        chartWrapper.innerHTML = `
          <div style="text-align:center; padding:30px; color: var(--text-secondary);">
            <div style="font-size: 32px; margin-bottom: 8px;">📭</div>
            <div>Chưa có dữ liệu</div>
          </div>
        `;
        return;
      }
      
      // Update title with time window
      const windowLabel = historyData.window || currentRange || '5d';
      if (titleEl) {
        titleEl.textContent = `📈 Biểu đồ nhiệt độ (${windowLabel})`;
      }
      
      // Format data for Chart.js (including day + time)
      const labels = historyData.data.map(item => {
        const date = new Date(item.x);
        return date.toLocaleString('vi-VN', { 
          weekday: 'short', 
          hour: '2-digit', 
          minute: '2-digit' 
        });
      });
      
      const temperatures = historyData.data.map(item => item.y);
      
      // Create canvas if not exists
      if (!chartWrapper.querySelector('canvas')) {
        chartWrapper.innerHTML = `<canvas id="chart-${deviceId}"></canvas>`;
      }
      
      const ctx = chartWrapper.querySelector(`#chart-${deviceId}`).getContext('2d');
      
      // Destroy old chart if exists
      if (chart) {
        chart.destroy();
      }
      
      // Colors for the theme
      const isStove = deviceType === 'stove_sim';
      const lineColor = isStove ? '#e67e22' : '#1abc9c';
      const bgColor = isStove ? 'rgba(230, 126, 34, 0.2)' : 'rgba(26, 188, 156, 0.2)';
      
      // Create new chart
      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: labels,
          datasets: [{
            label: isStove ? '🍳 Nhiệt độ bếp (°C)' : '❄️ Nhiệt độ tủ lạnh (°C)',
            data: temperatures,
            borderColor: lineColor,
            backgroundColor: bgColor,
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 2,
            pointHoverRadius: 6,
            pointBackgroundColor: lineColor,
            pointBorderColor: '#1a1a2e',
            pointBorderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          aspectRatio: 2,
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                color: '#eaeaea',
                font: {
                  family: "'Quicksand', sans-serif",
                  weight: '600'
                },
                padding: 15
              }
            },
            tooltip: {
              mode: 'index',
              intersect: false,
              backgroundColor: 'rgba(22, 33, 62, 0.95)',
              titleColor: '#eaeaea',
              bodyColor: '#a0a0a0',
              borderColor: lineColor,
              borderWidth: 1,
              padding: 12,
              cornerRadius: 8,
              titleFont: {
                family: "'Quicksand', sans-serif",
                weight: '600'
              },
              bodyFont: {
                family: "'Quicksand', sans-serif"
              }
            }
          },
          scales: {
            y: {
              beginAtZero: false,
              grid: {
                color: 'rgba(255, 255, 255, 0.05)',
                drawBorder: false
              },
              ticks: {
                color: '#a0a0a0',
                font: {
                  family: "'Quicksand', sans-serif"
                }
              },
              title: {
                display: true,
                text: 'Nhiệt độ (°C)',
                color: '#eaeaea',
                font: {
                  family: "'Quicksand', sans-serif",
                  weight: '600'
                }
              }
            },
            x: {
              grid: {
                color: 'rgba(255, 255, 255, 0.05)',
                drawBorder: false
              },
              ticks: {
                color: '#a0a0a0',
                maxTicksLimit: 12,
                font: {
                  family: "'Quicksand', sans-serif",
                  size: 10
                }
              },
              title: {
                display: true,
                text: 'Thời gian',
                color: '#eaeaea',
                font: {
                  family: "'Quicksand', sans-serif",
                  weight: '600'
                }
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
      
      // Auto-resize on window resize
      window.addEventListener('resize', () => {
        if (chart && isVisible) {
          chart.resize();
        }
      });
      
    } catch (error) {
      chartWrapper.innerHTML = `
        <div style="text-align:center; padding:30px; color: var(--danger);">
          <div style="font-size: 32px; margin-bottom: 8px;">⚠️</div>
          <div>Lỗi tải dữ liệu: ${error.message}</div>
        </div>
      `;
    }
  }
  
  // Public method to refresh chart
  chartContainer.refreshChart = () => {
    if (isVisible && chart) {
      loadAndRenderChart();
    }
  };
  
  return chartContainer;
}
