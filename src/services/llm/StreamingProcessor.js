const providerResolver = require('./ProviderResolver')
const inputValidator = require('./InputValidator')
const messageConverter = require('./MessageConverter')
const modelFactory = require('./ModelFactory')
const tokenTrackingService = require('./TokenTrackingService')

class StreamingProcessor {
  async process(config) {
    const {
      messages,
      isFirstMessage,
      userId,
      chatId,
      messageId,
      requestId,
      mode,
      onChunk,
      onComplete,
      onError,
    } = config

    const startTime = Date.now()

    try {
      inputValidator.validateMessages(messages)
      inputValidator.validateStreamingCallbacks({
        onChunk,
        onComplete,
        onError,
      })

      const providerInfo = providerResolver.resolve()
      const model = modelFactory.createModel(providerInfo)
      const langChainMessages = messageConverter.toLangChain(messages)

      const { assistantReply, chunkCount } = await this._streamResponse(
        model,
        langChainMessages,
        onChunk
      )

      const durationMs = Date.now() - startTime

      const autoTitle = isFirstMessage
        ? await this._generateTitle(
            messages,
            userId,
            chatId,
            messageId,
            requestId,
            mode,
            providerInfo
          )
        : null

      const tokenUsage = await tokenTrackingService.trackUsage({
        userId,
        chatId,
        messageId,
        requestId,
        provider: providerInfo.name,
        model: providerInfo.model,
        operation: 'chat',
        inputTokens: tokenTrackingService.calculateInputTokens(
          messages,
          providerInfo.name
        ),
        outputTokens: tokenTrackingService.estimateTokens(
          assistantReply,
          providerInfo.name
        ),
        metadata: {
          streaming: true,
          durationMs,
          chunksCount: chunkCount,
          mode,
        },
      })

      const result = {
        type: 'complete',
        assistantReply: assistantReply.trim(),
        title: autoTitle?.title || null,
        totalChunks: chunkCount,
        tokenUsage: {
          provider: providerInfo.name,
          model: providerInfo.model,
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
          totalTokens: tokenUsage.inputTokens + tokenUsage.outputTokens,
          cost: tokenUsage.cost,
          titleTokenUsage: autoTitle?.tokenUsage,
        },
        timestamp: new Date().toISOString(),
      }

      onComplete(result)

      return {
        assistantReply: result.assistantReply,
        title: result.title,
        totalChunks: chunkCount,
        tokenUsage: result.tokenUsage,
        durationMs,
      }
    } catch (error) {
      onError({
        type: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      })

      throw error
    }
  }

  async _streamResponse(model, langChainMessages, onChunk) {
    let assistantReply = ''
    let chunkCount = 0

    const stream = await model.stream(langChainMessages)

    for await (const chunk of stream) {
      const content = chunk.content || ''

      if (content) {
        assistantReply += content
        chunkCount++

        onChunk({
          type: 'chunk',
          content,
          fullContent: assistantReply,
          chunkIndex: chunkCount,
          timestamp: new Date().toISOString(),
        })
      }
    }

    return { assistantReply, chunkCount }
  }

  async _generateTitle(
    messages,
    userId,
    chatId,
    messageId,
    requestId,
    mode,
    providerInfo
  ) {
    try {
      const lastUserMessage =
        [...messages].reverse().find((m) => m.role === 'user') ||
        messages[messages.length - 1]

      const titleMessages = this._createTitlePrompt(
        lastUserMessage?.content || ''
      )
      const titleLangChainMessages = messageConverter.toLangChain(titleMessages)

      const titleModel = modelFactory.createModel(providerInfo)
      const titleResponse = await titleModel.invoke(titleLangChainMessages)
      const rawTitle = titleResponse.content || ''

      const title = rawTitle.replace(/["']/g, '').trim().slice(0, 80)

      const tokenUsage = await tokenTrackingService.trackUsage({
        userId,
        chatId,
        messageId,
        requestId,
        provider: providerInfo.name,
        model: providerInfo.model,
        operation: 'title_generation',
        inputTokens: tokenTrackingService.calculateInputTokens(
          titleMessages,
          providerInfo.name
        ),
        outputTokens: tokenTrackingService.estimateTokens(
          rawTitle,
          providerInfo.name
        ),
        metadata: {
          streaming: false,
          mode,
        },
      })

      return {
        title,
        tokenUsage: {
          inputTokens: tokenUsage.inputTokens,
          outputTokens: tokenUsage.outputTokens,
        },
      }
    } catch (error) {
      return null
    }
  }

  _createTitlePrompt(message) {
    return [
      {
        role: 'user',
        content:
          "Generate a short factual title summarizing the user's message. Strict rules: 1) Maximum 4 words, 2) No poetic or motivational phrases, 3) No punctuation, 4) Must directly reflect message topic, 5) Output only the title.",
      },
      { role: 'user', content: message },
    ]
  }
}

module.exports = new StreamingProcessor()
