const express = require('express')
const healthRoutes = require('./health.routes')
const authRoutes = require('./auth.routes.js')
const chatRoutes = require('./chat.route.js')
const messageRoutes = require('./message.route.js')
const searchRoutes = require('./search.routes.js')
const newsRoutes = require('./news.routes.js')
const evalRoutes = require('./eval.routes.js')

const router = express.Router()

router.use('/health', healthRoutes)
router.use('/auth', authRoutes)
router.use('/chat', chatRoutes)
router.use('/message', messageRoutes)
router.use('/search', searchRoutes)
router.use('/news', newsRoutes)
router.use('/eval', evalRoutes)

module.exports = router
