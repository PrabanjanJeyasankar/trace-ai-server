const { AppError } = require('./errorHandler')

module.exports = (schema) => (req, res, next) => {
  const result = schema.safeParse({
    body: req.body,
    query: req.query,
    params: req.params,
  })

  if (!result.success) {
    const formatted = result.error.errors.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    }))

    throw new AppError('Validation failed', 422, formatted)
  }

  Object.assign(req, result.data)
  next()
}
