import React, { useState, useEffect } from 'react'

const steps = [
  'Extracting text from PDF...',
  'Parsing document structure...',
  'Extracting keywords...',
  'Running 21-dimension analysis...',
  'Generating structured feedback...',
  'Building your report...',
]

function LoadingScreen() {
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => (prev + 1) % steps.length)
    }, 3000)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="loading-screen">
      <div className="loading-spinner"></div>
      <h2>Analyzing Your Resume</h2>
      <p className="loading-step">{steps[currentStep]}</p>
      <p className="loading-hint">This may take 30-60 seconds</p>
    </div>
  )
}

export default LoadingScreen
