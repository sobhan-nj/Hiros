import React, { useState } from 'react'

function getRatingTag(rating) {
  const r = (rating || '').toLowerCase()
  if (r === 'great') return { class: 'great', label: 'Great' }
  if (r === 'good with slight improvement') return { class: 'good', label: 'Good' }
  return { class: 'work', label: 'Needs Work' }
}

function DimensionRow({ dimKey, data }) {
  const [expanded, setExpanded] = useState(false)
  const { name, rating, summary, issues, fixes } = data
  const tag = getRatingTag(rating)
  const isGreat = (rating || '').toLowerCase() === 'great'
  const issueCount = issues?.length || 0

  const handleClick = () => {
    if (!isGreat) setExpanded(!expanded)
  }

  return (
    <div
      className={`dim-row ${expanded ? 'expanded' : ''}`}
      onClick={handleClick}
      style={!isGreat ? { cursor: 'pointer' } : { cursor: 'default' }}
    >
      <div className="dim-row-head">
        <span className="dim-row-title">{name}</span>
        <span className={`dim-tag ${tag.class}`}>{tag.label}</span>
      </div>

      {!expanded && (
        <div className="dim-row-sub">
          {isGreat ? 'No issues' : issueCount > 0 ? `${issueCount} issue${issueCount !== 1 ? 's' : ''}` : 'No issues'}
        </div>
      )}

      {expanded && (
        <div className="dim-row-detail">
          {summary && (
            <div className="dim-detail-section">
              <div className="dim-detail-label">Summary</div>
              <p className="dim-detail-text">{summary}</p>
            </div>
          )}

          {issues && issues.length > 0 && (
            <div className="dim-detail-section">
              <div className="dim-detail-label">Issues</div>
              <ul className="dim-detail-list issues">
                {issues.map((issue, i) => (
                  <li key={i}>{issue}</li>
                ))}
              </ul>
            </div>
          )}

          {fixes && fixes.length > 0 && (
            <div className="dim-detail-section">
              <div className="dim-detail-label">Fixes</div>
              <ul className="dim-detail-list fixes">
                {fixes.map((fix, i) => (
                  <li key={i}>{fix}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DimensionRow
