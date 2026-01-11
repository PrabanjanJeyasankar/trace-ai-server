class TokenEstimator {
  estimate(text) {
    throw new Error('TokenEstimator.estimate must be implemented')
  }

  estimateMessages(messages) {
    throw new Error('TokenEstimator.estimateMessages must be implemented')
  }
}

class OpenAITokenEstimator extends TokenEstimator {
  estimate(text) {
    if (!text) return 0
    const words = text.split(/\s+/).length
    const chars = text.length
    return Math.ceil(((words + chars / 4) / 2) * 1.3)
  }

  estimateMessages(messages) {
    if (!messages || messages.length === 0) return 0

    let total = 0
    for (const msg of messages) {
      total += 4
      total += this.estimate(msg.role || '')
      total += this.estimate(msg.content || '')
    }
    total += 2

    return total
  }
}

class OllamaTokenEstimator extends TokenEstimator {
  estimate(text) {
    if (!text) return 0
    return Math.ceil(text.length / 4)
  }

  estimateMessages(messages) {
    if (!messages || messages.length === 0) return 0

    let total = 0
    for (const msg of messages) {
      total += this.estimate(msg.content || '')
      total += 5
    }

    return total
  }
}

class AnthropicTokenEstimator extends TokenEstimator {
  estimate(text) {
    if (!text) return 0
    const words = text.split(/\s+/).length
    const chars = text.length
    return Math.ceil(((words + chars / 4) / 2) * 1.2)
  }

  estimateMessages(messages) {
    if (!messages || messages.length === 0) return 0

    let total = 0
    for (const msg of messages) {
      total += this.estimate(msg.content || '')
      total += 3
    }

    return total
  }
}

function createTokenEstimator(provider) {
  switch (provider) {
    case 'openai':
      return new OpenAITokenEstimator()
    case 'anthropic':
      return new AnthropicTokenEstimator()
    case 'ollama':
    default:
      return new OllamaTokenEstimator()
  }
}

module.exports = {
  TokenEstimator,
  OpenAITokenEstimator,
  OllamaTokenEstimator,
  AnthropicTokenEstimator,
  createTokenEstimator,
}
