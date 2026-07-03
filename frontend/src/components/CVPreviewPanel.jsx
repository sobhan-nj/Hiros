import React, { useState, useRef, useEffect, useCallback } from 'react'
import { marked } from 'marked'
import TurndownService from 'turndown'

const turndown = new TurndownService({
  headingStyle: 'atx',
  bulletListMarker: '-',
})

function CVPreviewPanel({ resumeText, resumeMarkdown, resumeFilename, candidateId, onUpdateMarkdown }) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedHtml, setEditedHtml] = useState('')
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef(null)
  const editorRef = useRef(null)

  const markdownSource = resumeMarkdown || resumeText || ''
  const renderedHtml = marked.parse(markdownSource)

  useEffect(() => {
    if (isEditing && editorRef.current) {
      editorRef.current.innerHTML = renderedHtml
      editorRef.current.focus()
    }
  }, [isEditing])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleEdit = useCallback(() => {
    setIsEditing(true)
    setEditedHtml(renderedHtml)
  }, [renderedHtml])

  const handleCancel = useCallback(() => {
    setIsEditing(false)
    setEditedHtml('')
  }, [])

  const handleSave = useCallback(() => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML
      const md = turndown.turndown(html)
      if (onUpdateMarkdown) onUpdateMarkdown(md)
    }
    setIsEditing(false)
  }, [onUpdateMarkdown])

  const downloadMarkdown = useCallback(() => {
    const html = isEditing && editorRef.current
      ? editorRef.current.innerHTML
      : renderedHtml
    const md = turndown.turndown(html)
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const safeName = (resumeFilename || 'resume').replace(/\.[^.]+$/, '')
    a.download = `${safeName}.md`
    a.click()
    URL.revokeObjectURL(url)
    setShowMenu(false)
  }, [isEditing, renderedHtml, resumeFilename])

  const downloadHtml = useCallback(async () => {
    if (candidateId) {
      const baseUrl = import.meta.env.PROD ? '' : '/api'
      window.open(`${baseUrl}/cv/${candidateId}/download/html`, '_blank')
    }
    setShowMenu(false)
  }, [candidateId])

  const downloadLatex = useCallback(async () => {
    if (candidateId) {
      const baseUrl = import.meta.env.PROD ? '' : '/api'
      window.open(`${baseUrl}/cv/${candidateId}/download/tex`, '_blank')
    }
    setShowMenu(false)
  }, [candidateId])

  if (!markdownSource) {
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
        <div className="cv-actions">
          {isEditing ? (
            <>
              <button className="cv-action-btn cv-save-btn" onClick={handleSave}>
                Done
              </button>
              <button className="cv-action-btn cv-cancel-btn" onClick={handleCancel}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button className="cv-action-btn cv-edit-btn" onClick={handleEdit}>
                Edit
              </button>
              <div className="cv-download-wrapper" ref={menuRef}>
                <button
                  className="cv-action-btn cv-download-btn"
                  onClick={() => setShowMenu(!showMenu)}
                >
                  Download ▾
                </button>
                {showMenu && (
                  <div className="cv-download-menu">
                    <button onClick={downloadMarkdown}>as Markdown (.md)</button>
                    <button onClick={downloadHtml}>as Template (.html)</button>
                    <button onClick={downloadLatex}>as LaTeX (.tex)</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="cv-text-wrapper">
        {isEditing ? (
          <div
            ref={editorRef}
            className="markdown-body cv-editor"
            contentEditable
            suppressContentEditableWarning
          />
        ) : (
          <div
            className="markdown-body cv-text-content"
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        )}
      </div>
    </div>
  )
}

export default CVPreviewPanel
