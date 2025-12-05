const express = require('express')
const cors = require('cors')
const router = require('./routes')
const { AppError, errorHandler } = require('./middleware/errorHandler')
const logger = require('./utils/logger')

const app = express()

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.originalUrl}`)
  next()
})

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api/v1', router)

app.use((req, res, next) => {
  next(new AppError('Route not found', 404))
})

app.use(errorHandler)

module.exports = app
