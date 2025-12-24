const buildNewsMessageSources = (newsResults) => {
  return newsResults.map((result) => ({
    title: result.payload.title,
    url: result.payload.url,
    source: result.payload.source,
    lines: `${result.payload.startLine}-${result.payload.endLine}`,
    publishedAt: new Date(result.payload.publishedAt).toISOString(),
    similarity: result.rerankScore ?? 0,
    finalScore: result.rerankScore ?? 0,
  }))
}

const buildLegalMessageSources = (legalResults) => {
  const uniqueSources = new Map()

  legalResults.forEach((result) => {
    const baseUrl = result.payload.pdf_url || ''
    const pageNumber = result.payload.page_number
    const docId = result.payload.doc_id

    const key = `${docId}_${pageNumber}`

    if (!uniqueSources.has(key)) {
      const pdfUrlWithPage =
        baseUrl && pageNumber ? `${baseUrl}#page=${pageNumber}` : baseUrl

      uniqueSources.set(key, {
        doc_id: docId,
        chunk_index: result.payload.chunk_index,
        text: result.payload.text,
        page_number: pageNumber,
        pdf_url: pdfUrlWithPage,
        similarity: result.rerankScore ?? 0,
        finalScore: result.rerankScore ?? 0,
      })
    }
  })

  return Array.from(uniqueSources.values())
}

module.exports = {
  buildNewsMessageSources,
  buildLegalMessageSources,
}
