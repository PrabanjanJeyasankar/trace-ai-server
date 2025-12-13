const express = require('express')
const { asyncHandler } = require('../middleware/asyncHandler')
const { ingestNews, searchNews } = require('../controllers/news.controller')
const { protect } = require('../middleware/authMiddleware')

const router = express.Router()

router.post('/ingest', protect, asyncHandler(ingestNews))

router.get('/search', protect, asyncHandler(searchNews))

module.exports = router
