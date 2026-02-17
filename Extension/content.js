// ⚙️ Configuration
const config = {
  interval: 1000,
  wsUrl: 'ws://localhost:3001'
};

// 📦 State
let state = {
  title: null,
  current: 0,
  duration: 0,
  playing: false,
  socket: null,
  connected: false,
  reconnectAttempts: 0,
  maxReconnectAttempts: 10
};

// 🔤 Parse Netflix title into structured format
function parse_netflix_title(raw) {
  if (!raw) {
    return null;
  }

  // 📀 Format "Series D01 Episode Name"
  const episodeMatch = raw.match(/^(.+?)D(\d+)(.+)$/);

  if (episodeMatch) {
    const series = episodeMatch[1].trim();
    const episode = episodeMatch[2];
    const name = episodeMatch[3].trim();

    return `${series}: D${episode} ${name}`;
  }

  // 📺 Format "Series S01E01 Episode Name"
  const seasonMatch = raw.match(/^(.+?)[:\s]*S(\d+)[:\s]*E(\d+)(.*)$/i);

  if (seasonMatch) {
    const series = seasonMatch[1].trim();
    const season = seasonMatch[2];
    const episode = seasonMatch[3];
    const name = seasonMatch[4].trim().replace(/^[:\s-]+/, '');

    if (name) {
      return `${series}: S${season}E${episode} - ${name}`;
    }

    return `${series}: S${season}E${episode}`;
  }

  // 🎬 Plain title, no episode info
  return raw;
}

// 🎥 Extract current video state from Netflix page
function extract() {
  const video = document.querySelector('video');

  if (!video) {
    console.log('⚠️ Video element not found');
    return null;
  }

  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    console.log('⚠️ Invalid video duration:', video.duration);
    return null;
  }

  let title = null;

  // 🔍 Try multiple selectors for title
  const titleSelectors = [
    '[data-uia="video-title"]',
    '.video-title',
    '.player-status-main-title',
    'h4.ellipsize-text'
  ];

  for (const selector of titleSelectors) {
    const titleElement = document.querySelector(selector);
    if (titleElement && titleElement.textContent.trim()) {
      const raw = titleElement.textContent.trim();
      title = parse_netflix_title(raw);
      console.log('📺 Raw title:', raw, '→ Parsed:', title);
      break;
    }
  }

  if (!title) {
    console.log('⚠️ Title not found, skipping update');
    return null;
  }

  const currentTime = Math.floor(video.currentTime);
  const duration = Math.floor(video.duration);
  const playing = !video.paused && !video.ended;

  return {
    title: title,
    current: currentTime,
    duration: duration,
    playing: playing
  };
}

// 🔌 Connect to WebSocket server
function connect() {
  if (state.socket && state.socket.readyState === WebSocket.OPEN) {
    return;
  }

  if (state.reconnectAttempts >= state.maxReconnectAttempts) {
    console.log('❌ Max reconnect attempts reached');
    return;
  }

  try {
    console.log(`🔄 Connecting to ${config.wsUrl} (attempt ${state.reconnectAttempts + 1})`);
    state.socket = new WebSocket(config.wsUrl);

    // ✅ Connection established
    state.socket.onopen = () => {
      console.log('✅ Connected to Netflix RPC');
      state.connected = true;
      state.reconnectAttempts = 0;

      const data = extract();
      if (data) {
        send(data);
      }
    };

    // ❌ Connection closed, schedule reconnect
    state.socket.onclose = () => {
      console.log('❌ Disconnected from Netflix RPC');
      state.connected = false;
      state.reconnectAttempts++;

      const delay = Math.min(1000 * Math.pow(2, state.reconnectAttempts), 30000);
      console.log(`⏳ Reconnecting in ${delay}ms...`);
      setTimeout(connect, delay);
    };

    // ⚠️ WebSocket error
    state.socket.onerror = (error) => {
      console.error('⚠️ WebSocket error:', error);
      state.connected = false;
    };

    // 📩 Incoming message from server
    state.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log('📩 Response:', data);
      } catch (e) {
        console.log('📩 Response (non-JSON):', event.data);
      }
    };

  } catch (error) {
    console.error('❌ Failed to connect:', error);
    state.reconnectAttempts++;
    setTimeout(connect, 3000);
  }
}

