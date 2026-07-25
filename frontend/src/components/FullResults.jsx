import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { marked } from 'marked'
import CategoryTabs from './CategoryTabs.jsx'
import DimensionRow from './DimensionRow.jsx'
import { TEXT_EDITABLE_DIMENSIONS, normalizeText, findBestMatch } from '../utils/matching.js'

const GROUP_ORDER = ['content', 'layout', 'red_flags', 'readability']

const DIMENSION_ORDER = {
  layout: ['page_structure', 'visual_design_scannability', 'ats_compatibility', 'section_order', 'formalities', 'professional_network'],
  content: ['professional_summary', 'bullet_quality_ownership', 'impact_so_what', 'specialty_fit_rotation_relevance', 'keyword_density', 'relevance_recency', 'soft_skills_integration', 'grammar_spelling_consistency', 'additional_context'],
  red_flags: ['legal_eligibility_status', 'gaps_risk_signals', 'pii_sensitive_data'],
  readability: ['white_space', 'fluff_buzzwords', 'bullet_length_formatting_consistency'],
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

  const isApplicable = useCallback((r, i) => {
    if (r.dimension_code && !TEXT_EDITABLE_DIMENSIONS.has(r.dimension_code)) return false
    if (!matchCache[i]) return false
    return true
  }, [matchCache])

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
      if (!isApplicable(r, i)) return
      all.add(i)
    })
    setSelectedIndices(all)
  }

  const handleDeselectAll = () => setSelectedIndices(new Set())

  const applyRewrites = useCallback((rewritesToApply) => {
    if (!rewritesToApply.length) {
      showToast('No changes could be applied.', 'info')
      return
    }

    // Sort by position descending so replacements don't shift indices
    const sorted = rewritesToApply
      .sort((a, b) => b.match.index - a.match.index)

    let currentMd = markdownSource
    let applied = 0

    for (const { match, rewritten } of sorted) {
      const target = currentMd.substring(match.index, match.index + match.length)
      if (target === match.text) {
        currentMd = currentMd.substring(0, match.index) + rewritten + currentMd.substring(match.index + match.length)
        applied++
      }
    }

    if (applied > 0) {
      setLocalMarkdown(currentMd)
      showToast(`${applied} change${applied !== 1 ? 's' : ''} applied`, 'success')
    } else {
      showToast('No changes could be applied.', 'info')
    }
  }, [markdownSource, showToast])

  const handleApplyAll = useCallback(() => {
    const applicable = rewrites
      ?.map((r, i) => ({ ...r, match: findBestMatch(markdownSource, r.original), _idx: i }))
      .filter(r => isApplicable(r, r._idx) && r.match) || []
    applyRewrites(applicable)
    setShowDrawer(false)
  }, [rewrites, markdownSource, isApplicable, applyRewrites])

  const handleApply = useCallback(() => {
    const selected = rewrites
      ?.map((r, i) => ({ ...r, match: findBestMatch(markdownSource, r.original), _idx: i }))
      .filter(r => selectedIndices.has(r._idx) && isApplicable(r, r._idx) && r.match) || []
    applyRewrites(selected)
    setShowDrawer(false)
  }, [rewrites, markdownSource, selectedIndices, isApplicable, applyRewrites])

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
                <div className="apply-split-btn">
                  <button
                    className="toolbar-btn toolbar-btn-primary"
                    onClick={handleApplyAll}
                  >
                    Apply Changes
                  </button>
                  <button
                    className="toolbar-btn toolbar-btn-dropdown"
                    onClick={() => setShowDrawer(!showDrawer)}
                    title="Review changes before applying"
                  >
                    ▾
                  </button>
                </div>
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
                  Review & Select Changes <span className="count">{applicableCount} of {rewrites.length} applicable</span>
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
                              {match?.type === 'normalized' && <div className="change-note success">Matched (whitespace-adjusted) — will replace</div>}
                              {match?.type === 'fuzzy' && <div className="change-note success">Fuzzy match — will replace matched section</div>}
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
