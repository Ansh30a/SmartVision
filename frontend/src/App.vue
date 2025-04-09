<script setup>
import { onMounted, ref } from 'vue';
import { initWebSocket, onOpen, onClose, onMessage, sendMessage } from './websocket';
import SnellenChart from './components/SnellenChart.vue';

// Connection status
const backendConnected = ref(false);
const esp32Connected = ref(false);
const microphoneConnected = ref(false);

// Test state
const testInProgress = ref(false);
const testCompleted = ref(false);
const testId = ref(null);

// Chart data
const chartData = ref([
  { letters: 'E', acuity: '20/200', size: 88 },
  { letters: 'FP', acuity: '20/100', size: 44 },
  { letters: 'TOZ', acuity: '20/70', size: 31 },
  { letters: 'LPED', acuity: '20/50', size: 22 },
  { letters: 'PECFD', acuity: '20/40', size: 18 },
  { letters: 'EDFCZP', acuity: '20/30', size: 13 },
  { letters: 'FELOPZD', acuity: '20/25', size: 11 },
  { letters: 'DEFPOTEC', acuity: '20/20', size: 9 },
  { letters: 'LEFODPCT', acuity: '20/15', size: 7 },
  { letters: 'FDPLTCEO', acuity: '20/10', size: 4 }
]);
const currentLine = ref(0);

// Recording state
const isRecording = ref(false);
const lineResponses = ref({});

// Results
const testResults = ref(null);

onMounted(() => {
  checkMicrophoneAccess();
  
  initWebSocket();

  onOpen(() => {
    backendConnected.value = true;
  });

  onClose(() => {
    backendConnected.value = false;
    esp32Connected.value = false;
  });

  onMessage((data) => {
    handleWebSocketMessage(data);
  });
});

function checkMicrophoneAccess() {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      // Close the stream right away
      stream.getTracks().forEach(track => track.stop());
      microphoneConnected.value = true;
    })
    .catch(error => {
      console.error('Error accessing microphone:', error);
      microphoneConnected.value = false;
      alert('Microphone access is required for this application. Please enable microphone access and refresh the page.');
    });
}

function handleWebSocketMessage(data) {
  console.log('WebSocket message received:', data);
  
  if (data.event === 'deviceStatus') {
    esp32Connected.value = data.status === 'connected';
  }
  
  if (data.event === 'micStatus') {
    isRecording.value = data.recording;
    
    if (!data.recording && data.transcript) {
      // Store the transcription
      lineResponses.value[data.lineIndex] = data.transcript;
    }
  }
  
  if (data.event === 'captureStarted') {
    isRecording.value = true;
  }
  
  if (data.event === 'captureStopped') {
    isRecording.value = false;
  }
}

async function startTest() {
  try {
    // Create new test on the backend
    const response = await fetch('/api/tests/create', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error('Failed to create test');
    }
    
    const data = await response.json();
    testId.value = data.testId;
    testInProgress.value = true;
    testCompleted.value = false;
    currentLine.value = 0;
    lineResponses.value = {};
    testResults.value = null;
  } catch (error) {
    console.error('Error starting test:', error);
    alert('Failed to start test. Please try again.');
  }
}

function startRecording() {
  if (!esp32Connected.value) {
    alert('ESP32 device is not connected. Cannot record audio.');
    return;
  }
  
  if (!backendConnected.value) {
    alert('Backend is not connected. Cannot record audio.');
    return;
  }
  
  isRecording.value = true;
  
  // Send command to backend to start capture on ESP32
  sendMessage({
    command: 'startCapture',
    testId: testId.value,
    lineIndex: currentLine.value
  });
}

function stopRecording() {
  isRecording.value = false;
  
  // Send command to backend to stop capture on ESP32
  sendMessage({
    command: 'stopCapture',
    testId: testId.value,
    lineIndex: currentLine.value
  });
}

function nextLine() {
  if (currentLine.value < chartData.value.length - 1) {
    currentLine.value++;
  }
}

function previousLine() {
  if (currentLine.value > 0) {
    currentLine.value--;
  }
}

async function finishTest() {
  try {
    // Get test results from backend
    const response = await fetch(`/api/tests/${testId.value}/results`);
    
    if (!response.ok) {
      throw new Error('Failed to get test results');
    }
    
    testResults.value = await response.json();
    testInProgress.value = false;
    testCompleted.value = true;
  } catch (error) {
    console.error('Error finishing test:', error);
    alert('Failed to get test results. Please try again.');
  }
}

function resetTest() {
  testInProgress.value = false;
  testCompleted.value = false;
  testId.value = null;
  currentLine.value = 0;
  lineResponses.value = {};
  testResults.value = null;
}
</script>

