const express = require('express')
const cors = require('cors')
const cookieParser = require('cookie-parser')
const router = require('./routes')
const { AppError, errorHandler } = require('./middleware/errorHandler')
const requestContext = require('./middleware/requestContext')
const logger = require('./utils/logger')
const { globalRateLimiter } = require('./utils/rateLimiter')
const config = require('./config')

const app = express()

app.set('trust proxy', 1)

app.use((request, response, next) => {
  logger.info(`${request.method} ${request.originalUrl}`)
  next()
})

app.use(cors(config.cors))
app.use(cookieParser())
app.use(express.json({ limit: '50mb' }))
app.use(express.urlencoded({ extended: true, limit: '50mb' }))

app.use(requestContext)
app.use('/api/v1', globalRateLimiter, router)

app.use((request, response, next) => {
  next(new AppError('Route not found', 404))
})

app.use(errorHandler)

module.exports = app
