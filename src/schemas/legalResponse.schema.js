const { z } = require('zod')

const CitationSchema = z.object({
  document: z.string().describe('The document filename (e.g., Case_Name.pdf)'),
  page: z.number().describe('The page number in the document'),
  sourceIndex: z.number().describe('The LEGAL SOURCE number (1-indexed)'),
})

const ResponsePointSchema = z.object({
  point: z.string().describe('The main statement or finding'),
  citations: z
    .array(CitationSchema)
    .describe('Citations supporting this point'),
})

const LegalResponseSchema = z.object({
  answer: z
    .array(ResponsePointSchema)
    .describe('Array of response points with inline citations'),
  summary: z.string().optional().describe('Optional summary or conclusion'),
  sourcesReferenced: z
    .array(
      z.object({
        document: z.string(),
        pages: z.array(z.number()),
      })
    )
    .describe('Summary of all documents and pages referenced'),
})

module.exports = {
  LegalResponseSchema,
  CitationSchema,
  ResponsePointSchema,
}
