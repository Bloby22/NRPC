// 📦 Dependencies
const WebSocket = require('ws');
const logger = require('../Utils/logger');
const netflix = require('./netflix');

// ⚙️ Configuration
const config = {
  port: 3001,
  ping: 30000,
  timeout: 60000,
  maxConnections: 10,
  maxMessageSize: 1024 * 10
};

// 📦 State
let state = {
  server: null,
  clients: new Map(),
  running: false,
  connections: 0,
  messages: 0,
  errors: 0
};

// 🗺️ Message type to handler map
const handlers = {
  update: handle_update,
  ping: handle_ping,
  status: handle_status,
  pause: handle_pause,
  resume: handle_resume,
  stop: handle_stop,
  clear: handle_clear
};

// 🔨 Create WebSocket server
function create(port) {
  if (state.server) {
    stop();
  }

  const server = new WebSocket.Server({
    port: port || config.port,
    maxPayload: config.maxMessageSize
  });

  state.server = server;

  attach_events(server);

  return server;
}

// 🎧 Attach server event listeners
function attach_events(server) {
  server.on('connection', handle_connection);
  server.on('error', handle_error);
  server.on('listening', handle_listening);
  server.on('close', handle_close);
}

// 🔌 Handle new client connection
function handle_connection(socket, request) {
  const id = generate_id();
  const ip = request.socket.remoteAddress;

  // 🚫 Reject if max connections reached
  if (state.clients.size >= config.maxConnections) {
    socket.close(1008, 'Max connections reached');
    logger.warn('Connection rejected - max limit', { ip: ip });
    return;
  }

  const client = {
    id: id,
    socket: socket,
    ip: ip,
    connected: Date.now(),
    lastMessage: Date.now(),
    lastPing: Date.now(),
    messages: 0,
    errors: 0,
    alive: true
  };

  state.clients.set(id, client);
  state.connections++;

  logger.info('Client connected', { id: id, ip: ip });

  attach_socket_events(socket, client);

  // ✅ Send welcome message
  send_message(socket, {
    type: 'connected',
    id: id,
    timestamp: Date.now()
  });

  start_ping(client);
}

// 🎧 Attach socket event listeners
function attach_socket_events(socket, client) {
  socket.on('message', (data) => handle_message(data, client));
  socket.on('pong', () => handle_pong(client));
  socket.on('error', (error) => handle_socket_error(error, client));
  socket.on('close', (code, reason) => handle_disconnect(code, reason, client));
}

// 📩 Handle incoming message from client
function handle_message(data, client) {
  try {
    const message = JSON.parse(data.toString());

    client.lastMessage = Date.now();
    client.messages++;
    state.messages++;

    if (!message.type) {
      send_error(client.socket, 'Missing message type');
      return;
    }

    const handler = handlers[message.type];

    if (!handler) {
      send_error(client.socket, 'Unknown message type');
      return;
    }

    handler(message, client);

  } catch (error) {
    logger.error('Failed to parse message', error);
    client.errors++;
    state.errors++;
    send_error(client.socket, 'Invalid JSON');
  }
}

// 🔄 Handle update message
async function handle_update(message, client) {
  if (!message.data) {
    send_error(client.socket, 'Missing data');
    return;
  }

  try {
    const result = await netflix.process(message.data);

    send_message(client.socket, {
      type: 'update_response',
      success: result.success,
      data: result.data,
      session: result.session,
      cached: result.cached
    });

    // 📡 Broadcast update to other clients
    broadcast_update(message.data, client.id);

  } catch (error) {
    logger.error('Update failed', error);
    send_error(client.socket, error.message);
  }
}

// 🏓 Handle ping message
async function handle_ping(message, client) {
  client.lastPing = Date.now();

  send_message(client.socket, {
    type: 'pong',
    timestamp: Date.now()
  });
}

// 📊 Handle status request
async function handle_status(message, client) {
  const status = netflix.status();

  send_message(client.socket, {
    type: 'status_response',
    status: status,
    server: {
      running: state.running,
      clients: state.clients.size,
      connections: state.connections,
      messages: state.messages,
      errors: state.errors
    }
  });
}

// ⏸️ Handle pause message
async function handle_pause(message, client) {
  try {
    const result = await netflix.pause();

    send_message(client.socket, {
      type: 'pause_response',
      success: result.success
    });

  } catch (error) {
    logger.error('Pause failed', error);
    send_error(client.socket, error.message);
  }
}

// ▶️ Handle resume message
async function handle_resume(message, client) {
  try {
    const result = await netflix.resume();

    send_message(client.socket, {
      type: 'resume_response',
      success: result.success
    });

  } catch (error) {
    logger.error('Resume failed', error);
    send_error(client.socket, error.message);
  }
}

