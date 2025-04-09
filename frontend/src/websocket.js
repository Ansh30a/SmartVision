// websocket.js - Place this file in the same directory as App.vue
let socket = null;
const listeners = {
  open: [],
  close: [],
  message: [],
  error: []
};

export function initWebSocket() {
  const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${wsProtocol}//${window.location.hostname}:5050/ws/frontend`;
  
  socket = new WebSocket(wsUrl);
  
  socket.onopen = (event) => {
    console.log('WebSocket connected');
    listeners.open.forEach(callback => callback(event));
  };
  
  socket.onclose = (event) => {
    console.log('WebSocket disconnected');
    listeners.close.forEach(callback => callback(event));
    
    // Try to reconnect after 5 seconds
    setTimeout(() => {
      initWebSocket();
    }, 5000);
  };
  
  socket.onerror = (error) => {
    console.error('WebSocket error:', error);
    listeners.error.forEach(callback => callback(error));
  };
  
  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      console.log('WebSocket message received:', data);
      listeners.message.forEach(callback => callback(data));
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  };
  
  return socket;
}

export function sendMessage(message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(typeof message === 'string' ? message : JSON.stringify(message));
  } else {
    console.error('WebSocket not connected, cannot send message');
  }
}

export function onOpen(callback) {
  listeners.open.push(callback);
}

export function onClose(callback) {
  listeners.close.push(callback);
}

export function onMessage(callback) {
  listeners.message.push(callback);
}

export function onError(callback) {
  listeners.error.push(callback);
}