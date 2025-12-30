const axios = require('axios')
const config = require('../../config')
const logger = require('../../utils/logger')
const { RpcClient } = require('../../lib/rpc-client')

let lastRerankerWarnAt = 0
const RERANKER_WARN_EVERY_MS = 30_000

const COLOR = {
  GREEN: '\x1b[32m',
  CYAN: '\x1b[36m',
  YELLOW: '\x1b[33m',
  RED: '\x1b[31m',
  RESET: '\x1b[0m',
  BOLD: '\x1b[1m',
}

let rpcClient = null
let connectionLogged = false

const initRpcClient = () => {
  if (!rpcClient && config?.rag?.rerankerRpcUrl) {
    rpcClient = new RpcClient(config.rag.rerankerRpcUrl, {
      serviceName: 'reranker',
      timeout: 15000,
      warnInterval: RERANKER_WARN_EVERY_MS,
    })

    if (!connectionLogged) {
      logger.info(
        `${COLOR.BOLD}${COLOR.GREEN}[reranker] ✓ RPC client initialized${COLOR.RESET}`
      )
      logger.info(
        `${COLOR.CYAN}[reranker] → url=${config.rag.rerankerRpcUrl}${COLOR.RESET}`
      )
      connectionLogged = true
    }
  }
  return rpcClient
}

const rerank = async ({ query, documents }) => {
  const url = config?.rag?.rerankerRpcUrl

  if (!documents || documents.length === 0) {
    return []
  }

  if (!url) {
    logger.warn(
      `${COLOR.YELLOW}[reranker] RPC URL not configured, using neutral scores${COLOR.RESET}`
    )
    return documents.map((_d, idx) => ({ index: idx, score: 1 }))
  }

  try {
    logger.info(
      `${COLOR.CYAN}[reranker] → RPC call: rerank(${documents.length} docs)${COLOR.RESET}`
    )

    const client = initRpcClient()
    if (!client) {
      throw new Error('RPC client initialization failed')
    }

    const result = await client.call('rerank', { query, documents })

    logger.info(
      `${COLOR.GREEN}[reranker] ✓ RPC response: ${result.length} scores${COLOR.RESET}`
    )

    return result
  } catch (error) {
    const now = Date.now()
    if (now - lastRerankerWarnAt >= RERANKER_WARN_EVERY_MS) {
      lastRerankerWarnAt = now

      const status = error?.response?.status
      const data = error?.response?.data
      const code = error?.code
      const message = error?.message || String(error)

      logger.warn(
        `${COLOR.RED}[reranker] ✗ RPC call failed; using neutral scores${COLOR.RESET}`
      )
      logger.warn(
        `${COLOR.YELLOW}[reranker] url=${url} status=${status || 'n/a'} code=${
          code || 'n/a'
        } message=${message}${COLOR.RESET}`
      )

      if (data) {
        logger.warn(
          `${COLOR.YELLOW}[reranker] Response: ${
            typeof data === 'string' ? data : JSON.stringify(data)
          }${COLOR.RESET}`
        )
      }
    }

    return documents.map((_d, idx) => ({ index: idx, score: 1 }))
  }
}

module.exports = {
  rerank,
}
