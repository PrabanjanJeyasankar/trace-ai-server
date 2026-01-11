const PRICING = {
  openai: {
    'gpt-4o': { input: 2.5 / 1_000_000, output: 10 / 1_000_000 },
    'gpt-4o-mini': { input: 0.15 / 1_000_000, output: 0.6 / 1_000_000 },
    'gpt-4-turbo': { input: 10 / 1_000_000, output: 30 / 1_000_000 },
    'gpt-4': { input: 30 / 1_000_000, output: 60 / 1_000_000 },
    'gpt-3.5-turbo': { input: 0.5 / 1_000_000, output: 1.5 / 1_000_000 },
    default: { input: 0.5 / 1_000_000, output: 1.5 / 1_000_000 },
  },

  anthropic: {
    'claude-3-opus': { input: 15 / 1_000_000, output: 75 / 1_000_000 },
    'claude-3-sonnet': { input: 3 / 1_000_000, output: 15 / 1_000_000 },
    'claude-3-haiku': { input: 0.25 / 1_000_000, output: 1.25 / 1_000_000 },
    default: { input: 3 / 1_000_000, output: 15 / 1_000_000 },
  },

  ollama: {
    default: { input: 0, output: 0 },
  },
}

function getPricing(provider, model) {
  const providerPricing = PRICING[provider] || PRICING.ollama

  if (providerPricing[model]) {
    return providerPricing[model]
  }

  const partialMatch = Object.keys(providerPricing).find(
    (key) =>
      key !== 'default' && model.toLowerCase().includes(key.toLowerCase())
  )

  if (partialMatch) {
    return providerPricing[partialMatch]
  }

  return providerPricing.default || { input: 0, output: 0 }
}

function calculateCost(provider, model, inputTokens, outputTokens) {
  const pricing = getPricing(provider, model)

  const inputCost = inputTokens * pricing.input
  const outputCost = outputTokens * pricing.output

  return {
    input: Math.round(inputCost * 1_000_000) / 1_000_000,
    output: Math.round(outputCost * 1_000_000) / 1_000_000,
    total: Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000,
    currency: 'USD',
  }
}

module.exports = {
  PRICING,
  getPricing,
  calculateCost,
}
