import React, { useState, useEffect } from 'react'
import axios from 'axios'

function CVPreviewPanel({ candidateId, resumeFilename }) {
  const [showCV, setShowCV] = useState(true)
  const [pdfUrl, setPdfUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!candidateId) return
    let blobUrl = null

    const fetchPdf = async () => {
      try {
        setLoading(true)
        const base = import.meta.env.PROD ? '' : '/api'
        const resp = await axios.get(`${base}/cv/${candidateId}`, {
          responseType: 'blob',
        })
        blobUrl = URL.createObjectURL(resp.data)
        setPdfUrl(blobUrl)
      } catch (err) {
        setError('Failed to load CV preview')
      } finally {
        setLoading(false)
      }
    }

    fetchPdf()

    return () => {
      if (blobUrl) URL.revokeObjectURL(blobUrl)
    }
  }, [candidateId])

  if (!candidateId) {
    return (
      <div className="cv-preview-empty">
        <p>No CV data available</p>
      </div>
    )
  }

  return (
    <div className="cv-preview-container">
      <div className="cv-preview-header">
        <span className="cv-filename">{resumeFilename || 'Resume'}</span>
        <button
          className="cv-toggle"
          onClick={() => setShowCV(!showCV)}
        >
          {showCV ? 'Hide CV' : 'Show CV'}
        </button>
      </div>

      {showCV && (
        <div className="cv-document-wrapper">
          {loading && <div className="cv-preview-empty"><p>Loading PDF...</p></div>}
          {error && <div className="cv-preview-empty"><p>{error}</p></div>}
          {pdfUrl && (
            <iframe
              src={pdfUrl}
              className="cv-iframe"
              title="CV Preview"
            />
          )}
        </div>
      )}
    </div>
  )
}

export default CVPreviewPanel
