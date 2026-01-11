const Message = require('../../models/Message')
const { emitProgress } = require('./progress.helper')

class MessageRepository {
  async createUserMessage(config) {
    const { chatId, userId, mode, content, onProgress } = config

    const userMessage = await Message.create({
      chatId,
      userId,
      role: 'user',
      mode,
      versions: [{ content }],
      currentVersionIndex: 0,
    })

    emitProgress(onProgress, 'user_message', 'completed', {
      messageId: userMessage._id,
    })

    return userMessage
  }

  async createAssistantMessage(config) {
    const { chatId, mode, content, model, sources } = config

    return Message.create({
      chatId,
      userId: null,
      role: 'assistant',
      mode,
      versions: [{ content, model }],
      currentVersionIndex: 0,
      sources,
    })
  }

  async findRecentAssistant(chatId) {
    return Message.findOne({
      chatId,
      role: 'assistant',
      createdAt: { $gte: new Date(Date.now() - 10000) },
    }).sort({ createdAt: -1 })
  }

  async updateMessage(messageId, updates) {
    return Message.findByIdAndUpdate(messageId, updates, { new: true })
  }

  async editUserMessage(config) {
    const { messageId, newContent } = config

    const message = await Message.findById(messageId)
    if (!message) throw new Error('Message not found')
    if (message.role !== 'user')
      throw new Error('Only user messages can be edited')

    message.versions.push({ content: newContent })
    message.currentVersionIndex = message.versions.length - 1
    await message.save()

    return message
  }

  async getMessagesByChatId(chatId) {
    const messages = await Message.find({ chatId })
      .sort({ createdAt: 1 })
      .lean()

    return messages.map((message) => ({
      ...message,
      mode: message.mode || 'default',
    }))
  }

  getLatestVersionContent(message) {
    return message.versions[message.currentVersionIndex].content
  }
}

module.exports = new MessageRepository()
