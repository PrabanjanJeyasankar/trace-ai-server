const config = require('../config')
const logger = require('../utils/logger')
const inMemory = require('./inMemoryChatHistoryCache')
const { getRedisClient } = require('./redisClient')

const keyForChat = (chatId) => `chat:${chatId}:messages:v1`

const normalizeMessage = (message) => {
  const obj =
    message && typeof message.toObject === 'function' ? message.toObject() : message

  if (!obj || typeof obj !== 'object') return obj

  const normalized = { ...obj }

  if (normalized._id?.toString) normalized._id = normalized._id.toString()
  if (normalized.chatId?.toString) normalized.chatId = normalized.chatId.toString()
  if (normalized.userId?.toString) normalized.userId = normalized.userId.toString()

  normalized.mode = normalized.mode || 'default'

  return normalized
}

const get = async (chatId) => {
  const fromMem = inMemory.get(chatId)
  if (fromMem) {
    logger.debug('[chatHistoryCache] hit (memory)', chatId)
    return fromMem
  }

  const redis = await getRedisClient()
  if (!redis) {
    logger.debug('[chatHistoryCache] miss (redis disabled)', chatId)
    return null
  }

  try {
    const raw = await redis.lRange(keyForChat(chatId), 0, -1)
    if (!raw || raw.length === 0) {
      logger.debug('[chatHistoryCache] miss (redis empty)', chatId)
      return null
    }

    const messages = raw.map((s) => JSON.parse(s))
    inMemory.set(chatId, messages)
    logger.debug('[chatHistoryCache] hit (redis)', chatId, `len=${messages.length}`)
    return messages
  } catch (error) {
    logger.warn('[chatHistoryCache] redis get failed; using in-memory only', error)
    return null
  }
}

const set = async (chatId, messages) => {
  const normalized = (messages || []).map(normalizeMessage)
  inMemory.set(chatId, normalized)
  logger.debug('[chatHistoryCache] set (memory)', chatId, `len=${normalized.length}`)

  const redis = await getRedisClient()
  if (!redis) return

  try {
    const key = keyForChat(chatId)
    const multi = redis.multi()
    multi.del(key)
    for (const msg of normalized) multi.rPush(key, JSON.stringify(msg))
    multi.expire(key, config.redis.ttlSeconds)
    if (config.redis.maxMessages > 0) multi.lTrim(key, -config.redis.maxMessages, -1)
    await multi.exec()
    logger.debug('[chatHistoryCache] set (redis)', chatId, `len=${normalized.length}`)
  } catch (error) {
    logger.warn('[chatHistoryCache] redis set failed; using in-memory only', error)
  }
}

const append = async (chatId, newMessages) => {
  const normalized = (newMessages || []).map(normalizeMessage)
  inMemory.append(chatId, normalized)
  if (normalized.length === 0) return
  logger.debug('[chatHistoryCache] append (memory)', chatId, `count=${normalized.length}`)

  const redis = await getRedisClient()
  if (!redis) return

  try {
    const key = keyForChat(chatId)
    const multi = redis.multi()
    for (const msg of normalized) multi.rPush(key, JSON.stringify(msg))
    if (config.redis.maxMessages > 0) multi.lTrim(key, -config.redis.maxMessages, -1)
    multi.expire(key, config.redis.ttlSeconds)
    await multi.exec()
    logger.debug('[chatHistoryCache] append (redis)', chatId, `count=${normalized.length}`)
  } catch (error) {
    logger.warn(
      '[chatHistoryCache] redis append failed; using in-memory only',
      error
    )
  }
}

const invalidate = async (chatId) => {
  inMemory.del(chatId)
  logger.debug('[chatHistoryCache] invalidate (memory)', chatId)

  const redis = await getRedisClient()
  if (!redis) return

  try {
    await redis.del(keyForChat(chatId))
    logger.debug('[chatHistoryCache] invalidate (redis)', chatId)
  } catch (error) {
    logger.warn(
      '[chatHistoryCache] redis invalidate failed; using in-memory only',
      error
    )
  }
}

module.exports = { get, set, append, invalidate }
