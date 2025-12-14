const Chat = require('../models/Chat')
const Message = require('../models/Message')
const { ApiError } = require('../utils/ApiError')
const { processLLM } = require('./llm.service')
const chatService = require('./chat.service')
const memoryService = require('./embeddings/memory.service')
const NewsService = require('./embeddings/news.service')
const logger = require('../utils/logger')
const chatHistoryCache = require('../cache/chatHistoryCache')

const getLatestVersionContent = (message) =>
  message.versions[message.currentVersionIndex].content

const createMessage = async ({ chatId, userId, content, mode }) => {
  let chat = null
  let isFirstMessage = false

  if (!chatId) {
    chat = await chatService.createChat({
      userId,
      firstMessageContent: content,
      mode,
    })
    chatId = chat._id
    isFirstMessage = true
  } else {
    chat = await Chat.findById(chatId)
    if (!chat) throw new ApiError(404, 'Chat not found')

    if (mode && mode !== chat.mode) {
      logger.info(`Switching chat ${chatId} from ${chat.mode} to ${mode}`)
      chat.mode = mode
      await chat.save()
    }
  }

  const userMessage = await Message.create({
    chatId,
    userId,
    role: 'user',
    mode: chat.mode,
    versions: [{ content }],
    currentVersionIndex: 0,
  })

  await memoryService.saveMessageVector({
    userId,
    chatId,
    messageId: userMessage._id,
    role: 'user',
    content,
  })

  // memory recall only when not first message
  let memory = []
  let memoryInstructions = ''

  if (!isFirstMessage) {
    memory = await memoryService.searchRelevant({
      userId,
      chatId,
      content,
      limit: 5,
      minScore: 0.35,
    })

    if (memory.length > 0) {
      const memoryContext = memory
        .map((m) => `(${m.role}) ${m.text}`)
        .join('\n')

      memoryInstructions = `
        You have access to previous important context:
        ${memoryContext}

        Do NOT mention memory in your answer.
      `
    }
  }

  let newsContext = ''
  let newsResults = []

  logger.info(`Chat ${chatId} mode: ${chat.mode}, requested mode: ${mode}`)

  if (chat.mode === 'news') {
    logger.info(`News RAG mode active for chat ${chatId}`)

    newsResults = await NewsService.searchNews(content)

    if (newsResults.length > 0) {
      const sourcesList = newsResults
        .map((result, idx) => {
          const { title, url, source, startLine, endLine, text } =
            result.payload
          return `
            SOURCE ${idx + 1}:
            Title: ${title}
            URL: ${url}
            Source: ${source}
            Lines: ${startLine}-${endLine}
            Content:
            ${text}
            ---`
        })
        .join('\n\n')

      newsContext = `
        You are a news-based AI assistant. Your ONLY job is to answer questions using information from the news articles provided below. 

        CRITICAL RULES:
        1. ONLY use information that appears in the sources below - do NOT add general knowledge
        2. Start your answer with "Based on recent news coverage:" 
        3. Cite specific sources for each fact: (Source: [Title])
        4. If the sources don't contain enough information to answer the question, say "The available news sources don't contain sufficient information to answer this question."
        5. Focus on the SPECIFIC content from these news articles, not general information

        NEWS SOURCES:
        ${sourcesList}

        REMEMBER: Your response must be grounded ONLY in the content above. Do not supplement with general knowledge about the topic.
                    `

      logger.info(
        `News RAG: ${newsResults.length} sources added to context for chat ${chatId}`
      )
    } else {
      logger.info(`News RAG: No relevant sources found for chat ${chatId}`)
    }
  }

  const systemContent = [memoryInstructions, newsContext]
    .filter((s) => s.trim())
    .join('\n\n')

  const llmMessages = [
    ...(systemContent ? [{ role: 'system', content: systemContent }] : []),
    { role: 'user', content },
  ]

  const { assistantReply, title } = await processLLM({
    model: chat.model,
    messages: llmMessages,
    isFirstMessage,
  })

  let messageSources = []
  if (chat.mode === 'news' && newsResults.length > 0) {
    messageSources = newsResults.map((result) => ({
      title: result.payload.title,
      url: result.payload.url,
      source: result.payload.source,
      lines: `${result.payload.startLine}-${result.payload.endLine}`,
      publishedAt: new Date(result.payload.publishedAt).toISOString(),
      similarity: result.score,
      finalScore: result.finalScore,
    }))
  }

  const assistantMessage = await Message.create({
    chatId,
    userId: null,
    role: 'assistant',
    mode: chat.mode,
    versions: [{ content: assistantReply, model: chat.model }],
    currentVersionIndex: 0,
    sources: messageSources,
  })

  // Best-effort cache update for per-session (chatId) history
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

  // Message versions changed; invalidate cached history
  chatHistoryCache.invalidate(message.chatId.toString()).catch(() => {})

  const chat = await Chat.findById(message.chatId)
  if (!chat) throw new ApiError(404, 'Chat not found')

  // Backfill mode for older messages
  if (!message.mode) {
    message.mode = chat.mode || 'default'
  }

  await memoryService.saveMessageVector({
    userId: message.userId,
    chatId: message.chatId,
    messageId: message._id,
    role: 'user',
    content: newContent,
  })

  const memory = await memoryService.searchRelevant({
    userId: message.userId,
    chatId: message.chatId,
    content: newContent,
    limit: 5,
  })

  const memoryContext = memory.map((m) => `(${m.role}) ${m.text}`).join('\n')

  let newsContext = ''
  let newsResults = []
  if (chat.mode === 'news') {
    newsResults = await NewsService.searchNews(newContent)

    if (newsResults.length > 0) {
      const sourcesList = newsResults
        .map((result, idx) => {
          const { title, url, source, startLine, endLine, text } =
            result.payload
          return `
              SOURCE ${idx + 1}:
              Title: ${title}
              URL: ${url}
              Source: ${source}
              Lines: ${startLine}-${endLine}
              Content:
              ${text}
              ---`
        })
        .join('\n\n')

      newsContext = `
              You are answering based on news articles. Follow these rules strictly:

              AVAILABLE SOURCES:
              ${sourcesList}

              CITATION RULES:
              1. Only state facts that are directly supported by the sources above.
              2. For each fact, add a citation at the end of the sentence: (found in: <Title>, lines X-Y)
              3. If a question cannot be answered from the sources, say "I don't have information about that in the available news sources."
              4. Do NOT mention Qdrant, embeddings, vector databases, or any internal system details.
              5. Be concise and accurate.
          `
    }
  }

  const systemContent = [
    memory.length ? `Use past context to respond:\n\n` + memoryContext : '',
    newsContext,
  ]
    .filter((s) => s.trim())
    .join('\n\n')

  const llmInput = [
    ...(systemContent ? [{ role: 'system', content: systemContent }] : []),
    { role: 'user', content: newContent },
  ]

  const { assistantReply } = await processLLM({
    model: chat.model,
    messages: llmInput,
    isFirstMessage: false,
  })

  const assistant = await Message.findOne({
    chatId: message.chatId,
    role: 'assistant',
  }).sort({ createdAt: -1 })

  if (!assistant) throw new ApiError(404, 'Assistant message not found')

  if (!assistant.mode) {
    assistant.mode = chat.mode || 'default'
  }

  // Update assistant sources if in news mode
  if (chat.mode === 'news' && newsResults.length > 0) {
    assistant.sources = newsResults.map((result) => ({
      title: result.payload.title,
      url: result.payload.url,
      source: result.payload.source,
      lines: `${result.payload.startLine}-${result.payload.endLine}`,
      publishedAt: new Date(result.payload.publishedAt).toISOString(),
      similarity: result.score,
      finalScore: result.finalScore,
    }))
  } else {
    assistant.sources = []
  }

  assistant.versions.push({ content: assistantReply, model: chat.model })
  assistant.currentVersionIndex = assistant.versions.length - 1
  await assistant.save()

  await memoryService.saveMessageVector({
    userId: message.userId,
    chatId: message.chatId,
    messageId: assistant._id,
    role: 'assistant',
    content: assistantReply,
  })

  return {
    editedUserMessage: message,
    newAssistantMessage: assistant,
  }
}

