// server.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { spawn } = require('child_process');
const { OpenAI } = require('openai');
require('dotenv').config();

// Initialize Express app
const app = express();
const port = process.env.PORT || 5050;

// Create HTTP server
const server = http.createServer(app);

// Create WebSocket server
// const wss = new WebSocket.Server({ 
//   server,
//   path: '/ws/device',
//   noServer: false // Allow accessing via different paths
// });

// Create WebSocket server without a specific path constraint
const wss = new WebSocket.Server({ 
  // server,
  noServer: true  // Use noServer: true to handle the upgrade manually
});

// Handle WebSocket upgrade requests to differentiate paths
server.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url, `http://${request.headers.host}`).pathname;
  
  if (pathname === '/ws/device' || pathname === '/ws/frontend') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// Connect to MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/snellen-chart', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// Configure Express middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Create directories for audio files if they don't exist
const audioDirectory = path.join(__dirname, 'audio');
if (!fs.existsSync(audioDirectory)) {
  fs.mkdirSync(audioDirectory, { recursive: true });
}

// Initialize OpenAI with API key from environment
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Define MongoDB schemas
const TestSchema = new mongoose.Schema({
  testId: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now },
  completed: { type: Boolean, default: false },
  visionScore: { type: String },
  interpretation: { type: String },
  lineResults: [{
    lineIndex: Number,
    acuity: String,
    letters: String,
    response: String,
    accuracy: Number
  }]
});

const Test = mongoose.model('Test', TestSchema);

// WebSocket connections store
const connections = {
  devices: new Map(),
  frontends: new Map()
};

// Audio processing variables
const activeRecordings = new Map();

