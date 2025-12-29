const { hybridRetrieve } = require('../retrieval/hybridRetriever')
const {
  multiQueryLegalRetrieve,
} = require('../retrieval/multiQueryLegalRetriever')
const { rerankResults } = require('../reranking/rerankResults')
const { filterRelevant } = require('../filtering/relevanceFilter')
const {
  NEWS_TOP_K,
  MIN_RELEVANT_CHUNKS,
  LAW_MIN_RELEVANT_CHUNKS,
  NOT_ENOUGH_INFO_MESSAGE,
} = require('../../config/rag')

const normalizeQuery = (query) =>
  String(query || '')
    .trim()
    .replace(/\s+/g, ' ')

const runNewsRagPipeline = async ({ query, onProgress }) => {
  const normalizedQuery = normalizeQuery(query)

  if (onProgress) {
    onProgress('rag_pipeline', 'retrieving', { source: 'news articles' })
  }

  const candidates = await hybridRetrieve(normalizedQuery)

  if (onProgress) {
    onProgress('rag_pipeline', 'reranking', { count: candidates.length })
  }

  const reranked = await rerankResults(normalizedQuery, candidates)

  if (onProgress) {
    onProgress('rag_pipeline', 'filtering')
  }

  const { filtered, isEnough } = filterRelevant(reranked, { mode: 'news' })

  if (!isEnough) {
    return {
      ok: false,
      message:
        NOT_ENOUGH_INFO_MESSAGE ||
        `The available sources are not relevant enough to answer accurately. (need at least ${MIN_RELEVANT_CHUNKS} relevant chunks)`,
      chunks: [],
    }
  }

  return { ok: true, chunks: filtered.slice(0, NEWS_TOP_K) }
}

const runLegalRagPipeline = async ({ query, onProgress }) => {
  const normalizedQuery = normalizeQuery(query)

  if (onProgress) {
    onProgress('rag_pipeline', 'retrieving', {
      source: 'legal documents',
      strategy: 'multi-query hybrid',
    })
  }

  const candidates = await multiQueryLegalRetrieve(normalizedQuery)

  if (onProgress) {
    onProgress('rag_pipeline', 'reranking', { count: candidates.length })
  }

  const reranked = await rerankResults(normalizedQuery, candidates)

  if (onProgress) {
    onProgress('rag_pipeline', 'filtering')
  }

  const { filtered, isEnough } = filterRelevant(reranked, { mode: 'law' })

  if (!isEnough) {
    return {
      ok: false,
      message:
        NOT_ENOUGH_INFO_MESSAGE ||
        `The available legal sources are not relevant enough to answer accurately. (need at least ${LAW_MIN_RELEVANT_CHUNKS} relevant chunks)`,
      chunks: [],
    }
  }

  return { ok: true, chunks: filtered.slice(0, NEWS_TOP_K) }
}

module.exports = { runNewsRagPipeline, runLegalRagPipeline, normalizeQuery }
