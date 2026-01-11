const { v4: uuidv4 } = require('uuid')

const ErrorCategory = {
  RETRIEVAL_EMPTY: 'retrieval_empty',
  RETRIEVAL_INSUFFICIENT: 'retrieval_insufficient',
  RERANKER_TIMEOUT: 'reranker_timeout',
  RERANKER_UNAVAILABLE: 'reranker_unavailable',
  LLM_RATE_LIMIT: 'llm_rate_limit',
  LLM_TIMEOUT: 'llm_timeout',
  LLM_CONTEXT_TOO_LONG: 'llm_context_too_long',
  EMBEDDING_FAILURE: 'embedding_failure',
  AUTH_INVALID: 'auth_invalid',
  VALIDATION_FAILED: 'validation_failed',
  UNKNOWN: 'unknown',
}

function categorizeError(error) {
  const message = (error.message || '').toLowerCase()
  const code = error.code || error.statusCode

  if (code === 429 || message.includes('rate limit')) {
    return ErrorCategory.LLM_RATE_LIMIT
  }
  if (message.includes('timeout') && message.includes('rerank')) {
    return ErrorCategory.RERANKER_TIMEOUT
  }
  if (message.includes('timeout')) {
    return ErrorCategory.LLM_TIMEOUT
  }
  if (message.includes('context') && message.includes('length')) {
    return ErrorCategory.LLM_CONTEXT_TOO_LONG
  }
  if (message.includes('embedding')) {
    return ErrorCategory.EMBEDDING_FAILURE
  }
  if (code === 401 || message.includes('auth') || message.includes('token')) {
    return ErrorCategory.AUTH_INVALID
  }
  if (code === 400 || message.includes('validation')) {
    return ErrorCategory.VALIDATION_FAILED
  }

  return ErrorCategory.UNKNOWN
}

function calculateAccountAgeDays(createdAt) {
  if (!createdAt) return null
  const created = new Date(createdAt)
  const now = new Date()
  const diffMs = now - created
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}

class WideEvent {
  constructor(options = {}) {
    this.data = {
      timestamp: new Date().toISOString(),
      request_id: options.requestId || uuidv4(),
      event_type: options.eventType || 'http_request',
      start_time: Date.now(),
    }

    if (options.method) this.data.method = options.method
    if (options.path) this.data.path = options.path
    if (options.socketId) this.data.socket_id = options.socketId

    this._completed = false
  }

  addUser(user) {
    if (!user) return this
    this.data.user = {
      id: String(user._id || user.id),
      email: user.email,
      name: user.name,
      is_active: user.isActive,
      account_age_days: calculateAccountAgeDays(user.createdAt),
      created_at: user.createdAt,
    }
    return this
  }

  addChat(chat, options = {}) {
    if (!chat) return this
    this.data.chat = {
      id: String(chat._id || chat.id),
      mode: chat.mode,
      message_count: chat.messages?.length || options.messageCount || 0,
      is_first_message: options.isFirstMessage || false,
      title: chat.title || options.title,
      created_at: chat.createdAt,
    }
    return this
  }

  addQuery(queryData) {
    if (!queryData) return this
    this.data.query = {
      text: queryData.text,
      length: queryData.text?.length || 0,
      mode: queryData.mode,
      message_id: queryData.messageId,
    }
    return this
  }

  addRAG(ragData) {
    if (!ragData) return this
    this.data.rag = {
      source_type: ragData.sourceType,
      query_normalized: ragData.queryNormalized,
      candidates_count: ragData.candidatesCount,
      reranked_count: ragData.rerankedCount,
      filtered_count: ragData.filteredCount,
      chunks_relevant: ragData.chunksRelevant,
      is_enough: ragData.isEnough,
      abort_reason: ragData.abortReason,
      retrieval_ms: ragData.retrievalMs,
      rerank_ms: ragData.rerankMs,
      filter_ms: ragData.filterMs,
      total_ms: ragData.totalMs,
      top_score: ragData.topScore,
      avg_score: ragData.avgScore,
    }
    return this
  }

