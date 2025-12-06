const { asyncHandler } = require('../middleware/asyncHandler')
const authService = require('../services/auth.service')
const logger = require('../utils/logger')
const { success } = require('../utils/response')

const signup = asyncHandler(async (request, response) => {
  const { email, password, name } = request.body

  const result = await authService.createUser(email, password, name)

  const token = authService.generateToken(result.user._id)

  if (result.existing) {
    return success(
      response,
      200,
      'User already exists. Logged in successfully',
      {
        user: {
          id: result.user._id,
          email: result.user.email,
        },
        token,
      }
    )
  }

  return success(response, 201, 'User registered successfully', {
    user: {
      id: result.user._id,
      email: result.user.email,
    },
    token,
  })
})

const login = asyncHandler(async (request, response) => {
  const { email, password } = request.body

  const user = await authService.validateUserCredentials(email, password)
  const token = authService.generateToken(user._id)

  success(response, 200, 'Login successful', {
    user: {
      id: user._id,
      email: user.email,
    },
    token,
  })
})

const me = asyncHandler(async (request, response) => {
  const user = await authService.getUserById(request.user.id)

  success(response, 200, 'User profile fetched', {
    user: {
      id: user._id,
      email: user.email,
      name: user.name,
    },
  })
})

module.exports = {
  signup,
  login,
  me,
}
