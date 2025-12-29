const { asyncHandler } = require('../middleware/asyncHandler')
const authService = require('../services/auth.service')
const logger = require('../utils/logger')
const { success } = require('../utils/response')
const { AppError } = require('../middleware/errorHandler')

const signup = asyncHandler(async (request, response) => {
  const { email, password, name } = request.body

  logger.info(`[auth] signup:start email=${email}`)

  const result = await authService.createUser(email, password, name)

  const accessToken = authService.generateAccessToken(result.user._id)
  const refreshToken = authService.generateRefreshToken(result.user._id)

  await authService.storeRefreshToken(result.user._id, refreshToken)

  response.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000,
  })

  response.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })

  if (result.existing) {
    logger.info(
      `[auth] signup:existing userId=${result.user._id} email=${result.user.email}`
    )
    return success(
      response,
      200,
      'User already exists. Logged in successfully',
      {
        user: {
          id: result.user._id,
          email: result.user.email,
        },
      }
    )
  }

  logger.info(
    `[auth] signup:created userId=${result.user._id} email=${result.user.email}`
  )
  return success(response, 201, 'User registered successfully', {
    user: {
      id: result.user._id,
      email: result.user.email,
    },
  })
})

const login = asyncHandler(async (request, response) => {
  const { email, password } = request.body

  logger.info(`[auth] login:start email=${email}`)

  const user = await authService.validateUserCredentials(email, password)
  const accessToken = authService.generateAccessToken(user._id)
  const refreshToken = authService.generateRefreshToken(user._id)

  await authService.storeRefreshToken(user._id, refreshToken)

  response.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000,
  })

  response.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  })

  logger.info(`[auth] login:success userId=${user._id} email=${user.email}`)
  success(response, 200, 'Login successful', {
    user: {
      id: user._id,
      email: user.email,
    },
  })
})

const me = asyncHandler(async (request, response) => {
  const user = await authService.getUserById(request.user.id)

  logger.info(`[auth] me userId=${user._id} email=${user.email}`)
  success(response, 200, 'User profile fetched', {
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
    },
  })
})

const refresh = asyncHandler(async (request, response) => {
  const refreshToken = request.cookies.refreshToken

  logger.info(`[auth] refresh:start hasToken=${Boolean(refreshToken)}`)

  if (!refreshToken) {
    throw new AppError('Refresh token not found', 401)
  }

  const user = await authService.verifyRefreshToken(refreshToken)
  const accessToken = authService.generateAccessToken(user._id)

  response.cookie('accessToken', accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000,
  })

  logger.info(`[auth] refresh:success userId=${user._id} email=${user.email}`)
  success(response, 200, 'Token refreshed successfully', {
    user: {
      id: user._id,
      email: user.email,
    },
  })
})

const logout = asyncHandler(async (request, response) => {
  await authService.clearRefreshToken(request.user.id)

  logger.info(`[auth] logout userId=${request.user.id}`)

  response.clearCookie('accessToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  })

  response.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
  })

  success(response, 200, 'Logged out successfully', {})
})

module.exports = {
  signup,
  login,
  me,
  refresh,
  logout,
}
