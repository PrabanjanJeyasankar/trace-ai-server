const {
  RERANK_MIN_SCORE,
  MIN_RELEVANT_CHUNKS,
  LAW_RERANK_MIN_SCORE,
  LAW_MIN_RELEVANT_CHUNKS,
  ENABLE_RERANKING,
} = require('../../config/rag')
const logger = require('../../utils/logger')

const COLOR = {
  CYAN: '\x1b[36m',
  YELLOW: '\x1b[33m',
  GREEN: '\x1b[32m',
  RESET: '\x1b[0m',
}

const filterRelevant = (items, options = {}) => {
  const { mode = 'news' } = options

  const minScore =
    mode === 'law' ? LAW_RERANK_MIN_SCORE : RERANK_MIN_SCORE
  const minChunks =
    mode === 'law' ? LAW_MIN_RELEVANT_CHUNKS : MIN_RELEVANT_CHUNKS

  const threshold = ENABLE_RERANKING ? minScore : 0.01

  const filtered = items.filter((i) => (i.rerankScore ?? 0) >= threshold)
  const rejected = items.length - filtered.length

  if (rejected > 0) {
    logger.info(
      `${COLOR.YELLOW}[rag:filter] Rejected ${rejected}/${items.length} chunks below threshold ${threshold.toFixed(2)}${COLOR.RESET}`
    )
  }

  logger.info(
    `${COLOR.CYAN}[rag:filter] Keeping ${filtered.length} chunks (min: ${minChunks}, threshold: ${threshold.toFixed(2)})${COLOR.RESET}`
  )

  const isEnough = filtered.length >= minChunks

  if (!isEnough) {
    logger.warn(
      `${COLOR.YELLOW}[rag:filter] Insufficient relevant chunks: ${filtered.length} < ${minChunks} required${COLOR.RESET}`
    )
  } else {
    logger.info(
      `${COLOR.GREEN}[rag:filter] ✓ Sufficient high-quality citations found${COLOR.RESET}`
    )
  }

  return {
    filtered,
    isEnough,
  }
}

module.exports = { filterRelevant }
