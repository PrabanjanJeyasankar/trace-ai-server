const formatResponse = (success, message, data = null, errors = null) => {
  return {
    success,
    message,
    ...(data !== null ? { data } : {}),
    ...(errors !== null ? { errors } : {}),
  }
}

module.exports = {
  success(response, status, message, data = {}) {
    return response.status(status).json(formatResponse(true, message, data))
  },

  error(response, status, message, errors = null) {
    return response
      .status(status)
      .json(formatResponse(false, message, null, errors))
  },

  formatResponse,
}
