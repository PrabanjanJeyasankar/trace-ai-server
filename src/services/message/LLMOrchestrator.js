const { processLLM, processLLMStreaming } = require('../llm.service')
const {
  buildMemoryContext,
  buildNewsContext,
  buildLegalContext,
} = require('./context.builder')
const {
  buildNewsMessageSources,
  buildLegalMessageSources,
} = require('./source.builder')
const { enrichCitationsWithUrls } = require('./citation.enricher')
const { emitProgress } = require('./progress.helper')

class LLMOrchestrator {
  async execute(config) {
    const {
      chat,
      userMessage,
      memory,
      ragResults,
      streaming,
      wideEvent,
      onProgress,
      onLLMChunk,
      onLLMComplete,
      onLLMError,
    } = config

    const { newsResults, newsAbortMessage, legalResults, legalAbortMessage } =
      ragResults

    if (chat.mode === 'news' && newsAbortMessage) {
      return {
        assistantReply: newsAbortMessage,
        title: null,
        sources: [],
        metrics: { durationMs: 0, chunksStreamed: 0, isStreaming: false },
      }
    }

    if (chat.mode === 'law' && legalAbortMessage) {
      return {
        assistantReply: legalAbortMessage,
        title: null,
        sources: [],
        metrics: { durationMs: 0, chunksStreamed: 0, isStreaming: false },
      }
    }

    const systemContent = this._buildSystemContext(
      chat.mode,
      memory,
      newsResults,
      legalResults
    )

    const userContent = this._prepareUserContent(
      chat.mode,
      userMessage.versions[0].content
    )

    const llmMessages = [
      ...(systemContent ? [{ role: 'system', content: systemContent }] : []),
      { role: 'user', content: userContent },
    ]

    emitProgress(onProgress, 'llm_generation', 'generating', {
      model: chat.model,
    })

    const startTime = Date.now()

    if (streaming) {
      return this._executeStreaming({
        chat,
        userMessage,
        llmMessages,
        newsResults,
        legalResults,
        wideEvent,
        startTime,
        onProgress,
        onLLMChunk,
        onLLMComplete,
        onLLMError,
      })
    }

    return this._executeNonStreaming({
      chat,
      userMessage,
      llmMessages,
      newsResults,
      legalResults,
      wideEvent,
      startTime,
      onProgress,
    })
  }

  async _executeStreaming(config) {
    const {
      chat,
      userMessage,
      llmMessages,
      newsResults,
      legalResults,
      wideEvent,
      startTime,
      onProgress,
      onLLMChunk,
      onLLMComplete,
      onLLMError,
    } = config

    let streamingAssistantMessage = null
    let currentContent = ''
    let saveTimeout = null
    let isSaving = false
    let messageCreationPromise = null
    let chunksStreamed = 0

    const debouncedSave = this._createDebouncedSave(() => ({
      message: streamingAssistantMessage,
      content: currentContent,
      isSaving,
      setIsSaving: (val) => (isSaving = val),
    }))

    const llmOut = await processLLMStreaming({
      messages: llmMessages,
      isFirstMessage: chat.messages?.length === 0,
      userId: chat.userId,
      chatId: chat._id,
      messageId: userMessage._id,
      requestId: wideEvent?.requestId,
      mode: chat.mode,
      onChunk: (chunkData) => {
        currentContent = chunkData.fullContent
        chunksStreamed++

        if (!streamingAssistantMessage && !messageCreationPromise) {
          messageCreationPromise = this._createStreamingMessage(
            chat,
            currentContent,
            onLLMChunk,
            chunkData
          ).then((msg) => {
            streamingAssistantMessage = msg
            return msg
          })
        } else if (streamingAssistantMessage) {
          streamingAssistantMessage.versions[0].content = currentContent
          debouncedSave()

          if (onLLMChunk) {
            onLLMChunk({
              ...chunkData,
              messageId: streamingAssistantMessage._id,
            })
          }
        }
      },
      onComplete: async (completeData) => {
        const result = await this._handleStreamingComplete({
          completeData,
          chat,
          newsResults,
          legalResults,
          streamingAssistantMessage,
          messageCreationPromise,
          saveTimeout,
          wideEvent,
          onLLMComplete,
        })

        streamingAssistantMessage = result.message
      },
      onError: (errorData) => {
        if (onLLMError) onLLMError(errorData)
      },
    })

    if (saveTimeout) clearTimeout(saveTimeout)

    emitProgress(onProgress, 'llm_generation', 'completed', {
      model: chat.model,
      streaming: true,
    })

    const sources = this._buildMessageSources(
      chat.mode,
      newsResults,
      legalResults
    )

    return {
      assistantReply: llmOut.assistantReply,
      title: llmOut.title,
      sources,
      streamingMessage: streamingAssistantMessage,
      metrics: {
        durationMs: Date.now() - startTime,
        chunksStreamed,
        isStreaming: true,
      },
    }
  }

