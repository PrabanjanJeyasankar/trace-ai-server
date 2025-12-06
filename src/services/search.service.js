const Message = require('../models/Message')
const Chat = require('../models/Chat')

const searchMessages = async ({ userId, query, limit = 20, page = 1 }) => {
  const skip = (page - 1) * limit

  const results = await Message.find(
    {
      $text: { $search: query },
      userId: userId,
    },
    { score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' } })
    .skip(skip)
    .limit(limit)

  const populated = await Chat.populate(results, {
    path: 'chatId',
    select: 'title lastMessage lastMessageAt',
  })

  return populated
}

module.exports = { searchMessages }
