// 📦 Dependencies
const rpc = require('./RPC/client');
const server = require('./Services/server');
const websocket = require('./Services/websocket');
const logger = require('./Utils/logger');

// ⚙️ Configuration
const config = {
  port: 3000,
  wsPort: 3001,
  client: '1472931378441228308',
  retry: 5000,
  logLevel: 'info'
};

// 📦 State
let state = {
  running: false,
  rpcConnected: false,
  serverRunning: false,
  wsRunning: false,
  startTime: 0,
  restarts: 0
};

// 🚀 Initialize logger and process handlers
async function init() {
  logger.configure({
    level: config.logLevel
  });

  logger.info('Initializing Netflix RPC Bot', {
    version: '1.0.0',
    node: process.version
  });

  // 🔴 Graceful shutdown signals
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // ❌ Error handlers
  process.on('uncaughtException', handle_exception);
  process.on('unhandledRejection', handle_rejection);
}

// 🔌 Connect to Discord RPC
async function connect_rpc() {
  try {
    logger.info('Connecting to Discord RPC...');

    const connected = await rpc.connect(config.client);

    if (connected) {
      state.rpcConnected = true;
      logger.info('Discord RPC connected');
      return true;
    }

    logger.error('Failed to connect to Discord RPC');
    return false;

  } catch (error) {
    logger.error('RPC connection error', error.message);
    return false;
  }
}

// 🌐 Start HTTP server
async function start_server() {
  try {
    logger.info('Starting HTTP server...');

    const started = server.start(config.port);

    if (started) {
      state.serverRunning = true;
      logger.info(`HTTP server running on port ${config.port}`);
      return true;
    }

    logger.error('Failed to start HTTP server');
    return false;

  } catch (error) {
    logger.error('Server start error', error.message);
    return false;
  }
}

// 🔌 Start WebSocket server
async function start_websocket() {
  try {
    logger.info('Starting WebSocket server...');

    const started = websocket.start(config.wsPort);

    if (started) {
      state.wsRunning = true;
      logger.info(`WebSocket server running on port ${config.wsPort}`);
      return true;
    }

    logger.error('Failed to start WebSocket server');
    return false;

  } catch (error) {
    logger.error('WebSocket start error', error.message);
    return false;
  }
}

// 🚀 Start all services
async function start() {
  if (state.running) {
    logger.warn('Already running');
    return false;
  }

  logger.info('Starting application...');

  state.startTime = Date.now();

  // 🔌 Connect to Discord RPC
  const rpcOk = await connect_rpc();

  if (!rpcOk) {
    logger.warn('RPC not connected, will retry in background');
    schedule_rpc_retry();
  }

  // 🌐 Start HTTP and WebSocket servers
  const serverOk = await start_server();
  const wsOk = await start_websocket();

  if (!serverOk || !wsOk) {
    logger.error('Failed to start required services');
    await shutdown();
    return false;
  }

  state.running = true;

  logger.info('Application started successfully', {
    rpc: state.rpcConnected,
    server: state.serverRunning,
    websocket: state.wsRunning
  });

  print_status();

  return true;
}

// 🔄 Schedule RPC reconnect retry
function schedule_rpc_retry() {
  setTimeout(async () => {
    if (!state.rpcConnected && state.running) {
      logger.info('Retrying RPC connection...');

      const connected = await connect_rpc();

      // 🔁 Keep retrying until connected
      if (!connected) {
        schedule_rpc_retry();
      }
    }
  }, config.retry);
}

// 🔴 Shutdown all services gracefully
async function shutdown() {
  if (!state.running) {
    return;
  }

  logger.info('Shutting down...');

  state.running = false;

  try {
    // 🔌 Stop WebSocket server
    if (state.wsRunning) {
      websocket.stop();
      state.wsRunning = false;
      logger.info('WebSocket server stopped');
    }

    // 🌐 Stop HTTP server
    if (state.serverRunning) {
      server.stop();
      state.serverRunning = false;
      logger.info('HTTP server stopped');
    }

    // 🔌 Disconnect Discord RPC
    if (state.rpcConnected) {
      await rpc.disconnect();
      state.rpcConnected = false;
      logger.info('Discord RPC disconnected');
    }

    const uptime = Date.now() - state.startTime;

    logger.info('Shutdown complete', {
      uptime: Math.floor(uptime / 1000),
      restarts: state.restarts
    });

    logger.flush();

    // ⏳ Exit after flush
    setTimeout(() => {
      process.exit(0);
    }, 1000);

  } catch (error) {
    logger.error('Shutdown error', error.message);
    process.exit(1);
  }
}

// 🔁 Restart all services
async function restart() {
  logger.info('Restarting application...');

  state.restarts++;

  await shutdown();

  // ⏳ Wait before restarting
  setTimeout(() => {
    start();
  }, 2000);
}

// ❌ Handle uncaught exception
function handle_exception(error) {
  logger.fatal('Uncaught exception', {
    message: error.message,
    stack: error.stack
  });

  shutdown();
}

// ❌ Handle unhandled promise rejection
function handle_rejection(reason, promise) {
  logger.fatal('Unhandled rejection', {
    reason: reason,
    promise: promise
  });

  shutdown();
}

// 📊 Print status to console
function print_status() {
  const uptime = state.startTime ? Date.now() - state.startTime : 0;

  console.log('\n=================================');
  console.log('Netflix Discord RPC Bot');
  console.log('=================================');
  console.log(`Status: ${state.running ? 'Running' : 'Stopped'}`);
  console.log(`Uptime: ${Math.floor(uptime / 1000)}s`);
  console.log(`Discord RPC: ${state.rpcConnected ? 'Connected' : 'Disconnected'}`);
  console.log(`HTTP Server: ${state.serverRunning ? `Running on :${config.port}` : 'Stopped'}`);
  console.log(`WebSocket: ${state.wsRunning ? `Running on :${config.wsPort}` : 'Stopped'}`);
  console.log(`Restarts: ${state.restarts}`);
  console.log('=================================\n');
}

// 📋 Get full status object
function get_status() {
  const uptime = state.startTime ? Date.now() - state.startTime : 0;

  return {
    running: state.running,
    uptime: uptime,
    rpc: {
      connected: state.rpcConnected,
      state: rpc.state()
    },
    server: {
      running: state.serverRunning,
      port: config.port
    },
    websocket: {
      running: state.wsRunning,
      port: config.wsPort,
      stats: websocket.stats()
    },
    restarts: state.restarts,
    logs: logger.stats()
  };
}

// 🚀 Bootstrap
init();
start();

// 📤 Exports
module.exports = {
  start: start,
  stop: shutdown,
  restart: restart,
  status: get_status,
  state: state
};
