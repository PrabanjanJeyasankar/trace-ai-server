const providerResolver = require('./ProviderResolver')
const inputValidator = require('./InputValidator')
const messageConverter = require('./MessageConverter')
const modelFactory = require('./ModelFactory')
const tokenTrackingService = require('./TokenTrackingService')

class StructuredOutputProcessor {
  async process(config) {
    const {
      messages,
      schema,
      userId,
      chatId,
      requestId,
      mode,
      onComplete,
      onError,
    } = config

    const startTime = Date.now()

    try {
      inputValidator.validateMessages(messages)

      const providerInfo = providerResolver.resolve()
      const model = modelFactory.createModel(providerInfo, {
        structuredOutput: true,
        schema,
      })
      const langChainMessages = messageConverter.toLangChain(messages)

      const response = await model.invoke(langChainMessages)

      const structuredData =
        typeof response === 'string' ? JSON.parse(response) : response

      const durationMs = Date.now() - startTime

      const tokenUsage = await tokenTrackingService.trackUsage({
        userId,
        chatId,
        requestId,
        provider: providerInfo.name,
        model: providerInfo.model,
        operation: 'structured_output',
        inputTokens: tokenTrackingService.calculateInputTokens(
          messages,
          providerInfo.name
        ),
        outputTokens: tokenTrackingService.estimateTokens(
          JSON.stringify(structuredData),
          providerInfo.name
        ),
        metadata: {
          streaming: false,
          durationMs,
          mode,
        },
      })

      const result = {
        structuredData,
        tokenUsage: {
          provider: providerInfo.name,
          model: providerInfo.model,
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
          totalTokens: tokenUsage.inputTokens + tokenUsage.outputTokens,
          cost: tokenUsage.cost,
        },
      }

      if (onComplete) {
        onComplete({
          type: 'complete',
          ...result,
          timestamp: new Date().toISOString(),
        })
      }

      return result
    } catch (error) {
      if (onError) {
        onError({
          type: 'error',
          error: error.message,
          timestamp: new Date().toISOString(),
        })
      }

      throw error
    }
  }
}

module.exports = new StructuredOutputProcessor()
