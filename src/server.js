const http = require('http')
const { Server } = require('socket.io')
const connectDB = require('./config/db')
const app = require('./app')
const config = require('./config')
const { initQdrantCollections } = require('./lib/qdrant.collections')
const CronService = require('./services/cron.service')
const { setupWebSocketHandlers } = require('./websocket/messageHandler')

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  process.exit(1)
})

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error)
  process.exit(1)
})

const startServer = async () => {
  try {
    await connectDB()
    await initQdrantCollections()
  } catch (error) {
    console.error(
      `Startup failed: ${error?.message || error}. Check QDRANT_URL/QDRANT_API_KEY and any dependent services (Mongo, Qdrant, reranker).`
    )
    process.exit(1)
  }

  CronService.startDailyNewsIngestion()
  CronService.startKeepAlive()

  const server = http.createServer(app)
  const io = new Server(server, {
    cors: {
      origin: config.cors.origin,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
    pingInterval: 25000,
  })

  setupWebSocketHandlers(io)

  server.listen(config.server.port, () => {
    const { host, port, env } = config.server
    const ragConfig = require('./config/rag')

    const provider = process.env.AI_PROVIDER || 'hf'
    const activeModel = 'embeddings-only'
    const rerankerUrl = config?.rag?.rerankerUrl || 'disabled'
    const rerankingEnabled = ragConfig.ENABLE_RERANKING ? 'ENABLED' : 'DISABLED'
    const rerankingStatus = ragConfig.ENABLE_RERANKING ? '✓' : '✗'

    const version = process.env.npm_package_version || '1.0.0'
    const nodeVersion = process.version
    const time = new Date().toISOString()

    const BLUE = '\x1b[34m'
    const CYAN = '\x1b[36m'
    const GREEN = '\x1b[32m'
    const MAGENTA = '\x1b[35m'
    const YELLOW = '\x1b[33m'
    const RED = '\x1b[31m'
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
    ${MAGENTA}  Reranker URL    :${RESET} ${rerankerUrl}
    ${
      ragConfig.ENABLE_RERANKING ? GREEN : RED
    }  Reranking       :${RESET} ${rerankingStatus} ${rerankingEnabled}

    ${YELLOW}  App Version     :${RESET} ${version}
    ${YELLOW}  Node Version    :${RESET} ${nodeVersion}
    ${YELLOW}  Started At      :${RESET} ${time}

    ${BLUE}============================================================${RESET}
    `
    )
  })

  server.setTimeout(30000)

  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down')
    CronService.stopDailyNewsIngestion()
    CronService.stopKeepAlive()
    server.close(() => console.log('Process terminated'))
  })
}

startServer()
