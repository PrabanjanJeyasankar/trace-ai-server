const memoryService = require('../embeddings/memory.service')

class MemoryOrchestrator {
  async saveUserMessage(config) {
    const { userId, chatId, messageId, content } = config
    await memoryService.saveMessageVector({
      userId,
      chatId,
      messageId,
      role: 'user',
      content,
    })
  }

  async saveAssistantMessage(config) {
    const { userId, chatId, messageId, content } = config
    await memoryService.saveMessageVector({
      userId,
      chatId,
      messageId,
      role: 'assistant',
      content,
    })
  }

  async searchRelevant(config) {
    const { userId, chatId, content, isFirstMessage, mode, onProgress } = config

    if (isFirstMessage || mode === 'news' || mode === 'law') {
      return {
        results: [],
        metrics: {
          searched: false,
          resultsCount: 0,
          durationMs: 0,
        },
      }
    }

    this._emitProgress(onProgress, 'memory_recall', 'searching')

    const startTime = Date.now()
    const memory = await memoryService.searchRelevant({
      userId,
      chatId,
      content,
      limit: 5,
      minScore: 0.35,
    })
    const durationMs = Date.now() - startTime

    if (memory.length > 0) {
      this._emitProgress(onProgress, 'memory_recall', 'found', {
        count: memory.length,
      })
    } else {
      this._emitProgress(onProgress, 'memory_recall', 'none_found')
    }

    return {
      results: memory,
      metrics: {
        searched: true,
        resultsCount: memory.length,
        durationMs,
      },
    }
  }

  _emitProgress(onProgress, stage, status, data) {
    if (onProgress) {
      onProgress(stage, status, data)
    }
  }
}

module.exports = new MemoryOrchestrator()
