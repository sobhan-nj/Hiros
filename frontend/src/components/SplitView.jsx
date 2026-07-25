import React, { useState, useRef, useCallback, useEffect } from 'react'
import GroupTabs from './GroupTabs.jsx'
import AnalysisPanel from './AnalysisPanel.jsx'
import CVPreviewPanel from './CVPreviewPanel.jsx'

const GROUP_ORDER = ['content', 'layout', 'red_flags', 'readability']

function SplitView({ results, onReset }) {
  const { id, analysis } = results
  const [activeGroup, setActiveGroup] = useState('content')
  const [expandedSub, setExpandedSub] = useState(null)
  const [localMarkdown, setLocalMarkdown] = useState(analysis.resume_markdown || '')
  const [mobileTab, setMobileTab] = useState('analysis')
  const [splitRatio, setSplitRatio] = useState(55)
  const isDragging = useRef(false)
  const splitRef = useRef(null)

  const { dimension_groups, tier, verdict, header, priority_fixes, rewrites } = analysis
  const candidateName = header?.candidate_name || analysis.candidate_name || 'Candidate'
  const tierClass = tier ? `tier-badge tier-${tier.toLowerCase().replace(/\s+/g, '-')}` : 'tier-badge'

  const handleSubsectionToggle = (groupKey, dimKey) => {
    if (expandedSub?.dimKey === dimKey) {
      setExpandedSub(null)
    } else {
      setExpandedSub({ groupKey, dimKey })
    }
  }

  const handleTabChange = (groupKey) => {
    setActiveGroup(groupKey)
    setExpandedSub(null)
  }

  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    isDragging.current = true
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [])

  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current || !splitRef.current) return
    const rect = splitRef.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const pct = (x / rect.width) * 100
    setSplitRatio(Math.max(30, Math.min(75, pct)))
  }, [])

  const handleMouseUp = useCallback(() => {
    isDragging.current = false
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [])

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMouseMove, handleMouseUp])

  return (
    <div className="split-view">
      <div className="split-content" ref={splitRef}>
        <div
          className="analysis-panel"
          style={{ width: splitRatio + '%' }}
        >
          <div className="analysis-top-bar">
            <div className="candidate-info">
              <h2>{candidateName}</h2>
              <div className="header-tags">
                {header?.cv_language && <span className="tag">{header.cv_language}</span>}
                {header?.page_count > 0 && <span className="tag">{header.page_count}p</span>}
                {header?.declared_seniority && <span className="tag">{header.declared_seniority}</span>}
                {header?.detected_specialty && <span className="tag">{header.detected_specialty}</span>}
              </div>
            </div>
            <div className="tier-verdict">
              <span className={tierClass}>{tier}</span>
              {verdict && <p className="verdict-text">{verdict}</p>}
            </div>

            {priority_fixes && priority_fixes.length > 0 && (
              <div className="priority-fixes">
                <h3>Priority Fixes</h3>
                <ol>
                  {priority_fixes.map((fix, i) => (
                    <li key={i}>
                      {fix.dimension_name && <span className="fix-dim">{fix.dimension_name}</span>}
                      {fix.fix || fix}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>

          <GroupTabs
            groups={dimension_groups}
            groupOrder={GROUP_ORDER}
            activeGroup={activeGroup}
            onTabChange={handleTabChange}
          />

          <div className="analysis-body">
            {dimension_groups && (
              <AnalysisPanel
                group={dimension_groups[activeGroup]}
                groupKey={activeGroup}
                expandedSub={expandedSub}
                onToggle={handleSubsectionToggle}
              />
            )}
          </div>

          <button className="btn-reset" onClick={onReset}>
            Try another resume
          </button>
        </div>

        <div
          className="split-divider"
          onMouseDown={handleMouseDown}
        />

        <div
          className="cv-preview-panel"
          style={{ width: (100 - splitRatio) + '%' }}
        >
          <CVPreviewPanel
            resumeText={analysis.resume_text}
            resumeMarkdown={localMarkdown}
            resumeFilename={analysis.resume_filename}
            candidateId={id}
            onUpdateMarkdown={setLocalMarkdown}
            rewrites={rewrites}
          />
        </div>
      </div>

      <div className="mobile-tab-bar">
        <button
          className="mobile-tab-btn"
          onClick={() => setMobileTab('analysis')}
        >
          <span className="mobile-tab-icon">&#128202;</span>
          Analysis
        </button>
        <button
          className="mobile-tab-btn"
          onClick={() => setMobileTab('resume')}
        >
          <span className="mobile-tab-icon">&#128196;</span>
          Resume
        </button>
      </div>
    </div>
  )
}

export default SplitView
