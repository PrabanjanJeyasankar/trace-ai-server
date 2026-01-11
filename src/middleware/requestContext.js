const { v4: uuidv4 } = require('uuid')
const { createHttpEvent } = require('../utils/wideEventLogger')

function requestContext(req, res, next) {
  req.id = uuidv4()
  req.event = createHttpEvent(req)

  const originalEnd = res.end
  res.end = function (chunk, encoding) {
    if (req.event && !req.event._completed) {
      req.event.complete(res.statusCode)
    }
    return originalEnd.call(this, chunk, encoding)
  }

  next()
}

module.exports = requestContext
