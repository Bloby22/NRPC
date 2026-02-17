// 📦 Dependencies
const rpc = require('../RPC/client');
const logger = require('../Utils/logger');

// ⚙️ Configuration
const config = {
  threshold: 5,
  timeout: 60000,
  minDuration: 10,
  maxTitle: 128
};

// 📦 State
let state = {
  current: null,
  previous: null,
  lastUpdate: 0,
  session: null,
  paused: false,
  timeout: null
};

// 💾 Cache
const cache = {
  data: null,
  timestamp: 0,
  hits: 0,
  misses: 0
};

// ✅ Validate incoming data object
function validate(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  if (!data.title || typeof data.title !== 'string') {
    return false;
  }

  if (typeof data.current !== 'number' || data.current < 0) {
    return false;
  }

  if (typeof data.duration !== 'number' || data.duration < config.minDuration) {
    return false;
  }

  if (typeof data.playing !== 'boolean') {
    return false;
  }

  return true;
}

// 🧹 Sanitize and clamp raw data values
function sanitize(data) {
  return {
    title: String(data.title).slice(0, config.maxTitle),
    current: Math.max(0, Math.floor(data.current)),
    duration: Math.max(0, Math.floor(data.duration)),
    playing: Boolean(data.playing),
    timestamp: data.timestamp || Date.now()
  };
}

// 🔢 Normalize data with derived fields
function normalize(data) {
  const clean = sanitize(data);

  const percent = (clean.current / clean.duration) * 100;
  const remaining = clean.duration - clean.current;

  return {
    ...clean,
    percent: Math.floor(percent),
    remaining: remaining,
    elapsed: clean.current
  };
}

// 🔄 Compare previous and next state for changes
function compare(prev, next) {
  if (!prev || !next) {
    return true;
  }

  // 📝 Title changed
  if (prev.title !== next.title) {
    return true;
  }

  // ▶️ Play state changed
  if (prev.playing !== next.playing) {
    return true;
  }

  // ⏩ Time difference exceeds threshold
  const diff = Math.abs(prev.current - next.current);

  if (diff > config.threshold) {
    return true;
  }

  return false;
}

// ✅ Determine if RPC update is needed
function should_update(data) {
  if (!state.current) {
    return true;
  }

  const changed = compare(state.current, data);

  if (!changed) {
    return false;
  }

  // ⏳ Throttle updates to max once per second
  const now = Date.now();
  const elapsed = now - state.lastUpdate;

  if (elapsed < 1000) {
    return false;
  }

  return true;
}

// 🆕 Create new session for current title
function create_session(data) {
  const session = {
    id: generate_id(),
    title: data.title,
    started: Date.now(),
    updated: Date.now(),
    duration: data.duration,
    watched: 0,
    pauses: 0,
    seeks: 0
  };

  state.session = session;

  logger.info('Session created', { id: session.id });

  return session;
}

// 🔄 Update existing session or create new one
function update_session(data) {
  if (!state.session) {
    return create_session(data);
  }

  // 🆕 Title changed, end old session and start new one
  if (state.session.title !== data.title) {
    end_session();
    return create_session(data);
  }

  const session = state.session;

  session.updated = Date.now();

  if (state.current) {
    const diff = data.current - state.current.current;

    // ⏩ Seek detected
    if (Math.abs(diff) > config.threshold) {
      session.seeks++;
    }

    // ⏸️ Pause detected
    if (data.playing && !state.current.playing) {
      session.pauses++;
    }

    // ⏱️ Accumulate watched time
    if (data.playing) {
      const elapsed = (Date.now() - state.lastUpdate) / 1000;
      session.watched += Math.min(elapsed, config.threshold);
    }
  }

  return session;
}

// 🏁 End current session and log stats
function end_session() {
  if (!state.session) {
    return null;
  }

  const session = state.session;
  const duration = Date.now() - session.started;

  logger.info('Session ended', {
    id: session.id,
    duration: Math.floor(duration / 1000),
    watched: Math.floor(session.watched),
    pauses: session.pauses,
    seeks: session.seeks
  });

  state.session = null;

  return session;
}

// 🔑 Generate unique session ID
function generate_id() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ⏱️ Reset inactivity timeout
function reset_timeout() {
  if (state.timeout) {
    clearTimeout(state.timeout);
  }

  state.timeout = setTimeout(() => {
    handle_timeout();
  }, config.timeout);
}

