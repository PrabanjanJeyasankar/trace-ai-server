const jwt = require('jsonwebtoken')
const User = require('../models/User')
const { AppError } = require('../middleware/errorHandler')
const config = require('../config')

const generateToken = (userId) => {
  return jwt.sign({ id: userId }, config.auth.jwtSecret, {
    expiresIn: '30d',
  })
}

const createUser = async (email, password) => {
  const existingUser = await User.findOne({ email })

  if (existingUser) {
    const isMatch = await existingUser.comparePassword(password)

    if (!isMatch) {
      throw new AppError('Email already registered. Please login.', 401)
    }

    return { existing: true, user: existingUser }
  }

  const newUser = await User.create({ email, password })

  return { existing: false, user: newUser }
}

const validateUserCredentials = async (email, password) => {
  const user = await User.findOne({ email })
  if (!user) {
    throw new AppError('Invalid email or password', 401)
  }

  const isMatch = await user.comparePassword(password)
  if (!isMatch) {
    throw new AppError('Invalid email or password', 401)
  }

  return user
}

const getUserById = (id) => {
  return User.findById(id).select('-password')
}

module.exports = {
  createUser,
  validateUserCredentials,
  generateToken,
  getUserById,
}
