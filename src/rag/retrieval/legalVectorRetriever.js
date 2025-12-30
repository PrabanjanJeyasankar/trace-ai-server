const client = require('../../lib/qdrant.client')
const { LEGAL_COLLECTION } = require('../../lib/qdrant.collections')
const { embedText } = require('../../services/embeddings/embeddingClient')
const {
  VECTOR_TOP_K,
  LAW_VECTOR_SIMILARITY_THRESHOLD,
} = require('../../config/rag')

const makeLegalChunkKey = (payload) => {
  const docId = payload?.doc_id || 'unknown-doc'
  const pageNumber =
    typeof payload?.page_number === 'number'
      ? payload.page_number
      : 'unknown-page'
  const chunkIndex =
    typeof payload?.chunk_index === 'number'
      ? payload.chunk_index
      : 'unknown-chunk'
  return `${docId}#p${pageNumber}#c${chunkIndex}`
}

const legalVectorSearch = async (query, topK = VECTOR_TOP_K) => {
  const queryVector = await embedText(query)

  const results = await client.search(LEGAL_COLLECTION, {
    vector: queryVector,
    limit: topK * 2,
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
