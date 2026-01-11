const {
  HumanMessage,
  AIMessage,
  SystemMessage,
} = require('@langchain/core/messages')

class MessageConverter {
  toLangChain(messages) {
    return messages.map((msg) => {
      if (msg.role === 'user') {
        return new HumanMessage(msg.content)
      } else if (msg.role === 'assistant') {
        return new AIMessage(msg.content)
      }
      if (msg.role === 'system') {
        return new SystemMessage(msg.content)
      }
      return new HumanMessage(msg.content)
    })
  }

  calculateTotalLength(messages) {
    return messages.reduce((sum, msg) => sum + (msg.content?.length || 0), 0)
  }
}

module.exports = new MessageConverter()
