const mongoose = require('mongoose')

const tokenUsageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    chatId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Chat',
      index: true,
    },

    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message',
    },

    requestId: {
      type: String,
      index: true,
    },

    provider: {
      type: String,
      enum: ['openai', 'ollama', 'anthropic'],
      required: true,
      index: true,
    },

    model: {
      type: String,
      required: true,
    },

    operation: {
      type: String,
      enum: ['chat', 'title_generation', 'embedding', 'structured_output'],
      default: 'chat',
    },

    tokens: {
      input: {
        type: Number,
        required: true,
        default: 0,
      },
      output: {
        type: Number,
        required: true,
        default: 0,
      },
      total: {
        type: Number,
        required: true,
        default: 0,
      },
    },

    cost: {
      input: {
        type: Number,
        default: 0,
      },
      output: {
        type: Number,
        default: 0,
      },
      total: {
        type: Number,
        default: 0,
      },
      currency: {
        type: String,
        default: 'USD',
      },
    },

    metadata: {
      streaming: Boolean,
      durationMs: Number,
      chunksCount: Number,
      mode: String,
    },
  },
  {
    timestamps: true,
  }
)

tokenUsageSchema.index({ userId: 1, createdAt: -1 })
tokenUsageSchema.index({ provider: 1, createdAt: -1 })
tokenUsageSchema.index({ userId: 1, provider: 1, createdAt: -1 })

tokenUsageSchema.statics.getUserTotalUsage = async function (
  userId,
  options = {}
) {
  const { startDate, endDate, provider } = options

  const match = { userId: new mongoose.Types.ObjectId(userId) }

  if (startDate || endDate) {
    match.createdAt = {}
    if (startDate) match.createdAt.$gte = new Date(startDate)
    if (endDate) match.createdAt.$lte = new Date(endDate)
  }

  if (provider) {
    match.provider = provider
  }

  const result = await this.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$provider',
        totalInputTokens: { $sum: '$tokens.input' },
        totalOutputTokens: { $sum: '$tokens.output' },
        totalTokens: { $sum: '$tokens.total' },
        totalCost: { $sum: '$cost.total' },
        requestCount: { $sum: 1 },
      },
    },
  ])

  return result
}

tokenUsageSchema.statics.getUsageByDateRange = async function (
  userId,
  startDate,
  endDate
) {
  const result = await this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(endDate),
        },
      },
    },
    {
      $group: {
        _id: {
          date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          provider: '$provider',
        },
        inputTokens: { $sum: '$tokens.input' },
        outputTokens: { $sum: '$tokens.output' },
        totalTokens: { $sum: '$tokens.total' },
        cost: { $sum: '$cost.total' },
        requests: { $sum: 1 },
      },
    },
    { $sort: { '_id.date': 1 } },
  ])

  return result
}

module.exports = mongoose.model('TokenUsage', tokenUsageSchema)
