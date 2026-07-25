import React, { useEffect, useState } from 'react'

const CIRCUMFERENCE = 326.7 // 2 * PI * 52

function getScoreColor(score) {
  if (score >= 85) return 'var(--teal-600)'
  if (score >= 65) return 'var(--amber-500)'
  return 'var(--coral-500)'
}

function ScoreRing({ score, size = 118 }) {
  const [mounted, setMounted] = useState(false)
  const color = getScoreColor(score)
  const dashOffset = CIRCUMFERENCE - (CIRCUMFERENCE * score / 100)

  useEffect(() => {
    const timer = setTimeout(() => setMounted(true), 50)
    return () => clearTimeout(timer)
  }, [])

  return (
    <div className="score-ring-wrap" style={{ width: size, height: size }}>
      <svg viewBox="0 0 118 118" width={size} height={size}>
        <circle className="ring-track" cx="59" cy="59" r="52" />
        <circle
          className="ring-fill"
          cx="59"
          cy="59"
          r="52"
          style={{
            stroke: color,
            strokeDashoffset: mounted ? dashOffset : CIRCUMFERENCE,
          }}
        />
      </svg>
      <div className="score-center">
        <div className="score-num">{score}</div>
        <div className="score-max">/ 100</div>
      </div>
    </div>
  )
}

export default ScoreRing
