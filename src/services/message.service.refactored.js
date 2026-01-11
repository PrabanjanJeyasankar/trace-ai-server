const Chat = require('../models/Chat')
const chatHistoryCache = require('../cache/chatHistoryCache')
const memoryOrchestrator = require('./message/MemoryOrchestrator')
const ragOrchestrator = require('./message/RAGOrchestrator')
const llmOrchestrator = require('./message/LLMOrchestrator')
const messageRepository = require('./message/MessageRepository')
const { emitProgress } = require('./message/progress.helper')
const { enrichCitationsWithUrls } = require('./message/citation.enricher')

class MessageService {
  async createMessage(config) {
    const { chatId, content, streaming = true, wideEvent } = config
    const { onProgress, onLLMChunk, onLLMComplete, onLLMError } = config

    const chat = await Chat.findById(chatId)
    if (!chat) throw new Error('Chat not found')

    const userId = chat.userId
    const isFirstMessage = !chat.lastMessageAt

    const userMessage = await messageRepository.createUserMessage({
      chatId,
      userId,
      mode: chat.mode,
      content,
      onProgress,
    })

    emitProgress(onProgress, 'memory_vector', 'processing')
    await memoryOrchestrator.saveUserMessage({
      userId,
      chatId,
      messageId: userMessage._id,
      content,
    })
    emitProgress(onProgress, 'memory_vector', 'completed')

    const memoryResult = await memoryOrchestrator.searchRelevant({
      userId,
      chatId,
      content,
      isFirstMessage,
      mode: chat.mode,
      onProgress,
    })

    const ragResults = await ragOrchestrator.execute({
      chat,
      content,
      onProgress,
    })

    const llmResult = await llmOrchestrator.execute({
      chat,
      userMessage,
      memory: memoryResult.results,
      ragResults,
      streaming,
      wideEvent,
      onProgress,
      onLLMChunk,
      onLLMComplete,
      onLLMError,
    })

    emitProgress(onProgress, 'assistant_message', 'creating')

    let assistantMessage

    if (streaming && llmResult.streamingMessage) {
      assistantMessage = llmResult.streamingMessage
    } else {
      assistantMessage = await messageRepository.createAssistantMessage({
        chatId,
        mode: chat.mode,
        content: llmResult.assistantReply,
        model: chat.model,
        sources: llmResult.sources,
      })
    }

    chatHistoryCache
      .append(chatId.toString(), [userMessage, assistantMessage])
      .catch(() => {})

    await memoryOrchestrator.saveAssistantMessage({
      userId,
      chatId,
      messageId: assistantMessage._id,
      content: llmResult.assistantReply,
    })

    emitProgress(onProgress, 'assistant_message', 'completed')

    chat.lastMessage = content
    chat.lastMessageAt = new Date()
    if (isFirstMessage && llmResult.title) {
      chat.title = llmResult.title
    }
    await chat.save()

    return {
      chatId,
      userMessage,
      assistantMessage,
      isFirstMessage,
      title: llmResult.title,
      metrics: {
        rag: ragResults.metrics,
        memory: memoryResult.metrics,
        llm: llmResult.metrics,
      },
    }
  }

  async editUserMessage(config) {
    const { messageId, newContent } = config

    const message = await messageRepository.editUserMessage({
      messageId,
      newContent,
    })

    chatHistoryCache.invalidate(message.chatId.toString()).catch(() => {})

    const chat = await Chat.findById(message.chatId)
    if (!chat) throw new Error('Chat not found')

    if (!message.mode) {
      message.mode = chat.mode || 'default'
    }

    return { message }
  }

  async regenerateAssistantResponse(config) {
    const { messageId } = config

    const Message = require('../../models/Message')
    const userMessage = await Message.findById(messageId)

    if (!userMessage) throw new Error('Message not found')
    if (userMessage.role !== 'user')
      throw new Error('Can only regenerate from user messages')

    chatHistoryCache.invalidate(userMessage.chatId.toString()).catch(() => {})

    const chat = await Chat.findById(userMessage.chatId)
    if (!chat) throw new Error('Chat not found')

    const latestUserText =
      messageRepository.getLatestVersionContent(userMessage)

    const memoryResult = await memoryOrchestrator.searchRelevant({
      userId: userMessage.userId,
      chatId: userMessage.chatId,
      content: latestUserText,
      isFirstMessage: false,
      mode: chat.mode,
    })

    const ragResults = await ragOrchestrator.execute({
      chat,
      content: latestUserText,
    })

    const llmResult = await llmOrchestrator.execute({
      chat,
      userMessage,
      memory: memoryResult.results,
      ragResults,
      streaming: false,
    })

    const assistant = await Message.findOne({
      chatId: userMessage.chatId,
      role: 'assistant',
    }).sort({ createdAt: -1 })

    if (!assistant.mode) {
      assistant.mode = chat.mode || 'default'
    }

    assistant.sources = llmResult.sources
    assistant.versions.push({
      content: llmResult.assistantReply,
      model: chat.model,
    })
    assistant.currentVersionIndex = assistant.versions.length - 1
    await assistant.save()

    await memoryOrchestrator.saveAssistantMessage({
      userId: userMessage.userId,
      chatId: userMessage.chatId,
      messageId: assistant._id,
      content: llmResult.assistantReply,
    })

    return { assistant }
  }

  async getMessagesByChatId(chatId) {
    const cached = await chatHistoryCache.get(chatId.toString())
    if (cached) {
      return cached.map((message) => ({
        ...message,
        mode: message.mode || 'default',
      }))
    }

    const messages = await messageRepository.getMessagesByChatId(chatId)

    chatHistoryCache.set(chatId.toString(), messages).catch(() => {})

    return messages
  }
}

module.exports = new MessageService()
