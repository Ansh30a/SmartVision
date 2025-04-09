# Digital Snellen Chart Vision Testing System

## Project Overview

This system creates a digital version of the classic Snellen eye chart for vision testing, with automated voice recognition to record patient responses. The system consists of:

1. **Frontend**: Vue.js + Vite web application displaying the Snellen chart
2. **Hardware**: ESP32 WROOM 32 microcontroller with INMP441 microphone for audio capture
3. **Backend**: MERN stack (MongoDB, Express, React, Node.js) for processing audio and storing results
4. **Speech Processing**: OpenAI's Whisper API for speech-to-text conversion

## System Architecture

```
┌───────────────┐     ┌───────────────┐     ┌─────────────────────────┐
│  Vue Frontend │     │ ESP32 + Mic   │     │ MERN Backend            │
│  - Chart UI   │◄───►│ - Audio       │────►│ - Audio Processing      │
│  - Test Flow  │     │   Capture     │     │ - Whisper Integration   │
│  - Results    │◄────┼───────────────┼────►│ - Score Calculation     │
└───────────────┘     └───────────────┘     │ - Results Storage       │
                                            └─────────────────────────┘
```

## Hardware Components

1. **ESP32 WROOM 32**: Microcontroller for capturing audio and transmitting to backend
2. **INMP441**: I2S MEMS microphone for high-quality audio capture
3. **Laptop/Computer**: To display the frontend web application

## Software Components

1. **Frontend**: Vue.js + Vite
   - Snellen chart display
   - Test flow management
   - Results visualization

2. **Hardware Code**: Arduino IDE
   - Audio capture via INMP441
   - WebSocket communication with backend

3. **Backend**: MERN Stack
   - MongoDB: Store test results and Snellen chart data
   - Express: API endpoints
   - Node.js: Server runtime
   - FFmpeg: Audio conversion
   - Whisper API: Speech-to-text transcription
   - Vision score calculation

## Detailed Implementation

### 1. Hardware Setup (ESP32 + INMP441)

#### Wiring Diagram
```
ESP32 WROOM 32 | INMP441 Mic
---------------|------------
3.3V           | VDD
GND            | GND
GPIO25         | SCK (Clock)
GPIO33         | SD (Data)
GPIO32         | WS (Word Select)
GND            | L/R (Left/Right channel select)
```

### 2. Frontend Implementation (Vue.js + Vite)

The frontend will provide:
- Digital Snellen chart with standard optotypes
- Testing flow control
- Audio capture status indicators
- Results display

### 3. Backend Implementation (MERN Stack)

- Audio processing pipeline
- Integration with Whisper API
- Test result calculation and storage
- API endpoints for frontend and ESP32

### 4. Vision Testing Flow

1. Patient opens web application
2. Clicks "Start Test" button
3. Snellen chart displays with different sized letters
4. Patient reads letters aloud
5. Audio captured by ESP32+INMP441
6. ESP32 sends audio to backend
7. Backend processes audio using FFmpeg
8. Whisper API converts speech to text
9. Backend compares results with correct answers
10. Vision score calculated based on errors
11. Results displayed to patient
12. Results stored in database

## Functional Components

### ESP32 Arduino Code

### Frontend Components

### Backend API and Processing

### Database Schema

## Project Implementation Details