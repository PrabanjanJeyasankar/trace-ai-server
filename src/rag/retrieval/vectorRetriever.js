const client = require('../../lib/qdrant.client')
const { NEWS_COLLECTION } = require('../../lib/qdrant.collections')
const { embedText } = require('../../services/embeddings/embeddingClient')
const {
  VECTOR_TOP_K,
  VECTOR_SIMILARITY_THRESHOLD,
} = require('../../config/rag')

const makeChunkKey = (payload) => {
  return `${payload.url}#${payload.chunkIndex}`
}

const vectorSearch = async (query, topK = VECTOR_TOP_K) => {
  const queryVector = await embedText(query)

  const results = await client.search(NEWS_COLLECTION, {
    vector: queryVector,
    limit: topK * 2,
    with_payload: true,
  })

  return (results || []).map((r) => ({
    key: makeChunkKey(r.payload),
    text: r.payload?.text || '',
    payload: r.payload,
    vectorScore: r.score,
  }))
}

module.exports = { vectorSearch, makeChunkKey }
