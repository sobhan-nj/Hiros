import React, { useState, useMemo } from 'react'

const TEXT_EDITABLE_DIMENSIONS = new Set([
  'professional_summary',
  'bullet_quality_ownership',
  'impact_so_what',
  'keyword_density',
  'grammar_spelling_consistency',
  'fluff_buzzwords',
  'soft_skills_integration',
  'bullet_length_formatting_consistency',
  'relevance_recency',
  'specialty_fit_rotation_relevance',
  'white_space',
  'additional_context',
])

const DIMENSION_LABELS = {
  professional_summary: 'Professional Summary',
  bullet_quality_ownership: 'Bullet Quality & Ownership',
  impact_so_what: 'Impact / "So What?"',
  keyword_density: 'Keyword Density',
  grammar_spelling_consistency: 'Grammar, Spelling & Consistency',
  fluff_buzzwords: 'Fluff & Buzzwords',
  soft_skills_integration: 'Soft Skills Integration',
  bullet_length_formatting_consistency: 'Bullet Length & Formatting',
  relevance_recency: 'Relevance & Recency',
  specialty_fit_rotation_relevance: 'Specialty Fit & Relevance',
  white_space: 'White Space',
  additional_context: 'Additional Context',
  legal_eligibility_status: 'Legal & Eligibility Status',
  gaps_risk_signals: 'Gaps & Risk Signals',
  professional_network: 'Professional Network',
  formalities: 'Formalities',
  page_structure: 'Page Structure',
  ats_compatibility: 'ATS Compatibility',
  section_order: 'Section Order',
  pii_sensitive_data: 'PII & Sensitive Data',
}

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

  // 1. Exact match on raw text
  const exactIdx = markdown.indexOf(original)
  if (exactIdx !== -1) return { index: exactIdx, length: original.length, text: original }

  // 2. Normalized match
  const normIdx = normMd.indexOf(normOrig)
  if (normIdx !== -1) {
    // Map back: find the start in original markdown by looking for first significant word
    const firstWord = normOrig.split(/\s+/).find(w => w.length > 2)
    if (firstWord) {
      // Search in a window around normIdx in the original markdown
      const searchStart = Math.max(0, normIdx - 20)
      const searchEnd = Math.min(markdown.length, normIdx + normOrig.length + 20)
      const window = markdown.substring(searchStart, searchEnd)
      const wordIdx = window.indexOf(firstWord)
      if (wordIdx !== -1) {
        const absStart = searchStart + wordIdx
        // Find end by searching for last significant word
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
    return { index: normIdx, length: normOrig.length, text: markdown.substring(normIdx, normIdx + normOrig.length), normalized: true }
  }

  // 3. Word-level fuzzy match — find longest contiguous chunk of normalized words
  const origWords = normOrig.split(/\s+/).filter(w => w.length > 2)
  if (origWords.length < 2) return null

  for (let len = origWords.length; len >= Math.min(3, origWords.length); len--) {
    for (let start = 0; start <= origWords.length - len; start++) {
      const chunk = origWords.slice(start, start + len).join(' ')
      const chunkIdx = normMd.indexOf(chunk)
      if (chunkIdx !== -1) {
        // Extend forward
        let endIdx = chunkIdx + chunk.length
        for (const w of origWords.slice(start + len)) {
          const nextIdx = normMd.indexOf(w, endIdx)
          if (nextIdx !== -1 && nextIdx - endIdx < 15) endIdx = nextIdx + w.length
          else break
        }
        // Extend backward
        let startIdx = chunkIdx
        for (const w of origWords.slice(0, start).reverse()) {
          const prevIdx = normMd.lastIndexOf(w, startIdx)
          if (prevIdx !== -1 && startIdx - prevIdx < 15) startIdx = prevIdx
          else break
        }
        // Map back to original markdown positions
        const matchedNorm = normMd.substring(startIdx, endIdx)
        const firstWord = matchedNorm.split(/\s+/).find(w => w.length > 2)
        if (firstWord) {
          const searchStart = Math.max(0, startIdx - 10)
          const searchEnd = Math.min(markdown.length, endIdx + 10)
          const window = markdown.substring(searchStart, searchEnd)
          const wordIdx = window.indexOf(firstWord)
          if (wordIdx !== -1) {
            const absStart = searchStart + wordIdx
            // Estimate length from normalized length (rough but close enough)
            const estEnd = Math.min(markdown.length, absStart + matchedNorm.length + 20)
            return { index: absStart, length: estEnd - absStart, text: markdown.substring(absStart, estEnd), partial: true }
          }
        }
      }
    }
  }

  return null
}

function SmartApplyPanel({ rewrites, markdown, onApply, onDismiss }) {
  const [selectedIndices, setSelectedIndices] = useState(() => {
    const initial = new Set()
    rewrites.forEach((r, i) => initial.add(i))
    return initial
  })
  const [expandedGroups, setExpandedGroups] = useState(() => {
    const groups = new Set()
    rewrites.forEach(r => {
      if (r.dimension_code) groups.add(r.dimension_code)
    })
    return groups
  })

  const matchCache = useMemo(() => {
    const cache = {}
    rewrites.forEach((r, i) => {
      cache[i] = findBestMatch(markdown, r.original)
    })
    return cache
  }, [rewrites, markdown])

  const groupedRewrites = useMemo(() => {
    const groups = {}
    rewrites.forEach((rewrite, index) => {
      const dim = rewrite.dimension_code || 'other'
      if (!groups[dim]) groups[dim] = []
      groups[dim].push({ ...rewrite, originalIndex: index })
    })
    return groups
  }, [rewrites])

  const applicableCount = useMemo(() => {
    return rewrites.filter((r, i) => {
      if (!selectedIndices.has(i)) return false
      if (r.dimension_code && !TEXT_EDITABLE_DIMENSIONS.has(r.dimension_code)) return false
      if (!matchCache[i]) return false
      return true
    }).length
  }, [rewrites, selectedIndices, matchCache])

  const handleToggle = (index) => {
    setSelectedIndices(prev => {
      const next = new Set(prev)
      if (next.has(index)) next.delete(index)
      else next.add(index)
      return next
    })
  }

  const handleToggleGroup = (dimCode) => {
    setExpandedGroups(prev => {
      const next = new Set(prev)
      if (next.has(dimCode)) next.delete(dimCode)
      else next.add(dimCode)
      return next
    })
  }

  const handleSelectAll = () => {
    const allApplicable = new Set()
    rewrites.forEach((r, i) => {
      if (r.dimension_code && !TEXT_EDITABLE_DIMENSIONS.has(r.dimension_code)) return
      if (!matchCache[i]) return
      allApplicable.add(i)
    })
    setSelectedIndices(allApplicable)
  }

  const handleDeselectAll = () => {
    setSelectedIndices(new Set())
  }

  const handleApply = () => {
    const selected = rewrites.filter((r, i) => {
      if (!selectedIndices.has(i)) return false
      if (r.dimension_code && !TEXT_EDITABLE_DIMENSIONS.has(r.dimension_code)) return false
      if (!matchCache[i]) return false
      return true
    }).map((r, _, arr) => {
      const i = rewrites.indexOf(r)
      return { ...r, matchInfo: matchCache[i] }
    })
    onApply(selected)
  }

  const isApplicable = (rewrite, index) => {
    if (rewrite.dimension_code && !TEXT_EDITABLE_DIMENSIONS.has(rewrite.dimension_code)) return false
    if (!matchCache[index]) return false
    return true
  }

  const renderDiff = (original, rewritten) => {
    return (
      <div className="smart-apply-diff">
        <div className="diff-original">
          <span className="diff-label">Original</span>
          <p>{original}</p>
        </div>
        <div className="diff-rewritten">
          <span className="diff-label">Rewritten</span>
          <p>{rewritten}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="smart-apply-panel">
      <div className="smart-apply-header">
        <div className="smart-apply-title">
          <h3>Apply Changes</h3>
          <span className="smart-apply-count">
            {applicableCount} of {rewrites.length} changes applicable
          </span>
        </div>
        <div className="smart-apply-actions">
          <button className="smart-apply-select-btn" onClick={handleSelectAll}>Select All</button>
          <button className="smart-apply-select-btn" onClick={handleDeselectAll}>Deselect All</button>
          <button className="smart-apply-dismiss-btn" onClick={onDismiss}>Dismiss</button>
        </div>
      </div>

      <div className="smart-apply-body">
        {Object.entries(groupedRewrites).map(([dimCode, items]) => {
          const dimLabel = DIMENSION_LABELS[dimCode] || dimCode
          const isEditable = !dimCode || TEXT_EDITABLE_DIMENSIONS.has(dimCode)
          const isExpanded = expandedGroups.has(dimCode)
          const groupSelectedCount = items.filter(item => selectedIndices.has(item.originalIndex)).length

          return (
            <div key={dimCode} className={`smart-apply-group ${!isEditable ? 'non-applicable' : ''}`}>
              <button
                className="smart-apply-group-header"
                onClick={() => handleToggleGroup(dimCode)}
              >
                <span className={`expand-icon ${isExpanded ? 'rotated' : ''}`}>▾</span>
                <span className="group-name">{dimLabel}</span>
                <span className="group-count">
                  {groupSelectedCount}/{items.length}
                </span>
                {!isEditable && <span className="non-applicable-badge">Manual action required</span>}
              </button>

              {isExpanded && (
                <div className="smart-apply-group-body">
                  {items.map((item) => {
                    const applicable = isApplicable(item, item.originalIndex)
                    const checked = selectedIndices.has(item.originalIndex)
                    return (
                      <div
                        key={item.originalIndex}
                        className={`smart-apply-row ${!applicable ? 'not-applicable' : ''} ${checked ? 'selected' : ''}`}
                      >
                        <label className="smart-apply-checkbox">
                          <input
                            type="checkbox"
                            checked={checked && applicable}
                            disabled={!applicable}
                            onChange={() => handleToggle(item.originalIndex)}
                          />
                          <span className="checkmark" />
                        </label>
                        <div className="smart-apply-row-content">
                          {renderDiff(item.original, item.rewritten)}
                          {!applicable && (
                            <span className="not-applicable-reason">
                              {item.dimension_code && !TEXT_EDITABLE_DIMENSIONS.has(item.dimension_code)
                                ? 'Requires manual action — not a text edit'
                                : 'Original text not found in resume'}
                            </span>
                          )}
                          {applicable && matchCache[item.originalIndex]?.partial && (
                            <span className="not-applicable-reason" style={{ color: '#16a34a' }}>
                              Partial match found — will replace matched section
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="smart-apply-footer">
        <button
          className="smart-apply-confirm-btn"
          onClick={handleApply}
          disabled={applicableCount === 0}
        >
          Apply {applicableCount} Change{applicableCount !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  )
}

export default SmartApplyPanel
