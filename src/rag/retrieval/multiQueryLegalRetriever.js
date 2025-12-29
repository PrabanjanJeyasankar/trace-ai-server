const { legalVectorSearch } = require('./legalVectorRetriever')
const { legalKeywordSearch } = require('./legalKeywordRetriever')
const { reciprocalRankFusion } = require('../scoring/reciprocalRankFusion')
const {
  normalizeLegalQuery,
  extractKeyEntities,
} = require('../preprocessing/queryNormalizer')
const { HYBRID_CANDIDATES } = require('../../config/rag')

const multiQueryLegalRetrieve = async (query) => {
  const queries = {
    original: query,
    normalized: normalizeLegalQuery(query),
    entityBased: extractKeyEntities(query),
  }

  const [originalVector, normalizedVector, entityVector, keywordResults] =
    await Promise.all([
      legalVectorSearch(queries.original),
      legalVectorSearch(queries.normalized),
      legalVectorSearch(queries.entityBased),
      Promise.resolve(legalKeywordSearch(query)),
    ])

  const vectorResults = [
    ...originalVector,
    ...normalizedVector,
    ...entityVector,
  ]

  const fusedScores = reciprocalRankFusion([
    originalVector,
    normalizedVector,
    entityVector,
    keywordResults,
  ])

  const byKey = new Map()

  for (const r of vectorResults) {
    if (!byKey.has(r.key)) {
      byKey.set(r.key, {
        key: r.key,
        text: r.text,
        payload: r.payload,
        vectorScore: r.vectorScore,
        keywordScore: undefined,
        rrfScore: fusedScores.get(r.key) || 0,
        queryMatches: {
          original: originalVector.some((v) => v.key === r.key),
          normalized: normalizedVector.some((v) => v.key === r.key),
          entity: entityVector.some((v) => v.key === r.key),
        },
      })
    }
  }

  for (const r of keywordResults) {
    const existing = byKey.get(r.key)
    if (existing) {
      existing.keywordScore = r.keywordScore
      existing.rrfScore = fusedScores.get(r.key) || existing.rrfScore
    } else {
      byKey.set(r.key, {
        key: r.key,
        text: r.text,
        payload: r.payload,
        vectorScore: undefined,
        keywordScore: r.keywordScore,
        rrfScore: fusedScores.get(r.key) || 0,
        queryMatches: {
          original: false,
          normalized: false,
          entity: false,
        },
      })
    }
  }

  const merged = [...byKey.values()]

  merged.sort((a, b) => {
    if (b.rrfScore !== a.rrfScore) {
      return b.rrfScore - a.rrfScore
    }
    const aMatches = Object.values(a.queryMatches).filter(Boolean).length
    const bMatches = Object.values(b.queryMatches).filter(Boolean).length
    return bMatches - aMatches
  })

  return merged.slice(0, HYBRID_CANDIDATES)
}

module.exports = { multiQueryLegalRetrieve }
