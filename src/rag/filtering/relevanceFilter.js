const {
  RERANK_MIN_SCORE,
  MIN_RELEVANT_CHUNKS,
  LAW_RERANK_MIN_SCORE,
  LAW_MIN_RELEVANT_CHUNKS,
  ENABLE_RERANKING,
} = require('../../config/rag')

const filterRelevant = (items, options = {}) => {
  const { mode = 'news' } = options

  const minScore = mode === 'law' ? LAW_RERANK_MIN_SCORE : RERANK_MIN_SCORE
  const minChunks =
    mode === 'law' ? LAW_MIN_RELEVANT_CHUNKS : MIN_RELEVANT_CHUNKS

  const threshold = ENABLE_RERANKING ? minScore : 0.01

  const filtered = items.filter((i) => (i.rerankScore ?? 0) >= threshold)

  return {
    filtered,
    isEnough:
      minChunks === 0 ? filtered.length > 0 : filtered.length >= minChunks,
  }
}

module.exports = { filterRelevant }
