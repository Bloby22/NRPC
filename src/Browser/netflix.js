// 🎯 DOM selectors for Netflix player elements
const selectors = {
  video: 'video',
  title: [
    '.video-title',
    '.ellipsize-text',
    '[class*="title"]',
    'h4.ellipsize-text',
    '.title-card-container h3',
    '.PlayerControlsNeo__layout h4'
  ],
  subtitle: [
    '.video-subtitle',
    '[class*="subtitle"]',
    '.PlayerControlsNeo__subtitle'
  ],
  controls: '.PlayerControlsNeo__layout',
  player: '#appMountPoint',
  overlay: '.watch-video'
};

// ⚙️ Configuration
const config = {
  interval: 2000,
  threshold: 3,
  timeout: 30000,
  retry: 5
};

// 📦 State
let state = {
  video: null,
  title: null,
  subtitle: null,
  current: 0,
  duration: 0,
  playing: false,
  paused: false,
  ended: false,
  buffering: false,
  volume: 1,
  muted: false,
  observers: [],
  attempts: 0
};

// 🔍 Query single or multiple selectors
function query(selector) {
  if (Array.isArray(selector)) {
    for (const item of selector) {
      const element = document.querySelector(item);
      if (element) {
        return element;
      }
    }
    return null;
  }

  return document.querySelector(selector);
}

// 📝 Get trimmed text content from element
function text(element) {
  if (!element) {
    return null;
  }

  return element.textContent.trim() || null;
}

// 🎥 Find video element with sufficient readyState
function find_video() {
  const video = query(selectors.video);

  if (!video) {
    return null;
  }

  // ⏳ Wait until video has enough data
  if (video.readyState < 2) {
    return null;
  }

  return video;
}

// 🔤 Find title element and return text
function find_title() {
  const element = query(selectors.title);
  const value = text(element);

  if (!value) {
    return 'Netflix';
  }

  return value;
}

// 💬 Find subtitle element and return text
function find_subtitle() {
  const element = query(selectors.subtitle);
  return text(element);
}

// ⏱️ Format seconds into H:MM:SS or M:SS
function parse_time(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

// 🔤 Combine title and subtitle into full title
function format_title(title, subtitle) {
  if (!subtitle) {
    return title;
  }

  return `${title} - ${subtitle}`;
}

// 📊 Extract full metadata from current video state
function extract_metadata() {
  const video = find_video();

  if (!video) {
    return null;
  }

  const title = find_title();
  const subtitle = find_subtitle();

  return {
    video: video,
    title: format_title(title, subtitle),
    raw: title,
    subtitle: subtitle,
    current: video.currentTime,
    duration: video.duration,
    playing: !video.paused && !video.ended,
    paused: video.paused,
    ended: video.ended,
    buffering: video.readyState < 3,
    volume: video.volume,
    muted: video.muted,
    progress: (video.currentTime / video.duration) * 100,
    remaining: video.duration - video.currentTime,
    formatted: {
      current: parse_time(video.currentTime),
      duration: parse_time(video.duration),
      remaining: parse_time(video.duration - video.currentTime)
    }
  };
}

// 🔄 Compare previous and next state for changes
function compare_state(prev, next) {
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

  // ⏸️ Pause state changed
  if (prev.paused !== next.paused) {
    return true;
  }

  // ⏹️ Ended state changed
  if (prev.ended !== next.ended) {
    return true;
  }

  // ⏩ Time difference exceeds threshold
  const diff = Math.abs(prev.current - next.current);

  if (diff > config.threshold) {
    return true;
  }

  return false;
}

// 💾 Update internal state if data has changed
function update_state(data) {
  const changed = compare_state(state, data);

  if (!changed) {
    return false;
  }

  state.video = data.video;
  state.title = data.title;
  state.subtitle = data.subtitle;
  state.current = data.current;
  state.duration = data.duration;
  state.playing = data.playing;
  state.paused = data.paused;
  state.ended = data.ended;
  state.buffering = data.buffering;
  state.volume = data.volume;
  state.muted = data.muted;

  return true;
}

// 🎧 Attach video event listeners
function attach_listeners(video) {
  const events = [
    'play',
    'pause',
    'ended',
    'timeupdate',
    'seeking',
    'seeked',
    'volumechange',
    'loadedmetadata',
    'canplay',
    'waiting',
    'playing'
  ];

  events.forEach(event => {
    video.addEventListener(event, handle_event);
  });
}

// 🗑️ Detach video event listeners
function detach_listeners(video) {
  const events = [
    'play',
    'pause',
    'ended',
    'timeupdate',
    'seeking',
    'seeked',
    'volumechange',
    'loadedmetadata',
    'canplay',
    'waiting',
    'playing'
  ];

  events.forEach(event => {
    video.removeEventListener(event, handle_event);
  });
}

// 📡 Handle video event and emit update if state changed
function handle_event(event) {
  const data = extract_metadata();

  if (!data) {
    return;
  }

  const changed = update_state(data);

  if (changed) {
    emit_update(data);
  }
}

// 📤 Emit update payload via postMessage
function emit_update(data) {
  const payload = {
    title: data.title,
    current: Math.floor(data.current),
    duration: Math.floor(data.duration),
    playing: data.playing,
    timestamp: Date.now()
  };

  window.postMessage({
    type: 'netflix_update',
    data: payload
  }, '*');
}

// 👁️ Observe DOM for video element changes
function observe_dom() {
  const target = document.body;

  const observer = new MutationObserver(() => {
    const video = find_video();

    // 🎥 New video element detected
    if (video && video !== state.video) {
      if (state.video) {
        detach_listeners(state.video);
      }

      attach_listeners(video);
      state.video = video;
      state.attempts = 0;

      const data = extract_metadata();

      if (data) {
        update_state(data);
        emit_update(data);
      }
    }
  });

  observer.observe(target, {
    childList: true,
    subtree: true
  });

  state.observers.push(observer);

  return observer;
}

// 🔁 Poll for video element on interval
function poll_video() {
  const video = find_video();

  if (video) {
    // 🎥 New video element found, swap listeners
    if (video !== state.video) {
      if (state.video) {
        detach_listeners(state.video);
      }

      attach_listeners(video);
      state.video = video;
    }

    const data = extract_metadata();

    if (data) {
      const changed = update_state(data);

      if (changed) {
        emit_update(data);
      }
    }

    state.attempts = 0;
  } else {
    state.attempts++;

    // ⚠️ Video not found after multiple attempts
    if (state.attempts > config.retry) {
      console.warn('Netflix video not found after multiple attempts');
    }
  }
}

// 🧹 Cleanup listeners and observers
function cleanup() {
  if (state.video) {
    detach_listeners(state.video);
    state.video = null;
  }

  state.observers.forEach(observer => {
    observer.disconnect();
  });

  state.observers = [];
}

// 🚀 Initialize extractor
function initialize() {
  cleanup();

  // 👁️ Start DOM observer
  observe_dom();

  // 🕐 Start polling interval
  setInterval(poll_video, config.interval);

  // 🔍 Initial poll
  poll_video();

  console.log('🎬 Netflix metadata extractor initialized');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initialize);
} else {
  initialize();
}

// 🔴 Cleanup on page unload
window.addEventListener('beforeunload', cleanup);

// 📤 Exports
module.exports = {
  extract: extract_metadata,
  state: state,
  cleanup: cleanup
};
