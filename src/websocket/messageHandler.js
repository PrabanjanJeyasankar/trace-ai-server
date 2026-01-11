const jwt = require('jsonwebtoken')
const config = require('../config')
const authService = require('../services/auth.service')
const messageService = require('../services/message.service')
const { PROGRESS_SCHEMA_VERSION } = require('../utils/progressMessages')
const { createWebSocketEvent } = require('../utils/wideEventLogger')

const authenticateSocket = async (socket, next) => {
  try {
    const token = socket.handshake.headers.cookie
      ?.split(';')
      ?.find((c) => c.trim().startsWith('accessToken='))
      ?.split('=')[1]

    if (!token) {
      return next(new Error('No authentication token provided'))
    }

    const decoded = jwt.verify(token, config.auth.jwtSecret)
    const user = await authService.getUserById(decoded.id)

    if (!user) {
      return next(new Error('User no longer exists'))
    }

    if (user.isActive === false) {
      return next(new Error('Account is disabled'))
    }

    socket.user = user
    next()
  } catch (error) {
    next(new Error('Authentication failed'))
  }
}

const handleCreateMessage = async (socket, data) => {
  const messageId = data?.messageId || 'unknown'
  const { chatId, content, mode, streaming = true } = data

  const wideEvent = createWebSocketEvent(socket, 'message:create', messageId)
  wideEvent.addUser(socket.user)
  wideEvent.addQuery({ text: content, mode, messageId })

  let eventsEmitted = 0
  let chunksSent = 0

  const emitToClient = (eventName, payload) => {
    socket.emit(eventName, payload)
    eventsEmitted++
  }

  try {
    emitToClient('message:received', {
      messageId,
      status: 'received',
      timestamp: new Date().toISOString(),
    })

    emitToClient('message:processing', {
      messageId,
      status: 'processing',
      stage: 'creating_user_message',
      timestamp: new Date().toISOString(),
    })

    const result = await messageService.createMessage({
      chatId,
      userId: socket.user.id,
      content,
      mode,
      streaming,
      wideEvent,
      onProgress: (stage, details) => {
        emitToClient('message:progress', {
          messageId,
          stage,
          details,
          timestamp: new Date().toISOString(),
        })

        if (stage === 'chain_of_thoughts') {
          emitToClient('message:chain_of_thoughts', {
            messageId,
            phase: details?.phase,
            status: details?.status,
            analysis: details?.analysis,
            strategy: details?.strategy,
            evaluation: details?.evaluation,
            sourceCount: details?.sourceCount,
            reasoning: details?.reasoning,
            phases: details?.phases,
            timestamp: new Date().toISOString(),
          })
        }
      },
      onLLMChunk: (chunkData) => {
        chunksSent++
        emitToClient('message:chunk', {
          messageId,
          ...chunkData,
          timestamp: new Date().toISOString(),
        })
      },
      onLLMComplete: (completeData) => {
        emitToClient('message:llm_complete', {
          messageId,
          ...completeData,
          timestamp: new Date().toISOString(),
        })
      },
      onLLMError: (errorData) => {
        emitToClient('message:llm_error', {
          messageId,
          ...errorData,
          timestamp: new Date().toISOString(),
        })
      },
    })

    const cleanResult = {
      chatId: result.chatId,
      userMessage: result.userMessage?.toObject
        ? result.userMessage.toObject()
        : result.userMessage,
      assistantMessage: result.assistantMessage?.toObject
        ? result.assistantMessage.toObject()
        : result.assistantMessage,
      isFirstMessage: result.isFirstMessage,
      title: result.title || null,
    }

    emitToClient('message:completed', {
      messageId,
      status: 'completed',
      data: cleanResult,
      timestamp: new Date().toISOString(),
    })

    if (result.metrics?.rag) {
      wideEvent.addRAG(result.metrics.rag)
    }

    if (result.metrics?.memory) {
      wideEvent.addMemory(result.metrics.memory)
    }

    if (result.metrics?.llm) {
      wideEvent.addLLM({
        ...result.metrics.llm,
        chunksStreamed: chunksSent,
      })
    }

    wideEvent.addChat(
      { _id: result.chatId, mode },
      { isFirstMessage: result.isFirstMessage, title: result.title }
    )

    wideEvent.addWebSocket({
      socketId: socket.id,
      eventName: 'message:create',
      messageId,
      streaming,
      chunksSent,
      eventsEmitted,
    })

    wideEvent.complete(200)
  } catch (error) {
    wideEvent.addError(error)
    wideEvent.complete(error.statusCode || 500)

    emitToClient('message:error', {
      messageId,
      status: 'error',
      error: {
        message: error.message,
        code: error.statusCode || error.status || 500,
      },
      timestamp: new Date().toISOString(),
    })
  }
}

const setupWebSocketHandlers = (io) => {
  io.use(authenticateSocket)

  io.on('connection', (socket) => {
    socket.join(`user_${socket.user.id}`)

    socket.on('message:create', (data) => handleCreateMessage(socket, data))

    socket.on('disconnect', () => {})

    socket.on('error', () => {})

    socket.emit('connected', {
      socketId: socket.id,
      userId: socket.user.id,
      progressVersion: PROGRESS_SCHEMA_VERSION,
      timestamp: new Date().toISOString(),
    })
  })
}

module.exports = {
  setupWebSocketHandlers,
}
