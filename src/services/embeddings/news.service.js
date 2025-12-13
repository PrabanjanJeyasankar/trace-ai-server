const { v4: uuidv4 } = require('uuid')
const client = require('../../lib/qdrant.client')
const { NEWS_COLLECTION } = require('../../lib/qdrant.collections')
const EmbeddingService = require('./embedding.service')
const { getSourceScore } = require('../../config/newsSources')
const {
  NEWS_TOP_K,
  NEWS_SEARCH_OVERFETCH_FACTOR,
  NEWS_MIN_SIMILARITY,
  NEWS_SIMILARITY_WEIGHT,
  NEWS_RECENCY_WEIGHT,
  NEWS_SOURCE_WEIGHT,
  NEWS_SECTION_WEIGHT,
  CHUNK_MAX_CHARS,
  CHUNK_OVERLAP_PARAGRAPHS,
  RECENCY_DECAY_DAYS,
} = require('../../config/rag')
const logger = require('../../utils/logger')

class NewsService {
  static chunkText(articleText, articleId, title, url, source, publishedAt) {
    const lines = articleText.split('\n').filter((line) => line.trim())
    const chunks = []
    let currentChunk = []
    let currentChars = 0
    let currentStartLine = 1
    let chunkIndex = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineLength = line.length

      if (
        currentChars + lineLength > CHUNK_MAX_CHARS &&
        currentChunk.length > 0
      ) {
        const chunkText = currentChunk.join('\n')
        const endLine = currentStartLine + currentChunk.length - 1

        chunks.push({
          text: chunkText,
          chunkIndex,
          startLine: currentStartLine,
          endLine,
          articleId,
          title,
          url,
          source,
          publishedAt,
          section: 'body',
        })

        const overlapStart = Math.max(
          0,
          currentChunk.length - CHUNK_OVERLAP_PARAGRAPHS
        )
        currentChunk = currentChunk.slice(overlapStart)
        currentStartLine = currentStartLine + overlapStart
        currentChars = currentChunk.reduce((sum, l) => sum + l.length, 0)
        chunkIndex++
      }

      currentChunk.push(line)
      currentChars += lineLength
    }

    if (currentChunk.length > 0) {
      const chunkText = currentChunk.join('\n')
      const endLine = currentStartLine + currentChunk.length - 1

      chunks.push({
        text: chunkText,
        chunkIndex,
        startLine: currentStartLine,
        endLine,
        articleId,
        title,
        url,
        source,
        publishedAt,
        section: 'body',
      })
    }

    return chunks
  }

  static async indexArticle(article) {
    const chunks = this.chunkText(
      article.content,
      article._id.toString(),
      article.title,
      article.url,
      article.source,
      article.publishedAt
    )

    if (chunks.length === 0) {
      logger.warn(`No chunks created for article: ${article.title}`)
      return 0
    }

    const points = []

    for (const chunk of chunks) {
      const vector = await EmbeddingService.embedText(chunk.text)

      const point = {
        id: uuidv4(),
        vector,
        payload: {
          articleId: chunk.articleId,
          title: chunk.title,
          url: chunk.url,
          source: chunk.source,
          publishedAt: new Date(chunk.publishedAt).getTime(),
          chunkIndex: chunk.chunkIndex,
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          text: chunk.text,
          section: chunk.section,
          sourceScore: getSourceScore(chunk.source),
        },
      }

      points.push(point)
    }

    await client.upsert(NEWS_COLLECTION, {
      wait: true,
      points,
    })

    logger.info(`Indexed ${points.length} chunks for article: ${article.title}`)
    return points.length
  }

  static calculateRecencyScore(publishedTimestamp) {
    const now = Date.now()
    const ageMs = now - publishedTimestamp
    const ageDays = ageMs / (1000 * 60 * 60 * 24)

    if (ageDays < 0) return 1.0

    const decayFactor = Math.exp(-ageDays / RECENCY_DECAY_DAYS)
    return decayFactor
  }

  static calculateSectionBoost(section) {
    if (section === 'headline' || section === 'summary') {
      return 1.2
    }
    return 1.0
  }

  static calculateFinalScore(similarity, publishedAt, sourceScore, section) {
    const recencyScore = this.calculateRecencyScore(publishedAt)
    const sectionBoost = this.calculateSectionBoost(section)

    const finalScore =
      similarity * NEWS_SIMILARITY_WEIGHT +
      recencyScore * NEWS_RECENCY_WEIGHT +
      sourceScore * NEWS_SOURCE_WEIGHT +
      sectionBoost * NEWS_SECTION_WEIGHT

    return finalScore
  }

  static async searchNews(query, limit = NEWS_TOP_K) {
    const queryVector = await EmbeddingService.embedText(query)

    const overfetchLimit = limit * NEWS_SEARCH_OVERFETCH_FACTOR

    const searchResults = await client.search(NEWS_COLLECTION, {
      vector: queryVector,
      limit: overfetchLimit,
      with_payload: true,
    })

    logger.info(
      `News search: query="${query}", raw results=${searchResults.length}`
    )

    const filteredResults = searchResults.filter(
      (item) => item.score >= NEWS_MIN_SIMILARITY
    )

    logger.info(
      `News search: filtered to ${filteredResults.length} results (min similarity: ${NEWS_MIN_SIMILARITY})`
    )

    const scoredResults = filteredResults.map((item) => {
      const { publishedAt, sourceScore, section } = item.payload

      const finalScore = this.calculateFinalScore(
        item.score,
        publishedAt,
        sourceScore,
        section
      )

      return {
        ...item,
        finalScore,
      }
    })

    scoredResults.sort((a, b) => b.finalScore - a.finalScore)

    const topResults = scoredResults.slice(0, limit)

    logger.info(
      `News search: returning top ${
        topResults.length
      } results with scores: ${topResults
        .map((r) => r.finalScore.toFixed(3))
        .join(', ')}`
    )

    return topResults
  }
}

module.exports = NewsService
