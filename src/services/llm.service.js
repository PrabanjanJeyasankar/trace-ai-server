const axios = require('axios')
const providers = require('../config/providers')
const config = require('../config')
const { ApiError } = require('../utils/ApiError')
const { MAX_SINGLE_MESSAGE_CHARS, ERRORS } = require('../config/llmLimits')

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

const callOpenAI = async (model, messages) => {
  const response = await axios.post(
    'https://api.openai.com/v1/chat/completions',
    {
      model,
      messages,
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${providers.openai.apiKey}`,
      },
      timeout: 30000,
    }
  )

  return response.data?.choices?.[0]?.message?.content?.trim() || ''
}

const callOllama = async ({ baseUrl, model, messages }) => {
  const url = `${baseUrl.replace(/\/$/, '')}/api/chat`

  const response = await axios.post(
    url,
    {
      model,
      messages,
      stream: false,
    },
    { headers: { 'Content-Type': 'application/json' }, timeout: 300000 }
  )

  const content = response.data?.message?.content || ''
  return content.trim()
}

const generateTitlePrompt = (message) => [
  {
    role: 'user',
    content:
      "Generate a short factual title summarizing the user's message. Strict rules: 1) Maximum 4 words, 2) No poetic or motivational phrases, 3) No punctuation, 4) Must directly reflect message topic, 5) Output only the title.",
  },
  { role: 'user', content: message },
]

const processLLM = async ({ messages, isFirstMessage }) => {
  validateLLMInput(messages)

  const { name, model, baseUrl } = resolveProvider()

  let assistantReply
  if (name === 'ollama') {
    assistantReply = await callOllama({ baseUrl, model, messages })
  } else {
    assistantReply = await callOpenAI(model, messages)
  }

  let autoTitle = null
  if (isFirstMessage) {
    const titleMessages = generateTitlePrompt(messages[0].content)

    let raw
    if (name === 'ollama') {
      raw = await callOllama({ baseUrl, model, messages: titleMessages })
    } else {
      raw = await callOpenAI(model, titleMessages)
    }

    autoTitle = raw.replace(/["']/g, '').trim().slice(0, 80)
  }

  return {
    assistantReply,
    title: autoTitle,
  }
}

module.exports = { processLLM }
