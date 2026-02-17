// ⚙️ Configuration
const config = {
  endpoint: 'http://localhost:3000',
  retry: 3000,
  timeout: 10000,
  storage: 'netflix_rpc_data',
  version: '1.0.0'
};

// 📦 State
const state = {
  connected: false,
  active: null,
  history: [],
  sessions: new Map(),
  errors: 0,
  initialized: false
};

// 💾 Cache
const cache = {
  data: null,
  timestamp: 0,
  valid: 5000
};

// 📝 Log message to console and history
function log(level, message, data) {
  const entry = {
    level: level,
    message: message,
    data: data,
    time: Date.now()
  };

  console.log(`[${level.toUpperCase()}]`, message, data || '');

  state.history.push(entry);

  // 🗑️ Keep only last 100 entries
  if (state.history.length > 100) {
    state.history.shift();
  }
}

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

  if (typeof data.duration !== 'number' || data.duration < 0) {
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
    title: String(data.title).slice(0, 128),
    current: Math.max(0, Math.floor(data.current)),
    duration: Math.max(0, Math.floor(data.duration)),
    playing: Boolean(data.playing),
    timestamp: Date.now()
  };
}

// 💾 Get cached data if still valid
function cache_get() {
  const now = Date.now();

  if (cache.data && (now - cache.timestamp) < cache.valid) {
    return cache.data;
  }

  return null;
}

// 💾 Set cache data
function cache_set(data) {
  cache.data = data;
  cache.timestamp = Date.now();
}

// 🗑️ Clear cache
function cache_clear() {
  cache.data = null;
  cache.timestamp = 0;
}

// 💾 Save data to chrome.storage
async function storage_save(key, value) {
  try {
    await chrome.storage.local.set({ [key]: value });
    log('info', 'Storage saved', { key: key });
    return true;
  } catch (error) {
    log('error', 'Storage save failed', error.message);
    return false;
  }
}

// 💾 Load data from chrome.storage
async function storage_load(key) {
  try {
    const result = await chrome.storage.local.get(key);
    return result[key] || null;
  } catch (error) {
    log('error', 'Storage load failed', error.message);
    return null;
  }
}

// 🗑️ Clear chrome.storage
async function storage_clear() {
  try {
    await chrome.storage.local.clear();
    log('info', 'Storage cleared');
    return true;
  } catch (error) {
    log('error', 'Storage clear failed', error.message);
    return false;
  }
}

// 📤 Send update data to server
async function send_server(data) {
  const url = `${config.endpoint}/update`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(config.timeout)
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    const result = await response.json();

    state.connected = true;
    state.errors = 0;

    log('info', 'Data sent to server', result);

    return result;
  } catch (error) {
    state.connected = false;
    state.errors++;

    log('error', 'Server send failed', error.message);

    return null;
  }
}

// 🔴 Send stop/clear signal to server
async function send_stop() {
  const url = `${config.endpoint}/stop`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(config.timeout)
    });

    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }

    log('info', 'Stop sent to server');

    return true;
  } catch (error) {
    log('error', 'Server stop failed', error.message);
    return false;
  }
}

// 🏓 Ping server to check connection
async function ping_server() {
  const url = `${config.endpoint}/ping`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(3000)
    });

    if (response.ok) {
      state.connected = true;
      state.errors = 0;
      return true;
    }

    return false;
  } catch (error) {
    state.connected = false;
    return false;
  }
}

// 🆕 Create new session for tab
function session_create(id) {
  const session = {
    id: id,
    created: Date.now(),
    updated: Date.now(),
    data: null,
    count: 0
  };

  state.sessions.set(id, session);

  log('info', 'Session created', { id: id });

  return session;
}

// 📋 Get session by tab ID
function session_get(id) {
  return state.sessions.get(id) || null;
}

// 🔄 Update or create session for tab
function session_update(id, data) {
  let session = session_get(id);

  if (!session) {
    session = session_create(id);
  }

  session.updated = Date.now();
  session.data = data;
  session.count++;

  return session;
}