<template>
  <div class="app">
    <header>
      <h1>Digital Snellen Chart Vision Test</h1>
      <div class="status-indicators">
        <div class="status-item">
          <span class="status-label">Backend:</span>
          <span class="status-value" :class="{ connected: backendConnected, disconnected: !backendConnected }">
            {{ backendConnected ? 'Connected' : 'Disconnected' }}
          </span>
        </div>
        <div class="status-item">
          <span class="status-label">ESP32:</span>
          <span class="status-value" :class="{ connected: esp32Connected, disconnected: !esp32Connected }">
            {{ esp32Connected ? 'Connected' : 'Disconnected' }}
          </span>
        </div>
        <div class="status-item">
          <span class="status-label">Microphone:</span>
          <span class="status-value" :class="{ connected: microphoneConnected, disconnected: !microphoneConnected }">
            {{ microphoneConnected ? 'Ready' : 'Not Available' }}
          </span>
        </div>
      </div>
    </header>

    <main>
      <div class="test-controls" v-if="!testInProgress && !testCompleted">
        <h2>Vision Test Instructions</h2>
        <p>This test will measure your visual acuity using a standard Snellen chart.</p>
        <ol>
          <li>Position yourself 20 feet (6 meters) from the screen</li>
          <li>If you wear glasses or contacts, keep them on</li>
          <li>Cover your left eye and read the letters on the chart with your right eye</li>
          <li>The test will progress through different letter sizes</li>
          <li>Speak the letters clearly when prompted</li>
        </ol>
        <button @click="startTest" class="start-button">Start Test</button>
      </div>

      <div class="test-container" v-if="testInProgress">
        <div class="test-info">
          <div class="test-progress">Line: {{ currentLine + 1 }} / {{ chartData.length }}</div>
          <div class="recording-status" :class="{ recording: isRecording }">
            {{ isRecording ? 'Recording...' : 'Ready to record' }}
          </div>
        </div>

        <SnellenChart :chartData="chartData" :currentLine="currentLine" />

        <div class="test-actions">
          <button @click="startRecording" :disabled="isRecording" class="record-button">
            Read Line Aloud
          </button>
          <button @click="stopRecording" :disabled="!isRecording" class="stop-button">
            Stop Recording
          </button>
          <button @click="nextLine" :disabled="isRecording || currentLine >= chartData.length - 1" class="next-button">
            Next Line
          </button>
          <button @click="previousLine" :disabled="isRecording || currentLine <= 0" class="prev-button">
            Previous Line
          </button>
          <button @click="finishTest" :disabled="isRecording" class="finish-button">
            Finish Test
          </button>
        </div>

        <div class="response-display" v-if="lineResponses[currentLine]">
          <h3>Your response:</h3>
          <p class="response">{{ lineResponses[currentLine] }}</p>
        </div>
      </div>

      <div class="results" v-if="testCompleted">
        <h2>Test Results</h2>
        <div v-if="testResults">
          <div class="vision-score">
            <h3>Your Vision Score:</h3>
            <p class="score">{{ testResults.visionScore }}</p>
            <p class="interpretation">{{ testResults.interpretation }}</p>
          </div>

          <table class="results-table">
            <thead>
              <tr>
                <th>Line</th>
                <th>Acuity</th>
                <th>Actual Letters</th>
                <th>Your Response</th>
                <th>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(result, index) in testResults.lineResults" :key="index">
                <td>{{ index + 1 }}</td>
                <td>{{ result.acuity }}</td>
                <td>{{ result.letters }}</td>
                <td>{{ result.response }}</td>
                <td>{{ result.accuracy }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else>
          <p>Loading test results...</p>
        </div>
        <button @click="resetTest" class="restart-button">Start New Test</button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 30px;
  flex-wrap: wrap;
}

h1 {
  margin: 0;
  color: #333;
}

.status-indicators {
  display: flex;
  gap: 20px;
}

.status-item {
  display: flex;
  align-items: center;
  gap: 5px;
}

.status-label {
  font-weight: bold;
}

.status-value {
  padding: 3px 8px;
  border-radius: 4px;
  font-size: 0.9em;
}

.connected {
  background: #d4edda;
  color: #155724;
}

.disconnected {
  background: #f8d7da;
  color: #721c24;
}

.test-controls {
  max-width: 600px;
  margin: 0 auto;
  text-align: left;
}

.test-controls ol {
  margin-bottom: 30px;
}

.test-controls li {
  margin-bottom: 10px;
}

.start-button {
  padding: 12px 24px;
  font-size: 1.2em;
  background-color: #4caf50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.test-container {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.test-info {
  display: flex;
  justify-content: space-between;
  width: 100%;
  margin-bottom: 20px;
}

.test-progress {
  font-weight: bold;
}

.recording-status {
  padding: 5px 10px;
  border-radius: 4px;
  background-color: #f8f9fa;
}

.recording-status.recording {
  background-color: #dc3545;
  color: white;
  animation: blink 1s infinite;
}

@keyframes blink {
  50% {
    opacity: 0.7;
  }
}

.test-actions {
  display: flex;
  gap: 10px;
  margin: 20px 0;
  flex-wrap: wrap;
  justify-content: center;
}

button {
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.record-button {
  background-color: #007bff;
  color: white;
}

.stop-button {
  background-color: #dc3545;
  color: white;
}

.next-button, .prev-button {
  background-color: #6c757d;
  color: white;
}

.finish-button {
  background-color: #28a745;
  color: white;
}

.restart-button {
  background-color: #17a2b8;
  color: white;
  padding: 10px 20px;
  font-size: 1.1em;
  margin-top: 20px;
}

.response-display {
  margin-top: 20px;
  padding: 15px;
  background-color: #f8f9fa;
  border-radius: 4px;
  width: 100%;
  text-align: center;
}

.response {
  font-size: 1.5em;
  font-weight: bold;
  letter-spacing: 3px;
}

.results {
  max-width: 800px;
  margin: 0 auto;
}

.vision-score {
  text-align: center;
  margin: 30px 0;
  padding: 20px;
  background-color: #f8f9fa;
  border-radius: 8px;
}

.score {
  font-size: 2em;
  font-weight: bold;
  color: #007bff;
  margin: 10px 0;
}

.interpretation {
  font-size: 1.2em;
  color: #6c757d;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  margin: 20px 0;
}

.results-table th, .results-table td {
  padding: 12px;
  border: 1px solid #dee2e6;
  text-align: center;
}

.results-table th {
  background-color: #e9ecef;
  font-weight: bold;
}

.results-table tr:nth-child(even) {
  background-color: #f8f9fa;
}
</style>