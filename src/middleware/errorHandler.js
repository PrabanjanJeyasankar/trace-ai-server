const logger = require('../utils/logger')

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

  return response.status(status).json({
    success: false,
    message: error.message || 'Internal server error',
    errors: error.errors || null,
    stack: isDev ? error.stack : undefined,
  })
}

module.exports = { AppError, errorHandler }
