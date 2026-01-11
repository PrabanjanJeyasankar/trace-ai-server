const { ChatOpenAI } = require('@langchain/openai')
const { ChatOllama } = require('@langchain/ollama')
const {
  HumanMessage,
  AIMessage,
  SystemMessage,
} = require('@langchain/core/messages')
const providers = require('../config/providers')
const config = require('../config')
const { ApiError } = require('../utils/ApiError')
const { MAX_SINGLE_MESSAGE_CHARS, ERRORS } = require('../config/llmLimits')
const { tokenTracker, createTokenEstimator } = require('./tokenUsage')

const resolveProvider = () => {
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

const validateLLMInput = (messages) => {
  if (!messages || messages.length === 0) return

  const last = messages[messages.length - 1]
  const charCount = [...last.content].length

  if (charCount > MAX_SINGLE_MESSAGE_CHARS) {
    throw new ApiError(400, ERRORS.TOO_LONG_SINGLE)
  }
}

const createLangChainModel = (options = {}) => {
  const { name, model, baseUrl, apiKey } = resolveProvider()
  const { structuredOutput = false, schema = null } = options

  if (name === 'ollama') {
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

const convertMessagesToLangChain = (messages) => {
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

const processLLMStreaming = async ({
  messages,
  isFirstMessage,
  onChunk,
  onComplete,
  onError,
  userId,
  chatId,
  messageId,
  requestId,
  mode,
}) => {
  const startTime = Date.now()

  try {
    validateLLMInput(messages)

    const providerInfo = resolveProvider()
    const model = createLangChainModel()
    const langChainMessages = convertMessagesToLangChain(messages)

    const estimator = createTokenEstimator(providerInfo.name)
    const estimatedInputTokens = estimator.estimateMessages(messages)

    let assistantReply = ''
    let chunkCount = 0

    const stream = await model.stream(langChainMessages)

    for await (const chunk of stream) {
      const content = chunk.content || ''

      if (content) {
        assistantReply += content
        chunkCount++

        // Emit chunk through callback
        if (onChunk && typeof onChunk === 'function') {
          onChunk({
            type: 'chunk',
            content,
            fullContent: assistantReply,
            chunkIndex: chunkCount,
            timestamp: new Date().toISOString(),
          })
        }
      }
    }

    const durationMs = Date.now() - startTime

    let autoTitle = null
    let titleTokenUsage = null

    if (isFirstMessage) {
      try {
        const lastUserMessage =
          [...messages].reverse().find((m) => m.role === 'user') ||
          messages[messages.length - 1]
        const titleMessages = generateTitlePrompt(
          lastUserMessage?.content || ''
        )
        const titleLangChainMessages = convertMessagesToLangChain(titleMessages)

        const titleModel = createLangChainModel()
        const titleResponse = await titleModel.invoke(titleLangChainMessages)
        const raw = titleResponse.content || ''

        autoTitle = raw.replace(/["']/g, '').trim().slice(0, 80)

        titleTokenUsage = await tokenTracker.track({
          userId,
          chatId,
          messageId,
          requestId,
          provider: providerInfo.name,
          model: providerInfo.model,
          operation: 'title_generation',
          messages: titleMessages,
          outputText: raw,
          streaming: false,
          mode,
        })
      } catch (titleError) {
        autoTitle = null
      }
    }

    const tokenUsage = await tokenTracker.track({
      userId,
      chatId,
      messageId,
      requestId,
      provider: providerInfo.name,
      model: providerInfo.model,
      operation: 'chat',
      messages,
      outputText: assistantReply,
      streaming: true,
      durationMs,
      chunksCount: chunkCount,
      mode,
    })

    if (onComplete && typeof onComplete === 'function') {
      onComplete({
        type: 'complete',
        assistantReply: assistantReply.trim(),
        title: autoTitle,
        totalChunks: chunkCount,
        tokenUsage: {
          ...tokenUsage,
          titleTokenUsage,
        },
        timestamp: new Date().toISOString(),
      })
    }

    return {
      assistantReply: assistantReply.trim(),
      title: autoTitle,
      totalChunks: chunkCount,
      tokenUsage: {
        ...tokenUsage,
        titleTokenUsage,
      },
      durationMs,
    }
  } catch (error) {
    if (onError && typeof onError === 'function') {
      onError({
        type: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      })
    }

    throw error
  }
}

const processLLMWithStructuredOutput = async ({
  messages,
  schema,
  onComplete,
  onError,
  userId,
  chatId,
  requestId,
  mode,
}) => {
  const startTime = Date.now()

  try {
    validateLLMInput(messages)

    const providerInfo = resolveProvider()
    const model = createLangChainModel({
      structuredOutput: true,
      schema,
    })
    const langChainMessages = convertMessagesToLangChain(messages)

    const response = await model.invoke(langChainMessages)

    let structuredData
    if (typeof response === 'string') {
      structuredData = JSON.parse(response)
    } else {
      structuredData = response
    }

    const durationMs = Date.now() - startTime

    const tokenUsage = await tokenTracker.track({
      userId,
      chatId,
      requestId,
      provider: providerInfo.name,
      model: providerInfo.model,
      operation: 'structured_output',
      messages,
      outputText: JSON.stringify(structuredData),
      streaming: false,
      durationMs,
      mode,
    })

    if (onComplete && typeof onComplete === 'function') {
      onComplete({
        type: 'complete',
        structuredData,
        tokenUsage,
        timestamp: new Date().toISOString(),
      })
    }

    return {
      structuredData,
      tokenUsage,
    }
  } catch (error) {
    if (onError && typeof onError === 'function') {
      onError({
        type: 'error',
        error: error.message,
        timestamp: new Date().toISOString(),
      })
    }

    throw error
  }
}

const generateTitlePrompt = (message) => [
  {
    role: 'user',
    content:
      "Generate a short factual title summarizing the user's message. Strict rules: 1) Maximum 4 words, 2) No poetic or motivational phrases, 3) No punctuation, 4) Must directly reflect message topic, 5) Output only the title.",
  },
  { role: 'user', content: message },
]

// Non-streaming version for compatibility
const processLLM = async ({
  messages,
  isFirstMessage,
  userId,
  chatId,
  messageId,
  requestId,
  mode,
}) => {
  return new Promise((resolve, reject) => {
    let result = {
      assistantReply: '',
      title: null,
      tokenUsage: null,
    }

    processLLMStreaming({
      messages,
      isFirstMessage,
      userId,
      chatId,
      messageId,
      requestId,
      mode,
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
  })
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
