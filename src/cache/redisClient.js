const config = require('../config')
const logger = require('../utils/logger')

let client = null
let connectInFlight = null

const loadRedis = () => {
  try {
    return require('redis')
  } catch (_error) {
    logger.warn(
      '[redis] REDIS_URL set but `redis` package not installed; falling back to in-memory cache'
    )
    return null
  }
}

const getRedisClient = async () => {
  if (!config.redis.url) {
    logger.debug('[redis] disabled (REDIS_URL not set)')
    return null
  }
  if (client) {
    logger.debug('[redis] reusing connected client')

    return client
  }

  if (connectInFlight) {
    logger.debug('[redis] awaiting in-flight connect()')
    await connectInFlight
    return client
  }

  const redis = loadRedis()
  if (!redis) return null

  const { createClient } = redis
  client = createClient({ url: config.redis.url })

  client.on('error', (error) => {
    logger.error('[redis] client error', error)
  })

  logger.debug('[redis] connecting to', config.redis.url)
  connectInFlight = client
    .connect()
    .then(() => {
      logger.info('[redis] connected')
    })
    .catch((error) => {
      logger.error(
        '[redis] connect failed; falling back to in-memory cache',
        error
      )
      client = null
    })
    .finally(() => {
      connectInFlight = null
    })

  await connectInFlight
  return client
}

module.exports = { getRedisClient }
