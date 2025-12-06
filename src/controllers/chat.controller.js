const { asyncHandler } = require('../middleware/asyncHandler')
const chatService = require('../services/chat.service')
const responseFormatter = require('../utils/response')

const createChat = asyncHandler(async (request, response) => {
  const userId = request.user.id
  const { firstMessageContent } = request.body

  const chat = await chatService.createChat({
    userId,
    firstMessageContent,
  })

  return responseFormatter.success(
    response,
    201,
    'Chat created successfully',
    chat
  )
})

const getChats = asyncHandler(async (request, response) => {
  const userId = request.user.id

  const chats = await chatService.getUserChats(userId)

  return responseFormatter.success(
    response,
    200,
    'Chats fetched successfully',
    chats
  )
})

const getChat = asyncHandler(async (request, response) => {
  const { chatId } = request.params
  const userId = request.user.id

  const chat = await chatService.getChatById(chatId, userId)

  return responseFormatter.success(
    response,
    200,
    'Chat fetched successfully',
    chat
  )
})

const renameChat = asyncHandler(async (request, response) => {
  const { chatId } = request.params
  const userId = request.user.id
  const { title } = request.body

  const updatedChat = await chatService.renameChat(chatId, userId, title)

  return responseFormatter.success(
    response,
    200,
    'Chat renamed successfully',
    updatedChat
  )
})

const deleteChat = asyncHandler(async (request, response) => {
  const { chatId } = request.params
  const userId = request.user.id

  await chatService.deleteChat(chatId, userId)

  return responseFormatter.success(response, 200, 'Chat deleted successfully')
})

const updateFinalTitle = asyncHandler(async (request, response) => {
  const { chatId } = request.params
  const userId = request.user.id
  const { finalTitle } = request.body

  const updatedChat = await chatService.setFinalTitle(
    chatId,
    userId,
    finalTitle
  )

  return responseFormatter.success(
    response,
    200,
    'Chat title updated successfully',
    updatedChat
  )
})

module.exports = {
  createChat,
  getChats,
  getChat,
  renameChat,
  deleteChat,
  updateFinalTitle,
}
