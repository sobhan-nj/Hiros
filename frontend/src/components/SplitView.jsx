import React, { useState } from 'react'
import GroupTabs from './GroupTabs.jsx'
import AnalysisPanel from './AnalysisPanel.jsx'
import CVPreviewPanel from './CVPreviewPanel.jsx'

const GROUP_ORDER = ['content', 'layout', 'red_flags', 'readability']

function SplitView({ results, onReset }) {
  const { id, analysis } = results
  const [activeGroup, setActiveGroup] = useState('content')
  const [expandedSub, setExpandedSub] = useState(null)

  const { dimension_groups, tier, verdict, header, priority_fixes } = analysis
  const candidateName = header?.candidate_name || analysis.candidate_name || 'Candidate'

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

  return (
    <div className="split-view">
      <div className="split-content">
        <div className="analysis-panel">
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
              <span className={`tier-badge tier-${(tier || '').toLowerCase().replace(/\s+/g, '-').replace('%', '')}`}>{tier}</span>
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
            Analyze Another
          </button>
        </div>

        <div className="cv-preview-panel">
          <CVPreviewPanel
            candidateId={id}
            resumeFilename={analysis.resume_filename}
          />
        </div>
      </div>
    </div>
  )
}

export default SplitView
