const axios = require('axios')
const config = require('../../config')
const logger = require('../../utils/logger')

let lastRerankerWarnAt = 0
const RERANKER_WARN_EVERY_MS = 30_000

const rerank = async ({ query, documents }) => {
  const url = config?.rag?.rerankerUrl

  if (!url) {
    return documents.map((_d, idx) => ({ index: idx, score: 1 }))
  }

  try {
    const response = await axios.post(
      url,
      { query, documents },
      { timeout: 15000 }
    )

    return response.data
  } catch (error) {
    const now = Date.now()
    if (now - lastRerankerWarnAt >= RERANKER_WARN_EVERY_MS) {
      lastRerankerWarnAt = now

      const status = error?.response?.status
      const data = error?.response?.data
      const code = error?.code
      const message = error?.message || String(error)

      logger.warn(
        `[reranker] Request failed; reranking degraded to neutral scores. url=${url} status=${status || 'n/a'} code=${code || 'n/a'} message=${message}`
      )

      if (data) {
        logger.warn(
          `[reranker] Response body: ${
            typeof data === 'string' ? data : JSON.stringify(data)
          }`
        )
      }
    }

    return documents.map((_d, idx) => ({ index: idx, score: 1 }))
  }
}

module.exports = { rerank }
