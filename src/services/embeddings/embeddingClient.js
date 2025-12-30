const config = require('../../config')
const logger = require('../../utils/logger')
const { RpcClient } = require('../../lib/rpc-client')

let lastEmbedderWarnAt = 0
const EMBEDDER_WARN_EVERY_MS = 30_000

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
  if (!rpcClient && config?.rag?.embeddingRpcUrl) {
    rpcClient = new RpcClient(config.rag.embeddingRpcUrl, {
      serviceName: 'embedding',
      timeout: 15000,
      warnInterval: EMBEDDER_WARN_EVERY_MS,
    })

    if (!connectionLogged) {
      logger.info(
        `${COLOR.BOLD}${COLOR.GREEN}[embedding] ✓ RPC client initialized${COLOR.RESET}`
      )
      logger.info(
        `${COLOR.CYAN}[embedding] → url=${config.rag.embeddingRpcUrl}${COLOR.RESET}`
      )
      connectionLogged = true
    }
  }
  return rpcClient
}

/**
 * Embed a single text string
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - 384D vector
 */
const embedText = async (text) => {
  const url = config?.rag?.embeddingRpcUrl

  if (!text || typeof text !== 'string') {
    throw new Error('Invalid text for embedding')
  }

  if (!url) {
    throw new Error('EMBEDDING_RPC_URL not configured')
  }

  try {
    logger.info(
      `${COLOR.CYAN}[embedding] → RPC call: embed(${text.length} chars)${COLOR.RESET}`
    )

    const client = initRpcClient()
    if (!client) {
      throw new Error('RPC client initialization failed')
    }

    const result = await client.call('embed', { text })

    if (!result.vector || !Array.isArray(result.vector)) {
      throw new Error('Invalid vector response from embedding service')
    }

    if (result.dimension !== 384) {
      throw new Error(
        `Vector dimension mismatch: got ${result.dimension}, expected 384`
      )
    }

    logger.info(
      `${COLOR.GREEN}[embedding] ✓ RPC response: ${result.dimension}D vector in ${result.duration_ms}ms${COLOR.RESET}`
    )

    return result.vector
  } catch (error) {
    const now = Date.now()
    if (now - lastEmbedderWarnAt >= EMBEDDER_WARN_EVERY_MS) {
      lastEmbedderWarnAt = now

      const status = error?.response?.status
      const data = error?.response?.data
      const code = error?.code

      if (status) {
        logger.error(
          `${COLOR.RED}[embedding] ✗ RPC error: HTTP ${status}${COLOR.RESET}`,
          { data }
        )
      } else if (code) {
        logger.error(
          `${COLOR.RED}[embedding] ✗ RPC error: ${code} ${error.message}${COLOR.RESET}`
        )
      } else {
        logger.error(
          `${COLOR.RED}[embedding] ✗ RPC error: ${error.message}${COLOR.RESET}`
        )
      }
    }

    throw error
  }
}

/**
 * Embed multiple text strings in a batch
 * @param {string[]} texts - Array of texts to embed
 * @returns {Promise<number[][]>} - Array of 384D vectors
 */
const embedBatch = async (texts) => {
  const url = config?.rag?.embeddingRpcUrl

  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('Invalid texts array for batch embedding')
  }

  if (!url) {
    throw new Error('EMBEDDING_RPC_URL not configured')
  }

  try {
    logger.info(
      `${COLOR.CYAN}[embedding] → RPC call: embed_batch(${texts.length} texts)${COLOR.RESET}`
    )

    const client = initRpcClient()
    if (!client) {
      throw new Error('RPC client initialization failed')
    }

    const result = await client.call('embed_batch', { texts })

    if (!result.vectors || !Array.isArray(result.vectors)) {
      throw new Error('Invalid vectors response from embedding service')
    }

    if (result.dimension !== 384) {
      throw new Error(
        `Vector dimension mismatch: got ${result.dimension}, expected 384`
      )
    }

    logger.info(
      `${COLOR.GREEN}[embedding] ✓ RPC response: ${result.count} x ${result.dimension}D vectors in ${result.duration_ms}ms${COLOR.RESET}`
    )

    return result.vectors
  } catch (error) {
    const now = Date.now()
    if (now - lastEmbedderWarnAt >= EMBEDDER_WARN_EVERY_MS) {
      lastEmbedderWarnAt = now

      const status = error?.response?.status
      const data = error?.response?.data
      const code = error?.code

      if (status) {
        logger.error(
          `${COLOR.RED}[embedding] ✗ RPC error: HTTP ${status}${COLOR.RESET}`,
          { data }
        )
      } else if (code) {
        logger.error(
          `${COLOR.RED}[embedding] ✗ RPC error: ${code} ${error.message}${COLOR.RESET}`
        )
      } else {
        logger.error(
          `${COLOR.RED}[embedding] ✗ RPC error: ${error.message}${COLOR.RESET}`
        )
      }
    }

    throw error
  }
}

module.exports = {
  embedText,
  embedBatch,
}
