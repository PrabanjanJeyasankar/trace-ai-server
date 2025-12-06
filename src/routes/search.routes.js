const router = require('express').Router()
const { search } = require('../controllers/search.controller')
const { protect } = require('../middleware/authMiddleware')

router.get('/', protect, search)

module.exports = router
