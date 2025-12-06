const connectDB = require('./config/db')
const app = require('./app')
const config = require('./config')

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  process.exit(1)
})

const startServer = async () => {
  await connectDB()

  const server = app.listen(config.server.port, () => {
    const { host, port, env } = config.server

    const provider = process.env.AI_PROVIDER || 'unknown'
    const activeModel =
      provider === 'openrouter'
        ? process.env.OPENROUTER_MODEL || 'none'
        : provider === 'ollama'
        ? process.env.OLLAMA_MODEL || 'none'
        : 'none'

    const version = process.env.npm_package_version || '1.0.0'
    const nodeVersion = process.version
    const time = new Date().toISOString()

    const BLUE = '\x1b[34m'
    const CYAN = '\x1b[36m'
    const GREEN = '\x1b[32m'
    const MAGENTA = '\x1b[35m'
    const YELLOW = '\x1b[33m'
    const RESET = '\x1b[0m'

    console.log(
      `
    ${BLUE}============================================================${RESET}
    ${CYAN}  AI Chat Server${RESET}
    ${BLUE}------------------------------------------------------------${RESET}

    ${GREEN}  Environment     :${RESET} ${env}
    ${GREEN}  Host            :${RESET} ${host}
    ${GREEN}  Port            :${RESET} ${port}
    ${GREEN}  URL             :${RESET} http://${host}:${port}

    ${MAGENTA}  AI Provider     :${RESET} ${provider}
    ${MAGENTA}  Active Model    :${RESET} ${activeModel}

    ${YELLOW}  App Version     :${RESET} ${version}
    ${YELLOW}  Node Version    :${RESET} ${nodeVersion}
    ${YELLOW}  Started At      :${RESET} ${time}

    ${BLUE}============================================================${RESET}
    `
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
}

startServer()