  addLLM(llmData) {
    if (!llmData) return this
    this.data.llm = {
      provider: llmData.provider,
      model: llmData.model,
      is_streaming: llmData.isStreaming,
      tokens_in: llmData.tokensIn,
      tokens_out: llmData.tokensOut,
      tokens_total: llmData.tokensTotal,
      chunks_streamed: llmData.chunksStreamed,
      duration_ms: llmData.durationMs,
      system_prompt_length: llmData.systemPromptLength,
      message_count: llmData.messageCount,
      cache_hit: llmData.cacheHit,
    }
    return this
  }

  addTokenUsage(tokenUsage) {
    if (!tokenUsage) return this
    this.data.token_usage = {
      provider: tokenUsage.provider,
      model: tokenUsage.model,
      input_tokens: tokenUsage.inputTokens,
      output_tokens: tokenUsage.outputTokens,
      total_tokens: tokenUsage.totalTokens,
      cost_usd: tokenUsage.cost?.total,
      title_input_tokens: tokenUsage.titleTokenUsage?.inputTokens,
      title_output_tokens: tokenUsage.titleTokenUsage?.outputTokens,
    }
    return this
  }

  addMemory(memoryData) {
    if (!memoryData) return this
    this.data.memory = {
      searched: memoryData.searched,
      results_count: memoryData.resultsCount,
      duration_ms: memoryData.durationMs,
    }
    return this
  }

  addDatabase(dbData) {
    if (!dbData) return this
    this.data.database = {
      queries_count: dbData.queriesCount,
      duration_ms: dbData.durationMs,
      collections: dbData.collections,
    }
    return this
  }

  addError(error) {
    if (!error) return this
    this.data.error = {
      type: error.name || 'Error',
      message: error.message,
      code: error.code || error.statusCode,
      category: categorizeError(error),
      retriable: error.retriable || false,
      stack:
        process.env.NODE_ENV !== 'production'
          ? error.stack?.split('\n').slice(0, 5).join('\n')
          : undefined,
    }
    return this
  }

  addMetric(key, value) {
    if (!this.data.metrics) this.data.metrics = {}
    this.data.metrics[key] = value
    return this
  }

  addCache(cacheData) {
    if (!cacheData) return this
    this.data.cache = {
      hit: cacheData.hit,
      key: cacheData.key,
      ttl: cacheData.ttl,
    }
    return this
  }

  addWebSocket(wsData) {
    if (!wsData) return this
    this.data.websocket = {
      socket_id: wsData.socketId,
      event_name: wsData.eventName,
      message_id: wsData.messageId,
      streaming: wsData.streaming,
      chunks_sent: wsData.chunksSent,
      events_emitted: wsData.eventsEmitted,
    }
    return this
  }

  complete(statusCode, outcome = null) {
    if (this._completed) return this
    this._completed = true

    this.data.status_code = statusCode
    this.data.duration_ms = Date.now() - this.data.start_time
    delete this.data.start_time

    if (!outcome) {
      if (statusCode >= 500) outcome = 'error'
      else if (statusCode >= 400) outcome = 'client_error'
      else outcome = 'success'
    }
    this.data.outcome = outcome

    this.emit()
    return this
  }

  emit() {
    if (!shouldKeepEvent(this.data)) return

    const output =
      process.env.NODE_ENV === 'production'
        ? JSON.stringify(this.data)
        : JSON.stringify(this.data, null, 2)

    console.log(`[WIDE_EVENT] ${output}`)
  }
}

function shouldKeepEvent(event) {
  if (event.status_code >= 500) return true
  if (event.duration_ms > 2000) return true
  if (event.status_code >= 400) return true
  if (event.rag) return true
  if (event.llm) return true
  if (event.error) return true
  return Math.random() < 0.05
}

function createHttpEvent(req) {
  return new WideEvent({
    requestId: req.id || uuidv4(),
    eventType: 'http_request',
    method: req.method,
    path: req.path || req.url,
  })
}

function createWebSocketEvent(socket, eventName, messageId) {
  return new WideEvent({
    requestId: uuidv4(),
    eventType: 'websocket_message',
    socketId: socket.id,
  }).addWebSocket({
    socketId: socket.id,
    eventName,
    messageId,
  })
}

function createRequestEvent(req) {
  return createHttpEvent(req)
}

module.exports = {
  WideEvent,
  ErrorCategory,
  categorizeError,
  createHttpEvent,
  createWebSocketEvent,
  createRequestEvent,
}
