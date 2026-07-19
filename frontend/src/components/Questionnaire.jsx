import React, { useState } from 'react'

const STEPS = [
  {
    key: 'industry',
    title: 'Industry',
    subtitle: 'What industry do you work in?',
    gridClass: 'cols-2',
    options: [
      { value: 'healthcare', label: 'Healthcare', desc: 'Physicians, pharmacists, nurses, and other medical professionals' },
      { value: 'technology', label: 'Technology', desc: 'Software engineers, data scientists, DevOps, and other tech roles' },
    ],
  },
  {
    key: 'seniority',
    title: 'Seniority Level',
    subtitle: 'What is your professional experience level?',
    gridClass: 'cols-4',
    options: [
      { value: 'junior', label: 'Junior', desc: '0\u20132 years experience' },
      { value: 'mid', label: 'Mid-Level', desc: '3\u20135 years experience' },
      { value: 'senior', label: 'Senior', desc: '6\u201310 years experience' },
      { value: 'exec', label: 'Executive', desc: '10+ years, leadership roles' },
    ],
  },
  {
    key: 'targetCountry',
    title: 'Target Country',
    subtitle: 'Where are you looking for a job?',
    gridClass: 'cols-4',
    options: [
      { value: 'germany', label: 'Germany', desc: 'Analysis includes country-specific rules and norms' },
      { value: 'us', label: 'United States', desc: 'General international resume analysis' },
      { value: 'canada', label: 'Canada', desc: 'General international resume analysis' },
      { value: 'other', label: 'Other', desc: 'General international resume analysis' },
    ],
  },
  {
    key: 'referralSource',
    title: 'How did you hear about us?',
    subtitle: 'Help us understand where our users come from',
    gridClass: 'pill-grid',
    options: [
      { value: 'linkedin', label: 'LinkedIn' },
      { value: 'instagram', label: 'Instagram' },
      { value: 'telegram', label: 'Telegram' },
      { value: 'whatsapp', label: 'WhatsApp' },
      { value: 'friends', label: 'Friends / Family' },
      { value: 'university', label: 'University / College' },
      { value: 'conference', label: 'Conference' },
      { value: 'jobboard', label: 'Job Board' },
      { value: 'google', label: 'Google Search' },
      { value: 'other', label: 'Other' },
    ],
  },
]

const VALUE_MAP = {
  industry: { healthcare: 'health', technology: 'tech' },
  seniority: { junior: 'junior', mid: 'mid', senior: 'senior', exec: 'executive' },
  targetCountry: { germany: 'germany', us: 'united states', canada: 'canada', other: 'other' },
  referralSource: {},
}

function mapValue(key, rawValue) {
  const map = VALUE_MAP[key]
  return map && map[rawValue] !== undefined ? map[rawValue] : rawValue
}

function Questionnaire({ onComplete, onStepAnswer, onSeeResults, answers, analyzing }) {
  const [step, setStep] = useState(0)
  const [localSelection, setLocalSelection] = useState(null)

  const current = STEPS[step]
  const totalSteps = STEPS.length
  const isLast = step === totalSteps - 1
  const progress = Math.round(((step + 1) / totalSteps) * 100)

  const handleSelect = (value) => {
    setLocalSelection(value)
  }

  const handleNext = () => {
    const rawValue = localSelection ?? answers[current.key]
    const mappedValue = mapValue(current.key, rawValue)
    onStepAnswer(current.key, mappedValue)

    if (isLast) {
      const allAnswers = { ...answers, [current.key]: mappedValue }
      onComplete(allAnswers)
    } else {
      setStep(step + 1)
      setLocalSelection(null)
    }
  }

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1)
      setLocalSelection(null)
    }
  }

  const handleSeeResults = () => {
    onSeeResults()
  }

  const currentSelection = localSelection ?? answers[current.key]

  return (
    <div className="wizard-wrap">
      <div className="wizard-card">
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="progress-meta">
          <span className="step-count">Step {step + 1} of {totalSteps}</span>
          <span className="step-pct">{progress}%</span>
        </div>



        <div className="card-body">
          <div className="step-panel">
            <h3 className="step-title">{current.title}</h3>
            <p className="step-sub">{current.subtitle}</p>

            <div className="step-body-center">
              {current.gridClass === 'pill-grid' ? (
                <div className="pill-grid">
                  {current.options.map(opt => (
                    <button
                      key={opt.value}
                      className={`pill-card ${currentSelection === opt.value ? 'selected' : ''}`}
                      onClick={() => handleSelect(opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className={`option-grid ${current.gridClass}`}>
                  {current.options.map(opt => (
                    <button
                      key={opt.value}
                      className={`option-card ${currentSelection === opt.value ? 'selected' : ''}`}
                      onClick={() => handleSelect(opt.value)}
                    >
                      <h4>{opt.label}</h4>
                      {opt.desc && <p>{opt.desc}</p>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="step-nav">
              {step > 0 && (
                <button className="btn btn-ghost" onClick={handleBack}>Back</button>
              )}
              {isLast ? (
                <button
                  className="btn btn-primary"
                  disabled={!currentSelection}
                  onClick={handleSeeResults}
                >
                  See the Results
                </button>
              ) : (
                <button
                  className="btn btn-primary"
                  disabled={!currentSelection}
                  onClick={handleNext}
                >
                  Next
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Questionnaire
