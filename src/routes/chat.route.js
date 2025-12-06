const express = require('express')
const router = express.Router()
const {
  createChat,
  getChats,
  getChat,
  renameChat,
  deleteChat,
} = require('../controllers/chat.controller')
const { protect } = require('../middleware/authMiddleware')

router.post('/', protect, createChat)
router.get('/', protect, getChats)

router.get('/:chatId', protect, getChat)
router.patch('/:chatId', protect, renameChat)
router.delete('/:chatId', protect, deleteChat)

module.exports = router
