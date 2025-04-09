// src/services/websocket.js
// websocket.js
let socket;
let onMessageCallback = () => {};
let onOpenCallback = () => {};
let onCloseCallback = () => {};

export function initWebSocket() {
  socket = new WebSocket('ws://localhost:5050/ws/frontend');

  socket.onopen = () => {
    console.log('WebSocket connected');
    onOpenCallback();
  };

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    onMessageCallback(data);
  };

  socket.onclose = () => {
    console.log('WebSocket disconnected');
    onCloseCallback();
    setTimeout(initWebSocket, 3000); // Auto-reconnect
  };
}

export function sendMessage(message) {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

export function onMessage(callback) {
  onMessageCallback = callback;
}

export function onOpen(callback) {
  onOpenCallback = callback;
}

export function onClose(callback) {
  onCloseCallback = callback;
}

class WebSocketService {
    constructor(url) {
      this.url = url;
      this.socket = null;
      this.isConnected = false;
      this.messageCallbacks = [];
      this.connectionCallbacks = [];
      this.reconnectTimer = null;
      this.reconnectInterval = 5000; // 5 seconds
    }
  
    connect() {
      if (this.socket && (this.socket.readyState === WebSocket.CONNECTING || this.socket.readyState === WebSocket.OPEN)) {
        return;
      }
  
      this.socket = new WebSocket(this.url);
  
      this.socket.onopen = () => {
        console.log('WebSocket connected');
        this.isConnected = true;
        this.notifyConnectionCallbacks(true);
        
        // Clear any reconnect timer
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
      };
  
      this.socket.onclose = () => {
        console.log('WebSocket disconnected');
        this.isConnected = false;
        this.notifyConnectionCallbacks(false);
        
        // Try to reconnect
        this.reconnectTimer = setTimeout(() => {
          this.connect();
        }, this.reconnectInterval);
      };
  
      this.socket.onerror = (error) => {
        console.error('WebSocket error:', error);
      };
  
      this.socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.notifyMessageCallbacks(data);
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };
    }
  
    disconnect() {
      if (this.socket) {
        this.socket.close();
        this.socket = null;
      }
      
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
    }
  
    send(data) {
      if (this.socket && this.socket.readyState === WebSocket.OPEN) {
        const message = typeof data === 'string' ? data : JSON.stringify(data);
        this.socket.send(message);
        return true;
      }
      return false;
    }
  
    onMessage(callback) {
      if (typeof callback === 'function') {
        this.messageCallbacks.push(callback);
      }
    }
  
    onConnectionChange(callback) {
      if (typeof callback === 'function') {
        this.connectionCallbacks.push(callback);
        
        // Immediately notify with current state
        if (this.socket) {
          callback(this.isConnected);
        }
      }
    }
  
    notifyMessageCallbacks(data) {
      this.messageCallbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error('Error in WebSocket message callback:', error);
        }
      });
    }
  
    notifyConnectionCallbacks(isConnected) {
      this.connectionCallbacks.forEach(callback => {
        try {
          callback(isConnected);
        } catch (error) {
          console.error('Error in WebSocket connection callback:', error);
        }
      });
    }
  }
  
  export default WebSocketService;