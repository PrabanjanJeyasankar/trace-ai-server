const express = require('express')
const healthRoutes = require('./health.routes')
const authRoutes = require('./auth.routes.js')
const chatRoutes = require('./chat.route.js')
const messageRoutes = require('./message.route.js')
const searchRoutes = require('./search.routes.js')

const router = express.Router()

router.use('/health', healthRoutes)
router.use('/auth', authRoutes)
router.use('/chat', chatRoutes)
router.use('/message', messageRoutes)
router.use('/search', searchRoutes)

module.exports = router
