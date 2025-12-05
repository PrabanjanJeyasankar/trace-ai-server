const express = require('express')
const { healthCheck, getStatus } = require('../controllers/health.controller')

const router = express.Router()

router.get('/', healthCheck)
router.get('/status', getStatus)

module.exports = router
