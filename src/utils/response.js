module.exports = {
  success(res, status, message, data = {}) {
    return res.status(status).json({
      success: true,
      message,
      data,
    })
  },

  fail(res, status, message, errors = null) {
    return res.status(status).json({
      success: false,
      message,
      errors,
    })
  },
}