// 🗑️ Remove session by tab ID
function session_remove(id) {
  const removed = state.sessions.delete(id);

  if (removed) {
    log('info', 'Session removed', { id: id });
  }

  return removed;
}

// 🧹 Remove sessions inactive for over 60 seconds
function session_cleanup() {
  const now = Date.now();
  const timeout = 60000;

  for (const [id, session] of state.sessions) {
    if (now - session.updated > timeout) {
      session_remove(id);
    }
  }
}

// 🔄 Handle update message from content script
async function handle_update(message, sender) {
  const data = message.data;

  if (!validate(data)) {
    log('warn', 'Invalid data received', data);
    return { success: false, error: 'invalid' };
  }

  const clean = sanitize(data);
  const id = sender.tab?.id;

  if (id) {
    session_update(id, clean);
    state.active = id;
  }

  await storage_save(config.storage, clean);
  cache_set(clean);

  await send_server(clean);

  log('info', 'Update processed', clean);

  return { success: true };
}

// 📊 Handle status request
async function handle_status(message, sender) {
  return {
    connected: state.connected,
    active: state.active,
    sessions: state.sessions.size,
    errors: state.errors,
    version: config.version
  };
}

// 🔴 Handle clear message from content script
async function handle_clear(message, sender) {
  cache_clear();
  await storage_clear();

  // 🔴 Notify server to clear RPC
  await send_stop();

  state.sessions.clear();
  state.active = null;

  log('info', 'State cleared');

  return { success: true };
}

// ✅ Extension installed
chrome.runtime.onInstalled.addListener(async (details) => {
  log('info', 'Extension installed', {
    reason: details.reason,
    version: config.version
  });

  state.initialized = true;

  await ping_server();
});

// ✅ Extension started
chrome.runtime.onStartup.addListener(async () => {
  log('info', 'Extension started');

  state.initialized = true;

  await ping_server();

  // 💾 Restore last state from storage
  const saved = await storage_load(config.storage);

  if (saved) {
    cache_set(saved);
    log('info', 'Restored from storage', saved);
  }
});

// 📩 Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (!message || !message.type) {
    respond({ success: false, error: 'missing_type' });
    return true;
  }

  const handlers = {
    update: handle_update,
    status: handle_status,
    clear: handle_clear
  };

  const handler = handlers[message.type];

  if (!handler) {
    respond({ success: false, error: 'unknown_type' });
    return true;
  }

  handler(message, sender)
    .then(result => respond(result))
    .catch(error => {
      log('error', 'Handler error', error.message);
      respond({ success: false, error: error.message });
    });

  return true;
});

// 🔄 Inject content script when Netflix tab is ready
chrome.tabs.onUpdated.addListener((id, info, tab) => {
  if (info.status === 'complete' && tab.url?.includes('netflix.com')) {
    chrome.tabs.sendMessage(id, {
      type: 'init',
      config: {
        endpoint: config.endpoint
      }
    }).catch(() => {
      log('warn', 'Failed to init tab', { id: id });
    });
  }

  // 🔴 Tab navigated away from Netflix, clear RPC
  if (info.url && !info.url.includes('netflix.com')) {
    const session = session_get(id);

    if (session) {
      log('info', 'Tab left Netflix, clearing RPC', { id: id });
      session_remove(id);

      if (state.active === id) {
        state.active = null;
        cache_clear();
        storage_clear();
        send_stop();
      }
    }
  }
});

// 🔴 Tab closed, clear RPC if it was the active Netflix tab
chrome.tabs.onRemoved.addListener((id) => {
  const session = session_get(id);

  session_remove(id);

  // 🔴 Was active Netflix tab, notify server
  if (state.active === id && session) {
    log('info', 'Active Netflix tab closed, clearing RPC', { id: id });

    state.active = null;
    cache_clear();
    storage_clear();
    send_stop();
  }
});

// 🕐 Periodic session cleanup
setInterval(() => {
  session_cleanup();
}, 30000);

// 🔄 Periodic reconnect attempt if disconnected
setInterval(() => {
  if (!state.connected) {
    ping_server();
  }
}, config.retry);
