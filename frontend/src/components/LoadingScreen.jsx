import React, { useState, useEffect } from 'react'

const steps = [
  { label: 'Parsing your resume', delay: 2500 },
  { label: 'Extracting keywords', delay: 3500 },
  { label: 'Analyzing your experience', delay: 5000 },
  { label: 'Extracting your skills', delay: 4000 },
  { label: 'Generating recommendations', delay: 5000 },
  { label: 'Building your report' },
]

function LoadingScreen({ analysisDone }) {
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    if (analysisDone || currentStep >= steps.length - 1) return
    const delay = steps[currentStep].delay
    const timer = setTimeout(() => {
      setCurrentStep((prev) => prev + 1)
    }, delay)
    return () => clearTimeout(timer)
  }, [currentStep, analysisDone])

  useEffect(() => {
    if (analysisDone) setCurrentStep(steps.length)
  }, [analysisDone])

  const displayStep = analysisDone ? steps.length : currentStep

  return (
    <div className="loading-screen">
      <h2 className="loading-title">Analyzing Your Resume</h2>
      <div className="loading-steps">
        {steps.map((step, i) => {
          const status = i < displayStep ? 'done' : i === displayStep && !analysisDone ? 'active' : 'pending'
          return (
            <div key={i} className={`loading-step-item ${status}`}>
              <div className="loading-step-icon">
                {status === 'done' && (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2.5 7.5L5.5 10.5L11.5 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
                {status === 'active' && <div className="loading-step-spinner" />}
              </div>
              <span className="loading-step-label">{step.label}</span>
              {i < steps.length - 1 && <div className="loading-step-line" />}
            </div>
          )
        })}
      </div>
      {!analysisDone && <p className="loading-hint">This may take 30-60 seconds</p>}
    </div>
  )
}

export default LoadingScreen
