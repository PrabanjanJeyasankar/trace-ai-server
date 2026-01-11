const streamingProcessor = require('./llm/StreamingProcessor')
const structuredOutputProcessor = require('./llm/StructuredOutputProcessor')
const providerResolver = require('./llm/ProviderResolver')
const inputValidator = require('./llm/InputValidator')
const messageConverter = require('./llm/MessageConverter')
const modelFactory = require('./llm/ModelFactory')

const processLLMStreaming = async (config) => {
  return streamingProcessor.process(config)
}

const processLLMWithStructuredOutput = async (config) => {
  return structuredOutputProcessor.process(config)
}

const processLLM = async (config) => {
  return new Promise((resolve, reject) => {
    const { onChunk, onComplete, onError, ...restConfig } = config

    let result = {
      assistantReply: '',
      title: null,
      tokenUsage: null,
    }

    streamingProcessor
      .process({
        ...restConfig,
        onChunk: (data) => {
          result.assistantReply = data.fullContent
        },
        onComplete: (data) => {
          result = {
            assistantReply: data.assistantReply,
            title: data.title,
            tokenUsage: data.tokenUsage,
          }
          resolve(result)
        },
        onError: (error) => {
          reject(new Error(error.error))
        },
      })
      .catch(reject)
  })
}

const createLangChainModel = (options) => {
  const providerInfo = providerResolver.resolve()
  return modelFactory.createModel(providerInfo, options)
}

const convertMessagesToLangChain = (messages) => {
  return messageConverter.toLangChain(messages)
}

const resolveProvider = () => {
  return providerResolver.resolve()
}

const validateLLMInput = (messages) => {
  return inputValidator.validateMessages(messages)
}

const generateTitlePrompt = (message) => {
  return [
    {
      role: 'user',
      content:
        "Generate a short factual title summarizing the user's message. Strict rules: 1) Maximum 4 words, 2) No poetic or motivational phrases, 3) No punctuation, 4) Must directly reflect message topic, 5) Output only the title.",
    },
    { role: 'user', content: message },
  ]
}

module.exports = {
  processLLM,
  processLLMStreaming,
  processLLMWithStructuredOutput,
  createLangChainModel,
  convertMessagesToLangChain,
  resolveProvider,
  validateLLMInput,
  generateTitlePrompt,
}
