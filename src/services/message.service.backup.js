const Chat = require('../models/Chat')
const Message = require('../models/Message')
const { ApiError } = require('../utils/ApiError')
const { processLLM, processLLMStreaming } = require('./llm.service')
const chatService = require('./chat.service')
const memoryService = require('./embeddings/memory.service')
const chatHistoryCache = require('../cache/chatHistoryCache')
const {
  runNewsRagPipeline,
  runLegalRagPipeline,
} = require('../rag/pipeline/ragPipeline')
const {
  buildMemoryContext,
  buildNewsContext,
  buildLegalContext,
} = require('./message/context.builder')
const {
  buildNewsMessageSources,
  buildLegalMessageSources,
} = require('./message/source.builder')
const { emitProgress } = require('./message/progress.helper')
const { enrichCitationsWithUrls } = require('./message/citation.enricher')

const getLatestVersionContent = (message) =>
  message.versions[message.currentVersionIndex].content

const buildSystemContext = (mode, memory, newsResults, legalResults) => {
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

const buildMessageSources = (mode, newsResults, legalResults) => {
  if (mode === 'news' && newsResults.length > 0) {
    return buildNewsMessageSources(newsResults)
  }
  if (mode === 'law' && legalResults.length > 0) {
    return buildLegalMessageSources(legalResults)
  }
  return []
}

const createMessage = async ({
  chatId,
  userId,
  content,
  mode,
  streaming = true,
  onProgress,
  onLLMChunk,
  onLLMComplete,
  onLLMError,
  wideEvent,
}) => {
  const serviceMetrics = {
    llmStartTime: null,
    llmDurationMs: null,
    ragMetrics: null,
    memoryMetrics: null,
    chunksStreamed: 0,
  }

  emitProgress(onProgress, 'chat_setup', 'initializing')

  let chat = null
  let isFirstMessage = false

  if (!chatId) {
    emitProgress(onProgress, 'chat_setup', 'creating_new_chat')
    chat = await chatService.createChat({
      userId,
      firstMessageContent: content,
      mode,
    })
    chatId = chat._id
    isFirstMessage = true
  } else {
    emitProgress(onProgress, 'chat_setup', 'loading_existing_chat')
    chat = await Chat.findById(chatId)
    if (!chat) throw new ApiError(404, 'Chat not found')

    if (mode && mode !== chat.mode) {
      chat.mode = mode
      await chat.save()
    }
  }

  emitProgress(onProgress, 'chat_setup', 'completed', { chatId })
  emitProgress(onProgress, 'user_message', 'creating')

  const userMessage = await Message.create({
    chatId,
    userId,
    role: 'user',
    mode: chat.mode,
    versions: [{ content }],
    currentVersionIndex: 0,
  })

  emitProgress(onProgress, 'user_message', 'completed', {
    messageId: userMessage._id,
  })

  emitProgress(onProgress, 'memory_vector', 'processing')

  await memoryService.saveMessageVector({
    userId,
    chatId,
    messageId: userMessage._id,
    role: 'user',
    content,
  })

  emitProgress(onProgress, 'memory_vector', 'completed')

  let memory = []
  const memoryStartTime = Date.now()

  if (!isFirstMessage && chat.mode !== 'news' && chat.mode !== 'law') {
    emitProgress(onProgress, 'memory_recall', 'searching')

    memory = await memoryService.searchRelevant({
      userId,
      chatId,
      content,
      limit: 5,
      minScore: 0.35,
    })

    serviceMetrics.memoryMetrics = {
      searched: true,
      resultsCount: memory.length,
      durationMs: Date.now() - memoryStartTime,
    }

    if (memory.length > 0) {
      emitProgress(onProgress, 'memory_recall', 'found', {
        count: memory.length,
      })
    } else {
      emitProgress(onProgress, 'memory_recall', 'none_found')
    }
  } else {
    serviceMetrics.memoryMetrics = {
      searched: false,
      resultsCount: 0,
      durationMs: 0,
    }
  }

  let newsResults = []
  let newsAbortMessage = null
  let legalResults = []
  let legalAbortMessage = null
  let chainOfThoughts = null

  if (chat.mode === 'news') {
    emitProgress(onProgress, 'rag_pipeline', 'starting', {
      source: 'news articles',
    })

    const ragResult = await runNewsRagPipeline({
      query: content,
      onProgress: (stage, data) => emitProgress(onProgress, stage, data),
    })

    serviceMetrics.ragMetrics = ragResult.metrics

    if (!ragResult.ok) {
      emitProgress(onProgress, 'rag_pipeline', 'insufficient_data')
      newsAbortMessage = ragResult.message
    } else {
      emitProgress(onProgress, 'rag_pipeline', 'completed', {
        count: ragResult.chunks?.length || 0,
      })
      newsResults = ragResult.chunks
    }
  }

  if (chat.mode === 'law') {
    emitProgress(onProgress, 'rag_pipeline', 'starting', {
      source: 'legal documents',
    })

    const ragResult = await runLegalRagPipeline({
      query: content,
      onProgress: (stage, data) => emitProgress(onProgress, stage, data),
    })

    serviceMetrics.ragMetrics = ragResult.metrics

    if (!ragResult.ok) {
      emitProgress(onProgress, 'rag_pipeline', 'insufficient_data')
      legalAbortMessage = ragResult.message
    } else {
      emitProgress(onProgress, 'rag_pipeline', 'completed', {
        count: ragResult.chunks?.length || 0,
      })
      legalResults = ragResult.chunks
    }
  }

  const systemContent = buildSystemContext(
    chat.mode,
    memory,
    newsResults,
    legalResults
  )

  let assistantReply = null
  let title = null

  if (chat.mode === 'news' && newsAbortMessage) {
    assistantReply = newsAbortMessage
  } else if (chat.mode === 'law' && legalAbortMessage) {
    assistantReply = legalAbortMessage
  } else {
    const userContent =
      chat.mode === 'news'
        ? `${content}\n\n(Remember: Cite EVERY statement with [1], [2], [3] from the NEWS SOURCES above. Do not use your training data.)`
        : content

    const llmMessages = [
      ...(systemContent ? [{ role: 'system', content: systemContent }] : []),
      { role: 'user', content: userContent },
    ]

    emitProgress(onProgress, 'llm_generation', 'generating', {
      model: chat.model,
    })

    serviceMetrics.llmStartTime = Date.now()

    if (streaming) {
      let streamingAssistantMessage = null
      let currentContent = ''
      let saveTimeout = null
      let isSaving = false
      let messageCreationPromise = null

      const debouncedSave = () => {
        if (saveTimeout) {
          clearTimeout(saveTimeout)
        }

        saveTimeout = setTimeout(async () => {
          if (streamingAssistantMessage && !isSaving) {
            isSaving = true
            try {
              streamingAssistantMessage.versions[0].content = currentContent
              await streamingAssistantMessage.save()
            } finally {
              isSaving = false
            }
          }
        }, 100)
      }

      const llmOut = await processLLMStreaming({
        messages: llmMessages,
        isFirstMessage,
        userId,
        chatId,
        messageId: userMessage._id,
        requestId: wideEvent?.requestId,
        mode: chat.mode,
        onChunk: (chunkData) => {
          currentContent = chunkData.fullContent
          serviceMetrics.chunksStreamed++

          if (!streamingAssistantMessage && !messageCreationPromise) {
            messageCreationPromise = Message.create({
              chatId,
              userId: null,
              role: 'assistant',
              mode: chat.mode,
              versions: [{ content: currentContent, model: chat.model }],
              currentVersionIndex: 0,
              sources: [],
            })
              .then((msg) => {
                streamingAssistantMessage = msg
                if (onLLMChunk) {
                  onLLMChunk({
                    ...chunkData,
                    messageId: msg._id,
                  })
                }
                return msg
              })
              .catch((err) => {
                throw err
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
          assistantReply = completeData.assistantReply
          title = completeData.title
          serviceMetrics.llmDurationMs =
            Date.now() - serviceMetrics.llmStartTime

          if (saveTimeout) {
            clearTimeout(saveTimeout)
          }

          if (messageCreationPromise && !streamingAssistantMessage) {
            try {
              streamingAssistantMessage = await messageCreationPromise
            } catch (err) {
              throw err
            }
          }

          const messageSources = buildMessageSources(
            chat.mode,
            newsResults,
            legalResults
          )

          if (assistantReply && messageSources.length > 0) {
            if (chat.mode === 'law') {
              assistantReply = enrichCitationsWithUrls(
                assistantReply,
                messageSources,
                'law'
              )
            } else if (chat.mode === 'news') {
              assistantReply = enrichCitationsWithUrls(
                assistantReply,
                messageSources,
                'news'
              )
            }
          }

          if (streamingAssistantMessage) {
            try {
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
            } catch (err) {
              throw err
            }
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
        },
        onError: (errorData) => {
          if (onLLMError) {
            onLLMError(errorData)
          }
        },
      })

      emitProgress(onProgress, 'llm_generation', 'completed', {
        model: chat.model,
        streaming: true,
      })

      assistantReply = llmOut.assistantReply
      title = llmOut.title
    } else {
      const llmOut = await processLLM({
        messages: llmMessages,
        isFirstMessage,
        userId,
        chatId,
        messageId: userMessage._id,
        requestId: wideEvent?.requestId,
        mode: chat.mode,
      })

      emitProgress(onProgress, 'llm_generation', 'completed', {
        model: chat.model,
        streaming: false,
      })

      assistantReply = llmOut.assistantReply
      title = llmOut.title

      if (wideEvent && llmOut.tokenUsage) {
        wideEvent.addTokenUsage(llmOut.tokenUsage)
      }
    }
  }

  const messageSources = buildMessageSources(
    chat.mode,
    newsResults,
    legalResults
  )

  if (assistantReply && messageSources.length > 0) {
    if (chat.mode === 'law') {
      assistantReply = enrichCitationsWithUrls(
        assistantReply,
        messageSources,
        'law'
      )
    } else if (chat.mode === 'news') {
      assistantReply = enrichCitationsWithUrls(
        assistantReply,
        messageSources,
        'news'
      )
    }
  }

  emitProgress(onProgress, 'assistant_message', 'creating')

  let assistantMessage
  if (streaming) {
    assistantMessage = await Message.findOne({
      chatId,
      role: 'assistant',
      createdAt: { $gte: new Date(Date.now() - 10000) },
    }).sort({ createdAt: -1 })

    if (!assistantMessage) {
      assistantMessage = await Message.create({
        chatId,
        userId: null,
        role: 'assistant',
        mode: chat.mode,
        versions: [{ content: assistantReply, model: chat.model }],
        currentVersionIndex: 0,
        sources: messageSources,
      })
    } else {
      assistantMessage.versions[0].content = assistantReply
      assistantMessage.sources = messageSources
      await assistantMessage.save()
    }
  } else {
    assistantMessage = await Message.create({
      chatId,
      userId: null,
      role: 'assistant',
      mode: chat.mode,
      versions: [{ content: assistantReply, model: chat.model }],
      currentVersionIndex: 0,
      sources: messageSources,
    })
  }

  chatHistoryCache
    .append(chatId.toString(), [userMessage, assistantMessage])
    .catch(() => {})

  await memoryService.saveMessageVector({
    userId,
    chatId,
    messageId: assistantMessage._id,
    role: 'assistant',
    content: assistantReply,
  })

  emitProgress(onProgress, 'assistant_message', 'completed')

  chat.lastMessage = content
  chat.lastMessageAt = new Date()
  if (isFirstMessage && title) chat.title = title
  await chat.save()

  return {
    chatId,
    userMessage,
    assistantMessage,
    isFirstMessage,
    title,
    metrics: {
      rag: serviceMetrics.ragMetrics,
      memory: serviceMetrics.memoryMetrics,
      llm: {
        durationMs: serviceMetrics.llmDurationMs,
        chunksStreamed: serviceMetrics.chunksStreamed,
        isStreaming: streaming,
        systemPromptLength: systemContent?.length || 0,
      },
    },
  }
}

const editUserMessage = async ({ messageId, newContent }) => {
  const message = await Message.findById(messageId)
  if (!message) throw new ApiError(404, 'Message not found')
  if (message.role !== 'user')
    throw new ApiError(400, 'Only user messages can be edited')

  message.versions.push({ content: newContent })
  message.currentVersionIndex = message.versions.length - 1
  await message.save()

  chatHistoryCache.invalidate(message.chatId.toString()).catch(() => {})

  const chat = await Chat.findById(message.chatId)
  if (!chat) throw new ApiError(404, 'Chat not found')

  if (!message.mode) {
    message.mode = chat.mode || 'default'
  }

  return { message }
}

const regenerateAssistantResponse = async ({ messageId }) => {
  const userMessage = await Message.findById(messageId)

  if (!userMessage) throw new ApiError(404, 'Message not found')
  if (userMessage.role !== 'user')
    throw new ApiError(400, 'Can only regenerate from user messages')

  chatHistoryCache.invalidate(userMessage.chatId.toString()).catch(() => {})

  const chat = await Chat.findById(userMessage.chatId)
  if (!chat) throw new ApiError(404, 'Chat not found')

  const latestUserText = getLatestVersionContent(userMessage)

  const memory = await memoryService.searchRelevant({
    userId: userMessage.userId,
    chatId: userMessage.chatId,
    content: latestUserText,
    limit: 5,
    minScore: 0.35,
  })

  let newsResults = []
  let newsAbortMessage = null
  let legalResults = []
  let legalAbortMessage = null

  if (chat.mode === 'news') {
    const ragResult = await runNewsRagPipeline({ query: latestUserText })
    if (!ragResult.ok) {
      newsAbortMessage = ragResult.message
    } else {
      newsResults = ragResult.chunks
    }
  }

  if (chat.mode === 'law') {
    const ragResult = await runLegalRagPipeline({ query: latestUserText })
    if (!ragResult.ok) {
      legalAbortMessage = ragResult.message
    } else {
      legalResults = ragResult.chunks
    }
  }

  const systemContent = buildSystemContext(
    chat.mode,
    memory,
    newsResults,
    legalResults
  )

  let assistantReply = null

  if (chat.mode === 'news' && newsAbortMessage) {
    assistantReply = newsAbortMessage
  } else if (chat.mode === 'law' && legalAbortMessage) {
    assistantReply = legalAbortMessage
  } else {
    const llmInput = [
      ...(systemContent ? [{ role: 'system', content: systemContent }] : []),
      { role: 'user', content: latestUserText },
    ]

    const llmOut = await processLLM({
      model: chat.model,
      messages: llmInput,
      isFirstMessage: false,
      userId: userMessage.userId,
      chatId: userMessage.chatId,
      messageId: userMessage._id,
      mode: chat.mode,
    })

    assistantReply = llmOut.assistantReply
  }

  const assistant = await Message.findOne({
    chatId: userMessage.chatId,
    role: 'assistant',
  }).sort({ createdAt: -1 })

  if (!assistant.mode) {
    assistant.mode = chat.mode || 'default'
  }

  assistant.sources = buildMessageSources(chat.mode, newsResults, legalResults)

  assistant.versions.push({ content: assistantReply, model: chat.model })
  assistant.currentVersionIndex = assistant.versions.length - 1
  await assistant.save()

  await memoryService.saveMessageVector({
    userId: userMessage.userId,
    chatId: userMessage.chatId,
    messageId: assistant._id,
    role: 'assistant',
    content: assistantReply,
  })

  return { assistant }
}

const getMessagesByChatId = async (chatId) => {
  const cached = await chatHistoryCache.get(chatId.toString())
  if (cached) {
    return cached.map((message) => ({
      ...message,
      mode: message.mode || 'default',
    }))
  }

  const messages = await Message.find({ chatId }).sort({ createdAt: 1 }).lean()

  const normalized = messages.map((message) => ({
    ...message,
    mode: message.mode || 'default',
  }))

  chatHistoryCache.set(chatId.toString(), normalized).catch(() => {})

  return normalized
}

module.exports = {
  createMessage,
  editUserMessage,
  regenerateAssistantResponse,
  getMessagesByChatId,
}
