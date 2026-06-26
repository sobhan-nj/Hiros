import React, { useState } from 'react'

function CVPreviewPanel({ resumeText, resumeFilename }) {
  const [showText, setShowText] = useState(true)

  if (!resumeText) {
    return (
      <div className="cv-preview-empty">
        <p>No resume text available</p>
      </div>
    )
  }

  return (
    <div className="cv-preview-container">
      <div className="cv-preview-header">
        <span className="cv-filename">{resumeFilename || 'Resume'}</span>
        <button
          className="cv-toggle"
          onClick={() => setShowText(!showText)}
        >
          {showText ? 'Hide Text' : 'Show Text'}
        </button>
      </div>

      {showText && (
        <div className="cv-text-wrapper">
          <pre className="cv-text-content">{resumeText}</pre>
        </div>
      )}
    </div>
  )
}

export default CVPreviewPanel
