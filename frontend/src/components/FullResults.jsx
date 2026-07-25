import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { marked } from 'marked'
import CategoryTabs from './CategoryTabs.jsx'
import DimensionRow from './DimensionRow.jsx'

const GROUP_ORDER = ['content', 'layout', 'red_flags', 'readability']

const DIMENSION_ORDER = {
  layout: ['page_structure', 'visual_design_scannability', 'ats_compatibility', 'section_order', 'formalities', 'professional_network'],
  content: ['professional_summary', 'bullet_quality_ownership', 'impact_so_what', 'specialty_fit_rotation_relevance', 'keyword_density', 'relevance_recency', 'soft_skills_integration', 'grammar_spelling_consistency', 'additional_context'],
  red_flags: ['legal_eligibility_status', 'gaps_risk_signals', 'pii_sensitive_data'],
  readability: ['white_space', 'fluff_buzzwords', 'bullet_length_formatting_consistency'],
}

const TEXT_EDITABLE_DIMENSIONS = new Set([
  'professional_summary', 'bullet_quality_ownership', 'impact_so_what',
  'keyword_density', 'grammar_spelling_consistency', 'fluff_buzzwords',
  'soft_skills_integration', 'bullet_length_formatting_consistency',
  'relevance_recency', 'specialty_fit_rotation_relevance', 'white_space',
  'additional_context',
])

