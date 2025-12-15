const NewsIngestService = require('./news.ingest.service')
const NewsService = require('./embeddings/news.service')
const logger = require('../utils/logger')
const axios = require('axios')
const config = require('../config')

class CronService {
  static newsIngestInterval = null
  static keepAliveInterval = null

  static startDailyNewsIngestion() {
    const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

    logger.info('Starting daily news ingestion cron job')

    this.newsIngestInterval = setInterval(async () => {
      try {
        logger.info('Running scheduled news ingestion...')
        const results = await NewsIngestService.ingestAll()
        logger.info(
          `Scheduled ingestion complete: ${results.successful} articles ingested`
        )
      } catch (error) {
        logger.error(`Scheduled news ingestion failed: ${error.message}`)
      }
    }, TWENTY_FOUR_HOURS)

    this.runInitialIngestion()
  }

  static async runInitialIngestion() {
    try {
      logger.info('Running initial news ingestion on startup...')
      await NewsService.warmupKeywordIndexFromMongo().catch((err) => {
        logger.warn(`Keyword index warmup failed: ${err.message}`)
      })
      const results = await NewsIngestService.ingestAll()
      logger.info(
        `Initial ingestion complete: ${results.successful} articles ingested`
      )
    } catch (error) {
      logger.error(`Initial news ingestion failed: ${error.message}`)
    }
  }

  static stopDailyNewsIngestion() {
    if (this.newsIngestInterval) {
      clearInterval(this.newsIngestInterval)
      this.newsIngestInterval = null
      logger.info('Daily news ingestion cron job stopped')
    }
  }

  /**
   * Keeps the server awake by pinging itself every 10 minutes
   * This prevents cold starts on platforms like Render's free tier
   * which spin down services after 15 minutes of inactivity
   */
  static startKeepAlive() {
    if (config.server.env !== 'production') {
      logger.info('Keep-alive disabled in non-production environment')
      return
    }

    const TEN_MINUTES = 10 * 60 * 1000
    const serviceUrl = process.env.SERVICE_URL

    if (!serviceUrl) {
      logger.warn('SERVICE_URL not configured - keep-alive disabled')
      return
    }

    logger.info(
      `Starting keep-alive cron job (pinging ${serviceUrl} every 10 minutes)`
    )

    this.keepAliveInterval = setInterval(async () => {
      try {
        const response = await axios.get(`${serviceUrl}/health`, {
          timeout: 5000,
        })
        logger.debug(`Keep-alive ping successful: ${response.status}`)
      } catch (error) {
        logger.warn(`Keep-alive ping failed: ${error.message}`)
      }
    }, TEN_MINUTES)
  }

  static stopKeepAlive() {
    if (this.keepAliveInterval) {
      clearInterval(this.keepAliveInterval)
      this.keepAliveInterval = null
      logger.info('Keep-alive cron job stopped')
    }
  }
}

module.exports = CronService
