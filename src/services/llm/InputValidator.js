const { ApiError } = require('../../utils/ApiError')
const { MAX_SINGLE_MESSAGE_CHARS, ERRORS } = require('../../config/llmLimits')

class InputValidator {
  validateMessages(messages) {
    if (!messages || messages.length === 0) return

    const last = messages[messages.length - 1]
    const charCount = [...last.content].length

    if (charCount > MAX_SINGLE_MESSAGE_CHARS) {
      throw new ApiError(400, ERRORS.TOO_LONG_SINGLE)
    }
  }

  validateStreamingCallbacks(callbacks) {
    const { onChunk, onComplete, onError } = callbacks
    if (!onChunk || typeof onChunk !== 'function') {
      throw new ApiError(400, 'onChunk callback is required for streaming')
    }
    if (!onComplete || typeof onComplete !== 'function') {
      throw new ApiError(400, 'onComplete callback is required for streaming')
    }
    if (!onError || typeof onError !== 'function') {
      throw new ApiError(400, 'onError callback is required for streaming')
    }
  }
}

module.exports = new InputValidator()
