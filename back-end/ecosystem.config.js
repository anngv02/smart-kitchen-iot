module.exports = {
  apps: [{
    name: 'kitchen-backend',
    script: './server.js',
    cwd: '/home/ubuntu/smart-kitchen-iot/back-end',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G', // Tự động restart khi vượt quá 1GB
    env: {
      NODE_ENV: 'production'
    },
    error_file: '/home/ubuntu/.pm2/logs/kitchen-backend-error.log',
    out_file: '/home/ubuntu/.pm2/logs/kitchen-backend-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    // Giới hạn số lần restart liên tiếp
    max_restarts: 10,
    min_uptime: '10s',
    // Restart delay
    restart_delay: 4000
  }]
};

