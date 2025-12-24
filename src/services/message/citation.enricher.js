const enrichCitationsWithUrls = (content, sources, mode = 'law') => {
  if (!content || !sources || sources.length === 0) return content

  if (mode === 'law') {
    // For law mode: enrich [Document: X, Page: Y] format
    const citationRegex = /\[Document:\s*([^,]+),\s*Page:\s*(\d+)\]/g

    return content.replace(citationRegex, (match, docName, page) => {
      const cleanDocName = docName.trim()
      const pageNum = parseInt(page)

      const source = sources.find((s) => {
        const sourceDocName = s.doc_id.split('/').pop()
        return (
          sourceDocName === cleanDocName ||
          s.doc_id.includes(cleanDocName) ||
          cleanDocName.includes(sourceDocName)
        )
      })

      if (!source || !source.pdf_url) {
        return match
      }

      const baseUrl = source.pdf_url.split('#')[0]
      const urlWithPage = `${baseUrl}#page=${pageNum}`

      return `[Document: ${cleanDocName}, Page: ${pageNum}, URL: ${urlWithPage}]`
    })
  } else if (mode === 'news') {
    // For news mode: enrich [1], [2], [3] format with clickable links
    const citationRegex = /\[(\d+)\]/g

    return content.replace(citationRegex, (match, num) => {
      const index = parseInt(num) - 1
      if (index < 0 || index >= sources.length) {
        return match
      }

      const source = sources[index]
      if (!source || !source.url) {
        return match
      }

      // Keep the [1] format but make it enriched for frontend display
      return match
    })
  }

  return content
}

module.exports = {
  enrichCitationsWithUrls,
}
