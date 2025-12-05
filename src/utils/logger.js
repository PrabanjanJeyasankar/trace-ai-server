const fs = require('fs')
const path = require('path')

const logDir = path.join(process.cwd(), 'logs')
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir)

const logFile = path.join(logDir, 'app.log')

const write = (level, message) => {
  const entry = `${new Date().toISOString()} [${level}] ${message}\n`
  fs.appendFileSync(logFile, entry)
}

const devLogger = {
  info: (msg) => console.log(msg),
  warn: (msg) => console.warn(msg),
  error: (msg) => console.error(msg),
}

const prodLogger = {
  info: (msg) => write('INFO', msg),
  warn: (msg) => write('WARN', msg),
  error: (msg) => write('ERROR', msg),
}

module.exports = process.env.NODE_ENV === 'production' ? prodLogger : devLogger
