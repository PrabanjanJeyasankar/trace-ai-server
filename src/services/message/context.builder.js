const buildMemoryContext = (memory) => {
  if (memory.length === 0) return ''

  const memoryContext = memory
    .map((m, idx) => `[${idx + 1}] ${m.role.toUpperCase()}: ${m.text}`)
    .join('\n')

  return `CONVERSATION CONTEXT:
        ${memoryContext}

        GUIDELINES:
        - Use this context to maintain conversation continuity
        - Reference prior discussion points naturally when relevant
        - Do not explicitly mention "memory" or "previous conversation" unless directly asked
        - If context conflicts with current query, prioritize the current query
        `
}

const buildNewsContext = (newsResults) => {
  if (newsResults.length === 0) return ''

  const sourcesList = newsResults
    .map((result, idx) => {
      const { title, url, source, startLine, endLine, text } = result.payload
      return `[NEWS SOURCE ${idx + 1}]
              Title: ${title}
              Publisher: ${source}
              Content:
              ${text}
              ---`
    })
    .join('\n\n')

  return `You are a news analyst. You MUST cite every statement with [number] matching the NEWS SOURCE number.

      MANDATORY CITATION FORMAT:
      - After EVERY factual statement, add [1], [2], [3] etc.
      - Example: "The president announced policy[1]. Markets rose[2]."
      - If articles don't answer the question: "The provided news articles do not contain information about this topic."
      - NEVER use your knowledge - ONLY the articles below
      - NEVER write a sentence without a citation [number]

      CORRECT EXAMPLE:
      Question: "What happened?"
      Answer: "The company announced layoffs[1]. The CEO cited budget concerns[1]. Analysts predict recovery[2]."

      NEWS ARTICLES:
      ${sourcesList}

      Every sentence MUST end with [number]. Start your response now:`
}

const buildLegalContext = (legalResults) => {
  if (legalResults.length === 0) return ''

  console.log('[buildLegalContext] legalResults count:', legalResults.length)

  const sourcesList = legalResults
    .map((result, idx) => {
      const { doc_id, chunk_index, text, page_number } = result.payload
      const pageInfo = page_number ? ` (Page ${page_number})` : ''
      return `[LEGAL SOURCE ${idx + 1}]
            Document: ${doc_id}${pageInfo}
            Chunk: ${chunk_index}
            Content:
            ${text}
            ---`
    })
    .join('\n\n')

  return `LEGAL DOCUMENTS CONTEXT:
        ${sourcesList}

        RESPONSE REQUIREMENTS:
        - Base your answer STRICTLY on the provided legal documents
        - CRITICAL: Use inline numbered citations [1], [2], [3] that match the LEGAL SOURCE number above
        - Place citation immediately after each statement: "The court ruled liability[1]."
        - If multiple sources support a point, cite all: "The precedent was established[1][2]."
        - If information is incomplete, ambiguous, or contradictory, explicitly state this limitation
        - Do NOT provide legal advice, opinions, or interpretations beyond what is explicitly stated in the documents
        - Do NOT introduce external legal knowledge, precedents, or assumptions
        - If the documents partially mention relevant information but do not clearly
            answer the question, summarize what is explicitly stated and note the limitation.
            Only respond with "The provided documents do not contain sufficient information"
            when no relevant information is present at all.
        - Maintain precise legal terminology as used in the source documents
        `
}

module.exports = {
  buildMemoryContext,
  buildNewsContext,
  buildLegalContext,
}
