import React, { useState, useEffect, useRef, useCallback } from 'react'

const LOADING_STEPS = [
  'Parsing your resume',
  'Extracting keywords',
  'Analyzing your experience',
  'Extracting your skills',
  'Generating recommendations',
  'Building your report',
]

const FACTS = [
  "Recruiters often spend under 10 seconds on a first pass of a CV.",
  "Clear, consistent formatting is one of the easiest wins on any CV.",
  "A one-line note next to a career gap reads far better than silence.",
  "Tailoring your CV to the target country's norms improves response rates.",
  "Quantified achievements stand out more than generic responsibility lists.",
  "Use strong action verbs — 'Led', 'Built', 'Reduced' — not passive phrases.",
  "Every bullet should answer: what did you do, and what was the result?",
  "Consistent date formats and section ordering make your CV scannable.",
]

const RING_CIRCUMFERENCE = 301.6
const FAST_FORWARD_DURATION = 400

function randomDelay() {
  return Math.floor(Math.random() * 2000) + 5000
}

const CHECK_SVG = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M5 13l4 4L19 7" stroke="#3a9d9b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function LoadingScreen({ analysisDone, onReady }) {
  const [currentStep, setCurrentStep] = useState(0)
  const [percentage, setPercentage] = useState(0)
  const [factIndex, setFactIndex] = useState(0)
  const [factFading, setFactFading] = useState(false)
  const [fastForwarded, setFastForwarded] = useState(false)

  const timerRef = useRef(null)
  const factTimerRef = useRef(null)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  // Normal animation - random 5-7s per step, last step waits for analysisDone
  useEffect(() => {
    if (analysisDone || fastForwarded) return

    // Don't advance past second-to-last step until analysisDone
    if (currentStep >= LOADING_STEPS.length - 1) return

    const delay = randomDelay()
    timerRef.current = setTimeout(() => {
      setCurrentStep(prev => prev + 1)
      setPercentage(Math.round(((currentStep + 1) / LOADING_STEPS.length) * 100))
    }, delay)

    return () => clearTimeout(timerRef.current)
  }, [currentStep, analysisDone, fastForwarded])

  // Fact rotation
  useEffect(() => {
    factTimerRef.current = setInterval(() => {
      setFactFading(true)
      setTimeout(() => {
        setFactIndex(prev => (prev + 1) % FACTS.length)
        setFactFading(false)
      }, 300)
    }, 3400)

    return () => clearInterval(factTimerRef.current)
  }, [])

  // When analysisDone, fast-forward to completion
  useEffect(() => {
    if (!analysisDone || fastForwarded) return

    setFastForwarded(true)
    clearInterval(factTimerRef.current)
    clearTimeout(timerRef.current)

    // Quickly advance remaining steps
    const remaining = LOADING_STEPS.length - currentStep
    if (remaining <= 0) {
      setPercentage(100)
      setTimeout(() => onReadyRef.current?.(), FAST_FORWARD_DURATION)
      return
    }

    const stepDelay = Math.max(FAST_FORWARD_DURATION / remaining, 80)
    let step = currentStep

    const advance = () => {
      step++
      setCurrentStep(step)
      setPercentage(Math.round((step / LOADING_STEPS.length) * 100))

      if (step >= LOADING_STEPS.length) {
        setTimeout(() => onReadyRef.current?.(), FAST_FORWARD_DURATION)
      } else {
        setTimeout(advance, stepDelay)
      }
    }

    setTimeout(advance, stepDelay)
  }, [analysisDone, fastForwarded, currentStep])

  const displayStep = fastForwarded ? LOADING_STEPS.length : Math.min(currentStep, LOADING_STEPS.length)
  const displayPercentage = fastForwarded ? 100 : percentage
  const dashOffset = RING_CIRCUMFERENCE - (RING_CIRCUMFERENCE * displayPercentage / 100)

  return (
    <div className="wizard-wrap">
      <div className="loading-card">
        <div className="loading-ring-wrap">
          <svg viewBox="0 0 108 108" width="108" height="108">
            <circle className="ring-track" cx="54" cy="54" r="48" />
            <circle
              className="ring-fill"
              cx="54"
              cy="54"
              r="48"
              style={{ strokeDashoffset: dashOffset }}
            />
          </svg>
          <div className="ring-icon">
            <img
              src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='20' fill='%230d1b2a'/%3E%3Ctext x='50' y='62' font-family='serif' font-size='42' font-weight='bold' fill='%23faf7f0' text-anchor='middle'%3EH%3C/text%3E%3C/svg%3E"
              alt="Hiros"
            />
          </div>
          <div className="ring-pct">{displayPercentage}%</div>
        </div>

        <h3 className="loading-title">Analyzing Your Resume</h3>

        <div className="loading-steps">
          {LOADING_STEPS.map((label, i) => {
            let status = 'pending'
            if (i < displayStep) status = 'done'
            else if (i === displayStep && displayStep < LOADING_STEPS.length) status = 'active'

            return (
              <div key={i} className={`loading-step ${status}`}>
                <div className="step-icon">
                  {status === 'done' && CHECK_SVG}
                  {status === 'active' && <div className="spinner" />}
                </div>
                <span className="loading-step-label">{label}</span>
              </div>
            )
          })}
        </div>

        {!analysisDone && <p className="loading-note">This may take 30–60 seconds</p>}

        <div className="fact-ticker">
          <span className={`fact-text ${factFading ? 'fading-out' : 'fading-in'}`}>
            {FACTS[factIndex]}
          </span>
        </div>
      </div>
    </div>
  )
}

export default LoadingScreen