// ⏰ Handle session timeout due to inactivity
function handle_timeout() {
  logger.warn('Session timeout');

  end_session();

  // 🧹 Clear Discord RPC
  rpc.clear().catch(error => {
    logger.error('Failed to clear RPC', error);
  });

  state.current = null;
  state.previous = null;
  state.paused = false;
}

// 📡 Process incoming data and update RPC
async function process(data) {
  if (!validate(data)) {
    logger.warn('Invalid data received', data);
    return {
      success: false,
      error: 'invalid'
    };
  }

  const normalized = normalize(data);

  // 💾 Return cached result if nothing changed
  if (!should_update(normalized)) {
    cache.hits++;

    return {
      success: true,
      cached: true
    };
  }

  cache.misses++;

  update_session(normalized);
  reset_timeout();

  state.previous = state.current;
  state.current = normalized;
  state.lastUpdate = Date.now();
  state.paused = !normalized.playing;

  try {
    await rpc.update(normalized);

    logger.info('RPC updated', {
      title: normalized.title,
      current: normalized.current,
      duration: normalized.duration,
      playing: normalized.playing
    });

    // 💾 Update cache
    cache.data = normalized;
    cache.timestamp = Date.now();

    return {
      success: true,
      data: normalized,
      session: state.session
    };
  } catch (error) {
    logger.error('Failed to update RPC', error);

    return {
      success: false,
      error: error.message
    };
  }
}

// ⏸️ Pause current activity
async function pause() {
  if (!state.current) {
    return {
      success: false,
      error: 'no_active'
    };
  }

  try {
    await rpc.pause();

    state.paused = true;

    logger.info('Paused');

    return {
      success: true
    };
  } catch (error) {
    logger.error('Failed to pause', error);

    return {
      success: false,
      error: error.message
    };
  }
}

// ▶️ Resume current activity
async function resume() {
  if (!state.current) {
    return {
      success: false,
      error: 'no_active'
    };
  }

  try {
    await rpc.resume();

    state.paused = false;

    logger.info('Resumed');

    return {
      success: true
    };
  } catch (error) {
    logger.error('Failed to resume', error);

    return {
      success: false,
      error: error.message
    };
  }
}

// ⏹️ Stop activity and clear RPC
async function stop() {
  try {
    await rpc.clear();

    end_session();

    // 🛑 Cancel timeout
    if (state.timeout) {
      clearTimeout(state.timeout);
      state.timeout = null;
    }

    state.current = null;
    state.previous = null;
    state.paused = false;

    logger.info('Stopped');

    return {
      success: true
    };
  } catch (error) {
    logger.error('Failed to stop', error);

    return {
      success: false,
      error: error.message
    };
  }
}

// 📊 Get current service status
function status() {
  return {
    active: state.current !== null,
    paused: state.paused,
    current: state.current,
    session: state.session,
    lastUpdate: state.lastUpdate,
    cache: {
      hits: cache.hits,
      misses: cache.misses,
      ratio: cache.hits / (cache.hits + cache.misses) || 0
    }
  };
}

// 📋 Get current normalized data
function get_current() {
  return state.current;
}

// 📋 Get current session
function get_session() {
  return state.session;
}

// ✅ Check if activity is active
function is_active() {
  return state.current !== null;
}

// ✅ Check if activity is paused
function is_paused() {
  return state.paused;
}

// ⏱️ Get session uptime in milliseconds
function get_uptime() {
  if (!state.session) {
    return 0;
  }

  return Date.now() - state.session.started;
}

// 🔁 Reset all state and cache
function reset() {
  if (state.timeout) {
    clearTimeout(state.timeout);
  }

  end_session();

  state.current = null;
  state.previous = null;
  state.lastUpdate = 0;
  state.session = null;
  state.paused = false;
  state.timeout = null;

  // 🗑️ Clear cache
  cache.data = null;
  cache.timestamp = 0;
  cache.hits = 0;
  cache.misses = 0;

  logger.info('Service reset');
}

// 📤 Exports
module.exports = {
  process: process,
  pause: pause,
  resume: resume,
  stop: stop,
  reset: reset,
  status: status,
  current: get_current,
  session: get_session,
  active: is_active,
  paused: is_paused,
  uptime: get_uptime
};
