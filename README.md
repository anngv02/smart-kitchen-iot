# Smart Kitchen IoT

An end-to-end smart kitchen monitoring and control system featuring ESP32 sensor nodes, MQTT messaging, Node.js backend with real-time Socket.IO, and a responsive web dashboard. Includes device simulators (stove, fridge) and automated safety features (auto-off stove on gas leak, auto-close fridge on high temperature).

## System Architecture

```
┌─────────────────┐     MQTT      ┌─────────────────┐     Socket.IO    ┌─────────────────┐
│   ESP32 Node    │──────────────▶│   Node.js       │◀────────────────▶│   Web Dashboard │
│  (Gas/Flame)    │◀──────────────│   Backend       │                  │   (Browser)     │
└─────────────────┘               └────────┬────────┘                  └─────────────────┘
                                           │
┌─────────────────┐     MQTT               │ MongoDB
│   Simulators    │────────────────────────┤
│ (Stove/Fridge)  │◀───────────────────────┤
└─────────────────┘                        ▼
                                  ┌─────────────────┐
                                  │    MongoDB      │
                                  │  (Users, Devs)  │
                                  └─────────────────┘
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| **Embedded** | ESP32, FreeRTOS, DHT22, MQ-2 Gas Sensor, Flame Sensor, Telegram Bot |
| **IoT Protocol** | MQTT (Mosquitto broker) - Topics: `home/kitchen/{deviceId}/status\|command` |
| **Backend** | Node.js, Express.js, Socket.IO, MQTT.js, Mongoose (MongoDB), JWT, bcryptjs, dotenv |
| **Frontend** | Vanilla JavaScript (ES Modules), Socket.IO Client, Chart.js, Responsive CSS |
| **Database** | MongoDB with TTL indexes (7-day auto-cleanup) |
| **Process Manager** | PM2 (1GB memory cap, auto-restart, auto-start on boot) |

## Key Features

### Authentication & User Management
- User registration and login with JWT tokens
- Password hashing with bcrypt
- Per-user device isolation

### Device Management
- Add/delete/rename devices (stove, fridge)
- Sensor nodes are read-only (protected)
- Editable MQTT topics per device
- Automatic simulator management via PM2

### Real-time Control
- **Stove**: Power ON/OFF, 9-level temperature control (max 300°C)
- **Fridge**: Door open/close, temperature set point
- Instant status updates via Socket.IO

### Monitoring & Visualization
- Live sensor data (temperature, humidity, gas, flame)
- Temperature history charts (8h / 24h / 3-day views)
- Auto-sampling for performance optimization

### Safety Automations
- 🔥 **Gas Detection** → Auto turn OFF all user's stoves immediately
- ❄️ **Fridge Alert** → If temp > 15°C for 15 min with door open → Auto close door

## Project Structure

```
smart-kitchen-iot/
├── back-end/
│   ├── server.js                 # Main Express + Socket.IO + MQTT server
│   ├── ecosystem.config.js       # PM2 configuration
│   ├── models/
│   │   ├── User.js               # User schema (auth)
│   │   ├── Device.js             # Device schema (per-user)
│   │   └── TemperatureHistory.js # Temperature logs (7-day TTL)
│   ├── scripts/
│   │   ├── manage-simulators.js  # Auto start/stop simulators via PM2
│   │   └── reset-database.js     # DB reset utility
│   └── package.json
│
├── front-end/
│   ├── index.html                # Main entry point
│   ├── src/
│   │   ├── main.js               # App initialization & routing
│   │   ├── api.js                # REST API client
│   │   ├── socket.js             # Socket.IO client
│   │   ├── styles.css            # Responsive styles
│   │   └── components/
│   │       ├── Login.js          # Login/Register form
│   │       ├── Dashboard.js      # Main dashboard
│   │       ├── DeviceManager.js  # Add/edit/delete devices
│   │       ├── DeviceCard.js     # Stove control card
│   │       ├── FridgeCard.js     # Fridge control card
│   │       ├── SensorCard.js     # Sensor display card
│   │       └── TemperatureChart.js # Chart.js temperature graph
│   ├── stove.js                  # Stove simulator (MQTT)
│   ├── fridge.js                 # Fridge simulator (MQTT)
│   └── package.json
│
├── embed/
│   └── 68.ino                    # ESP32 firmware (sensors + MQTT + Telegram)
│
└── README.md
```

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB 6.0+ (or 7.0)
- Mosquitto MQTT Broker
- PM2 (`npm install -g pm2`)

### 1. Backend Setup

```bash
cd back-end
npm install

