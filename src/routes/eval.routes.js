const express = require('express')
const { runEvalQuery } = require('../controllers/eval.controller')
const { validateApiKey } = require('../middleware/apiKeyAuth')

const router = express.Router()

router.post('/query', validateApiKey, runEvalQuery)

module.exports = router
