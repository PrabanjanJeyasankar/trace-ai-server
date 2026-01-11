const memoryService = require('../embeddings/memory.service')
const {
  runNewsRagPipeline,
  runLegalRagPipeline,
} = require('../../rag/pipeline/ragPipeline')

class RAGOrchestrator {
  async execute(config) {
    const { chat, content, onProgress } = config

    const results = {
      newsResults: [],
      newsAbortMessage: null,
      legalResults: [],
      legalAbortMessage: null,
      metrics: null,
    }

    if (chat.mode === 'news') {
      const newsResult = await this._runNewsRAG(content, onProgress)
      results.newsResults = newsResult.chunks
      results.newsAbortMessage = newsResult.abortMessage
      results.metrics = newsResult.metrics
    } else if (chat.mode === 'law') {
      const legalResult = await this._runLegalRAG(content, onProgress)
      results.legalResults = legalResult.chunks
      results.legalAbortMessage = legalResult.abortMessage
      results.metrics = legalResult.metrics
    }

    return results
  }

  async _runNewsRAG(query, onProgress) {
    this._emitRAGProgress(onProgress, 'starting', { source: 'news articles' })

    const ragResult = await runNewsRagPipeline({
      query,
      onProgress: (stage, data) =>
        this._emitRAGProgress(onProgress, stage, data),
    })

    if (!ragResult.ok) {
      this._emitRAGProgress(onProgress, 'insufficient_data')
      return {
        chunks: [],
        abortMessage: ragResult.message,
        metrics: ragResult.metrics,
      }
    }

    this._emitRAGProgress(onProgress, 'completed', {
      count: ragResult.chunks?.length || 0,
    })

    return {
      chunks: ragResult.chunks,
      abortMessage: null,
      metrics: ragResult.metrics,
    }
  }

  async _runLegalRAG(query, onProgress) {
    this._emitRAGProgress(onProgress, 'starting', { source: 'legal documents' })

    const ragResult = await runLegalRagPipeline({
      query,
      onProgress: (stage, data) =>
        this._emitRAGProgress(onProgress, stage, data),
    })

    if (!ragResult.ok) {
      this._emitRAGProgress(onProgress, 'insufficient_data')
      return {
        chunks: [],
        abortMessage: ragResult.message,
        metrics: ragResult.metrics,
      }
    }

    this._emitRAGProgress(onProgress, 'completed', {
      count: ragResult.chunks?.length || 0,
    })

    return {
      chunks: ragResult.chunks,
      abortMessage: null,
      metrics: ragResult.metrics,
    }
  }

  _emitRAGProgress(onProgress, stage, data) {
    if (onProgress) {
      onProgress('rag_pipeline', stage, data)
    }
  }
}

module.exports = new RAGOrchestrator()
