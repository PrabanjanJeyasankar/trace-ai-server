const { asyncHandler } = require('../middleware/asyncHandler')

const healthCheck = asyncHandler(async (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

const getStatus = asyncHandler(async (req, res) => {
  res.status(200).json({
    status: 'success',
    data: {
      environment: process.env.NODE_ENV,
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    },
  })
})

module.exports = {
  healthCheck,
  getStatus,
}
