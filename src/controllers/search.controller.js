const { asyncHandler } = require('../middleware/asyncHandler')
const { success } = require('../utils/response')
const { searchMessages } = require('../services/search.service')

const search = asyncHandler(async (request, response) => {
  const userId = request.user.id
  const query = request.query.q

  request.event.addUser(request.user)
  request.event.addQuery({ text: query, mode: 'search' })

  if (!query || query.trim() === '') {
    return success(response, 200, 'No query provided', { results: [] })
  }

  const results = await searchMessages({
    userId,
    query,
    page: Number(request.query.page) || 1,
    limit: Number(request.query.limit) || 20,
  })

  request.event.addMetric('search_results_count', results.length)

  return success(response, 200, 'Search results', { results })
})

module.exports = { search }
