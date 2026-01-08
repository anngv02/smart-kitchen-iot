#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <UniversalTelegramBot.h>
#include <ArduinoJson.h>

// ==========================================
// 1. CẤU HÌNH HỆ THỐNG
// ==========================================

// --- WIFI & MQTT ---
const char* ssid = "Annez";
const char* password = "12345679";
const char* mqtt_server = "131.153.224.169"; 
const char* topic_status = "home/kitchen/sensor1/status";

// --- TELEGRAM ---
#define BOTtoken "8596919219:AAEiuHZbmkynjqQ_QvCVHChH5vgtTJOLy9k"  
#define CHAT_ID "6408676530"

// --- PHẦN CỨNG (BỎ CHÂN 33) ---
#define PIN_GAS 32
#define PIN_FLAME 35
#define PIN_LED 26
#define PIN_BUZZER 27

// --- LOGIC SLIDING WINDOW ---
#define WINDOW_SIZE 10    // Số lượng mẫu trong cửa sổ
#define ALARM_THRESHOLD 8 // Ngưỡng kích hoạt (8/10 mẫu = 1)

// ==========================================
// 2. BIẾN TOÀN CỤC (SHARED RESOURCES)
// ==========================================
// Dùng volatile để báo cho trình biên dịch biết biến này
// có thể bị thay đổi bởi các Task khác nhau bất cứ lúc nào
volatile bool g_finalGasState = false;  // Trạng thái chốt sau khi qua Window
volatile bool g_finalFireState = false; // Trạng thái chốt sau khi qua Window
volatile bool g_isDanger = false;       // Tổng hợp nguy hiểm

// ==========================================
// 3. KHỞI TẠO OBJECT
// ==========================================
WiFiClient espClient;
PubSubClient client(espClient);
WiFiClientSecure secured_client;
UniversalTelegramBot bot(BOTtoken, secured_client);

TaskHandle_t TaskSensorHandle;
TaskHandle_t TaskMQTTHandle;
TaskHandle_t TaskTelegramHandle;

// ==========================================
// 4. CÁC HÀM HỖ TRỢ KẾT NỐI
// ==========================================
void setup_wifi() {
  delay(10);
  Serial.print("Connecting to WiFi: ");
  Serial.println(ssid);
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected");
  secured_client.setInsecure(); 
}

void reconnect_mqtt() {
  while (!client.connected()) {
    Serial.print("MQTT connecting...");
    if (client.connect("ESP32_Edge_Node")) { 
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      vTaskDelay(5000 / portTICK_PERIOD_MS); 
    }
  }
}

// ==========================================
// TASK 1: BỘ NÃO XỬ LÝ (EDGE COMPUTING)
// Nhiệm vụ: Đọc cảm biến -> Lọc nhiễu (Window) -> Ra quyết định -> Cập nhật biến Global
// ==========================================
void TaskSensor(void *pvParameters) {
  (void) pvParameters;

  // Cấu hình chân
  pinMode(PIN_GAS, INPUT);
  pinMode(PIN_FLAME, INPUT);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  // Khởi tạo bộ nhớ cho cửa sổ trượt
  int gasWindow[WINDOW_SIZE] = {0};
  int fireWindow[WINDOW_SIZE] = {0};
  int index = 0;
  int gasSum = 0;
  int fireSum = 0;

  for (;;) { 
    // --- BƯỚC 1: ĐỌC DỮ LIỆU THÔ ---
    // Chuyển đổi tín hiệu: LOW (0V) là có biến -> đổi thành số 1 để tính toán
    int rawGas = (digitalRead(PIN_GAS) == LOW) ? 1 : 0;
    int rawFire = (digitalRead(PIN_FLAME) == LOW) ? 1 : 0;

    // --- BƯỚC 2: THUẬT TOÁN SLIDING WINDOW ---
    // Trừ giá trị cũ nhất ra khỏi tổng
    gasSum -= gasWindow[index];
    fireSum -= fireWindow[index];

    // Ghi đè giá trị mới vào vị trí hiện tại
    gasWindow[index] = rawGas;
    fireWindow[index] = rawFire;

    // Cộng giá trị mới vào tổng
    gasSum += gasWindow[index];
    fireSum += fireWindow[index];

    // Di chuyển chỉ số vòng tròn (0 -> 9 -> 0...)
    index = (index + 1) % WINDOW_SIZE;

    bool isGasConfirmed = (gasSum >= ALARM_THRESHOLD);
    bool isFireConfirmed = (fireSum >= ALARM_THRESHOLD);

    // Cập nhật vào biến toàn cục để các Task khác dùng
    g_finalGasState = isGasConfirmed;
    g_finalFireState = isFireConfirmed;
    g_isDanger = g_finalGasState || g_finalFireState;

    // --- BƯỚC 4: ĐIỀU KHIỂN TẠI CHỖ (LOA/ĐÈN) ---
    if (g_isDanger) {
      digitalWrite(PIN_LED, HIGH);
      digitalWrite(PIN_BUZZER, HIGH);
    } else {
      digitalWrite(PIN_LED, LOW);
      digitalWrite(PIN_BUZZER, LOW);
    }

    // Tần số lấy mẫu: 100ms 
    vTaskDelay(100 / portTICK_PERIOD_MS);
  }
}

