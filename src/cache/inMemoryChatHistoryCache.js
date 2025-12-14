const config = require('../config')

const ttlMs = Math.max(1, config.redis.ttlSeconds) * 1000
const maxChats = Math.max(1, config.redis.inMemoryMaxChats)

const entries = new Map()

const now = () => Date.now()

const evictExpired = () => {
  const time = now()
  for (const [chatId, entry] of entries) {
    if (entry.expiresAt <= time) entries.delete(chatId)
  }
}

const touch = (chatId, entry) => {
  entries.delete(chatId)
  entries.set(chatId, entry)
}

const ensureSizeLimit = () => {
  while (entries.size > maxChats) {
    const oldestKey = entries.keys().next().value
    if (oldestKey == null) return
    entries.delete(oldestKey)
  }
}

const get = (chatId) => {
  evictExpired()
  const entry = entries.get(chatId)
  if (!entry) return null
  if (entry.expiresAt <= now()) {
    entries.delete(chatId)
    return null
  }
  touch(chatId, entry)
  return entry.messages
}

const set = (chatId, messages) => {
  evictExpired()
  const entry = { expiresAt: now() + ttlMs, messages }
  entries.set(chatId, entry)
  touch(chatId, entry)
  ensureSizeLimit()
}

const append = (chatId, newMessages) => {
  if (!Array.isArray(newMessages) || newMessages.length === 0) return
  const existing = get(chatId)
  if (!existing) return
  set(chatId, [...existing, ...newMessages])
}

const del = (chatId) => {
  entries.delete(chatId)
}

module.exports = { get, set, append, del }
