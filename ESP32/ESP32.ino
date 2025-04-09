#include <WiFi.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <driver/i2s.h>

// WiFi Credentials
const char* ssid = "TP-Link_B436"; // Replace with your WiFi SSID // Gareeb Kalyaan Yojna
const char* password = "13739393"; // Replace with your WiFi password

// WebSocket Server details
const char* websocket_server = "192.168.0.103"; // Replace with your server's IP
const uint16_t websocket_port = 5050;
const char* websocket_path = "/ws/device"; // Match the path in server.js

// I2S Configuration for INMP441 microphone
#define I2S_WS_PIN 15
#define I2S_SCK_PIN 2
#define I2S_SD_PIN 13
#define I2S_PORT I2S_NUM_0
#define BUFFER_SIZE 1024

WebSocketsClient webSocket;
bool isRecording = false;
String testId = "";
int lineIndex = 0;
unsigned long lastHeartbeat = 0;

// Buffer for audio data
int16_t sBuffer[BUFFER_SIZE];

void setup() {
  Serial.begin(115200);
  
  // Connect to WiFi
  WiFi.begin(ssid, password);
  Serial.println("Connecting to WiFi...");
  
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  
  Serial.println();
  Serial.print("Connected to WiFi, IP address: ");
  Serial.println(WiFi.localIP());
  
  // Initialize I2S for the INMP441 microphone
  initI2S();
  
  // Setup WebSocket connection
  setupWebSocket();
}

void loop() {
  webSocket.loop();
  
  // Handle recording if active
  if (isRecording) {
    recordAndSendAudio();
  }
  
  // Send heartbeat message every 30 seconds
  unsigned long currentMillis = millis();
  if (currentMillis - lastHeartbeat > 30000) {
    sendHeartbeat();
    lastHeartbeat = currentMillis;
  }
  
  // Check if we should reconnect to WiFi or WebSocket
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi disconnected. Reconnecting...");
    WiFi.begin(ssid, password);
  }
}

void initI2S() {
  Serial.println("Configuring I2S...");
  
  // I2S configuration for INMP441 microphone
  const i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = 16000,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = BUFFER_SIZE,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };
  
  // I2S pin configuration
  const i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK_PIN,   // Serial Clock
    .ws_io_num = I2S_WS_PIN,     // Word Select (Left/Right Clock)
    .data_out_num = I2S_PIN_NO_CHANGE,  // Not used for input
    .data_in_num = I2S_SD_PIN    // Serial Data
  };
  
  // Install and start I2S driver
  i2s_driver_uninstall(I2S_PORT); // Uninstall first in case it was previously installed
  esp_err_t result = i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  if (result != ESP_OK) {
    Serial.printf("Error installing I2S driver: %d\n", result);
    return;
  }
  
  result = i2s_set_pin(I2S_PORT, &pin_config);
  if (result != ESP_OK) {
    Serial.printf("Error setting I2S pins: %d\n", result);
    return;
  }
  
  i2s_zero_dma_buffer(I2S_PORT);
  Serial.println("I2S driver installed successfully");
}

void setupWebSocket() {
  // Server info
  Serial.println("Connecting to WebSocket server...");
  
  // Initialize WebSocket client
  webSocket.begin(websocket_server, websocket_port, websocket_path);
  
  // Callbacks
  webSocket.onEvent(webSocketEvent);
  
  // Try to reconnect every 5 seconds if connection fails
  webSocket.setReconnectInterval(5000);
  
  // Enable heartbeat
  webSocket.enableHeartbeat(15000, 3000, 2);
}

void webSocketEvent(WStype_t type, uint8_t * payload, size_t length) {
  switch(type) {
    case WStype_DISCONNECTED:
      Serial.println("WebSocket disconnected");
      isRecording = false;
      break;
      
    case WStype_CONNECTED:
      Serial.println("WebSocket connected");
      // Send device registration
      sendDeviceInfo();
      break;
      
    case WStype_TEXT:
      handleTextMessage(payload, length);
      break;
      
    case WStype_BIN:
      Serial.println("Binary message received (unexpected)");
      break;
      
    case WStype_ERROR:
      Serial.println("WebSocket error");
      break;
      
    case WStype_PING:
      Serial.println("Ping received");
      break;
      
    case WStype_PONG:
      Serial.println("Pong received");
      break;
  }
}

