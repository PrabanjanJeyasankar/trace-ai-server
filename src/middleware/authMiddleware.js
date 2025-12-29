const jwt = require('jsonwebtoken')
const { AppError } = require('./errorHandler')
const authService = require('../services/auth.service')
const config = require('../config')
const logger = require('../utils/logger')

const protect = async (request, response, next) => {
  const accessToken = request.cookies.accessToken
  const refreshToken = request.cookies.refreshToken

  if (!accessToken) {
    logger.warn('[auth] protect:missing access token')
    throw new AppError('Not authorized', 401)
  }

  try {
    const decoded = jwt.verify(accessToken, config.auth.jwtSecret)
    const user = await authService.getUserById(decoded.id)

    if (!user) {
      logger.warn(`[auth] protect:user missing userId=${decoded.id}`)
      throw new AppError('User no longer exists', 404)
    }

    if (user.isActive === false) {
      logger.warn(`[auth] protect:user disabled userId=${decoded.id}`)
      throw new AppError('Account is disabled', 403)
    }

    request.user = user
    logger.info(`[auth] protect:success userId=${user._id}`)
    next()
  } catch (error) {
    // If access token is expired but refresh token exists, try auto-refresh
    if (error.name === 'TokenExpiredError' && refreshToken) {
      logger.info(
        '[auth] protect:access token expired, attempting auto-refresh'
      )

      try {
        // Verify refresh token
        const user = await authService.verifyRefreshToken(refreshToken)

        // Generate new access token
        const newAccessToken = authService.generateAccessToken(user._id)

        // Set new access token cookie
        response.cookie('accessToken', newAccessToken, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
          maxAge: 15 * 60 * 1000,
        })

        request.user = user
        logger.info(`[auth] protect:auto-refresh success userId=${user._id}`)
        return next()
      } catch (refreshError) {
        logger.warn(
          `[auth] protect:auto-refresh failed error=${refreshError.message}`
        )
        throw new AppError('Invalid or expired refresh token', 401)
      }
    }

    logger.warn(
      `[auth] protect:invalid token error=${error?.message || 'unknown'}`
    )
    throw new AppError('Invalid or expired token', 401)
  }
}

module.exports = { protect }
