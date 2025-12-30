const { createProgressData } = require('../../utils/progressMessages')

const emitProgress = (onProgress, stage, substage, additionalData = {}) => {
  if (onProgress && typeof onProgress === 'function') {
    const progressData = createProgressData(stage, substage, additionalData)
    onProgress(stage, progressData)
  }
}

module.exports = { emitProgress }
