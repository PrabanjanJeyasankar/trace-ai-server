const mongoose = require('mongoose')

const newsArticleSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },

    source: {
      type: String,
      required: true,
      trim: true,
    },

    publishedAt: {
      type: Date,
      required: true,
    },

    content: {
      type: String,
      required: true,
    },

    summary: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
)

newsArticleSchema.index({ url: 1 })
newsArticleSchema.index({ publishedAt: -1 })
newsArticleSchema.index({ source: 1 })

module.exports = mongoose.model('NewsArticle', newsArticleSchema)
