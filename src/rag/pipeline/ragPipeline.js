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

function calculateScoreStats(results) {
  if (!results || results.length === 0) {
    return { topScore: null, avgScore: null }
  }
  const scores = results
    .map((r) => r.score || r.rerank_score || 0)
    .filter(Boolean)
  if (scores.length === 0) {
    return { topScore: null, avgScore: null }
  }
  const topScore = Math.max(...scores)
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length
  return {
    topScore: Math.round(topScore * 1000) / 1000,
    avgScore: Math.round(avgScore * 1000) / 1000,
  }
}

const runNewsRagPipeline = async ({ query, onProgress }) => {
  const pipelineStart = Date.now()
  const normalizedQuery = normalizeQuery(query)
  const metrics = {
    sourceType: 'news',
    queryNormalized: normalizedQuery.substring(0, 100),
  }

  if (onProgress) {
    onProgress('rag_pipeline', 'retrieving', { source: 'news articles' })
  }

  const retrievalStart = Date.now()
  const candidates = await hybridRetrieve(normalizedQuery)
  metrics.retrievalMs = Date.now() - retrievalStart
  metrics.candidatesCount = candidates.length

  if (onProgress) {
    onProgress('rag_pipeline', 'reranking', { count: candidates.length })
  }

  const rerankStart = Date.now()
  const reranked = await rerankResults(normalizedQuery, candidates)
  metrics.rerankMs = Date.now() - rerankStart
  metrics.rerankedCount = reranked.length

  const scoreStats = calculateScoreStats(reranked)
  metrics.topScore = scoreStats.topScore
  metrics.avgScore = scoreStats.avgScore

  if (onProgress) {
    onProgress('rag_pipeline', 'filtering')
  }

  const filterStart = Date.now()
  const { filtered, isEnough } = filterRelevant(reranked, { mode: 'news' })
  metrics.filterMs = Date.now() - filterStart
  metrics.filteredCount = filtered.length
  metrics.chunksRelevant = filtered.length
  metrics.isEnough = isEnough
  metrics.totalMs = Date.now() - pipelineStart

  if (!isEnough) {
    metrics.abortReason = 'insufficient_relevant_chunks'
    return {
      ok: false,
      message:
        NOT_ENOUGH_INFO_MESSAGE ||
        `The available sources are not relevant enough to answer accurately. (need at least ${MIN_RELEVANT_CHUNKS} relevant chunks)`,
      chunks: [],
      metrics,
    }
  }

  return { ok: true, chunks: filtered.slice(0, NEWS_TOP_K), metrics }
}

const runLegalRagPipeline = async ({ query, onProgress }) => {
  const pipelineStart = Date.now()
  const normalizedQuery = normalizeQuery(query)
  const metrics = {
    sourceType: 'law',
    queryNormalized: normalizedQuery.substring(0, 100),
  }

  if (onProgress) {
    onProgress('rag_pipeline', 'retrieving', {
      source: 'legal documents',
      strategy: 'multi-query hybrid',
    })
  }

  const retrievalStart = Date.now()
  const candidates = await multiQueryLegalRetrieve(normalizedQuery)
  metrics.retrievalMs = Date.now() - retrievalStart
  metrics.candidatesCount = candidates.length

  if (onProgress) {
    onProgress('rag_pipeline', 'reranking', { count: candidates.length })
  }

  const rerankStart = Date.now()
  const reranked = await rerankResults(normalizedQuery, candidates)
  metrics.rerankMs = Date.now() - rerankStart
  metrics.rerankedCount = reranked.length

  const scoreStats = calculateScoreStats(reranked)
  metrics.topScore = scoreStats.topScore
  metrics.avgScore = scoreStats.avgScore

  if (onProgress) {
    onProgress('rag_pipeline', 'filtering')
  }

  const filterStart = Date.now()
  const { filtered, isEnough } = filterRelevant(reranked, { mode: 'law' })
  metrics.filterMs = Date.now() - filterStart
  metrics.filteredCount = filtered.length
  metrics.chunksRelevant = filtered.length
  metrics.isEnough = isEnough
  metrics.totalMs = Date.now() - pipelineStart

  if (!isEnough) {
    metrics.abortReason = 'insufficient_relevant_chunks'
    return {
      ok: false,
      message:
        NOT_ENOUGH_INFO_MESSAGE ||
        `The available legal sources are not relevant enough to answer accurately. (need at least ${LAW_MIN_RELEVANT_CHUNKS} relevant chunks)`,
      chunks: [],
      metrics,
    }
  }

  return { ok: true, chunks: filtered.slice(0, NEWS_TOP_K), metrics }
}

module.exports = { runNewsRagPipeline, runLegalRagPipeline, normalizeQuery }
