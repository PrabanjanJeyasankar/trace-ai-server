const axios = require('axios')
const logger = require('../utils/logger')

class RpcError extends Error {
  constructor(message, code, data) {
    super(message)
    this.name = 'RpcError'
    this.code = code
    this.data = data
  }
}

class RpcClient {
  constructor(url, options = {}) {
    this.url = url
    this.timeout = options.timeout || 15000
    this.serviceName = options.serviceName || 'unknown'
    this.lastRequestId = 0
    this.lastWarnAt = 0
    this.warnInterval = options.warnInterval || 30000
  }

  generateId() {
    this.lastRequestId = (this.lastRequestId + 1) % Number.MAX_SAFE_INTEGER
    return this.lastRequestId
  }

  async call(method, params) {
    if (!this.url) {
      throw new Error(`RPC URL not configured for ${this.serviceName}`)
    }

    const requestId = this.generateId()
    const payload = {
      jsonrpc: '2.0',
      method,
      params,
      id: requestId,
    }

    try {
      const response = await axios.post(this.url, payload, {
        timeout: this.timeout,
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response?.data?.error) {
        const rpcError = response.data.error
        throw new RpcError(
          rpcError.message || 'RPC error',
          rpcError.code,
          rpcError.data
        )
      }

      if (response?.data?.id !== requestId) {
        throw new Error('RPC response ID mismatch')
      }

      return response.data.result
    } catch (error) {
      this.logError(method, error)
      throw error
    }
  }

  logError(method, error) {
    const now = Date.now()
    if (now - this.lastWarnAt < this.warnInterval) {
      return
    }

    this.lastWarnAt = now

    const status = error?.response?.status
    const data = error?.response?.data
    const code = error?.code
    const message = error?.message || String(error)

    logger.warn(
      `[${this.serviceName}] RPC call failed. method=${method} url=${
        this.url
      } status=${status || 'n/a'} code=${code || 'n/a'} message=${message}`
    )

    if (data) {
      logger.warn(
        `[${this.serviceName}] Response: ${
          typeof data === 'string' ? data : JSON.stringify(data)
        }`
      )
    }
  }
}

module.exports = { RpcClient, RpcError }
