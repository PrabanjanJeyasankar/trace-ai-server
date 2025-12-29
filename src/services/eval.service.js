const messageService = require('./message.service')
const mongoose = require('mongoose')
const fs = require('fs').promises
const path = require('path')

const EVAL_LOG_PATH = path.join(
  __dirname,
  '../../ragas-eval/datasets/collected_queries.jsonl'
)

const saveEvalQuery = async (data) => {
  try {
    const logEntry =
      JSON.stringify({
        timestamp: new Date().toISOString(),
        mode: data.mode,
        user_input: data.user_input,
        retrieved_contexts: data.retrieved_contexts,
        response: data.response,
        reference: data.reference || '',
      }) + '\n'

    await fs.appendFile(EVAL_LOG_PATH, logEntry)
    console.log('✅ Eval query saved to collected_queries.jsonl')
  } catch (error) {
    console.error('Failed to save eval query:', error)
  }
}

const runEvalQuery = async ({ mode, query }) => {
  const evalUserId = process.env.EVAL_USER_ID

  if (!evalUserId) {
    throw new Error('EVAL_USER_ID not configured in environment variables')
  }

  const userId = new mongoose.Types.ObjectId(evalUserId)

  let retrievedContexts = []
  let response = ''
  let sources = []

  const result = await messageService.createMessage({
    chatId: null,
    userId,
    content: query,
    mode,
    streaming: false,
    onProgress: () => {},
  })

  if (result.assistantMessage) {
    response = result.assistantMessage.versions[0]?.content || ''
    sources = result.assistantMessage.sources || []

    retrievedContexts = sources.map((source) => {
      if (mode === 'news') {
        return `[${source.title}]\n${
          source.content || source.snippet || ''
        }\nURL: ${source.url}`
      } else if (mode === 'law') {
        return `[${source.doc_id}, Page ${source.page_number}]\n${source.text}`
      }
      return source.text || source.content || ''
    })
  }

  let reference = ''
  if (mode === 'law' && sources.length > 0) {
    reference = sources
      .map((source) => `${source.doc_id} (Page ${source.page_number})`)
      .join(', ')
  } else if (mode === 'news' && sources.length > 0) {
    reference = sources.map((source) => source.url).join(', ')
  }

  const evalData = {
    user_input: query,
    retrieved_contexts: retrievedContexts,
    response,
    reference,
    mode,
  }

  await saveEvalQuery(evalData)

  return evalData
}

module.exports = {
  runEvalQuery,
}
