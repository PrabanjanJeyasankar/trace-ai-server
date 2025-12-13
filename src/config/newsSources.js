const sourceQuality = {
  'BBC News': 1.2,
  'The New York Times': 1.2,
  Reuters: 1.2,
  'The Guardian': 1.1,
  'Associated Press': 1.2,
  NPR: 1.1,
  'The Washington Post': 1.1,
  CNN: 1.0,
  TechCrunch: 1.0,
  'Ars Technica': 1.0,
  'Hacker News': 0.9,
}

const DEFAULT_SOURCE_SCORE = 1.0

function getSourceScore(source) {
  return sourceQuality[source] || DEFAULT_SOURCE_SCORE
}

module.exports = {
  sourceQuality,
  getSourceScore,
  DEFAULT_SOURCE_SCORE,
}
