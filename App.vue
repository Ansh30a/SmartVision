import { onMounted, ref } from 'vue';
import { initWebSocket, onOpen, onClose } from './websocket';

const backendConnected = ref(false);
const esp32Connected = ref(false);

onMounted(() => {
  initWebSocket();

  onOpen(() => {
    backendConnected.value = true;
  });

  onClose(() => {
    backendConnected.value = false;
    esp32Connected.value = false;
  });
});


<template>
  <div class="app">
    <header>
      <h1>Digital Snellen Chart Vision Test</h1>
      <!-- <div class="status-indicators">
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
      </div> -->
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

<script>
import SnellenChart from './components/SnellenChart.vue';

export default {
  name: 'App',
  components: {
    SnellenChart
  },
  data() {
    return {
      // Connection status
      backendConnected: false,
      esp32Connected: false,
      microphoneConnected: false,
      
      // Test state
      testInProgress: false,
      testCompleted: false,
      testId: null,
      
      // Chart data
      chartData: [
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
      ],
      currentLine: 0,
      
      // Recording state
      isRecording: false,
      lineResponses: {},
      
      // WebSocket connection
      socket: null,
      
      // Results
      testResults: null
    };
  },
  mounted() {
    this.checkMicrophoneAccess();
    this.connectToBackend();
  },
  beforeUnmount() {
    this.disconnectWebSocket();
  },
  methods: {
    async checkMicrophoneAccess() {
      try {
        // Just check if microphone is available, don't keep the stream open
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Close the stream right away
        stream.getTracks().forEach(track => track.stop());
        this.microphoneConnected = true;
      } catch (error) {
        console.error('Error accessing microphone:', error);
        this.microphoneConnected = false;
        alert('Microphone access is required for this application. Please enable microphone access and refresh the page.');
      }
    },
    connectToBackend() {
      // Connect to backend via WebSocket
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      // const wsUrl = `${wsProtocol}//${window.location.hostname}:${window.location.port || 5050}/ws/frontend`;
      // const wsUrl = `${wsProtocol}//${window.location.hostname}:5050/ws/device`;
      const wsUrl = `${wsProtocol}//${window.location.hostname}:5050/ws/frontend`;
      
      this.socket = new WebSocket(wsUrl);
      
      this.socket.onopen = () => {
        console.log('WebSocket connected to backend');
        this.backendConnected = true;
      };
      
      this.socket.onclose = () => {
        console.log('WebSocket disconnected from backend');
        this.backendConnected = false;
        this.esp32Connected = false;
        
        // Try to reconnect after a delay
        setTimeout(() => {
          if (!this.backendConnected) {
            this.connectToBackend();
          }
        }, 5000);
      };
      
      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.backendConnected = false;
      };
      
      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleWebSocketMessage(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
    },
    disconnectWebSocket() {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.close();
      }
    },
    handleWebSocketMessage(data) {
      console.log('WebSocket message received:', data);
      
      if (data.event === 'deviceStatus') {
        this.esp32Connected = data.status === 'connected';
      }
      
      if (data.event === 'micStatus') {
        this.isRecording = data.recording;
        
        if (!data.recording && data.transcript) {
          // Store the transcription
          this.$set(this.lineResponses, data.lineIndex, data.transcript);
        }
      }
      
      if (data.event === 'captureStarted') {
        this.isRecording = true;
      }
      
      if (data.event === 'captureStopped') {
        this.isRecording = false;
      }
    },
    async startTest() {
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
        this.testId = data.testId;
        this.testInProgress = true;
        this.testCompleted = false;
        this.currentLine = 0;
        this.lineResponses = {};
        this.testResults = null;
      } catch (error) {
        console.error('Error starting test:', error);
        alert('Failed to start test. Please try again.');
      }
    },
    startRecording() {
      if (!this.esp32Connected) {
        alert('ESP32 device is not connected. Cannot record audio.');
        return;
      }
      
      if (!this.backendConnected) {
        alert('Backend is not connected. Cannot record audio.');
        return;
      }
      
      this.isRecording = true;
      
      // Send command to backend to start capture on ESP32
      this.socket.send(JSON.stringify({
        command: 'startCapture',
        testId: this.testId,
        lineIndex: this.currentLine
      }));
    },
    stopRecording() {
      this.isRecording = false;
      
      // Send command to backend to stop capture on ESP32
      this.socket.send(JSON.stringify({
        command: 'stopCapture',
        testId: this.testId,
        lineIndex: this.currentLine
      }));
    },
    nextLine() {
      if (this.currentLine < this.chartData.length - 1) {
        this.currentLine++;
      }
    },
    previousLine() {
      if (this.currentLine > 0) {
        this.currentLine--;
      }
    },
    async finishTest() {
      try {
        // Get test results from backend
        const response = await fetch(`/api/tests/${this.testId}/results`);
        
        if (!response.ok) {
          throw new Error('Failed to get test results');
        }
        
        this.testResults = await response.json();
        this.testInProgress = false;
        this.testCompleted = true;
      } catch (error) {
        console.error('Error finishing test:', error);
        alert('Failed to get test results. Please try again.');
      }
    },
    resetTest() {
      this.testInProgress = false;
      this.testCompleted = false;
      this.testId = null;
      this.currentLine = 0;
      this.lineResponses = {};
      this.testResults = null;
    }
  }
};
</script>

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