// WebSocket server handling
wss.on('connection', (ws, req) => {
  const connectionId = uuidv4();
  const url = new URL(req.url, `http://${req.headers.host}`);
  const connectionType = url.pathname.includes('/ws/device') ? 'device' : 'frontend';
  
  if (connectionType === 'device') {
    connections.devices.set(connectionId, ws);
    console.log(`🎙️ Device connected: ${connectionId}`);
    
    // Send connection confirmation to device
    ws.send(JSON.stringify({ 
      status: 'connected',
      connectionId: connectionId 
    }));

    // Notify frontends of device connection
    notifyFrontends({
      event: 'deviceStatus',
      status: 'connected',
      deviceType: 'ESP32_Audio_Capture'
    });

  } else {
    connections.frontends.set(connectionId, ws);
    console.log(`🖥️ Frontend connected: ${connectionId}`);
    // Send current device connection status to the new frontend
    ws.send(JSON.stringify({
      event: 'deviceStatus',
      status: connections.devices.size > 0 ? 'connected' : 'disconnected'
    }));
  }
  
  ws.on('message', async (message) => {
    try {
      // Check if message is binary (audio data)
      if (message instanceof Buffer) {
        handleAudioData(connectionId, message);
      } else {
        const msgStr = message.toString();
        let data;
        
        try {
          data = JSON.parse(msgStr);
        } catch (error) {
          console.error('Error parsing JSON message:', error);
          console.log('Raw message:', msgStr);
          return;
        }
        
        await handleJsonMessage(connectionId, data, ws, connectionType);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      ws.send(JSON.stringify({ 
        status: 'error',
        message: 'Failed to process message' 
      }));
    }
  });
  
  ws.on('close', () => {
    if (connections.devices.has(connectionId)) {
      const recording = activeRecordings.get(connectionId);
      if (recording && recording.fileStream) {
        recording.fileStream.end();
        activeRecordings.delete(connectionId);
        console.log(`📀 Closed recording for device: ${connectionId}`);
      }
      connections.devices.delete(connectionId);
      console.log(`❌ Device disconnected: ${connectionId}`);
    } else if (connections.frontends.has(connectionId)) {
      connections.frontends.delete(connectionId);
      console.log(`❌ Frontend disconnected: ${connectionId}`);
    }
  });
  
  ws.on('error', (err) => {
    console.error(`❌ WebSocket error for ${connectionType}:`, err);
  });
});

// Handle JSON messages from WebSocket clients
async function handleJsonMessage(connectionId, data, ws, connectionType) {
  console.log(`📩 Received JSON message from ${connectionType}:`, JSON.stringify(data));
  
  // Handle device registration
  if (data.event === 'deviceConnected') {
    console.log(`🔌 Device registered: ${data.deviceType}, MAC: ${data.mac}, IP: ${data.ip}`);
    
    // Notify frontends of device connection
    notifyFrontends({
      event: 'deviceStatus',
      status: 'connected',
      deviceType: data.deviceType,
      mac: data.mac,
      ip: data.ip
    });
    
    return;
  }
  
  // Handle heartbeat
  if (data.event === 'heartbeat') {
    // Just log the heartbeat
    console.log(`💓 Heartbeat from device: ${connectionId}, uptime: ${data.uptime}s`);
    return;
  }
  
  // Handle commands
  if (data.command) {
    const { command, testId, lineIndex } = data;
    
    if (!command) {
      ws.send(JSON.stringify({ status: 'error', message: 'Command is required' }));
      return;
    }
    
    if (command === 'startCapture') {
      if (!testId || lineIndex === undefined) {
        ws.send(JSON.stringify({ status: 'error', message: 'testId and lineIndex are required' }));
        return;
      }
      
      // Create a new file stream for the recording
      const directory = path.join(audioDirectory, testId);
      if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
      }
      
      const fileName = `line_${lineIndex}.raw`;
      const filePath = path.join(directory, fileName);
      const fileStream = fs.createWriteStream(filePath);
      
      activeRecordings.set(connectionId, {
        testId,
        lineIndex,
        filePath,
        fileStream
      });
      
      console.log(`🎬 Started recording for test ${testId}, line ${lineIndex}`);
      
      // Relay command to device if it came from frontend
      if (connectionType === 'frontend') {
        connections.devices.forEach((deviceWs) => {
          if (deviceWs.readyState === WebSocket.OPEN) {
            deviceWs.send(JSON.stringify({
              command: 'startCapture',
              testId,
              lineIndex
            }));
          }
        });
      }
      
      // Notify connected frontends about mic status
      notifyFrontends({
        event: 'micStatus',
        recording: true,
        testId,
        lineIndex
      });
      
      ws.send(JSON.stringify({ status: 'recording_started' }));
    }
    else if (command === 'stopCapture') {
      const recording = activeRecordings.get(connectionId);
      
      if (recording) {
        recording.fileStream.end();
        activeRecordings.delete(connectionId);
        
        console.log(`🛑 Stopped recording for test ${testId}, line ${lineIndex}`);
        
        // Relay command to device if it came from frontend
        if (connectionType === 'frontend') {
          connections.devices.forEach((deviceWs) => {
            if (deviceWs.readyState === WebSocket.OPEN) {
              deviceWs.send(JSON.stringify({
                command: 'stopCapture',
                testId,
                lineIndex
              }));
            }
          });
        }
        
        try {
          // Process the audio file
          const transcript = await processAudioFile(testId, lineIndex, recording.filePath);
          
          // Notify connected frontends about mic status and transcription
          notifyFrontends({
            event: 'micStatus',
            recording: false,
            testId,
            lineIndex,
            transcript
          });
          
          ws.send(JSON.stringify({ 
            status: 'recording_stopped',
            transcript
          }));
        } catch (error) {
          console.error('Error processing audio file:', error);
          ws.send(JSON.stringify({ 
            status: 'error',
            message: 'Failed to process audio recording' 
          }));
        }
      } else {
        ws.send(JSON.stringify({ 
          status: 'error',
          message: 'No active recording found' 
        }));
      }
    }
  }
  
  // Handle events from device
  if (data.event === 'captureStarted' || data.event === 'captureStopped') {
    // Relay to frontend
    notifyFrontends({
      event: data.event,
      testId: data.testId,
      lineIndex: data.lineIndex
    });
  }
}