// 📤 Send update payload to server
function send(data) {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    console.warn('⚠️ Not connected, data not sent');
    return false;
  }

  try {
    const payload = {
      type: 'update',
      data: data,
      timestamp: Date.now()
    };

    state.socket.send(JSON.stringify(payload));
    console.log('📤 Sent:', data);
    return true;
  } catch (error) {
    console.error('❌ Failed to send:', error);
    state.connected = false;
    return false;
  }
}

// 🔴 Send clear signal to server
function send_clear() {
  if (!state.socket || state.socket.readyState !== WebSocket.OPEN) {
    return;
  }

  try {
    state.socket.send(JSON.stringify({
      type: 'clear'
    }));
    console.log('🔴 Sent clear to server');
  } catch (error) {
    console.error('❌ Failed to send clear:', error);
  }
}

// 🔄 Check for state changes and send update if needed
function update() {
  const data = extract();

  if (!data) {
    return;
  }

  const changed = data.title !== state.title ||
                  data.playing !== state.playing ||
                  data.duration !== state.duration ||
                  Math.abs(data.current - state.current) >= 1;

  if (changed) {
    console.log('🔄 State changed:', {
      from: { title: state.title, current: state.current, playing: state.playing },
      to: { title: data.title, current: data.current, playing: data.playing }
    });

    state.title = data.title;
    state.current = data.current;
    state.duration = data.duration;
    state.playing = data.playing;

    send(data);
  }
}

// 🎧 Attach event listeners to video element
function setupVideoListeners() {
  const video = document.querySelector('video');

  if (!video) {
    console.log('⚠️ Video not found, will retry...');
    setTimeout(setupVideoListeners, 1000);
    return;
  }

  console.log('✅ Video element found, attaching listeners');

  // ▶️ Playback started
  video.addEventListener('play', () => {
    console.log('▶️ Video started playing');
    update();
  });

  // ⏸️ Playback paused
  video.addEventListener('pause', () => {
    console.log('⏸️ Video paused');
    update();
  });

  // ⏩ User seeked to new position
  video.addEventListener('seeked', () => {
    console.log('⏩ Video seeked');
    update();
  });

  // ⏹️ Video finished playing
  video.addEventListener('ended', () => {
    console.log('⏹️ Video ended');
    send_clear();
  });

  // 📊 Metadata loaded, duration available
  video.addEventListener('loadedmetadata', () => {
    console.log('📊 Video metadata loaded');
    update();
  });
}

// 🚀 Initialize content script
function init() {
  console.log('🎬 Netflix RPC Content Script initialized');
  console.log('📍 Current URL:', window.location.href);

  connect();
  setupVideoListeners();

  // 🕐 Periodic update interval
  setInterval(update, config.interval);

  // ⏳ Initial update after page load
  setTimeout(update, 2000);

  // 🔴 Clear RPC when tab or window is closed
  window.addEventListener('beforeunload', () => {
    console.log('🔴 Netflix tab closing, clearing RPC');
    send_clear();
  });
}

// 👁️ Watch for URL changes (Netflix is a SPA)
let lastUrl = window.location.href;
new MutationObserver(() => {
  const currentUrl = window.location.href;
  if (currentUrl !== lastUrl) {
    console.log('🔄 URL changed:', lastUrl, '→', currentUrl);

    // 🔴 Left watch page, clear RPC
    if (lastUrl.includes('/watch/') && !currentUrl.includes('/watch/')) {
      console.log('🔴 Left watch page, clearing RPC');
      send_clear();
    }

    lastUrl = currentUrl;
    setTimeout(() => {
      setupVideoListeners();
      update();
    }, 2000);
  }
}).observe(document, { subtree: true, childList: true });

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

console.log('🎬 Netflix RPC Content Script loaded');