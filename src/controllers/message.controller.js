const { asyncHandler } = require('../middleware/asyncHandler')
const messageService = require('../services/message.service')
const { success } = require('../utils/response')

const createMessage = asyncHandler(async (request, response) => {
  const chatId = request.params.chatId || null
  const { content, mode } = request.body

  request.event.addUser(request.user)
  request.event.addQuery({ text: content, mode })

  const result = await messageService.createMessage({
    chatId,
    userId: request.user.id,
    content,
    mode,
    streaming: false,
    wideEvent: request.event,
  })

  if (result.metrics?.rag) {
    request.event.addRAG(result.metrics.rag)
  }

  if (result.metrics?.memory) {
    request.event.addMemory(result.metrics.memory)
  }

  if (result.metrics?.llm) {
    request.event.addLLM(result.metrics.llm)
  }

  request.event.addChat(
    { _id: result.chatId, mode },
    { isFirstMessage: result.isFirstMessage, title: result.title }
  )

  const cleanResult = {
    chatId: result.chatId,
    userMessage: result.userMessage?.toObject
      ? result.userMessage.toObject()
      : result.userMessage,
    assistantMessage: result.assistantMessage?.toObject
      ? result.assistantMessage.toObject()
      : result.assistantMessage,
    isFirstMessage: result.isFirstMessage,
    title: result.title || null,
  }

  return success(response, 201, 'Message created', cleanResult)
})

const editMessage = asyncHandler(async (request, response) => {
  const { messageId } = request.params
  const { content } = request.body

  request.event.addUser(request.user)

  const result = await messageService.editUserMessage({
    messageId,
    newContent: content,
  })

  return success(response, 200, 'Message edited', result)
})

const regenerateMessage = asyncHandler(async (request, response) => {
  const { messageId } = request.params

  request.event.addUser(request.user)

  const result = await messageService.regenerateAssistantResponse({
    messageId,
  })

  return success(response, 200, 'Assistant regenerated', result)
})

const getMessages = asyncHandler(async (request, response) => {
  const { chatId } = request.params

  request.event.addUser(request.user)

  const messages = await messageService.getMessagesByChatId(chatId)

  request.event.addMetric('messages_count', messages.length)

  return success(response, 200, 'Messages fetched', { messages })
})

module.exports = {
  createMessage,
  editMessage,
  regenerateMessage,
  getMessages,
}
