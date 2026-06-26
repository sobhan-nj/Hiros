import React, { useState, useRef, useEffect } from 'react'
import { analyzeResume } from '../api/client.js'

function UploadForm({ onAnalysis, onError, onLoading }) {
  const [file, setFile] = useState(null)
  const [seniority, setSeniority] = useState('mid')
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

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) {
      onError('Please select a file to analyze.')
      return
    }

    if (turnstileSiteKey && !turnstileToken) {
      onError('Please complete the security check.')
      return
    }

    onLoading()

    const formData = new FormData()
    formData.append('file', file)
    formData.append('seniority', seniority)

    try {
      const result = await analyzeResume(formData, turnstileToken)
      onAnalysis(result)
    } catch (err) {
      const msg = err.response?.data?.detail || err.message || 'Analysis failed'
      onError(msg)
    }
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

      <div className="form-group">
        <label htmlFor="seniority">Seniority Level</label>
        <select
          id="seniority"
          value={seniority}
          onChange={(e) => setSeniority(e.target.value)}
        >
          <option value="junior">Junior</option>
          <option value="mid">Mid</option>
          <option value="senior">Senior</option>
          <option value="executive">Executive</option>
        </select>
      </div>

      {turnstileSiteKey && (
        <div className="turnstile-container">
          <div ref={turnstileRef}></div>
        </div>
      )}

      <button type="submit" className="btn-analyze" disabled={!file}>
        Analyze Resume
      </button>
    </form>
  )
}

export default UploadForm
