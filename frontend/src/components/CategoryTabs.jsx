import React from 'react'

const GROUP_ORDER = ['content', 'layout', 'red_flags', 'readability']

function CategoryTabs({ groups, activeGroup, onTabChange }) {
  if (!groups) return null

  const getIssueCount = (groupKey) => {
    const group = groups[groupKey]
    if (!group?.dimensions) return 0
    return Object.values(group.dimensions).reduce(
      (sum, dim) => sum + (dim.issues?.length || 0), 0
    )
  }

  return (
    <div className="cat-tabs">
      {GROUP_ORDER.map(groupKey => {
        const group = groups[groupKey]
        if (!group) return null
        const issueCount = getIssueCount(groupKey)
        const isActive = activeGroup === groupKey

        return (
          <button
            key={groupKey}
            className={`cat-tab ${isActive ? 'active' : ''}`}
            onClick={() => onTabChange(groupKey)}
          >
            {group.label}
            <span className="n">{issueCount}</span>
          </button>
        )
      })}
    </div>
  )
}

export default CategoryTabs
