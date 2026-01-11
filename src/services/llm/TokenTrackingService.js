const {
  tokenTracker,
  createTokenEstimator,
  calculateCost,
} = require('../tokenUsage')

class TokenTrackingService {
  async trackUsage(trackingData) {
    const {
      userId,
      chatId,
      messageId,
      requestId,
      provider,
      model,
      operation,
      inputTokens,
      outputTokens,
      metadata,
    } = trackingData

    await tokenTracker.track({
      userId,
      chatId,
      messageId,
      requestId,
      provider,
      model,
      operation,
      inputTokens,
      outputTokens,
      metadata,
    })

    const cost = calculateCost(provider, model, inputTokens, outputTokens)

    return {
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cost,
      provider,
      model,
    }
  }

  estimateTokens(text, provider) {
    const estimator = createTokenEstimator(provider)
    return estimator.estimate(text)
  }

  calculateInputTokens(messages, provider) {
    const totalText = messages.map((m) => m.content || '').join('\n')
    return this.estimateTokens(totalText, provider)
  }
}

module.exports = new TokenTrackingService()
