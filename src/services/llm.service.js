const axios = require('axios')
const { ai } = require('../config')
const providers = require('../config/providers')
const { ApiError } = require('../utils/ApiError')
const logger = require('../utils/logger')

const resolveProvider = (modelName) => {
  if (ai.provider === 'ollama') {
    logger.info(`Using Ollama with model: ${ai.defaultModelOllama}`, modelName)
    return {
      provider: 'ollama',
      baseUrl: providers.ollama.baseUrl,
      model: ai.defaultModelOllama,
    }
  }

  return {
    provider: 'openrouter',
    baseUrl: providers.openrouter.baseUrl,
    model: modelName || ai.defaultModelOpenRouter,
    apiKey: providers.openrouter.apiKey,
  }
}

const callOpenRouter = async (model, messages) => {
  try {
    const response = await axios.post(
      `${providers.openrouter.baseUrl}/chat/completions`,
      { model, messages },
      {
        headers: {
          Authorization: `Bearer ${providers.openrouter.apiKey}`,
          'Content-Type': 'application/json',
        },
      }
    )

    return response.data.choices?.[0]?.message?.content || ''
  } catch (error) {
    throw new ApiError(
      500,
      error?.response?.data?.error || 'OpenRouter request failed'
    )
  }
}

const callOllama = async (model, messages) => {
  try {
    const response = await axios.post(
      `${providers.ollama.baseUrl}/api/chat`,
      { model, messages, stream: false },
      { headers: { 'Content-Type': 'application/json' } }
    )

    return response.data?.message?.content || ''
  } catch (error) {
    throw new ApiError(
      500,
      error?.response?.data?.error || 'Ollama request failed'
    )
  }
}

const generateTitlePrompt = (userMessage) => {
  return [
    {
      role: 'system',
      content: `
You create short, meaningful titles (maximum 4 words).

Rules:
- Always produce a real, meaningful topic-based title.
- Never say things like "Invalid input", "No query", "Error", or apologies.
- Never repeat the user message verbatim.
- Never output meta-text (e.g., "Here is your title").
- Even if the user message is unclear, extremely short, or messy, infer the most likely general topic.
- If the content is ambiguous, choose a broad, reasonable category (e.g., "General Query", "User Assistance", "Quick Question", "Casual Inquiry").
- Output ONLY the title. No punctuation around it.
`,
    },
    { role: 'user', content: userMessage },
  ]
}

const processLLM = async ({ model, messages, isFirstMessage }) => {
  const { provider, baseUrl } = resolveProvider(model)
  const finalModel = resolveProvider(model).model

  let assistantReply = ''

  if (provider === 'openrouter') {
    assistantReply = await callOpenRouter(finalModel, messages)
  } else {
    assistantReply = await callOllama(finalModel, messages)
  }

  let autoTitle = null

  if (isFirstMessage) {
    const titlePrompt = generateTitlePrompt(messages[0].content)

    if (provider === 'openrouter') {
      autoTitle = await callOpenRouter(finalModel, titlePrompt)
    } else {
      autoTitle = await callOllama(finalModel, titlePrompt)
    }

    autoTitle = autoTitle.replace(/["']/g, '').trim()
  }

  return {
    assistantReply,
    title: autoTitle,
  }
}

module.exports = {
  processLLM,
}
