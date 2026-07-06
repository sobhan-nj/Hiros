import React from 'react'

const STEPS = [
  {
    key: 'seniority',
    title: 'Seniority Level',
    subtitle: 'What is your professional experience level?',
    options: [
      { value: 'junior', label: 'Junior', desc: '0-2 years experience' },
      { value: 'mid', label: 'Mid-Level', desc: '3-5 years experience' },
      { value: 'senior', label: 'Senior', desc: '6-10 years experience' },
      { value: 'executive', label: 'Executive', desc: '10+ years, leadership roles' },
    ],
  },
  {
    key: 'targetCountry',
    title: 'Target Country',
    subtitle: 'Where are you looking for a job?',
    options: [
      { value: 'germany', label: 'Germany', desc: 'Analysis includes Approbation & German-specific rules' },
      { value: 'united states', label: 'United States', desc: 'General international resume analysis' },
      { value: 'canada', label: 'Canada', desc: 'General international resume analysis' },
      { value: 'other', label: 'Other', desc: 'General international resume analysis' },
    ],
  },
  {
    key: 'referralSource',
    title: 'How did you hear about us?',
    subtitle: 'Help us understand where our users come from',
    options: [
      { value: 'linkedin', label: 'LinkedIn', desc: '' },
      { value: 'instagram', label: 'Instagram', desc: '' },
      { value: 'telegram', label: 'Telegram', desc: '' },
      { value: 'whatsapp', label: 'WhatsApp', desc: '' },
      { value: 'friends', label: 'Friends / Family', desc: '' },
      { value: 'university', label: 'University / College', desc: '' },
      { value: 'conference', label: 'Medical Conference', desc: '' },
      { value: 'job_board', label: 'Job Board', desc: '' },
      { value: 'google', label: 'Google Search', desc: '' },
      { value: 'other', label: 'Other', desc: '' },
    ],
  },
]

function Questionnaire({ onComplete, onStepAnswer, onSeeResults, answers, analyzing }) {
  const [step, setStep] = React.useState(0)
  const [localSelection, setLocalSelection] = React.useState(null)

  const current = STEPS[step]
  const isLast = step === STEPS.length - 1
  const progress = ((step + 1) / STEPS.length) * 100

  const handleSelect = (value) => {
    setLocalSelection(value)
    onStepAnswer(current.key, value)
  }

  const handleNext = () => {
    const value = localSelection ?? answers[current.key]
    onStepAnswer(current.key, value)
    if (isLast) {
      onComplete({ ...answers, [current.key]: value })
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

  return (
    <div className="questionnaire">
      <div className="questionnaire-progress">
        <div className="progress-bar" style={{ width: `${progress}%` }} />
      </div>
      <div className="questionnaire-progress-label">{Math.round(progress)}%</div>
      {analyzing && step > 0 && (
        <div className="analysis-indicator">
          <span className="analysis-indicator-dot" />
          Analysis in progress...
        </div>
      )}

      <div className="questionnaire-content">
        <h2>{current.title}</h2>
        <p className="questionnaire-subtitle">{current.subtitle}</p>

        <div className="questionnaire-options">
          {current.options.map(opt => (
            <button
              key={opt.value}
              className={`questionnaire-option ${(localSelection ?? answers[current.key]) === opt.value ? 'selected' : ''}`}
              onClick={() => handleSelect(opt.value)}
            >
              <span className="option-label">{opt.label}</span>
              {opt.desc && <span className="option-desc">{opt.desc}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="questionnaire-nav">
        <button
          className="btn-back-questionnaire"
          onClick={handleBack}
          style={{ visibility: step > 0 ? 'visible' : 'hidden' }}
        >
          Back
        </button>
        <button className="btn-next-questionnaire" onClick={isLast ? () => onSeeResults({ ...answers, [current.key]: localSelection ?? answers[current.key] }) : handleNext}>
          {isLast ? 'See the Results' : 'Next'}
        </button>
      </div>
    </div>
  )
}

export default Questionnaire
