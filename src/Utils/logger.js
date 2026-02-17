// 📦 Dependencies
const fs = require('fs');
const path = require('path');

// ⚙️ Configuration
const config = {
  level: 'info',
  file: 'logs/app.log',
  maxSize: 10 * 1024 * 1024,
  maxFiles: 5,
  timestamp: true,
  colors: true
};

// 🔢 Log level hierarchy
const levels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4
};

// 🎨 ANSI color codes
const colors = {
  debug: '\x1b[36m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  fatal: '\x1b[35m',
  reset: '\x1b[0m'
};

// 📦 State
let state = {
  enabled: true,
  console: true,
  file: true,
  buffer: [],
  writing: false,
  stats: {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
    fatal: 0
  }
};

// 🚀 Initialize log directory
function init() {
  const dir = path.dirname(config.file);

  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (error) {
      console.error('Failed to create log directory:', error.message);
      state.file = false;
    }
  }
}

// ⏱️ Format current timestamp
function format_timestamp() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  const ms = String(now.getMilliseconds()).padStart(3, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${ms}`;
}

// 🔤 Format level string with padding
function format_level(level) {
  return level.toUpperCase().padEnd(5);
}

// 📝 Format full log message
function format_message(level, message, data) {
  const parts = [];

  // ⏱️ Prepend timestamp
  if (config.timestamp) {
    parts.push(`[${format_timestamp()}]`);
  }

  parts.push(`[${format_level(level)}]`);
  parts.push(message);

  // 📦 Append data if provided
  if (data !== undefined && data !== null) {
    if (typeof data === 'object') {
      try {
        parts.push(JSON.stringify(data));
      } catch (error) {
        parts.push('[Circular]');
      }
    } else {
      parts.push(String(data));
    }
  }

  return parts.join(' ');
}

// 🎨 Wrap text in ANSI color for given level
function colorize(level, text) {
  if (!config.colors) {
    return text;
  }

  const color = colors[level] || colors.reset;
  return `${color}${text}${colors.reset}`;
}

// ✅ Check if level should be logged
function should_log(level) {
  if (!state.enabled) {
    return false;
  }

  const current = levels[level] || 0;
  const minimum = levels[config.level] || 0;

  return current >= minimum;
}

// 🖥️ Write log to console
function write_console(level, message, data) {
  if (!state.console) {
    return;
  }

  const formatted = format_message(level, message, data);
  const colored = colorize(level, formatted);

  // ❌ Errors to stderr
  if (level === 'error' || level === 'fatal') {
    console.error(colored);
  } else if (level === 'warn') {
    console.warn(colored);
  } else {
    console.log(colored);
  }
}

// 💾 Write log to file buffer
function write_file(level, message, data) {
  if (!state.file) {
    return;
  }

  const formatted = format_message(level, message, data);
  const line = `${formatted}\n`;

  state.buffer.push(line);

  // 📤 Flush if not already writing
  if (!state.writing) {
    flush_buffer();
  }
}

// 📤 Flush buffer to log file
function flush_buffer() {
  if (state.buffer.length === 0) {
    state.writing = false;
    return;
  }

  state.writing = true;

  // 📦 Take up to 100 lines at a time
  const lines = state.buffer.splice(0, 100);
  const content = lines.join('');

  fs.appendFile(config.file, content, (error) => {
    if (error) {
      console.error('Failed to write log:', error.message);
    }

    check_rotation();

    // 🔁 Continue flushing if buffer has more
    if (state.buffer.length > 0) {
      flush_buffer();
    } else {
      state.writing = false;
    }
  });
}

// 📏 Check if log file needs rotation
function check_rotation() {
  try {
    const stats = fs.statSync(config.file);

    if (stats.size >= config.maxSize) {
      rotate_logs();
    }
  } catch (error) {
    return;
  }
}

// 🔄 Rotate log files
function rotate_logs() {
  const dir = path.dirname(config.file);
  const base = path.basename(config.file, '.log');

  // 🔁 Shift old log files
  for (let i = config.maxFiles - 1; i > 0; i--) {
    const current = path.join(dir, `${base}.${i}.log`);
    const next = path.join(dir, `${base}.${i + 1}.log`);

    if (fs.existsSync(current)) {
      // 🗑️ Delete oldest log
      if (i === config.maxFiles - 1) {
        fs.unlinkSync(current);
      } else {
        fs.renameSync(current, next);
      }
    }
  }

  // 📦 Archive current log
  const archived = path.join(dir, `${base}.1.log`);
  fs.renameSync(config.file, archived);
}

// 📝 Core log function
function log(level, message, data) {
  if (!should_log(level)) {
    return;
  }

  state.stats[level]++;

  write_console(level, message, data);
  write_file(level, message, data);
}

// 🐛 Debug level log
function debug(message, data) {
  log('debug', message, data);
}

// ℹ️ Info level log
function info(message, data) {
  log('info', message, data);
}

// ⚠️ Warn level log
function warn(message, data) {
  log('warn', message, data);
}

// ❌ Error level log
function error(message, data) {
  log('error', message, data);
}

// 💀 Fatal level log
function fatal(message, data) {
  log('fatal', message, data);
}

// 🔧 Set minimum log level
function set_level(level) {
  if (!levels.hasOwnProperty(level)) {
    throw new Error(`Invalid log level: ${level}`);
  }

  config.level = level;
}

// ✅ Enable logging
function enable() {
  state.enabled = true;
}

// 🔴 Disable logging
function disable() {
  state.enabled = false;
}

// ✅ Enable console output
function enable_console() {
  state.console = true;
}

// 🔴 Disable console output
function disable_console() {
  state.console = false;
}

// ✅ Enable file output
function enable_file() {
  state.file = true;
}

// 🔴 Disable file output
function disable_file() {
  state.file = false;
}

// 📊 Get log stats
function get_stats() {
  return {
    ...state.stats,
    total: Object.values(state.stats).reduce((a, b) => a + b, 0),
    buffered: state.buffer.length
  };
}

// 🗑️ Clear log stats
function clear_stats() {
  state.stats = {
    debug: 0,
    info: 0,
    warn: 0,
    error: 0,
    fatal: 0
  };
}

// 🗑️ Clear write buffer
function clear_buffer() {
  state.buffer = [];
  state.writing = false;
}

// 📋 Get current config
function get_config() {
  return { ...config };
}

// 🔧 Update config options
function set_config(options) {
  Object.assign(config, options);

  // 🚀 Reinitialize if file path changed
  if (options.file) {
    init();
  }
}

// 🚀 Initialize on load
init();

// 📤 Exports
module.exports = {
  debug: debug,
  info: info,
  warn: warn,
  error: error,
  fatal: fatal,
  level: set_level,
  enable: enable,
  disable: disable,
  console: {
    enable: enable_console,
    disable: disable_console
  },
  file: {
    enable: enable_file,
    disable: disable_file
  },
  stats: get_stats,
  clear: clear_stats,
  flush: clear_buffer,
  config: get_config,
  configure: set_config
};
