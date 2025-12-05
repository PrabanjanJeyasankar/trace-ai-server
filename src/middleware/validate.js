const { AppError } = require('./errorHandler')

module.exports = (schema) => (request, response, next) => {
  const parsed = schema.safeParse({
    body: request.body,
    query: request.query,
    params: request.params,
  })

  if (!parsed.success) {
    const formatted = parsed.error.errors.map((error) => ({
      field: error.path.join('.'),
      message: error.message,
    }))

    throw new AppError('Validation failed', 422, formatted)
  }

  next()
}
