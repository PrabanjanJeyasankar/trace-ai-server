const qdrant = require('../../lib/qdrant.client')
const { LEGAL_COLLECTION } = require('../../lib/qdrant.collections')
const logger = require('../../utils/logger')
const {
  indexLegalChunks,
} = require('../../rag/retrieval/legalKeywordRetriever')
const {
  makeLegalChunkKey,
} = require('../../rag/retrieval/legalVectorRetriever')

class LegalService {
  /**
   * Warms up the in-memory BM25 keyword index from Qdrant on startup.
   *
   * Why:
   * - Legal keyword retrieval is in-memory.
   * - Legal ingestion happens outside this service, so without warmup
   *   the keyword index stays empty after restarts.
   *
   */
  static async warmupKeywordIndexFromQdrant(opts = {}) {
    const limit =
      Number(opts.limit ?? process.env.LEGAL_WARMUP_LIMIT) || 2000
    const batchSize = Math.min(
      Math.max(
        Number(opts.batchSize ?? process.env.LEGAL_WARMUP_BATCH_SIZE) || 256,
        1
      ),
      512
    )

    let loaded = 0
    let offset = undefined

    try {
      while (loaded < limit) {
        const remaining = limit - loaded
        const pageLimit = Math.min(batchSize, remaining)

        const res = await qdrant.scroll(LEGAL_COLLECTION, {
          limit: pageLimit,
          offset,
          with_payload: true,
          with_vector: false,
        })

        const points = Array.isArray(res?.points) ? res.points : []
        if (points.length === 0) break

        const chunks = points
          .map((p) => {
            const payload = p?.payload || {}
            const text = payload?.text || ''
            if (!text) return null
            return { key: makeLegalChunkKey(payload), text, payload }
          })
          .filter(Boolean)

        indexLegalChunks(chunks)

        loaded += points.length
        offset = res?.next_page_offset

        if (!offset) break
      }

      logger.info(`Legal keyword index warmup complete: chunks=${loaded}`)
    } catch (error) {
      logger.warn(`Legal keyword index warmup failed: ${error.message}`)
    }
  }
}

module.exports = LegalService
