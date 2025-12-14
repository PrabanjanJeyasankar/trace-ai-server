const NewsIngestService = require('../services/news.ingest.service')
const NewsService = require('../services/embeddings/news.service')
const { successResponse } = require('../utils/response')
const logger = require('../utils/logger')

const ingestNews = async (request, response) => {
  logger.info('Starting news ingestion...')

  const results = await NewsIngestService.ingestAll()

  return successResponse(response, {
    message: 'News ingestion completed',
    data: {
      totalArticles: results.total,
      successful: results.successful,
      failedFeeds: results.failed,
      articles: results.articles.map((a) => ({
        title: a.title,
        source: a.source,
        url: a.url,
        publishedAt: a.publishedAt,
      })),
    },
  })
}

const searchNews = async (request, response) => {
  const { query, limit } = request.query

  if (!query) {
    return response.status(400).json({ error: 'Query parameter is required' })
  }

  const parsedLimit = limit ? parseInt(limit, 10) : undefined

  const results = await NewsService.searchNews(query, parsedLimit)

  return successResponse(response, {
    message: 'News search completed',
    data: {
      query,
      resultsCount: results.length,
      results: results.map((r) => ({
        title: r.payload.title,
        source: r.payload.source,
        url: r.payload.url,
        lines: `${r.payload.startLine}-${r.payload.endLine}`,
        similarity: r.score.toFixed(3),
        finalScore: r.finalScore.toFixed(3),
        publishedAt: new Date(r.payload.publishedAt).toISOString(),
        text: r.payload.text.substring(0, 200) + '...',
      })),
    },
  })
}

module.exports = {
  ingestNews,
  searchNews,
}
