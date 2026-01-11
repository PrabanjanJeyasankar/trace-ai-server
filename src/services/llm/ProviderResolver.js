const providers = require('../../config/providers')
const config = require('../../config')

class ProviderResolver {
  resolve() {
    const provider = config.ai.provider || 'openai'

    if (provider === 'ollama') {
      return {
        name: 'ollama',
        model: providers.ollama.model,
        baseUrl: providers.ollama.baseUrl,
      }
    }

    return {
      name: 'openai',
      model: providers.openai.model,
      apiKey: providers.openai.apiKey,
    }
  }

  getProviderName() {
    return this.resolve().name
  }

  getModel() {
    return this.resolve().model
  }
}

module.exports = new ProviderResolver()
