const { tokenize, normalizeText } = require('../retrieval/keywordRetriever')

const normalizeLegalQuery = (query) => {
  // Use BM25 tokenization (removes stopwords, normalizes)
  const tokens = tokenize(query)

  // Join tokens back into normalized query
  return tokens.join(' ')
}

const extractKeyEntities = (query) => {
  let entityQuery = String(query || '').trim()

  const datePattern = /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b|\b\d{4}\b/g
  const dates = entityQuery.match(datePattern) || []

  const sectionPattern = /section\s+\d+[A-Z]?/gi
  const sections = entityQuery.match(sectionPattern) || []

  const caseNamePattern = /[A-Z][a-z]+\s+(?:v\.?|vs\.?)\s+[A-Z][a-z]+/g
  const caseNames = entityQuery.match(caseNamePattern) || []

  const courtPattern = /(?:supreme|high|district)\s+court/gi
  const courts = entityQuery.match(courtPattern) || []

  const entities = [...dates, ...sections, ...caseNames, ...courts]

  return entities.length > 0 ? entities.join(' ') : entityQuery
}

module.exports = {
  normalizeLegalQuery,
  extractKeyEntities,
}
