const client = require('../../lib/qdrant.client')
const { LEGAL_COLLECTION } = require('../../lib/qdrant.collections')
const EmbeddingService = require('../../services/embeddings/embedding.service')
const { VECTOR_TOP_K } = require('../../config/rag')

const makeLegalChunkKey = (payload) => {
  return `${payload.doc_id}#${payload.chunk_index}`
}

const legalVectorSearch = async (query, topK = VECTOR_TOP_K) => {
  const queryVector = await EmbeddingService.embedText(query)

  const results = await client.search(LEGAL_COLLECTION, {
    vector: queryVector,
    limit: topK,
    with_payload: true,
  })

  return (results || []).map((r) => ({
    key: makeLegalChunkKey(r.payload),
    text: r.payload?.text || '',
    payload: r.payload,
    vectorScore: r.score,
  }))
}

module.exports = { legalVectorSearch, makeLegalChunkKey }
