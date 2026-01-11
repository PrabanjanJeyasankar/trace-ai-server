const TokenUsage = require('../../models/TokenUsage')
const { createTokenEstimator } = require('./estimators')
const { calculateCost } = require('./pricing')

class TokenTracker {
  constructor() {
    this.pendingRecords = []
    this.batchSize = 10
    this.flushIntervalMs = 5000
    this.flushTimer = null
    this.startAutoFlush()
  }

  startAutoFlush() {
    if (this.flushTimer) return

    this.flushTimer = setInterval(() => {
      this.flush().catch(() => {})
    }, this.flushIntervalMs)

    if (this.flushTimer.unref) {
      this.flushTimer.unref()
    }
  }

  stopAutoFlush() {
    if (this.flushTimer) {
      clearInterval(this.flushTimer)
      this.flushTimer = null
    }
  }

  async track(params) {
    const {
      userId,
      chatId,
      messageId,
      requestId,
      provider,
      model,
      operation = 'chat',
      messages = [],
      outputText = '',
      inputTokens: providedInputTokens,
      outputTokens: providedOutputTokens,
      streaming = false,
      durationMs,
      chunksCount,
      mode,
    } = params

    const estimator = createTokenEstimator(provider)

    const inputTokens =
      providedInputTokens ?? estimator.estimateMessages(messages)
    const outputTokens = providedOutputTokens ?? estimator.estimate(outputText)
    const totalTokens = inputTokens + outputTokens

    const cost = calculateCost(provider, model, inputTokens, outputTokens)

    const record = {
      userId,
      chatId,
      messageId,
      requestId,
      provider,
      model,
      operation,
      tokens: {
        input: inputTokens,
        output: outputTokens,
        total: totalTokens,
      },
      cost,
      metadata: {
        streaming,
        durationMs,
        chunksCount,
        mode,
      },
    }

    this.pendingRecords.push(record)

    if (this.pendingRecords.length >= this.batchSize) {
      await this.flush()
    }

    return {
      inputTokens,
      outputTokens,
      totalTokens,
      cost,
      provider,
      model,
    }
  }

  async flush() {
    if (this.pendingRecords.length === 0) return

    const records = [...this.pendingRecords]
    this.pendingRecords = []

    try {
      await TokenUsage.insertMany(records, { ordered: false })
    } catch (error) {
      this.pendingRecords.push(...records)
    }
  }

  async trackSync(params) {
    const result = await this.track(params)

    const record = this.pendingRecords.pop()
    if (record) {
      try {
        await TokenUsage.create(record)
      } catch (error) {
        this.pendingRecords.push(record)
      }
    }

    return result
  }

  async getUserUsage(userId, options = {}) {
    return TokenUsage.getUserTotalUsage(userId, options)
  }

  async getUserUsageByDateRange(userId, startDate, endDate) {
    return TokenUsage.getUsageByDateRange(userId, startDate, endDate)
  }

  async getRecentUsage(userId, limit = 50) {
    return TokenUsage.find({ userId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean()
  }
}

const tokenTracker = new TokenTracker()

module.exports = {
  TokenTracker,
  tokenTracker,
}