void handleTextMessage(uint8_t * payload, size_t length) {
  // Parse JSON message
  DynamicJsonDocument doc(1024);
  DeserializationError error = deserializeJson(doc, payload, length);
  
  if (error) {
    Serial.print("JSON parsing failed: ");
    Serial.println(error.c_str());
    return;
  }
  
  // Handle commands
  if (doc.containsKey("command")) {
    const char* command = doc["command"];
    Serial.print("Received command: ");
    Serial.println(command);
    
    if (strcmp(command, "startCapture") == 0) {
      if (doc.containsKey("testId") && doc.containsKey("lineIndex")) {
        testId = doc["testId"].as<String>();
        lineIndex = doc["lineIndex"].as<int>();
        startRecording();
      } else {
        Serial.println("Missing testId or lineIndex in startCapture command");
      }
    } else if (strcmp(command, "stopCapture") == 0) {
      stopRecording();
    }
  }
}

void sendDeviceInfo() {
  DynamicJsonDocument doc(256);
  doc["event"] = "deviceConnected";
  doc["deviceType"] = "ESP32_Audio_Capture";
  doc["mac"] = WiFi.macAddress();
  doc["ip"] = WiFi.localIP().toString();
  
  String jsonStr;
  serializeJson(doc, jsonStr);
  
  webSocket.sendTXT(jsonStr);
  Serial.println("Device info sent to server");
}

void sendHeartbeat() {
  DynamicJsonDocument doc(100);
  doc["event"] = "heartbeat";
  doc["uptime"] = millis() / 1000;
  
  String jsonStr;
  serializeJson(doc, jsonStr);
  
  webSocket.sendTXT(jsonStr);
  Serial.println("Heartbeat sent");
}

void startRecording() {
  Serial.printf("Starting audio recording for test %s, line %d\n", testId.c_str(), lineIndex);
  i2s_zero_dma_buffer(I2S_PORT);
  isRecording = true;
  
  // Send confirmation to server
  DynamicJsonDocument doc(256);
  doc["event"] = "captureStarted";
  doc["testId"] = testId;
  doc["lineIndex"] = lineIndex;
  
  String jsonStr;
  serializeJson(doc, jsonStr);
  webSocket.sendTXT(jsonStr);
}

void stopRecording() {
  Serial.printf("Stopping audio recording for test %s, line %d\n", testId.c_str(), lineIndex);
  isRecording = false;
  
  // Send confirmation to server
  DynamicJsonDocument doc(256);
  doc["event"] = "captureStopped";
  doc["testId"] = testId;
  doc["lineIndex"] = lineIndex;
  
  String jsonStr;
  serializeJson(doc, jsonStr);
  webSocket.sendTXT(jsonStr);
}

void recordAndSendAudio() {
  size_t bytesRead = 0;
  esp_err_t result = i2s_read(I2S_PORT, &sBuffer, sizeof(sBuffer), &bytesRead, 0);
  
  if (result == ESP_OK && bytesRead > 0) {
    Serial.printf("Read %d bytes from I2S\n", bytesRead);
    
    // Apply simple DC offset removal and normalization
    int32_t sum = 0;
    int16_t maxVal = 0;
    
    // Calculate DC offset and find maximum value
    for (int i = 0; i < bytesRead / sizeof(int16_t); i++) {
      sum += sBuffer[i];
      if (abs(sBuffer[i]) > maxVal) {
        maxVal = abs(sBuffer[i]);
      }
    }
    
    int16_t dcOffset = sum / (bytesRead / sizeof(int16_t));
    Serial.printf("DC offset: %d, Max value: %d\n", dcOffset, maxVal);
    
    // Simple noise gate - if max value is too small, consider it silence
    if (maxVal < 500) {
      Serial.println("Silence detected, not sending buffer");
      return;
    }
    
    // Remove DC offset
    for (int i = 0; i < bytesRead / sizeof(int16_t); i++) {
      sBuffer[i] -= dcOffset;
    }
    
    // Only send if WebSocket is connected
    if (webSocket.isConnected()) {
      Serial.printf("Sending %d bytes of audio data\n", bytesRead);
      webSocket.sendBIN((uint8_t*)sBuffer, bytesRead);
    } else {
      Serial.println("WebSocket not connected, can't send audio");
      stopRecording(); // Auto stop if connection lost
    }
  } else if (result != ESP_OK) {
    Serial.printf("I2S read error: %d\n", result);
  }
}