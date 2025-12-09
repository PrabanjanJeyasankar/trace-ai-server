const jwt = require('jsonwebtoken')
const { AppError } = require('./errorHandler')
const authService = require('../services/auth.service')
const config = require('../config')

const protect = async (request, response, next) => {
  const token = request.cookies.accessToken

  if (!token) {
    throw new AppError('Not authorized', 401)
  }

  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret)
    const user = await authService.getUserById(decoded.id)

    if (!user) {
      throw new AppError('User no longer exists', 404)
    }

    if (user.isActive === false) {
      throw new AppError('Account is disabled', 403)
    }

    request.user = user
    next()
  } catch (error) {
    throw new AppError('Invalid or expired token', 401)
  }
}

module.exports = { protect }
