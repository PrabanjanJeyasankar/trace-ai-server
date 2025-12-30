const Parser = require('rss-parser')
const axios = require('axios')
const cheerio = require('cheerio')
const NewsArticle = require('../models/NewsArticle')
const NewsService = require('./embeddings/news.service')
const { RSS_FEEDS } = require('../config/newsFeeds')
const logger = require('../utils/logger')

const rssParser = new Parser({
  timeout: 10000,
  customFields: {
    item: ['pubDate', 'published', 'updated'],
  },
})

class NewsIngestService {
  static async fetchArticleContent(url) {
    try {
      const response = await axios.get(url, {
        timeout: 15000,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
      })

      const $ = cheerio.load(response.data)

      $('script, style, nav, header, footer, aside, iframe, noscript').remove()

      const articleSelectors = [
        'article',
        '[role="main"]',
        '.article-body',
        '.post-content',
        '.entry-content',
        'main',
      ]

      let content = ''

      for (const selector of articleSelectors) {
        const element = $(selector).first()
        if (element.length) {
          content = element.text()
          break
        }
      }

      if (!content) {
        content = $('body').text()
      }

      content = content.replace(/\s+/g, ' ').trim()

      if (content.length < 100) {
        return null
      }

      return content
    } catch (error) {
      logger.warn(
        `Failed to fetch article content from ${url}: ${error.message}`
      )
      return null
    }
  }

  static parseDate(dateString) {
    if (!dateString) return new Date()

    const date = new Date(dateString)
    if (isNaN(date.getTime())) {
      return new Date()
    }
    return date
  }

  static async ingestFromRSS(feedUrl, source) {
    try {
      logger.info(`Fetching RSS feed: ${feedUrl}`)

      const feed = await rssParser.parseURL(feedUrl)

      const ingestedArticles = []

      for (const item of feed.items) {
        const url = item.link
        const title = item.title
        const pubDate = item.pubDate || item.published || item.updated

        if (!url || !title) {
          logger.warn('Skipping RSS item without URL or title')
          continue
        }

        const existingArticle = await NewsArticle.findOne({ url })
        if (existingArticle) {
          // logger.info(`Article already exists: ${title}`)
          continue
        }

        let content = item.contentSnippet || item.description || ''

        const fetchedContent = await this.fetchArticleContent(url)
        if (fetchedContent) {
          content = fetchedContent
        }

        if (content.length < 100) {
          logger.warn(`Article too short, skipping: ${title}`)
          continue
        }

        const publishedAt = this.parseDate(pubDate)

        const article = await NewsArticle.create({
          url,
          title,
          source,
          publishedAt,
          content,
          summary: item.contentSnippet || '',
        })

        await NewsService.indexArticle(article)

        ingestedArticles.push(article)
        logger.info(`Ingested and indexed: ${title}`)
      }

      return ingestedArticles
    } catch (error) {
      logger.error(`Failed to ingest RSS feed ${feedUrl}: ${error.message}`)
      throw error
    }
  }

  static async ingestAll() {
    const results = {
      total: 0,
      successful: 0,
      failed: 0,
      articles: [],
    }

    for (const feed of RSS_FEEDS) {
      try {
        const articles = await this.ingestFromRSS(feed.url, feed.source)
        results.articles.push(...articles)
        results.successful += articles.length
        results.total += articles.length
      } catch (error) {
        results.failed++
        logger.error(`Failed to ingest feed ${feed.source}: ${error.message}`)
      }
    }

    logger.info(
      `Ingestion complete: ${results.successful} successful, ${results.failed} failed feeds`
    )

    return results
  }
}

module.exports = NewsIngestService