.status-value.connected {
  color: green;
}

.status-value.disconnected {
  color: red;
}

</style>




<!-- // File: src/App.vue
<template>
  <div class="snellen-app">
    <header>
      <h1>Digital Snellen Chart Vision Test</h1>
    </header>
    
    <main>
      <div v-if="testState === 'ready'" class="start-screen">
        <h2>Vision Test</h2>
        <p>This test will evaluate your vision using a digital Snellen chart.</p>
        <p>Instructions:</p>
        <ol>
          <li>Click the "Start Test" button below</li>
          <li>Read aloud the letters displayed on the screen</li>
          <li>Start from the top row and continue to the bottom</li>
          <li>Speak clearly into the microphone</li>
        </ol>
        <button @click="startTest" class="primary-button">Start Test</button>
      </div>
      
      <div v-else-if="testState === 'testing'" class="test-screen">
        <SnellenChart 
          :currentLine="currentLine" 
          :chartData="snellenChartData" 
        />
        
        <div class="test-controls">
          <div class="mic-status" :class="{ 'recording': isRecording }">
            <span v-if="isRecording">Recording...</span>
            <span v-else>Microphone Ready</span>
          </div>
          <div class="progress">
            Line {{ currentLine + 1 }} of {{ snellenChartData.length }}
          </div>
          <button @click="nextLine" class="secondary-button" 
                  :disabled="currentLine >= snellenChartData.length - 1">
            Next Line
          </button>
          <button @click="completeTest" class="primary-button">
            Complete Test
          </button>
        </div>
      </div>
      
      <div v-else-if="testState === 'loading'" class="loading-screen">
        <div class="loader"></div>
        <p>Processing results...</p>
      </div>
      
      <div v-else-if="testState === 'results'" class="results-screen">
        <h2>Your Vision Test Results</h2>
        <div class="vision-score">
          <h3>Vision Score: {{ visionScore }}</h3>
          <p>{{ visionScoreInterpretation }}</p>
        </div>
        
        <div class="result-details">
          <h3>Line by Line Results:</h3>
          <table>
            <thead>
              <tr>
                <th>Line</th>
                <th>Visual Acuity</th>
                <th>Letters</th>
                <th>Your Response</th>
                <th>Accuracy</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(result, index) in results" :key="index">
                <td>{{ index + 1 }}</td>
                <td>{{ result.acuity }}</td>
                <td>{{ result.letters }}</td>
                <td>{{ result.response }}</td>
                <td>{{ result.accuracy }}%</td>
              </tr>
            </tbody>
          </table>
        </div>
        
        <button @click="restartTest" class="primary-button">
          Take Test Again
        </button>
      </div>
    </main>
  </div>
</template>

<script>
import SnellenChart from './components/SnellenChart.vue';
import axios from 'axios';

