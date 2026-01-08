#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <PubSubClient.h>
#include <UniversalTelegramBot.h>
#include <ArduinoJson.h>

// --- CẤU HÌNH WIFI & MQTT ---
// const char* ssid = "My Mom";
// const char* password = "hachicutedangyeu10diem";
const char* ssid = "Annez";
const char* password = "12345679";
// const char* mqtt_server = "10.17.13.220"; // Thay bằng IP máy
// const char* mqtt_server = "10.203.190.47";
const char* mqtt_server = "131.153.224.169"; 

// --- CẤU HÌNH TELEGRAM ---
#define BOTtoken "8596919219:AAEiuHZbmkynjqQ_QvCVHChH5vgtTJOLy9k"  
#define CHAT_ID "6408676530"

// --- ĐỊNH NGHĨA CHÂN ---
#define PIN_GAS 32
#define PIN_FLAME 35
#define PIN_LED 26
#define PIN_BUZZER 27

// [QUAN TRỌNG] Topic phải khớp với Database MongoDB
const char* topic_status = "home/kitchen/sensor1/status";

// --- 2. BIẾN TOÀN CỤC (SHARED RESOURCE) ---
volatile bool g_isGas = false;
volatile bool g_isFire = false;
volatile bool g_isDanger = false;

// --- 3. KHỞI TẠO OBJECT ---
WiFiClient espClient;
PubSubClient client(espClient);
WiFiClientSecure secured_client;
UniversalTelegramBot bot(BOTtoken, secured_client);

// Handle cho các Task
TaskHandle_t TaskSensorHandle;
TaskHandle_t TaskMQTTHandle;
TaskHandle_t TaskTelegramHandle;

// --- 4. HÀM HỖ TRỢ ---
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
    // [QUAN TRỌNG] Client ID phải unique
    if (client.connect("ESP32_Sensor_Node")) { 
      Serial.println("connected");
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      // Dùng vTaskDelay để không chặn các task khác khi đang cố reconnect
      vTaskDelay(5000 / portTICK_PERIOD_MS); 
    }
  }
}

// ==========================================
// TASK 1: ĐỌC CẢM BIẾN & XỬ LÝ TẠI CHỖ (Ưu tiên cao nhất)
// ==========================================
void TaskSensor(void *pvParameters) {
  (void) pvParameters;

  pinMode(PIN_GAS, INPUT);
  pinMode(PIN_FLAME, INPUT);
  pinMode(PIN_LED, OUTPUT);
  pinMode(PIN_BUZZER, OUTPUT);

  for (;;) { 
    // Đọc cảm biến (Giả sử LOW là kích hoạt - Active Low)
    int gasState = digitalRead(PIN_GAS);
    int fireState = digitalRead(PIN_FLAME);

    // Cập nhật biến toàn cục
    g_isGas = (gasState == LOW);
    g_isFire = (fireState == LOW);
    g_isDanger = g_isGas || g_isFire;

    // Xử lý còi đèn ngay lập tức
    if (g_isDanger) {
      digitalWrite(PIN_LED, HIGH);
      digitalWrite(PIN_BUZZER, HIGH);
    } else {
      digitalWrite(PIN_LED, LOW);
      digitalWrite(PIN_BUZZER, LOW);
    }

    // Delay 100ms
    vTaskDelay(100 / portTICK_PERIOD_MS);
  }
}

// ==========================================
// TASK 2: GỬI DATA MQTT (Ưu tiên trung bình)
// ==========================================
void TaskMQTT(void *pvParameters) {
  (void) pvParameters;
  
  client.setServer(mqtt_server, 1883);

  for (;;) {
    if (WiFi.status() == WL_CONNECTED) {
      if (!client.connected()) {
        reconnect_mqtt();
      }
      client.loop();

      static unsigned long lastMsg = 0;
      unsigned long now = millis();
      
      // Gửi data mỗi 2 giây
      if (now - lastMsg > 2000) {
        lastMsg = now;
        
        // [QUAN TRỌNG] Format JSON theo chuẩn Web Dashboard mong đợi
        // "DETECTED" -> Màu đỏ, "SAFE" -> Màu xanh
        String payload = "{";
        payload += "\"gas\": \"" + String(g_isGas ? "DETECTED" : "SAFE") + "\",";
        payload += "\"fire\": \"" + String(g_isFire ? "DETECTED" : "SAFE") + "\"";
        payload += "}";
        
        client.publish(topic_status, payload.c_str());
        Serial.println("[MQTT] Published: " + payload);
      }
    }
    
    vTaskDelay(10 / portTICK_PERIOD_MS);
  }
}

// ==========================================
// TASK 3: GỬI TELEGRAM (Ưu tiên thấp, Stack lớn)
// ==========================================
void TaskTelegram(void *pvParameters) {
  (void) pvParameters;

  // Gửi tin nhắn khởi động
  bot.sendMessage(CHAT_ID, "🚀 Cụm Cảm Biến Bếp (ESP32) đã online!", "");

  unsigned long lastTelegramTime = 0;
  const unsigned long telegramDelay = 15000; // 15s cooldown để tránh spam

  for (;;) {
    if (g_isDanger) {
      unsigned long now = millis();
      if (now - lastTelegramTime > telegramDelay) {
        
        Serial.println("[TELEGRAM] Preparing message...");
        String message = "⚠️ CẢNH BÁO KHẨN CẤP!\n";
        message += "📍 Vị trí: Nhà Bếp\n";
        if (g_isGas) message += "🔥 Phát hiện: KHÍ GAS RÒ RỈ!\n";
        if (g_isFire) message += "🔥 Phát hiện: CÓ LỬA!\n";
        message += "Hãy kiểm tra ngay lập tức!";
        
        if (bot.sendMessage(CHAT_ID, message, "")) {
           Serial.println("[TELEGRAM] Sent successfully");
           lastTelegramTime = now;
        } else {
           Serial.println("[TELEGRAM] Failed to send");
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
  
  // Kết nối Wifi trước khi chạy task
  setup_wifi();

  Serial.println("Creating FreeRTOS Tasks...");

  // 1. Task Sensor (Ưu tiên cao nhất)
  xTaskCreate(TaskSensor, "Sensor_Task", 2048, NULL, 2, &TaskSensorHandle);

  // 2. Task MQTT (Ưu tiên trung bình)
  xTaskCreate(TaskMQTT, "MQTT_Task", 4096, NULL, 1, &TaskMQTTHandle);

  // 3. Task Telegram (Ưu tiên thấp nhất - Stack lớn 10KB cho SSL)
  xTaskCreate(TaskTelegram, "Telegram_Task", 10240, NULL, 0, &TaskTelegramHandle);
  
  Serial.println("System Ready!");
}

void loop() {
  vTaskDelete(NULL); // Xóa loop mặc định
}