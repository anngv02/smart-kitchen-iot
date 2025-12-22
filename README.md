# Smart Kitchen IoT

An end-to-end smart kitchen system: ESP32 sensor node, MQTT, Node.js backend with Socket.IO, and a web dashboard. Includes device simulators (stove, fridge) and safety automations (auto-off stove on gas leak, auto-close fridge on high temp).

## Architecture & Stack
- Hardware/Embedded: ESP32, FreeRTOS, Gas/Flame sensors, Telegram Bot.
- IoT Protocol: MQTT (`home/kitchen/{deviceId}/status|command`).
- Backend: Node.js/Express, Socket.IO, MQTT.js, MongoDB (Mongoose), JWT, bcrypt, dotenv.
- Frontend: Vanilla JS (ES modules), Socket.IO client (CDN), Chart.js (temperature charts), responsive CSS.
- Process manager: PM2 (1GB memory cap, auto-restart).

## Key Features
- Auth: register/login (JWT).
- Device management: add/delete/rename (stove, fridge), protect `sensor_node` (read-only).
- Control: stove (on/off, level), fridge (door open/close, set temp).
- Realtime: status updates via Socket.IO.
- Temperature charts (Chart.js) with auto-sampling.
- Safety automations:
  - GAS detected → auto turn OFF all stoves.
  - Fridge temp > 15°C for 15 minutes with door open → auto close door.
- Temperature history with 7-day TTL and query limits.

## Project Structure
- `back-end/`: Express server, APIs, MQTT handler, Socket.IO, models (User, Device, TemperatureHistory).
- `front-end/`: dashboard, components, API client, charts.
- `embed/`: ESP32 code (gas/fire sensors, MQTT publish, Telegram alert).
- `stove.js`, `fridge.js`: MQTT device simulators.

## Quick Start (development)
1) Backend
```bash
cd back-end
npm install
cp env.example .env   # set PORT, JWT_SECRET, MONGO_URI, MQTT_HOST
pm2 start ecosystem.config.js    # or: pm2 start server.js --max-memory-restart 1G
pm2 save
```
2) Frontend (static, no build needed)
```bash
cd front-end
python3 -m http.server 3000   # or npx http-server -p 3000
```
3) Simulators (optional)
```bash
cd front-end
pm2 start stove.js --name stove-simulator
pm2 start fridge.js --name fridge-simulator
pm2 save
``]
4) ESP32
- Flash `embed/68.ino`, configure WiFi & `mqtt_server`.
- MQTT publish: `home/kitchen/sensor1/status`.

### Running locally
- Backend listens on `3000`. Allow port 3000 on firewall/ufw:
```bash
sudo ufw allow 3000/tcp
```

### Allow MQTT (Mosquitto) remote access (ESP32)
By default Mosquitto blocks external connections. Enable listener:
```bash
sudo nano /etc/mosquitto/conf.d/default.conf
```
File content:
```
listener 1883
allow_anonymous true
```
Save (Ctrl+O, Enter, Ctrl+X), then restart:
```bash
sudo systemctl restart mosquitto
sudo systemctl enable mosquitto
```

## Install MongoDB on Ubuntu

### Quick way (often enough for labs)
```bash
sudo apt update
sudo apt install -y mongodb

# Start & enable
sudo systemctl enable --now mongodb

# Check
systemctl status mongodb
mongo --eval 'db.runCommand({ ping: 1 })'
```

### Official Repository (recommended on VPS)
**Step 1:** Tools
```bash
sudo apt-get install -y gnupg curl
```
**Step 2:** Import GPG key
```bash
curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc | \
  sudo gpg -o /usr/share/keyrings/mongodb-server-7.0.gpg --dearmor
```
**Step 3:** Add repo (choose your Ubuntu)
- Ubuntu 22.04 (jammy):
```bash
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
```
- Ubuntu 20.04 (focal):
```bash
echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/7.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list
```
**Step 4:** Update & install
```bash
sudo apt-get update
sudo apt-get install -y mongodb-org
```
**Step 5:** Start MongoDB (service mongod)
```bash
sudo systemctl start mongod
sudo systemctl enable mongod
sudo systemctl status mongod   # active (running) is OK
```
**Step 6:** Test
```bash
mongosh
```

### Secure MongoDB (users & auth)
In `mongosh`:
**Step 1: Create Admin**
```javascript
use admin
db.createUser({
  user: "myAdmin",
  pwd: "admin123",            // change password
  roles: [ { role: "userAdminAnyDatabase", db: "admin" }, "readWriteAnyDatabase" ]
})
```
**Step 2: Project DB & user**
```javascript
use smart_kitchen
db.createUser({
  user: "kitchen_user",
  pwd: "kitchen123",          // change password
  roles: [ { role: "readWrite", db: "smart_kitchen" } ]
})
exit
```
**Step 3: Enable auth**
```bash
sudo nano /etc/mongod.conf
```
Set:
```yaml
security:
  authorization: enabled
```
Then:
```bash
sudo systemctl restart mongod
```
**Step 4: Update backend connection string**
```javascript
// mongodb://<user>:<password>@127.0.0.1:27017/<db>?authSource=<db>
mongoose.connect('mongodb://kitchen_user:kitchen123@127.0.0.1:27017/smart_kitchen?authSource=smart_kitchen')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB Connection Error:', err));
```
**Step 5: Verify**
```bash
mongosh "mongodb://127.0.0.1:27017/smart_kitchen" -u kitchen_user -p
```
If `show collections` requires auth -> good.

## Install MQTT Broker (Mosquitto) on Ubuntu
```bash
sudo apt update
sudo apt install -y mosquitto mosquitto-clients
sudo systemctl enable --now mosquitto
mosquitto_sub -h 127.0.0.1 -t test -v &
mosquitto_pub -h 127.0.0.1 -t test -m "hello"
```

## APIs
- `POST /api/register`, `POST /api/login`
- `GET /api/devices`, `POST /api/devices`, `PUT /api/devices/:id`, `DELETE /api/devices/:id`
- `POST /api/device/command`
- `GET /api/devices/:deviceId/temperature-history`

## Ops Notes
- PM2 cap 1GB RAM, auto-restart.
- MongoDB TTL 7 days for temperature history.
- Device cache + sampling reduce DB/memory load.
