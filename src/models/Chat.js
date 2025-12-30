const mongoose = require('mongoose')

const chatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    title: {
      type: String,
      default: 'New Chat',
      trim: true,
    },

    isTitleFinal: {
      type: Boolean,
      default: false,
    },

    model: {
      type: String,
      default: 'default',
    },

    mode: {
      type: String,
      enum: ['default', 'news', 'law'],
      default: 'default',
    },

    lastMessage: {
      type: String,
      default: '',
    },

    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
)

module.exports = mongoose.model('Chat', chatSchema)
