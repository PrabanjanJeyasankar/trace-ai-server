const { ChatOpenAI } = require('@langchain/openai')
const { ChatOllama } = require('@langchain/ollama')

class ModelFactory {
  createModel(providerConfig, options = {}) {
    const { name } = providerConfig
    const { structuredOutput = false, schema = null } = options

    if (name === 'ollama') {
      return this._createOllamaModel(providerConfig, structuredOutput, schema)
    }

    return this._createOpenAIModel(providerConfig, structuredOutput, schema)
  }

  _createOllamaModel(providerConfig, structuredOutput, schema) {
    const { model, baseUrl } = providerConfig

    const ollamaModel = new ChatOllama({
      model,
      baseUrl: baseUrl.replace(/\/$/, ''),
      temperature: 0.3,
      format: structuredOutput ? 'json' : undefined,
    })

    if (structuredOutput && schema) {
      return ollamaModel.bind({
        response_format: { type: 'json_object' },
      })
    }

    return ollamaModel
  }

  _createOpenAIModel(providerConfig, structuredOutput, schema) {
    const { model, apiKey } = providerConfig

    const openaiModel = new ChatOpenAI({
      modelName: model,
      openAIApiKey: apiKey,
      temperature: 0.3,
      streaming: true,
    })

    if (structuredOutput && schema) {
      return openaiModel.withStructuredOutput(schema, {
        method: 'jsonMode',
      })
    }

    return openaiModel
  }
}

module.exports = new ModelFactory()