export default {
  name: 'App',
  components: {
    SnellenChart
  },
  data() {
    return {
      testState: 'ready', // ready, testing, loading, results
      currentLine: 0,
      isRecording: false,
      testId: null,
      results: [],
      visionScore: '',
      visionScoreInterpretation: '',
      snellenChartData: [
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
      ],
      socket: null,
      backendUrl: 'http://localhost:5050/api',
      wsUrl: 'ws://localhost:5050/ws'
    };
  },
  methods: {
    startTest() {
      this.testState = 'testing';
      this.currentLine = 0;
      this.results = [];
      
      // Create a new test session
      axios.post(`${this.backendUrl}/tests/create`)
        .then(response => {
          this.testId = response.data.testId;
          this.connectWebSocket();
        })
        .catch(error => {
          console.error('Error creating test:', error);
          alert('Failed to start test. Please try again.');
          this.testState = 'ready';
        });
    },
    
    connectWebSocket() {
      this.socket = new WebSocket(`${this.wsUrl}/device`);
      
      this.socket.onopen = () => {
        console.log('WebSocket connected');
        this.startRecording();
      };
      
      this.socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        console.log('Received message:', data);
        
        if (data.event === 'micStatus') {
          this.isRecording = data.recording;
        }
      };
      
      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
      
      this.socket.onclose = () => {
        console.log('WebSocket disconnected');
        this.isRecording = false;
      };
    },
    
    startRecording() {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({
          command: 'startCapture',
          testId: this.testId,
          lineIndex: this.currentLine
        }));
        this.isRecording = true;
      }
    },
    
    stopRecording() {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({
          command: 'stopCapture',
          testId: this.testId,
          lineIndex: this.currentLine
        }));
        this.isRecording = false;
      }
    },
    
    nextLine() {
      // Stop recording for current line
      this.stopRecording();
      
      // Proceed to next line
      if (this.currentLine < this.snellenChartData.length - 1) {
        this.currentLine++;
        
        // Small delay before starting recording for the next line
        setTimeout(() => {
          this.startRecording();
        }, 1000);
      }
    },
    
    completeTest() {
      this.stopRecording();
      this.testState = 'loading';
      
      if (this.socket) {
        this.socket.close();
      }
      
      // Fetch test results
      axios.get(`${this.backendUrl}/tests/${this.testId}/results`)
        .then(response => {
          this.results = response.data.lineResults;
          this.visionScore = response.data.visionScore;
          this.visionScoreInterpretation = response.data.interpretation;
          this.testState = 'results';
        })
        .catch(error => {
          console.error('Error fetching results:', error);
          alert('Failed to fetch test results. Please try again.');
          this.testState = 'ready';
        });
    },
    
    restartTest() {
      this.testState = 'ready';
      this.currentLine = 0;
      this.testId = null;
      this.results = [];
    }
  },
  beforeUnmount() {
    if (this.socket) {
      this.socket.close();
    }
  }
}
</script>

<style>
.snellen-app {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  font-family: Arial, sans-serif;
}

header {
  text-align: center;
  margin-bottom: 30px;
}

.start-screen, .test-screen, .loading-screen, .results-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.test-controls {
  margin-top: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
  width: 100%;
  max-width: 500px;
}

.mic-status {
  padding: 10px 20px;
  border-radius: 5px;
  background-color: #f0f0f0;
}

.mic-status.recording {
  background-color: #ff5252;
  color: white;
  animation: pulse 2s infinite;
}

.primary-button {
  background-color: #4CAF50;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 5px;
  font-size: 16px;
  cursor: pointer;
  margin: 10px 0;
}

.secondary-button {
  background-color: #2196F3;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  font-size: 14px;
  cursor: pointer;
}

button:disabled {
  background-color: #cccccc;
  cursor: not-allowed;
}

.vision-score {
  background-color: #f5f5f5;
  padding: 20px;
  border-radius: 10px;
  margin: 20px 0;
  text-align: center;
}

.result-details table {
  border-collapse: collapse;
  width: 100%;
  margin: 20px 0;
}

.result-details th, .result-details td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: center;
}

.result-details th {
  background-color: #f2f2f2;
}

.loader {
  border: 5px solid #f3f3f3;
  border-top: 5px solid #3498db;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  animation: spin 2s linear infinite;
  margin: 30px 0;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.7; }
  100% { opacity: 1; }
}
</style> -->