# Create .env file
cat > .env << EOF
PORT=3000
JWT_SECRET=your_super_secret_key_here
MONGO_URI=mongodb://127.0.0.1:27017/smart_kitchen
MQTT_HOST=mqtt://127.0.0.1:1883
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup  # Enable auto-start on boot
```

### 2. Frontend

The frontend is static HTML/JS. Serve it using any HTTP server:

```bash
cd front-end

# Option 1: Python
python3 -m http.server 8080

# Option 2: Node.js http-server
npx http-server -p 8080
```

Or configure Nginx to serve `front-end/` as static files.

### 3. Device Simulators (Optional)

Simulators are auto-managed when you add devices via the web UI. Manual start:

```bash
cd front-end

# Start with custom MQTT topic
pm2 start stove.js --name stove-sim -- home/kitchen/stove1
pm2 start fridge.js --name fridge-sim -- home/kitchen/fridge1
pm2 save
```

### 4. ESP32 Sensor Node

1. Open `embed/68.ino` in Arduino IDE
2. Configure WiFi credentials and `mqtt_server` IP
3. Flash to ESP32
4. Device publishes to: `home/kitchen/sensor1/status`

## Network Configuration

### Open Backend Port (Firewall)

```bash
sudo ufw allow 3000/tcp
```

### Enable MQTT Remote Access (for ESP32)

By default, Mosquitto only accepts local connections. Enable external access:

```bash
sudo nano /etc/mosquitto/conf.d/default.conf
```

Add:
```
listener 1883
allow_anonymous true
```

Restart Mosquitto:
```bash
sudo systemctl restart mosquitto
sudo systemctl enable mosquitto
```

## MongoDB Installation

### Quick Install (Ubuntu)

```bash
sudo apt update
sudo apt install -y mongodb
sudo systemctl enable --now mongodb

# Verify
mongo --eval 'db.runCommand({ ping: 1 })'
```

### Official Repository (Recommended for Production)

**Step 1: Install tools**
```bash
sudo apt-get install -y gnupg curl
```

**Step 2: Import MongoDB GPG key**
```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
```

**Step 3: Add repository**

Ubuntu 22.04 (Jammy):
```bash
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
```

Ubuntu 20.04 (Focal):
```bash
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
```

**Step 4: Install MongoDB**
```bash
sudo apt-get update
sudo apt-get install -y mongodb-org
```

**Step 5: Start service**
```bash
sudo systemctl start mongod
sudo systemctl enable mongod
sudo systemctl status mongod   # Should show "active (running)"
```

**Step 6: Test connection**
```bash
mongosh
```

### Secure MongoDB (Production)

**Create admin user:**
```javascript
use admin
db.createUser({
  user: "myAdmin",
  pwd: "securePassword123",
  roles: [ { role: "userAdminAnyDatabase", db: "admin" }, "readWriteAnyDatabase" ]
})
```

**Create project user:**
```javascript
use smart_kitchen
db.createUser({
  user: "kitchen_user",
  pwd: "kitchenPassword123",
  roles: [ { role: "readWrite", db: "smart_kitchen" } ]
})
exit
```

**Enable authentication:**
```bash
sudo nano /etc/mongod.conf
```

Add:
```yaml
security:
  authorization: enabled
```

Restart:
```bash
sudo systemctl restart mongod
```

**Update .env connection string:**
```
MONGO_URI=mongodb://kitchen_user:kitchenPassword123@127.0.0.1:27017/smart_kitchen?authSource=smart_kitchen
```

## MQTT Broker Installation (Mosquitto)

```bash
sudo apt update
sudo apt install -y mosquitto mosquitto-clients
sudo systemctl enable --now mosquitto

# Test
mosquitto_sub -h 127.0.0.1 -t test -v &
mosquitto_pub -h 127.0.0.1 -t test -m "hello"
```

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/register` | Register new user |
| POST | `/api/login` | Login, returns JWT |
| GET | `/api/devices` | List user's devices |
| POST | `/api/devices` | Add new device |
| PUT | `/api/devices/:id` | Update device (name, topic) |
| DELETE | `/api/devices/:id` | Delete device |
| POST | `/api/device/command` | Send command to device |
| GET | `/api/devices/:id/temperature-history` | Get temperature logs |

## Operational Notes

- **Memory**: PM2 auto-restarts backend if memory exceeds 1GB
- **Data Retention**: Temperature history auto-deletes after 7 days (MongoDB TTL)
- **Caching**: Device info cached in memory, reduces DB queries
- **Sampling**: Chart data sampled to max 500 points for performance
- **Simulators**: Auto-managed via `manage-simulators.js` when devices are added/deleted

## License

MIT