// ⏹️ Handle stop message
async function handle_stop(message, client) {
  try {
    const result = await netflix.stop();

    send_message(client.socket, {
      type: 'stop_response',
      success: result.success
    });

  } catch (error) {
    logger.error('Stop failed', error);
    send_error(client.socket, error.message);
  }
}

// 🧹 Handle clear message (Netflix tab closed)
async function handle_clear(message, client) {
  try {
    const result = await netflix.stop();

    send_message(client.socket, {
      type: 'clear_response',
      success: result.success
    });

    logger.info('RPC cleared by client', { id: client.id });

  } catch (error) {
    logger.error('Clear failed', error);
    send_error(client.socket, error.message);
  }
}

// 🏓 Handle pong response from client
function handle_pong(client) {
  client.alive = true;
  client.lastPing = Date.now();
}

// ⚠️ Handle socket error
function handle_socket_error(error, client) {
  logger.error('Socket error', { id: client.id, error: error.message });
  client.errors++;
  state.errors++;
}

// ❌ Handle client disconnect
function handle_disconnect(code, reason, client) {
  state.clients.delete(client.id);

  // 🛑 Stop ping interval
  if (client.pingInterval) {
    clearInterval(client.pingInterval);
  }

  logger.info('Client disconnected', {
    id: client.id,
    code: code,
    reason: reason.toString(),
    duration: Date.now() - client.connected
  });
}

// ❌ Handle server error
function handle_error(error) {
  logger.error('Server error', error);
  state.errors++;
}

// ✅ Handle server listening
function handle_listening() {
  logger.info('WebSocket server listening', { port: config.port });
  state.running = true;
}

// 🔴 Handle server close
function handle_close() {
  logger.info('WebSocket server closed');
  state.running = false;
}

// 📤 Send JSON message to socket
function send_message(socket, message) {
  if (socket.readyState !== WebSocket.OPEN) {
    return false;
  }

  try {
    socket.send(JSON.stringify(message));
    return true;
  } catch (error) {
    logger.error('Failed to send message', error);
    return false;
  }
}

// ❌ Send error message to socket
function send_error(socket, message) {
  send_message(socket, {
    type: 'error',
    message: message,
    timestamp: Date.now()
  });
}

// 📡 Broadcast message to all clients
function broadcast(message, exclude) {
  let sent = 0;

  for (const [id, client] of state.clients) {
    // 🚫 Skip excluded client
    if (exclude && id === exclude) {
      continue;
    }

    if (send_message(client.socket, message)) {
      sent++;
    }
  }

  return sent;
}

// 📡 Broadcast update to all other clients
function broadcast_update(data, exclude) {
  return broadcast({
    type: 'broadcast_update',
    data: data,
    timestamp: Date.now()
  }, exclude);
}

// 🏓 Start ping interval for client
function start_ping(client) {
  const interval = setInterval(() => {
    // ❌ Terminate if no pong received
    if (!client.alive) {
      clearInterval(interval);
      client.socket.terminate();
      return;
    }

    client.alive = false;
    client.socket.ping();

  }, config.ping);

  client.pingInterval = interval;
}

// 🧹 Close inactive client connections
function cleanup_inactive() {
  const now = Date.now();

  for (const [id, client] of state.clients) {
    const inactive = now - client.lastMessage;

    // ⏰ Timeout inactive client
    if (inactive > config.timeout) {
      logger.warn('Client timeout', { id: id });
      client.socket.close(1000, 'Timeout');
    }
  }
}

// 🔑 Generate unique client ID
function generate_id() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// 🚀 Start WebSocket server
function start(port) {
  if (state.running) {
    logger.warn('Server already running');
    return false;
  }

  create(port);

  // 🕐 Periodic cleanup of inactive clients
  setInterval(cleanup_inactive, 30000);

  return true;
}

// 🔴 Stop WebSocket server
function stop() {
  if (!state.server) {
    return false;
  }

  // 🔌 Close all client connections
  for (const [id, client] of state.clients) {
    if (client.pingInterval) {
      clearInterval(client.pingInterval);
    }

    client.socket.close(1000, 'Server shutdown');
  }

  state.clients.clear();

  state.server.close(() => {
    logger.info('Server stopped');
  });

  state.server = null;
  state.running = false;

  return true;
}

// 📋 Get list of connected clients
function get_clients() {
  const clients = [];

  for (const [id, client] of state.clients) {
    clients.push({
      id: id,
      ip: client.ip,
      connected: client.connected,
      lastMessage: client.lastMessage,
      messages: client.messages,
      errors: client.errors
    });
  }

  return clients;
}

// 📊 Get server stats
function get_stats() {
  return {
    running: state.running,
    clients: state.clients.size,
    connections: state.connections,
    messages: state.messages,
    errors: state.errors
  };
}

// ✅ Check if server is running
function is_running() {
  return state.running;
}

// 📤 Exports
module.exports = {
  start: start,
  stop: stop,
  broadcast: broadcast,
  clients: get_clients,
  stats: get_stats,
  running: is_running
};
