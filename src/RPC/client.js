// 📦 Dependencies
const RPC = require('discord-rpc');

// ⚙️ Configuration
const config = {
  retry: 5000,
  timeout: 10000,
  reconnect: 3
};

// 📦 State
let state = {
  client: null,
  connected: false,
  ready: false,
  activity: null,
  timestamp: null,
  attempts: 0,
  id: null,
  _ticker: null
};

// 🔨 Create new Discord RPC client
function create(id) {
  if (state.client) {
    destroy();
  }

  const client = new RPC.Client({
    transport: 'ipc'
  });

  state.client = client;
  state.id = id;

  attach_events(client);

  return client;
}

// 🎧 Attach event listeners to client
function attach_events(client) {
  client.on('ready', handle_ready);
  client.on('disconnected', handle_disconnect);
  client.on('error', handle_error);
}

// ✅ Client ready
function handle_ready() {
  console.log('✅ Discord RPC Ready');
  state.connected = true;
  state.ready = true;
  state.attempts = 0;

  // 🔄 Restore previous activity if exists
  if (state.activity) {
    set_activity(state.activity).catch(() => {});
  }
}

// ❌ Client disconnected
function handle_disconnect() {
  console.log('❌ Discord RPC Disconnected');
  state.connected = false;
  state.ready = false;

  // 🔄 Schedule reconnect if attempts remain
  if (state.attempts < config.reconnect) {
    setTimeout(() => {
      reconnect();
    }, config.retry);
  }
}

// ⚠️ Client error
function handle_error(error) {
  console.error('⚠️ Discord RPC Error:', error);
  state.connected = false;
  state.ready = false;
}

// 🔌 Connect to Discord
async function connect(id) {
  if (state.connected) {
    return true;
  }

  try {
    console.log(`🔌 Connecting to Discord (Client ID: ${id})...`);
    const client = create(id);

    await client.login({
      clientId: id
    });

    return true;
  } catch (error) {
    console.error('❌ Failed to connect:', error);
    state.attempts++;

    // 🔄 Schedule reconnect if attempts remain
    if (state.attempts < config.reconnect) {
      setTimeout(() => {
        reconnect();
      }, config.retry);
    }

    return false;
  }
}

// 🔄 Reconnect to Discord
async function reconnect() {
  if (state.connected) {
    return true;
  }

  return connect(state.id);
}

// 🔌 Disconnect from Discord
function disconnect() {
  if (!state.client) {
    return;
  }

  try {
    state.client.destroy();
  } catch (error) {
  }

  state.connected = false;
  state.ready = false;
}

// 🗑️ Destroy client and reset state
function destroy() {
  disconnect();

  // 🛑 Stop ticker
  if (state._ticker) {
    clearInterval(state._ticker);
    state._ticker = null;
  }

  state.client = null;
  state.activity = null;
  state.timestamp = null;
  state.attempts = 0;
  state.id = null;
}

// 🔤 Parse title into series, season, episode, name
function parse_title(title) {
  // 📀 Format "Series: D01 Episode Name"
  const episodeMatch = title.match(/(.+?):\s*D(\d+)\s+(.+)/i);

  if (episodeMatch) {
    return {
      series: episodeMatch[1].trim(),
      episode: episodeMatch[2],
      name: episodeMatch[3].trim(),
      format: 'disk'
    };
  }

  // 📺 Format "Series: S01E01 - Episode Name"
  const seasonMatch = title.match(/(.+?):\s*S(\d+)\s*E(\d+)\s*-?\s*(.+)/i);

  if (seasonMatch) {
    return {
      series: seasonMatch[1].trim(),
      season: seasonMatch[2],
      episode: seasonMatch[3],
      name: seasonMatch[4].trim(),
      format: 'season'
    };
  }

  // 📺 Format "Series: S01E01" without episode name
  const seasonOnlyMatch = title.match(/(.+?):\s*S(\d+)\s*E(\d+)/i);

  if (seasonOnlyMatch) {
    return {
      series: seasonOnlyMatch[1].trim(),
      season: seasonOnlyMatch[2],
      episode: seasonOnlyMatch[3],
      name: null,
      format: 'season'
    };
  }

  return null;
}

// 🎨 Format activity object for Discord RPC
function format_activity(data) {
  const parsed = parse_title(data.title);

  // 🎬 Plain movie or unparseable title
  if (!parsed) {
    return {
      details: data.title,
      largeImageKey: 'netflix_logo',
      largeImageText: 'Netflix',
      type: 3,
      instance: false
    };
  }

  let details;
  let stateText;

  // 📺 Season/episode format
  if (parsed.format === 'season') {
    details = parsed.series;

    if (parsed.name) {
      stateText = `S${parsed.season}E${parsed.episode} - ${parsed.name}`;
    } else {
      stateText = `S${parsed.season}E${parsed.episode}`;
    }
  }

  // 📀 Disk/episode format
  if (parsed.format === 'disk') {
    details = parsed.series;
    stateText = `Díl ${parsed.episode} - ${parsed.name}`;
  }

  return {
    details: details,
    state: stateText,
    largeImageKey: 'netflix_logo',
    largeImageText: 'Netflix',
    type: 3,
    instance: false
  };
}

