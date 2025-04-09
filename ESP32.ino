#include <WiFi.h>
#include <WebSocketsClient.h>
#include <driver/i2s.h>
#include <ArduinoJson.h>

// WiFi credentials
const char* ssid = "TP-Link_B436";
const char* password = "13739393";

// WebSocket server details
const char* webSocketServer = "192.168.0.102";
const int webSocketPort = 5000;
const char* webSocketPath = "/ws/audio";

// I2S configuration for INMP441 microphone
#define I2S_WS 15
#define I2S_SD 13
#define I2S_SCK 2
#define I2S_PORT I2S_NUM_0
#define I2S_SAMPLE_RATE 16000
#define I2S_BUFFER_SIZE 1024

// Audio capture variables
int16_t sBuffer[I2S_BUFFER_SIZE];
bool isCapturing = false;
String testId = "";

// WebSocket client
WebSocketsClient webSocket;

// Function prototypes
void setupI2S();
void setupWebSocket();
void webSocketEvent(WStype_t type, uint8_t* payload, size_t length);
void handleTextMessage(uint8_t* payload, size_t length);
void startAudioCapture();
void stopAudioCapture();
void captureAndSendAudio();
void processAudioData(int16_t* buffer, size_t length);

void setup() {
  Serial.begin(115200);
  
  // Connect to WiFi
  Serial.println("Connecting to WiFi...");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());
  
  // Setup I2S for INMP441 microphone
  setupI2S();
  
  // Setup WebSocket connection
  setupWebSocket();
}

void loop() {
  webSocket.loop();
  
  if (isCapturing) {
    captureAndSendAudio();
  }
  
  delay(10);
}

void setupI2S() {
  Serial.println("Configuring I2S...");
  
  const i2s_config_t i2s_config = {
    .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_RX),
    .sample_rate = I2S_SAMPLE_RATE,
    .bits_per_sample = I2S_BITS_PER_SAMPLE_16BIT,
    .channel_format = I2S_CHANNEL_FMT_ONLY_LEFT,
    .communication_format = I2S_COMM_FORMAT_STAND_I2S,
    .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
    .dma_buf_count = 8,
    .dma_buf_len = I2S_BUFFER_SIZE,
    .use_apll = false,
    .tx_desc_auto_clear = false,
    .fixed_mclk = 0
  };
  
  const i2s_pin_config_t pin_config = {
    .bck_io_num = I2S_SCK,
    .ws_io_num = I2S_WS,
    .data_out_num = I2S_PIN_NO_CHANGE,
    .data_in_num = I2S_SD
  };
  
  // Install and start I2S driver
  i2s_driver_install(I2S_PORT, &i2s_config, 0, NULL);
  i2s_set_pin(I2S_PORT, &pin_config);
}

void setupWebSocket() {
  Serial.println("Setting up WebSocket connection...");
  
  // Server address, port, and URL path
  webSocket.begin(webSocketServer, webSocketPort, webSocketPath);
  
  // Event handler
  webSocket.onEvent(webSocketEvent);
  
  // Try reconnection every 5000ms if connection fails
  webSocket.setReconnectInterval(5000);
  
  // Start heartbeat to avoid disconnections
  webSocket.enableHeartbeat(15000, 3000, 2);
}

void webSocketEvent(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_DISCONNECTED:
      Serial.println("WebSocket disconnected");
      break;
      
    case WStype_CONNECTED:
      Serial.println("WebSocket connected");
      break;
      
    case WStype_TEXT:
      handleTextMessage(payload, length);
      break;
      
    case WStype_BIN:
      Serial.println("Received binary data");
      break;
  }
}

void handleTextMessage(uint8_t* payload, size_t length) {
  String message = String((char*)payload);
  
  DynamicJsonDocument doc(1024);
  deserializeJson(doc, message);
  
  String command = doc["command"];
  
  if (command == "startCapture") {
    testId = doc["testId"].as<String>();
    startAudioCapture();
  } 
  else if (command == "stopCapture") {
    stopAudioCapture();
  }
}

void startAudioCapture() {
  Serial.println("Starting audio capture");
  isCapturing = true;
  
  // Send confirmation back to server
  DynamicJsonDocument doc(1024);
  doc["event"] = "captureStarted";
  doc["testId"] = testId;
  
  String jsonString;
  serializeJson(doc, jsonString);
  webSocket.sendTXT(jsonString);
}

void stopAudioCapture() {
  Serial.println("Stopping audio capture");
  isCapturing = false;
  
  // Send confirmation back to server
  DynamicJsonDocument doc(1024);
  doc["event"] = "captureStopped";
  doc["testId"] = testId;
  
  String jsonString;
  serializeJson(doc, jsonString);
  webSocket.sendTXT(jsonString);
}

void captureAndSendAudio() {
  size_t bytesRead = 0;
  
  // Read data from I2S
  esp_err_t result = i2s_read(I2S_PORT, &sBuffer, sizeof(sBuffer), &bytesRead, 0);
  
  if (result == ESP_OK && bytesRead > 0) {
    // Process audio data to improve quality
    processAudioData(sBuffer, bytesRead / sizeof(int16_t));
    
    // Send audio data via WebSocket
    webSocket.sendBIN((uint8_t*)sBuffer, bytesRead);
  }
}

// Audio processing function to handle raw microphone data
void processAudioData(int16_t* buffer, size_t length) {
  // Simple DC offset removal
  int32_t sum = 0;
  for (size_t i = 0; i < length; i++) {
    sum += buffer[i];
  }
  
  int16_t dcOffset = sum / length;
  
  // Remove DC offset and apply simple normalization
  int16_t maxSample = 0;
  for (size_t i = 0; i < length; i++) {
    buffer[i] -= dcOffset;
    
    // Track maximum amplitude for normalization
    if (abs(buffer[i]) > maxSample) {
      maxSample = abs(buffer[i]);
    }
  }
  
  // Normalize only if the signal is not too quiet (to avoid amplifying noise)
  if (maxSample > 500) {
    float normFactor = 32767.0f / maxSample;
    // Apply a conservative normalization (0.8 factor to prevent clipping)
    normFactor *= 0.8;
    
    for (size_t i = 0; i < length; i++) {
      buffer[i] = (int16_t)(buffer[i] * normFactor);
    }
  }
  
  // Optional: Apply a simple noise gate
  const int16_t noiseThreshold = 300;
  for (size_t i = 0; i < length; i++) {
    if (abs(buffer[i]) < noiseThreshold) {
      buffer[i] = 0;
    }
  }
}
