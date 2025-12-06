module.exports = {
  ollama: {
    name: 'ollama',
    baseUrl: process.env.OLLAMA_URL || 'http://localhost:11434',
  },

  openrouter: {
    name: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    apiKey: process.env.OPENROUTER_API_KEY,
  },
}
