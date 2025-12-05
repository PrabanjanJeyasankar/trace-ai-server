import jwt from 'jsonwebtoken'
import { config } from '../config/env.js'
import { User } from '../models/User.js'
import { ApiError } from '../utils/ApiError.js'

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, config.jwtSecret, {
    expiresIn: '30d',
  })
}

const createUser = async (email, password) => {
  const existingUser = await User.findOne({ email })
  if (existingUser) {
    throw new ApiError(409, 'User already exists')
  }

  const user = await User.create({ email, password })
  return user
}

const validateUserCredentials = async (email, password) => {
  const user = await User.findOne({ email })
  if (!user) {
    throw new ApiError(401, 'Invalid email or password')
  }

  const isMatch = await user.isPasswordCorrect(password)
  if (!isMatch) {
    throw new ApiError(401, 'Invalid email or password')
  }

  return user
}

export const authService = {
  createUser,
  validateUserCredentials,
  generateToken,
}
