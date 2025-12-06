const mongoose = require('mongoose')

const messageVersionSchema = new mongoose.Schema(
  {
    content: { type: String, required: true, trim: true },
    model: { type: String, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
)

const messageSchema = new mongoose.Schema(
  {
    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      required: true,
    },

    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    role: {
      type: String,
      enum: ['user', 'assistant'],
      required: true,
    },

    versions: {
      type: [messageVersionSchema],
      default: [],
    },

    currentVersionIndex: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
)

messageSchema.index({ 'versions.content': 'text' })

module.exports = mongoose.model('Message', messageSchema)
