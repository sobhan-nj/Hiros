import React, { useMemo } from 'react'
import ScoreRing from './ScoreRing.jsx'

const TIER_SCORES = {
  'Top 10%': 92,
  'Strong': 78,
  'Competitive': 62,
  'Entry': 42,
  'Needs Work': 28,
}

const WARNING_SVG = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a1.5 1.5 0 001.28 2.25h17.8a1.5 1.5 0 001.28-2.25L13.71 3.86a1.5 1.5 0 00-2.42 0z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

const ARROW_SVG = (
  <svg viewBox="0 0 24 24" fill="none">
    <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
)

function ResultsSummary({ results, onReset, onSeeFull }) {
  const { analysis } = results
  const { tier, verdict, header, dimension_groups, priority_fixes, rewrites } = analysis

  const candidateName = header?.candidate_name || 'Candidate'
  const score = TIER_SCORES[tier] || 50
  const fixCount = rewrites?.length || 0

  const categoryCounts = useMemo(() => {
    const counts = {}
    if (dimension_groups) {
      Object.entries(dimension_groups).forEach(([key, group]) => {
        counts[key] = Object.values(group.dimensions).reduce(
          (sum, dim) => sum + (dim.issues?.length || 0), 0
        )
      })
    }
    return counts
  }, [dimension_groups])

  const topFixes = useMemo(() => (priority_fixes || []).slice(0, 3), [priority_fixes])

  const getChipClass = (count) => {
    if (count >= 5) return 'high'
    if (count >= 1) return 'med'
    return 'low'
  }

  return (
    <div className="summary-wrap">
      <div className="summary-card">
        <div className="summary-top">
          <ScoreRing score={score} />
          <div className="summary-top-text">
            <h1 className="summary-candidate-name">{candidateName}</h1>
            <div className="fix-count-badge">
              <span className="fix-count-num">{fixCount}</span> fixes you can apply to improve this resume
            </div>
          </div>
        </div>

        {verdict && (
          <p className="summary-text">{verdict}</p>
        )}

        {topFixes.length > 0 && (
          <div className="priority-box">
            <h3 className="priority-head">
              {WARNING_SVG}
              Priority Fixes
            </h3>
            <ul className="priority-list">
              {topFixes.map((fix, i) => (
                <li key={i} className="priority-item">
                  <span className="priority-num">{i + 1}</span>
                  <p>
                    <strong>{fix.dimension_name}</strong> — {fix.fix}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="stat-row">
          <div className={`stat-chip ${getChipClass(categoryCounts.content || 0)}`}>
            <span className="dot" />
            <span className="label">Content</span>
            <span className="count">{categoryCounts.content || 0}</span>
          </div>
          <div className={`stat-chip ${getChipClass(categoryCounts.layout || 0)}`}>
            <span className="dot" />
            <span className="label">Layout</span>
            <span className="count">{categoryCounts.layout || 0}</span>
          </div>
          <div className={`stat-chip ${getChipClass(categoryCounts.red_flags || 0)}`}>
            <span className="dot" />
            <span className="label">Red Flags</span>
            <span className="count">{categoryCounts.red_flags || 0}</span>
          </div>
          <div className={`stat-chip ${getChipClass(categoryCounts.readability || 0)}`}>
            <span className="dot" />
            <span className="label">Readability</span>
            <span className="count">{categoryCounts.readability || 0}</span>
          </div>
        </div>

        <div className="summary-actions">
          <button className="link-quiet" onClick={onReset}>
            &larr; Try another resume
          </button>
          <button className="btn-full-results" onClick={onSeeFull}>
            See Full Results
            {ARROW_SVG}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ResultsSummary