function normalizeText(text) {
  return text
    .replace(/[\u200B\u200C\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/[–—-]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

function findBestMatch(markdown, original) {
  if (!markdown || !original) return null

  const normMd = normalizeText(markdown)
  const normOrig = normalizeText(original)

  const exactIdx = markdown.indexOf(original)
  if (exactIdx !== -1) return { index: exactIdx, length: original.length, text: original }

  const normIdx = normMd.indexOf(normOrig)
  if (normIdx !== -1) {
    const firstWord = normOrig.split(/\s+/).find(w => w.length > 2)
    if (firstWord) {
      const searchStart = Math.max(0, normIdx - 20)
      const searchEnd = Math.min(markdown.length, normIdx + normOrig.length + 20)
      const window = markdown.substring(searchStart, searchEnd)
      const wordIdx = window.indexOf(firstWord)
      if (wordIdx !== -1) {
        const absStart = searchStart + wordIdx
        const words = normOrig.split(/\s+/)
        const lastWord = words.reverse().find(w => w.length > 2)
        if (lastWord) {
          const endWindow = markdown.substring(absStart, absStart + normOrig.length + 40)
          const lastWordIdx = endWindow.lastIndexOf(lastWord)
          if (lastWordIdx !== -1) {
            const absEnd = absStart + lastWordIdx + lastWord.length
            return { index: absStart, length: absEnd - absStart, text: markdown.substring(absStart, absEnd), normalized: true }
          }
        }
        return { index: absStart, length: normOrig.length, text: markdown.substring(absStart, absStart + normOrig.length), normalized: true }
      }
    }
  }

  const origWords = normOrig.split(/\s+/).filter(w => w.length > 2)
  if (origWords.length < 2) return null

  for (let len = origWords.length; len >= Math.min(3, origWords.length); len--) {
    for (let start = 0; start <= origWords.length - len; start++) {
      const chunk = origWords.slice(start, start + len).join(' ')
      const chunkIdx = normMd.indexOf(chunk)
      if (chunkIdx !== -1) {
        let endIdx = chunkIdx + chunk.length
        for (const w of origWords.slice(start + len)) {
          const nextIdx = normMd.indexOf(w, endIdx)
          if (nextIdx !== -1 && nextIdx - endIdx < 15) endIdx = nextIdx + w.length
          else break
        }
        let startIdx = chunkIdx
        for (const w of origWords.slice(0, start).reverse()) {
          const prevIdx = normMd.lastIndexOf(w, startIdx)
          if (prevIdx !== -1 && startIdx - prevIdx < 15) startIdx = prevIdx
          else break
        }
        const matchedNorm = normMd.substring(startIdx, endIdx)
        const firstWord = matchedNorm.split(/\s+/).find(w => w.length > 2)
        if (firstWord) {
          const searchStart = Math.max(0, startIdx - 10)
          const searchEnd = Math.min(markdown.length, endIdx + 10)
          const window = markdown.substring(searchStart, searchEnd)
          const wordIdx = window.indexOf(firstWord)
          if (wordIdx !== -1) {
            const absStart = searchStart + wordIdx
            const estEnd = Math.min(markdown.length, absStart + matchedNorm.length + 20)
            return { index: absStart, length: estEnd - absStart, text: markdown.substring(absStart, estEnd), partial: true }
          }
        }
      }
    }
  }

  return null
}

function FullResults({ results, onBackToSummary, onReset }) {
  const { id, analysis = {} } = results || {}
  const {
    dimension_groups, tier, verdict, header, priority_fixes, rewrites,
    resume_markdown, resume_text, resume_filename
  } = analysis
  const resumeFilename = resume_filename || ''

  const [activeGroup, setActiveGroup] = useState('content')
  const [showDrawer, setShowDrawer] = useState(false)
  const [selectedIndices, setSelectedIndices] = useState(() => {
    const initial = new Set()
    rewrites?.forEach((_, i) => initial.add(i))
    return initial
  })
  const [toast, setToast] = useState(null)
  const [localMarkdown, setLocalMarkdown] = useState(resume_markdown || '')
  const toastTimerRef = useRef(null)

  const candidateName = header?.candidate_name || 'Candidate'
  const markdownSource = localMarkdown || resume_text || ''
  const renderedHtml = useMemo(() => marked.parse(markdownSource), [markdownSource])

  const matchCache = useMemo(() => {
    const cache = {}
    rewrites?.forEach((r, i) => {
      cache[i] = findBestMatch(markdownSource, r.original)
    })
    return cache
  }, [rewrites, markdownSource])

  const applicableCount = useMemo(() => {
    return rewrites?.filter((r, i) => {
      if (!selectedIndices.has(i)) return false
      if (r.dimension_code && !TEXT_EDITABLE_DIMENSIONS.has(r.dimension_code)) return false
      if (!matchCache[i]) return false
      return true
    }).length || 0
  }, [rewrites, selectedIndices, matchCache])

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }
  }, [])

  const showToast = useCallback((message, type) => {
    setToast({ message, type })
    toastTimerRef.current = setTimeout(() => setToast(null), 5000)
  }, [])

  const handleToggle = (index) => {
    setSelectedIndices(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const handleSelectAll = () => {
    const all = new Set()
    rewrites?.forEach((r, i) => {
      if (r.dimension_code && !TEXT_EDITABLE_DIMENSIONS.has(r.dimension_code)) return
      if (!matchCache[i]) return
      all.add(i)
    })
    setSelectedIndices(all)
  }

  const handleDeselectAll = () => setSelectedIndices(new Set())

  const handleApply = () => {
    const selected = rewrites?.filter((r, i) => {
      if (!selectedIndices.has(i)) return false
      if (r.dimension_code && !TEXT_EDITABLE_DIMENSIONS.has(r.dimension_code)) return false
      if (!matchCache[i]) return false
      return true
    }).map(r => {
      const i = rewrites.indexOf(r)
      return { ...r, matchInfo: matchCache[i] }
    }) || []

    if (selected.length === 0) {
      showToast('No changes selected.', 'info')
      return
    }

    let currentMd = markdownSource
    let applied = 0

    const sorted = selected
      .map(r => {
        const matchText = r.matchInfo?.text || r.original
        return { ...r, matchText, index: currentMd.indexOf(matchText) }
      })
      .filter(r => r.index !== -1)
      .sort((a, b) => b.index - a.index)

    for (const rewrite of sorted) {
      if (currentMd.includes(rewrite.matchText)) {
        currentMd = currentMd.replace(rewrite.matchText, rewrite.rewritten)
        applied++
      }
    }

    if (applied > 0) {
      setLocalMarkdown(currentMd)
      showToast(`${applied} change${applied !== 1 ? 's' : ''} applied`, 'success')
    } else {
      showToast('No changes could be applied.', 'info')
    }

    setShowDrawer(false)
  }

  const handleDownload = (format) => {
    if (format === 'md') {
      const blob = new Blob([markdownSource], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = (resumeFilename || 'resume').replace(/\.[^.]+$/, '') + '.md'
      a.click()
      URL.revokeObjectURL(url)
    } else if (id) {
      const baseUrl = import.meta.env.PROD ? '' : '/api'
      window.open(baseUrl + '/cv/' + id + '/download/' + format, '_blank')
    }
  }

  const orderedKeys = DIMENSION_ORDER[activeGroup] || Object.keys(dimension_groups?.[activeGroup]?.dimensions || {})

  return (
    <div className="results-shell">
      {/* Left Pane: Analysis */}
      <div className="pane-analysis">
        <div className="pane-analysis-pinned">
          <div className="analysis-pane-header">
            <h1 className="candidate-name">{candidateName}</h1>
            <span className="analysis-pane-sub">Full breakdown across all 21 dimensions</span>
          </div>

          <CategoryTabs
            groups={dimension_groups}
            activeGroup={activeGroup}
            onTabChange={setActiveGroup}
          />

          <button className="btn-analyze-another" onClick={onReset}>
            &larr; Analyze another resume
          </button>
        </div>

        <div className="pane-analysis-scroll">
          <div className="dim-list">
            {dimension_groups && orderedKeys.map(dimKey => {
              const dim = dimension_groups[activeGroup]?.dimensions[dimKey]
              if (!dim) return null
              return <DimensionRow key={dimKey} dimKey={dimKey} data={dim} />
            })}
          </div>
        </div>
      </div>

      {/* Right Pane: Resume Viewer */}
      <div className="pane-resume">
        <div className="pane-resume-pinned">
          <div className="resume-toolbar">
            <span className="resume-filename">{resumeFilename || 'Resume'}</span>
            <div className="toolbar-actions">
              {rewrites && rewrites.length > 0 && (
                <button
                  className="toolbar-btn toolbar-btn-primary"
                  onClick={() => setShowDrawer(!showDrawer)}
                >
                  Apply Changes
                </button>
              )}
              <button className="toolbar-btn toolbar-btn-ghost">
                Edit
              </button>
              <button className="toolbar-btn toolbar-btn-ghost" onClick={() => handleDownload('md')}>
                Download
              </button>
            </div>
          </div>
        </div>

        <div className="pane-resume-scroll">
          {showDrawer && (
            <div className="changes-drawer">
              <div className="changes-drawer-head">
                <span className="changes-drawer-title">
                  Apply Changes <span className="count">{applicableCount} of {rewrites.length} applicable</span>
                </span>
                <div className="changes-drawer-actions">
                  <button onClick={handleSelectAll}>Select All</button>
                  <button onClick={handleDeselectAll}>Deselect All</button>
                  <button className="dismiss" onClick={() => setShowDrawer(false)}>Dismiss</button>
                </div>
              </div>

              {(() => {
                const groups = {}
                rewrites?.forEach((r, i) => {
                  const dim = r.dimension_code || 'other'
                  if (!groups[dim]) groups[dim] = []
                  groups[dim].push({ ...r, originalIndex: i })
                })
                return Object.entries(groups).map(([dimCode, items]) => {
                  const isEditable = !dimCode || TEXT_EDITABLE_DIMENSIONS.has(dimCode)
                  return (
                    <div key={dimCode}>
                      <div className="change-group-label">
                        {dimCode.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} — {items.length}/{items.length}
                      </div>
                      {items.map((item) => {
                        const match = matchCache[item.originalIndex]
                        const checked = selectedIndices.has(item.originalIndex)
                        return (
                          <div key={item.originalIndex} className="change-item">
                            <div
                              className={`change-checkbox ${checked && match ? 'checked' : ''}`}
                              onClick={() => match && handleToggle(item.originalIndex)}
                              style={!match ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                            />
                            <div className="change-body">
                              <div className="change-original">{item.original}</div>
                              <div className="change-rewritten">{item.rewritten}</div>
                              {!match && <div className="change-note">Original text not found in resume</div>}
                              {match?.partial && <div className="change-note success">Partial match — will replace matched section</div>}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })
              })()}

              <div className="apply-bar">
                <button
                  className="toolbar-btn toolbar-btn-primary"
                  onClick={handleApply}
                  disabled={applicableCount === 0}
                >
                  Apply {applicableCount} Change{applicableCount !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          )}

          <div className="resume-page" dangerouslySetInnerHTML={{ __html: renderedHtml }} />
        </div>
      </div>

      {toast && (
        <div className={`results-toast ${toast.type}`}>
          <span>{toast.type === 'success' ? '\u2713' : '\u2139'}</span>
          {toast.message}
        </div>
      )}
    </div>
  )
}

export default FullResults
