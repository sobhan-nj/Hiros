import React, { useState, useRef, useEffect } from 'react'

function UploadForm({ onSubmit, onError }) {
  const [file, setFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const turnstileRef = useRef(null)
  const [turnstileToken, setTurnstileToken] = useState(null)

  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY

  useEffect(() => {
    if (!turnstileSiteKey || !window.turnstile) return
    const widgetId = window.turnstile.render(turnstileRef.current, {
      sitekey: turnstileSiteKey,
      callback: (token) => setTurnstileToken(token),
      'expired-callback': () => setTurnstileToken(null),
      theme: 'light',
    })
    return () => {
      if (window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [turnstileSiteKey])

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!file) {
      onError('Please select a file to analyze.')
      return
    }

    if (turnstileSiteKey && !turnstileToken) {
      onError('Please complete the security check.')
      return
    }

    onSubmit(file)
  }

  return (
    <form onSubmit={handleSubmit} className="upload-form">
      <div
        className={`dropzone ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          type="file"
          id="file-input"
          accept=".pdf,.docx"
          onChange={handleChange}
          hidden
        />
        <label htmlFor="file-input" className="dropzone-label">
          {file ? (
            <span className="file-name">{file.name}</span>
          ) : (
            <>
              <span className="drop-icon">📄</span>
              <span>Drag & drop your CV here or click to browse</span>
              <span className="drop-hint">PDF or DOCX, max 10MB</span>
            </>
          )}
        </label>
      </div>

      {turnstileSiteKey && (
        <div className="turnstile-container">
          <div ref={turnstileRef}></div>
        </div>
      )}

      <button type="submit" className="btn-analyze" disabled={!file}>
        Start Analysis
      </button>
    </form>
  )
}

export default UploadForm
