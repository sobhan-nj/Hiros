import React from 'react'

const STEPS = [
  { key: 'parsing', label: 'Extracting keywords and building prompt...', percent: 25 },
  { key: 'llm', label: 'Running 21-dimension analysis...', percent: 60 },
  { key: 'report', label: 'Building your report...', percent: 90 },
]

function LoadingScreen({ step }) {
  const currentStep = STEPS.findIndex(s => s.key === step?.step)
  const percent = currentStep >= 0 ? STEPS[currentStep].percent : 10
  const message = step?.message || 'Preparing analysis...'

  return (
    <div className="loading-screen">
      <div className="loading-progress">
        <div className="loading-progress-bar" style={{ width: `${percent}%` }} />
      </div>
      <div className="loading-progress-label">{percent}%</div>
      <div className="loading-spinner"></div>
      <h2>Analyzing Your Resume</h2>
      <p className="loading-step">{message}</p>
      <p className="loading-hint">This may take 30-60 seconds</p>
    </div>
  )
}

export default LoadingScreen
