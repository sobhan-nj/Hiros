import React, { useState, useMemo } from 'react'
import { TEXT_EDITABLE_DIMENSIONS, normalizeText, findBestMatch } from '../utils/matching.js'

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
                          {applicable && matchCache[item.originalIndex]?.type === 'normalized' && (
                            <span className="not-applicable-reason" style={{ color: '#16a34a' }}>
                              Matched (whitespace-adjusted) — will replace
                            </span>
                          )}
                          {applicable && matchCache[item.originalIndex]?.type === 'fuzzy' && (
                            <span className="not-applicable-reason" style={{ color: '#16a34a' }}>
                              Fuzzy match — will replace matched section
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
