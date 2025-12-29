const { asyncHandler } = require('../middleware/asyncHandler')
const evalService = require('../services/eval.service')
const responseFormatter = require('../utils/response')

const runEvalQuery = asyncHandler(async (request, response) => {
  const { mode, query } = request.body

  if (!mode || !query) {
    return responseFormatter.error(response, 400, 'mode and query are required')
  }

  if (!['news', 'law'].includes(mode)) {
    return responseFormatter.error(response, 400, 'mode must be news or law')
  }

  const result = await evalService.runEvalQuery({
    mode,
    query,
  })

  return responseFormatter.success(
    response,
    200,
    'Evaluation query completed',
    result
  )
})

module.exports = {
  runEvalQuery,
}
