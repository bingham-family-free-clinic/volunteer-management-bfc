const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 }
const level = LEVELS[(process.env.CHATBOT_LOG_LEVEL || 'info').toLowerCase()] || LEVELS.info

function log(levelName, message, meta = {}) {
  const lvl = LEVELS[levelName] || 0
  if (lvl > level) return
  const entry = { level: levelName, message, timestamp: new Date().toISOString(), ...meta }
  const line = JSON.stringify(entry)
  if (levelName === 'error') console.error(line)
  else console.log(line)
}

export const logger = {
  error: (message, meta) => log('error', message, meta),
  warn: (message, meta) => log('warn', message, meta),
  info: (message, meta) => log('info', message, meta),
  debug: (message, meta) => log('debug', message, meta)
}
