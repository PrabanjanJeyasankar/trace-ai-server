const express = require('express')
const router = express.Router()
const { protect } = require('../middleware/authMiddleware')

const {
  createMessage,
  editMessage,
  regenerateMessage,
  getMessages,
} = require('../controllers/message.controller')

router.post('/', protect, createMessage)
router.post('/:chatId/messages', protect, createMessage)

router.get('/:chatId/messages', protect, getMessages)
router.patch('/:messageId', protect, editMessage)
router.post('/:messageId/regenerate', protect, regenerateMessage)

module.exports = router