// Handle binary audio data from WebSocket clients
function handleAudioData(connectionId, data) {
  const recording = activeRecordings.get(connectionId);
  
  if (recording && recording.fileStream) {
    recording.fileStream.write(data);
  }
}

// Process audio file (convert to WAV and transcribe)
async function processAudioFile(testId, lineIndex, rawFilePath) {
  try {
    // Verify the raw file exists and has content
    if (!fs.existsSync(rawFilePath) || fs.statSync(rawFilePath).size === 0) {
      throw new Error(`Raw audio file is missing or empty: ${rawFilePath}`);
    }
    
    // Convert raw audio to WAV using FFmpeg
    const directory = path.dirname(rawFilePath);
    const wavFilePath = path.join(directory, `line_${lineIndex}.wav`);
    
    await new Promise((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',                // Overwrite output file if it exists
        '-f', 's16le',       // Input format (16-bit signed PCM)
        '-ar', '16000',      // Sample rate
        '-ac', '1',          // Mono channel
        '-i', rawFilePath,   // Input file
        '-c:a', 'pcm_s16le', // Output codec
        wavFilePath          // Output file
      ]);
      
      let ffmpegError = '';
      
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg process exited with code ${code}: ${ffmpegError}`));
        }
      });
      
      ffmpeg.stderr.on('data', (data) => {
        const msg = data.toString();
        ffmpegError += msg;
        console.log(`🎞️ FFmpeg: ${msg}`);
      });
      
      ffmpeg.on('error', (err) => {
        reject(new Error(`FFmpeg process error: ${err.message}`));
      });
    });
    
    console.log(`🔄 Converted audio to WAV: ${wavFilePath}`);
    
    // Verify the WAV file exists and has content
    if (!fs.existsSync(wavFilePath) || fs.statSync(wavFilePath).size === 0) {
      throw new Error(`WAV file is missing or empty: ${wavFilePath}`);
    }
    
    // Transcribe audio using OpenAI Whisper API
    const transcript = await transcribeAudio(wavFilePath);
    console.log(`🔤 Transcription for test ${testId}, line ${lineIndex}: "${transcript}"`);
    
    // Update test results in the database
    await updateTestResults(testId, lineIndex, transcript);
    
    return transcript;
  } catch (error) {
    console.error('❌ Error processing audio file:', error);
    throw error;
  }
}

// Transcribe audio using OpenAI Whisper API
async function transcribeAudio(wavFilePath) {
  try {
    // Check if file exists and has content
    if (!fs.existsSync(wavFilePath)) {
      throw new Error(`WAV file not found: ${wavFilePath}`);
    }
    
    if (fs.statSync(wavFilePath).size === 0) {
      throw new Error(`WAV file is empty: ${wavFilePath}`);
    }
    
    const response = await openai.audio.transcriptions.create({
      file: fs.createReadStream(wavFilePath),
      model: "whisper-1",
      language: "en",
      response_format: "text"
    });
    
    return response.trim().toUpperCase();
  } catch (error) {
    console.error('❌ Error transcribing audio:', error);
    return '';
  }
}

// Update test results in the database
async function updateTestResults(testId, lineIndex, transcription) {
  try {
    // Get the test from the database
    const test = await Test.findOne({ testId });
    
    if (!test) {
      throw new Error(`Test with ID ${testId} not found`);
    }
    
    // Snellen chart data
    const snellenChart = [
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
    ];
    
    if (lineIndex < 0 || lineIndex >= snellenChart.length) {
      throw new Error(`Invalid lineIndex: ${lineIndex}`);
    }
    
    // Get the correct letters for this line
    const correctLetters = snellenChart[lineIndex].letters;
    
    // Calculate accuracy percentage
    const accuracy = calculateAccuracy(correctLetters, transcription);
    
    // Create line result
    const lineResult = {
      lineIndex,
      acuity: snellenChart[lineIndex].acuity,
      letters: correctLetters,
      response: transcription,
      accuracy
    };
    
    // Find the index of this line in the existing results (if any)
    const existingIndex = test.lineResults.findIndex(r => r.lineIndex === lineIndex);
    
    if (existingIndex >= 0) {
      // Update existing result
      test.lineResults[existingIndex] = lineResult;
    } else {
      // Add new result
      test.lineResults.push(lineResult);
    }
    
    // Save updated test
    await test.save();
    
    console.log(`✅ Updated test results for test ${testId}, line ${lineIndex}`);
  } catch (error) {
    console.error('❌ Error updating test results:', error);
    throw error;
  }
}

// Calculate accuracy percentage between correct letters and transcription
function calculateAccuracy(correctLetters, transcription) {
  let correctCount = 0;
  
  // Remove spaces from transcription
  transcription = transcription.replace(/\s+/g, '');
  
  // Iterate through each letter in the correct letters
  for (let i = 0; i < correctLetters.length; i++) {
    if (i < transcription.length && correctLetters[i] === transcription[i]) {
      correctCount++;
    }
  }
  
  // Calculate accuracy as a percentage
  return Math.round((correctCount / correctLetters.length) * 100);
}

// Notify all connected frontends with a message
function notifyFrontends(message) {
  const messageString = JSON.stringify(message);
  
  connections.frontends.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(messageString);
    }
  });
}

// API routes
app.post('/api/tests/create', async (req, res) => {
  try {
    const testId = uuidv4();
    
    const newTest = new Test({
      testId,
      completed: false,
      lineResults: []
    });
    
    await newTest.save();
    
    res.status(201).json({ testId });
  } catch (error) {
    console.error('❌ Error creating test:', error);
    res.status(500).json({ error: 'Failed to create test' });
  }
});

app.get('/api/tests/:testId/results', async (req, res) => {
  try {
    const { testId } = req.params;
    
    // Get the test from the database
    const test = await Test.findOne({ testId });
    
    if (!test) {
      return res.status(404).json({ error: 'Test not found' });
    }
    
    // Sort line results by lineIndex
    const lineResults = [...test.lineResults].sort((a, b) => a.lineIndex - b.lineIndex);
    
    // Calculate vision score
    const { visionScore, interpretation } = calculateVisionScore(lineResults);
    
    // Update test with vision score if it's not already set
    if (!test.visionScore) {
      test.visionScore = visionScore;
      test.interpretation = interpretation;
      test.completed = true;
      await test.save();
    }
    
    res.json({
      testId,
      visionScore,
      interpretation,
      lineResults
    });
  } catch (error) {
    console.error('❌ Error getting test results:', error);
    res.status(500).json({ error: 'Failed to get test results' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Calculate vision score based on line results
function calculateVisionScore(lineResults) {
  // Find the smallest line with at least 50% accuracy
  for (let i = lineResults.length - 1; i >= 0; i--) {
    if (lineResults[i].accuracy >= 50) {
      return {
        visionScore: lineResults[i].acuity,
        interpretation: getVisionInterpretation(lineResults[i].acuity)
      };
    }
  }
  
  // If no line has at least 50% accuracy, use the largest line
  if (lineResults.length > 0) {
    return {
      visionScore: lineResults[0].acuity,
      interpretation: getVisionInterpretation(lineResults[0].acuity)
    };
  }
  
  // Default if no results
  return {
    visionScore: 'N/A',
    interpretation: 'No valid measurements'
  };
}

// Get interpretation of vision score
function getVisionInterpretation(visionScore) {
  const scores = {
    '20/10': 'Excellent vision (better than average)',
    '20/15': 'Very good vision (better than average)',
    '20/20': 'Normal vision',
    '20/25': 'Near normal vision',
    '20/30': 'Mild vision loss',
    '20/40': 'Moderate vision loss (driving vision standard)',
    '20/50': 'Moderate vision loss',
    '20/70': 'Moderate-to-severe vision loss',
    '20/100': 'Severe vision loss',
    '20/200': 'Very severe vision loss (legal blindness threshold)'
  };
  
  return scores[visionScore] || 'Unknown';
}

// Start the server
server.listen(port, () => {
  console.log(`🚀 Server listening on http://localhost:${port}`);
  console.log(`🔌 WebSocket listening at ws://localhost:${port}/ws/device`);
});