const regenerateAssistantResponse = async ({ messageId }) => {
  const userMessage = await Message.findById(messageId)
  if (!userMessage) throw new ApiError(404, 'Message not found')
  if (userMessage.role !== 'user')
    throw new ApiError(400, 'Only user messages can regenerate')

  const chat = await Chat.findById(userMessage.chatId)
  if (!chat) throw new ApiError(404, 'Chat not found')

  // Assistant output will change; invalidate cached history
  chatHistoryCache.invalidate(userMessage.chatId.toString()).catch(() => {})

  if (!userMessage.mode) {
    userMessage.mode = chat.mode || 'default'
    await userMessage.save()
  }

  const latestUserText = getLatestVersionContent(userMessage)

  const memory = await memoryService.searchRelevant({
    userId: userMessage.userId,
    chatId: userMessage.chatId,
    content: latestUserText,
    limit: 5,
  })

  const memoryContext = memory.map((m) => `(${m.role}) ${m.text}`).join('\n')

  let newsContext = ''
  let newsResults = []
  if (chat.mode === 'news') {
    newsResults = await NewsService.searchNews(latestUserText)

    if (newsResults.length > 0) {
      const sourcesList = newsResults
        .map((result, idx) => {
          const { title, url, source, startLine, endLine, text } =
            result.payload
          return `
          SOURCE ${idx + 1}:
          Title: ${title}
          URL: ${url}
          Source: ${source}
          Lines: ${startLine}-${endLine}
          Content:
          ${text}
          ---`
        })
        .join('\n\n')

      newsContext = `
          You are a news-based AI assistant. Your ONLY job is to answer questions using information from the news articles provided below. 

          CRITICAL RULES:
          1. ONLY use information that appears in the sources below - do NOT add general knowledge
          2. Start your answer with "Based on recent news coverage:" 
          3. Cite specific sources for each fact: (Source: [Title])
          4. If the sources don't contain enough information to answer the question, say "The available news sources don't contain sufficient information to answer this question."
          5. Focus on the SPECIFIC content from these news articles, not general information

          NEWS SOURCES:
          ${sourcesList}

          REMEMBER: Your response must be grounded ONLY in the content above. Do not supplement with general knowledge about the topic.
          `
    }
  }

  const systemContent = [
    memory.length ? `Use past context:\n` + memoryContext : '',
    newsContext,
  ]
    .filter((s) => s.trim())
    .join('\n\n')

  const llmInput = [
    ...(systemContent ? [{ role: 'system', content: systemContent }] : []),
    { role: 'user', content: latestUserText },
  ]

  const { assistantReply } = await processLLM({
    model: chat.model,
    messages: llmInput,
    isFirstMessage: false,
  })

  const assistant = await Message.findOne({
    chatId: userMessage.chatId,
    role: 'assistant',
  }).sort({ createdAt: -1 })

  if (!assistant.mode) {
    assistant.mode = chat.mode || 'default'
  }

  // Update assistant sources if in news mode
  if (chat.mode === 'news' && newsResults.length > 0) {
    assistant.sources = newsResults.map((result) => ({
      title: result.payload.title,
      url: result.payload.url,
      source: result.payload.source,
      lines: `${result.payload.startLine}-${result.payload.endLine}`,
      publishedAt: new Date(result.payload.publishedAt).toISOString(),
      similarity: result.score,
      finalScore: result.finalScore,
    }))
  } else {
    assistant.sources = []
  }

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
