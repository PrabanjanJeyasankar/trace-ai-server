const logger = require('../utils/logger')
const { formatResponse } = require('../utils/response')

class AppError extends Error {
  constructor(message, statusCode, errors = null) {
    super(message)
    this.statusCode = statusCode
    this.errors = errors
  }
}

const errorHandler = (error, request, response, next) => {
  const status = error.statusCode || 500
  const isDev = process.env.NODE_ENV !== 'production'

  logger.error(error.message)

  const formatted = formatResponse(
    false,
    error.message || 'Internal server error',
    null,
    error.errors || null
  )

  if (isDev) formatted.stack = error.stack

  return response.status(status).json(formatted)
}

module.exports = { AppError, errorHandler }
