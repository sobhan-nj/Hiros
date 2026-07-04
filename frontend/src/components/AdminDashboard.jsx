import React, { useState, useEffect } from 'react'
import { getCandidates, getCandidate, getStats } from '../api/client.js'
import SubsectionCard from './SubsectionCard.jsx'
import CVPreviewPanel from './CVPreviewPanel.jsx'
import GroupTabs from './GroupTabs.jsx'

const TIER_CONFIG = {
  'Needs Work': { color: '#ef4444', bg: '#fef2f2' },
  'Entry': { color: '#f97316', bg: '#fff7ed' },
  'Competitive': { color: '#eab308', bg: '#fefce8' },
  'Strong': { color: '#22c55e', bg: '#f0fdf4' },
  'Top 10%': { color: '#3b82f6', bg: '#eff6ff' },
}

const GROUP_ORDER = ['content', 'layout', 'red_flags', 'readability']

function AdminDashboard({ adminKey, onLogout }) {
  const [candidates, setCandidates] = useState([])
  const [stats, setStats] = useState(null)
  const [selected, setSelected] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeGroup, setActiveGroup] = useState('content')
  const [expandedSub, setExpandedSub] = useState(null)
  const [localMarkdown, setLocalMarkdown] = useState('')

  useEffect(() => {
    loadCandidates()
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      const data = await getStats(adminKey)
      setStats(data)
    } catch {
      // stats are non-critical, ignore errors
    }
  }

  const loadCandidates = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getCandidates(adminKey)
      setCandidates(data.candidates || [])
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load candidates')
    } finally {
      setLoading(false)
    }
  }

  const viewCandidate = async (id) => {
    setSelected(id)
    setDetailLoading(true)
    setError('')
    setActiveGroup('content')
    setExpandedSub(null)
    try {
      const data = await getCandidate(adminKey, id)
      setDetail(data)
      setLocalMarkdown(data.resume_markdown || '')
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to load candidate')
    } finally {
      setDetailLoading(false)
    }
  }

  const goBack = () => {
    setSelected(null)
    setDetail(null)
  }

  const handleSubsectionToggle = (groupKey, dimKey) => {
    if (expandedSub?.dimKey === dimKey) {
      setExpandedSub(null)
    } else {
      setExpandedSub({ groupKey, dimKey })
    }
  }

  if (selected && detail) {
    const analysis = detail.analysis || {}
    const tierConfig = TIER_CONFIG[analysis.tier] || TIER_CONFIG['Competitive']
    const { dimension_groups, tier, verdict, header, priority_fixes } = analysis
    const candidateName = header?.candidate_name || detail.name || 'Candidate'

    return (
      <div className="admin-dashboard admin-detail-view">
        <div className="admin-header">
          <button className="btn-back" onClick={goBack}>&larr; Back to list</button>
          <div className="admin-header-actions">
            <span className="candidate-count">{detail.name}</span>
            <button className="btn-logout" onClick={onLogout}>Logout</button>
          </div>
        </div>

        <div className="split-content" style={{ height: 'calc(100vh - 120px)' }}>
          <div className="analysis-panel">
            <div className="analysis-top-bar">
              <div className="candidate-info">
                <h2>{candidateName}</h2>
                <div className="header-tags">
                  {header?.cv_language && <span className="tag">{header.cv_language}</span>}
                  {header?.page_count > 0 && <span className="tag">{header.page_count}p</span>}
                  {header?.declared_seniority && <span className="tag">{header.declared_seniority}</span>}
                  {header?.detected_specialty && <span className="tag">{header.detected_specialty}</span>}
                  <span className="tag">Seniority: {detail.seniority_declared}</span>
                  {detail.seniority_detected && <span className="tag">Detected: {detail.seniority_detected}</span>}
                  {detail.created_at && <span className="tag">{new Date(detail.created_at).toLocaleDateString()}</span>}
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

            {dimension_groups && (
              <GroupTabs
                groups={dimension_groups}
                groupOrder={GROUP_ORDER}
                activeGroup={activeGroup}
                onTabChange={(g) => { setActiveGroup(g); setExpandedSub(null) }}
              />
            )}

            <div className="analysis-body">
              {dimension_groups && (
                <div className="analysis-list">
                  {Object.entries(dimension_groups[activeGroup]?.dimensions || {}).map(([key, dim]) => (
                    <SubsectionCard
                      key={key}
                      dimKey={key}
                      data={dim}
                      isExpanded={expandedSub?.dimKey === key}
                      isHighPriority={false}
                      onToggle={() => handleSubsectionToggle(activeGroup, key)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="cv-preview-panel">
            <CVPreviewPanel
              resumeText={detail.resume_text}
              resumeMarkdown={localMarkdown}
              resumeFilename={detail.original_filename}
              candidateId={detail.id}
              onUpdateMarkdown={setLocalMarkdown}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>Talent Pool</h1>
        <div className="admin-header-actions">
          <span className="candidate-count">{candidates.length} candidates</span>
          <button className="btn-refresh" onClick={loadCandidates}>Refresh</button>
          <button className="btn-logout" onClick={onLogout}>Logout</button>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {stats && (
        <div className="stats-bar">
          <div className="stat-card">
            <span className="stat-value">{stats.total_analyses}</span>
            <span className="stat-label">Total Analyses</span>
          </div>
          <div className="stat-card">
            <span className="stat-value">{stats.today}</span>
            <span className="stat-label">Today</span>
          </div>
          {Object.entries(stats.by_seniority || {}).map(([level, count]) => (
            <div key={level} className="stat-card">
              <span className="stat-value">{count}</span>
              <span className="stat-label">{level}</span>
            </div>
          ))}
          {Object.entries(stats.by_tier || {}).map(([tier, count]) => (
            <div key={tier} className="stat-card">
              <span className="stat-value">{count}</span>
              <span className="stat-label">{tier}</span>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="loading-screen">
          <div className="loading-spinner"></div>
          <p>Loading candidates...</p>
        </div>
      ) : candidates.length === 0 ? (
        <div className="empty-state">
          <p>No candidates in the talent pool yet.</p>
          <p className="empty-hint">Upload resumes on the main page to get started.</p>
        </div>
      ) : (
        <div className="candidates-table-wrapper">
          <table className="candidates-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Seniority</th>
                <th>Tier</th>
                <th>Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((c) => {
                const tc = TIER_CONFIG[c.tier] || TIER_CONFIG['Competitive']
                return (
                  <tr key={c.id} onClick={() => viewCandidate(c.id)} className="candidate-row">
                    <td className="candidate-name">{c.name}</td>
                    <td>{c.seniority}</td>
                    <td>
                      <span className="tier-badge-sm" style={{ backgroundColor: tc.bg, color: tc.color, borderColor: tc.color }}>
                        {c.tier || 'N/A'}
                      </span>
                    </td>
                    <td>{c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</td>
                    <td>
                      <button className="btn-view" onClick={(e) => { e.stopPropagation(); viewCandidate(c.id) }}>
                        View
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export default AdminDashboard
