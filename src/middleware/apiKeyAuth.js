const { AppError } = require('./errorHandler')

const validateApiKey = (request, response, next) => {
  const apiKey = request.headers['x-api-key']
  const validApiKey = process.env.EVAL_API_KEY

  if (!validApiKey) {
    return next(
      new AppError('Evaluation API key not configured on server', 500)
    )
  }

  if (!apiKey) {
    return next(new AppError('API key required', 401))
  }

  if (apiKey !== validApiKey) {
    return next(new AppError('Invalid API key', 403))
  }

  next()
}

module.exports = { validateApiKey }