  async _executeNonStreaming(config) {
    const {
      chat,
      userMessage,
      llmMessages,
      newsResults,
      legalResults,
      wideEvent,
      startTime,
      onProgress,
    } = config

    const llmOut = await processLLM({
      messages: llmMessages,
      isFirstMessage: chat.messages?.length === 0,
      userId: chat.userId,
      chatId: chat._id,
      messageId: userMessage._id,
      requestId: wideEvent?.requestId,
      mode: chat.mode,
    })

    if (wideEvent && llmOut.tokenUsage) {
      wideEvent.addTokenUsage(llmOut.tokenUsage)
    }

    emitProgress(onProgress, 'llm_generation', 'completed', {
      model: chat.model,
      streaming: false,
    })

    const sources = this._buildMessageSources(
      chat.mode,
      newsResults,
      legalResults
    )

    let enrichedReply = llmOut.assistantReply

    if (enrichedReply && sources.length > 0) {
      enrichedReply = enrichCitationsWithUrls(enrichedReply, sources, chat.mode)
    }

    return {
      assistantReply: enrichedReply,
      title: llmOut.title,
      sources,
      streamingMessage: null,
      metrics: {
        durationMs: Date.now() - startTime,
        chunksStreamed: 0,
        isStreaming: false,
      },
    }
  }

  _buildSystemContext(mode, memory, newsResults, legalResults) {
    const memoryContext = buildMemoryContext(memory)
    const newsContext = buildNewsContext(newsResults)
    const legalContext = buildLegalContext(legalResults)

    const contextParts =
      mode === 'news'
        ? [newsContext]
        : mode === 'law'
        ? [legalContext]
        : [memoryContext, newsContext]

    return contextParts.filter((s) => s.trim()).join('\n\n')
  }

  _prepareUserContent(mode, content) {
    if (mode === 'news') {
      return `${content}\n\n(Remember: Cite EVERY statement with [1], [2], [3] from the NEWS SOURCES above. Do not use your training data.)`
    }
    return content
  }

  _buildMessageSources(mode, newsResults, legalResults) {
    if (mode === 'news' && newsResults.length > 0) {
      return buildNewsMessageSources(newsResults)
    }
    if (mode === 'law' && legalResults.length > 0) {
      return buildLegalMessageSources(legalResults)
    }
    return []
  }

  _createDebouncedSave(getState) {
    let saveTimeout = null

    return () => {
      if (saveTimeout) clearTimeout(saveTimeout)

      saveTimeout = setTimeout(async () => {
        const state = getState()
        if (state.message && !state.isSaving) {
          state.setIsSaving(true)
          try {
            state.message.versions[0].content = state.content
            await state.message.save()
          } finally {
            state.setIsSaving(false)
          }
        }
      }, 100)
    }
  }

  async _createStreamingMessage(chat, content, onLLMChunk, chunkData) {
    const Message = require('../../models/Message')

    const msg = await Message.create({
      chatId: chat._id,
      userId: null,
      role: 'assistant',
      mode: chat.mode,
      versions: [{ content, model: chat.model }],
      currentVersionIndex: 0,
      sources: [],
    })

    if (onLLMChunk) {
      onLLMChunk({
        ...chunkData,
        messageId: msg._id,
      })
    }

    return msg
  }

  async _handleStreamingComplete(config) {
    const {
      completeData,
      chat,
      newsResults,
      legalResults,
      streamingAssistantMessage,
      messageCreationPromise,
      saveTimeout,
      wideEvent,
      onLLMComplete,
    } = config

    let { assistantReply, title } = completeData

    if (saveTimeout) clearTimeout(saveTimeout)

    if (messageCreationPromise && !streamingAssistantMessage) {
      streamingAssistantMessage = await messageCreationPromise
    }

    const messageSources = this._buildMessageSources(
      chat.mode,
      newsResults,
      legalResults
    )

    if (assistantReply && messageSources.length > 0) {
      assistantReply = enrichCitationsWithUrls(
        assistantReply,
        messageSources,
        chat.mode
      )
    }

    if (streamingAssistantMessage) {
      const Message = require('../../models/Message')
      await Message.findByIdAndUpdate(
        streamingAssistantMessage._id,
        {
          $set: {
            'versions.0.content': assistantReply,
            sources: messageSources,
          },
        },
        { new: true }
      )
    }

    if (wideEvent && completeData.tokenUsage) {
      wideEvent.addTokenUsage(completeData.tokenUsage)
    }

    if (onLLMComplete) {
      onLLMComplete({
        ...completeData,
        messageId: streamingAssistantMessage?._id,
        sources: messageSources,
        assistantReply,
      })
    }

    return {
      message: streamingAssistantMessage,
      assistantReply,
      title,
    }
  }
}

module.exports = new LLMOrchestrator()
