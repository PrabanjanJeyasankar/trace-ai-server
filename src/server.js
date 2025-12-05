const connectDB = require('./config/db')
const app = require('./app')
const config = require('./config')

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  process.exit(1)
})

connectDB()

const server = app.listen(config.server.port, () => {
  const { host, port, env } = config.server
  const BLUE = '\x1b[34m'
  const RESET = '\x1b[0m'

  console.log(
    BLUE +
      `
============================================================
  AI Chat Server
  Environment: ${env}
  Port:        ${port}
  URL:         http://${host}:${port}
============================================================
` +
      RESET
  )
})

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error)
  server.close(() => process.exit(1))
})

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down')
  server.close(() => console.log('Process terminated'))
})
