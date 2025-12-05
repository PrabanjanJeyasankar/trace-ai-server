const app = require('./app')
const config = require('./config')

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
  process.exit(1)
})

const server = app.listen(config.server.port, () => {
  const host = config.server.host
  const port = config.server.port
  const env = config.server.env

  console.log(`
============================================================
  AI Chat Server
  Environment: ${env}
  Port:        ${port}
  URL:         http://${host}:${port}
============================================================
`)
})

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err)
  server.close(() => {
    process.exit(1)
  })
})

process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down')
  server.close(() => {
    console.log('Process terminated')
  })
})