// ==========================================
// TASK 2: NGƯỜI ĐƯA TIN (MQTT)
// Nhiệm vụ: Lấy kết quả từ TaskSensor -> Gửi lên Server
// ==========================================
void TaskMQTT(void *pvParameters) {
  (void) pvParameters;
  client.setServer(mqtt_server, 1883);

  for (;;) {
    if (WiFi.status() == WL_CONNECTED) {
      if (!client.connected()) reconnect_mqtt();
      client.loop();

      static unsigned long lastMsg = 0;
      unsigned long now = millis();
      
      // Gửi định kỳ mỗi 2 giây
      if (now - lastMsg > 2000) {
        lastMsg = now;
        
        // --- TẠO JSON TỪ KẾT QUẢ ĐÃ XỬ LÝ ---
        // Lưu ý: Dùng g_finalGasState (đã qua Window) chứ không đọc trực tiếp digitalRead
        String payload = "{";
        payload += "\"gas\": \"" + String(g_finalGasState ? "DETECTED" : "SAFE") + "\",";
        payload += "\"fire\": \"" + String(g_finalFireState ? "DETECTED" : "SAFE") + "\"";
        payload += "}";
        
        client.publish(topic_status, payload.c_str());
        // Serial.println("Sent: " + payload); // Debug
      }
    }
    // Delay nhỏ để nhường CPU cho các Task khác
    vTaskDelay(10 / portTICK_PERIOD_MS);
  }
}

// ==========================================
// TASK 3: CỨU HỘ (TELEGRAM)
// Nhiệm vụ: Gửi tin nhắn khẩn cấp khi g_isDanger bật
// ==========================================
void TaskTelegram(void *pvParameters) {
  (void) pvParameters;
  bot.sendMessage(CHAT_ID, "🚀 Hệ thống Edge Monitor đã khởi động!", "");

  unsigned long lastTelegramTime = 0;
  const unsigned long telegramDelay = 15000;

  for (;;) {
    // Chỉ kiểm tra nếu Sensor báo nguy hiểm
    if (g_isDanger) {
      unsigned long now = millis();
      if (now - lastTelegramTime > telegramDelay) {
        
        String message = "⚠️ CẢNH BÁO!\n";
        message += "📍 Nhà Bếp\n";
        
        // Logic tin nhắn dựa trên kết quả phân tích
        if (g_finalGasState) message += "🔥 KHÍ GAS RÒ RỈ !\n";
        if (g_finalFireState) message += "🔥 CÓ LỬA !\n";
        
        if (bot.sendMessage(CHAT_ID, message, "")) {
           lastTelegramTime = now;
        }
      }
    }
    // Kiểm tra mỗi 1 giây
    vTaskDelay(1000 / portTICK_PERIOD_MS);
  }
}

// ==========================================
// MAIN SETUP
// ==========================================
void setup() {
  Serial.begin(115200);
  setup_wifi();

  Serial.println("Khoi tao FreeRTOS Tasks...");

  // Ưu tiên: Sensor (2 - Cao nhất) > MQTT (1) > Telegram (0)
  
  xTaskCreate(TaskSensor,   "Sensor_Processing", 4096, NULL, 2, &TaskSensorHandle);
  xTaskCreate(TaskMQTT,     "MQTT_Reporting",    4096, NULL, 1, &TaskMQTTHandle);
  xTaskCreate(TaskTelegram, "Telegram_Alert",    10240, NULL, 0, &TaskTelegramHandle); 
  
  Serial.println("System Ready!");
}

void loop() {
  // Loop để trống vì FreeRTOS đã quản lý mọi thứ
  vTaskDelete(NULL); 
}