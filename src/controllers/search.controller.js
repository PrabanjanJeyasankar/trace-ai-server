const { asyncHandler } = require('../middleware/asyncHandler')
const { success } = require('../utils/response')
const { searchMessages } = require('../services/search.service')

const search = asyncHandler(async (request, response) => {
  const userId = request.user.id
  const query = request.query.q

  if (!query || query.trim() === '') {
    return success(response, 200, 'No query provided', { results: [] })
  }

  const results = await searchMessages({
    userId,
    query,
    page: Number(request.query.page) || 1,
    limit: Number(request.query.limit) || 20,
  })

  return success(response, 200, 'Search results', { results })
})

module.exports = { search }
