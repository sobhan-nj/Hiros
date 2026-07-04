import React, { useState, useEffect } from 'react'

const steps = [
  { label: 'Parsing your resume', icon: '📄' },
  { label: 'Extracting keywords', icon: '🔑' },
  { label: 'Analyzing your experience', icon: '📋' },
  { label: 'Extracting your skills', icon: '💡' },
  { label: 'Generating recommendations', icon: '✨' },
  { label: 'Building your report', icon: '📊' },
]

function LoadingScreen() {
  const [currentStep, setCurrentStep] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= steps.length - 1) return prev
        return prev + 1
      })
    }, 1500)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="loading-screen">
      <h2 className="loading-title">Analyzing Your Resume</h2>
      <div className="loading-steps">
        {steps.map((step, i) => {
          const status = i < currentStep ? 'done' : i === currentStep ? 'active' : 'pending'
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
      <p className="loading-hint">This may take 30-60 seconds</p>
    </div>
  )
}

export default LoadingScreen
