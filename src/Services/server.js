// 📦 Dependencies
const express = require('express');
const logger = require('../Utils/logger');
const netflix = require('./netflix');

// ⚙️ Configuration
const config = {
  port: 3000,
  timeout: 30000,
  bodyLimit: '10mb'
};

// 📦 State
let state = {
  app: null,
  server: null,
  running: false,
  requests: 0,
  errors: 0
};

// 🔨 Create Express app with middleware and routes
function create() {
  const app = express();

  // 🌐 CORS headers
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // 📝 Body parsers
  app.use(express.json({ limit: config.bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: config.bodyLimit }));

  // 📊 Request counter
  app.use((req, res, next) => {
    state.requests++;
    logger.debug(`${req.method} ${req.path}`);
    next();
  });

  attach_routes(app);
  attach_error_handlers(app);

  return app;
}

// 🛣️ Attach all routes to app
function attach_routes(app) {
  app.get('/', handle_root);
  app.get('/ping', handle_ping);
  app.get('/status', handle_status);
  app.post('/update', handle_update);
  app.post('/pause', handle_pause);
  app.post('/resume', handle_resume);
  app.post('/stop', handle_stop);
  app.post('/reset', handle_reset);
}

// ❌ Attach error handlers to app
function attach_error_handlers(app) {
  app.use(handle_not_found);
  app.use(handle_error);
}

// 🏠 GET / - API info
function handle_root(req, res) {
  res.json({
    name: 'Netflix Discord RPC Bot',
    version: '1.0.0',
    status: 'running',
    endpoints: [
      'GET /',
      'GET /ping',
      'GET /status',
      'POST /update',
      'POST /pause',
      'POST /resume',
      'POST /stop',
      'POST /reset'
    ]
  });
}

// 🏓 GET /ping - Health check
function handle_ping(req, res) {
  res.json({
    pong: true,
    timestamp: Date.now()
  });
}

// 📊 GET /status - Service status
async function handle_status(req, res) {
  try {
    const status = netflix.status();

    res.json({
      success: true,
      data: status,
      server: {
        running: state.running,
        requests: state.requests,
        errors: state.errors
      }
    });
  } catch (error) {
    logger.error('Status error', error);
    state.errors++;

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// 🔄 POST /update - Update RPC activity
async function handle_update(req, res) {
  try {
    const data = req.body;

    if (!data) {
      return res.status(400).json({
        success: false,
        error: 'Missing data'
      });
    }

    const result = await netflix.process(data);

    res.json({
      success: result.success,
      data: result.data,
      session: result.session,
      cached: result.cached
    });

  } catch (error) {
    logger.error('Update error', error);
    state.errors++;

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ⏸️ POST /pause - Pause activity
async function handle_pause(req, res) {
  try {
    const result = await netflix.pause();

    res.json({
      success: result.success,
      error: result.error
    });

  } catch (error) {
    logger.error('Pause error', error);
    state.errors++;

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ▶️ POST /resume - Resume activity
async function handle_resume(req, res) {
  try {
    const result = await netflix.resume();

    res.json({
      success: result.success,
      error: result.error
    });

  } catch (error) {
    logger.error('Resume error', error);
    state.errors++;

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// ⏹️ POST /stop - Stop activity
async function handle_stop(req, res) {
  try {
    const result = await netflix.stop();

    res.json({
      success: result.success,
      error: result.error
    });

  } catch (error) {
    logger.error('Stop error', error);
    state.errors++;

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// 🔁 POST /reset - Reset service and counters
async function handle_reset(req, res) {
  try {
    netflix.reset();

    // 🗑️ Reset request counters
    state.requests = 0;
    state.errors = 0;

    res.json({
      success: true
    });

  } catch (error) {
    logger.error('Reset error', error);
    state.errors++;

    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}

// 🔍 404 - Route not found
function handle_not_found(req, res) {
  res.status(404).json({
    success: false,
    error: 'Not found'
  });
}

// ❌ 500 - Internal server error
function handle_error(error, req, res, next) {
  logger.error('Request error', {
    method: req.method,
    path: req.path,
    error: error.message
  });

  state.errors++;

  res.status(500).json({
    success: false,
    error: error.message
  });
}

// 🚀 Start HTTP server
function start(port) {
  if (state.running) {
    logger.warn('Server already running');
    return false;
  }

  const app = create();

  const server = app.listen(port || config.port, () => {
    logger.info(`HTTP server listening on port ${port || config.port}`);
  });

  // ⏱️ Set request timeout
  server.timeout = config.timeout;

  state.app = app;
  state.server = server;
  state.running = true;

  return true;
}

// 🔴 Stop HTTP server
function stop() {
  if (!state.server) {
    return false;
  }

  state.server.close(() => {
    logger.info('HTTP server stopped');
  });

  state.app = null;
  state.server = null;
  state.running = false;

  return true;
}

// 📊 Get server stats
function get_stats() {
  return {
    running: state.running,
    requests: state.requests,
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
  stats: get_stats,
  running: is_running
};