// ⏱️ Format seconds into H:MM:SS or M:SS
function format_time(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(secs)}`;
  }

  return `${minutes}:${pad(secs)}`;
}

// 🔢 Pad number with leading zero
function pad(num) {
  return String(num).padStart(2, '0');
}

// 📡 Set Discord RPC activity
async function set_activity(data) {
  if (!validate_data(data)) {
    console.warn('⚠️ Invalid activity data');
    return false;
  }

  // 💾 Cache activity if client not ready yet
  if (!state.client || !state.ready) {
    state.activity = {
      title: data.title,
      current: data.current,
      duration: data.duration,
      playing: data.playing,
      _lastUpdate: Date.now()
    };
    state.timestamp = Date.now();
    return false;
  }

  try {
    const activity = format_activity(data);

    const nowSec = Math.floor(Date.now() / 1000);
    const currentSec = Number.isFinite(data.current) ? Math.floor(data.current) : 0;
    const durationSec = Number.isFinite(data.duration) ? Math.floor(data.duration) : 0;

    // ⏱️ Calculate timestamps
    const start = nowSec - currentSec;
    const end = start + durationSec;

    // ⏱️ Only set timestamps when playing
    if (durationSec > 0 && data.playing) {
      activity.startTimestamp = start;
      activity.endTimestamp = end;
    }

    console.log('📤 Setting activity:', {
      details: activity.details,
      state: activity.state,
      playing: data.playing,
      timestamps: data.playing ? `${start} - ${end}` : 'paused'
    });

    await state.client.setActivity(activity);

    // 💾 Save current state
    state.activity = {
      title: data.title,
      current: currentSec,
      duration: durationSec,
      playing: !!data.playing,
      _lastUpdate: Date.now()
    };

    state.timestamp = Date.now();

    // 🛑 Clear old ticker
    if (state._ticker) {
      clearInterval(state._ticker);
      state._ticker = null;
    }

    // 🕐 Start ticker only when playing
    if (durationSec > 0 && data.playing) {
      state._ticker = setInterval(async () => {
        if (!state.client || !state.ready || !state.activity) return;

        const now = Date.now();
        const elapsedSinceLast = (now - (state.activity._lastUpdate || now)) / 1000;

        let current = state.activity.current;

        // ⏩ Advance current time
        if (state.activity.playing) {
          current = Math.min(state.activity.duration, current + elapsedSinceLast);
          state.activity.current = current;
          state.activity._lastUpdate = now;
        }

        const nowSecTick = Math.floor(Date.now() / 1000);
        const startTick = nowSecTick - Math.floor(current);
        const endTick = startTick + Math.floor(state.activity.duration);

        const tick = format_activity(state.activity);

        tick.startTimestamp = startTick;
        tick.endTimestamp = endTick;

        try {
          await state.client.setActivity(tick);
          console.log('🔄 Activity updated (ticker)');
        } catch (e) {
          console.error('⚠️ Ticker update failed:', e);
        }

      }, 15000);
    }

    return true;
  } catch (error) {
    console.error('❌ Failed to set activity:', error);
    return false;
  }
}

// 🧹 Clear Discord RPC activity
async function clear_activity() {
  if (!state.client || !state.ready) {
    return false;
  }

  try {
    await state.client.clearActivity();

    // 🛑 Stop ticker
    if (state._ticker) {
      clearInterval(state._ticker);
      state._ticker = null;
    }

    state.activity = null;
    state.timestamp = null;

    console.log('🧹 Activity cleared');
    return true;
  } catch (error) {
    console.error('❌ Failed to clear activity:', error);
    return false;
  }
}

// 📊 Get current state snapshot
function get_state() {
  return {
    connected: state.connected,
    ready: state.ready,
    activity: state.activity,
    timestamp: state.timestamp,
    attempts: state.attempts
  };
}

// ✅ Check if connected and ready
function is_connected() {
  return state.connected && state.ready;
}

// ✅ Check if activity is set
function is_active() {
  return state.activity !== null;
}

// 📋 Get current activity
function get_activity() {
  return state.activity;
}

// ⏱️ Get uptime in milliseconds
function get_uptime() {
  if (!state.timestamp) {
    return 0;
  }

  return Date.now() - state.timestamp;
}

// ✅ Validate incoming data object
function validate_data(data) {
  if (!data || typeof data !== 'object') {
    return false;
  }

  if (!data.title || typeof data.title !== 'string') {
    return false;
  }

  if (typeof data.current !== 'number' || data.current < 0) {
    return false;
  }

  if (typeof data.duration !== 'number' || data.duration <= 0) {
    return false;
  }

  if (typeof data.playing !== 'boolean') {
    return false;
  }

  return true;
}

// 🔄 Update activity with new data
async function update(data) {
  if (!validate_data(data)) {
    return false;
  }

  if (!is_connected()) {
    console.warn('⚠️ Not connected to Discord');
    return false;
  }

  return set_activity(data);
}

// ⏸️ Mark activity as paused
async function pause() {
  if (!state.activity) {
    return false;
  }

  const paused = {
    title: state.activity.title,
    current: state.activity.current,
    duration: state.activity.duration,
    playing: false
  };

  return set_activity(paused);
}

// ▶️ Mark activity as playing
async function resume() {
  if (!state.activity) {
    return false;
  }

  const resumed = {
    title: state.activity.title,
    current: state.activity.current,
    duration: state.activity.duration,
    playing: true
  };

  return set_activity(resumed);
}

// 🔁 Clear and reset activity
async function reset() {
  await clear_activity();

  state.activity = null;
  state.timestamp = null;

  return true;
}

// 📤 Exports
module.exports = {
  connect: connect,
  disconnect: disconnect,
  reconnect: reconnect,
  destroy: destroy,
  update: update,
  pause: pause,
  resume: resume,
  reset: reset,
  clear: clear_activity,
  state: get_state,
  connected: is_connected,
  active: is_active,
  activity: get_activity,
  uptime: get_uptime
};
