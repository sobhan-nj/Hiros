import React from 'react'

function VBlog({ onNavigate }) {
  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--cream-50)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Source Sans 3', sans-serif",
      padding: '2rem',
      textAlign: 'center'
    }}>
      <h1 style={{
        fontFamily: "'Fraunces', serif",
        fontSize: '2rem',
        color: 'var(--navy-950)',
        marginBottom: '1rem'
      }}>
        Blog
      </h1>
      <p style={{
        fontSize: '1.1rem',
        color: 'var(--ink-500)',
        marginBottom: '2rem',
        maxWidth: '400px'
      }}>
        Coming soon. We're working on sharing stories and tips from physicians who've navigated the move abroad.
      </p>
      <button
        onClick={() => onNavigate('landing')}
        style={{
          background: 'var(--navy-950)',
          color: 'var(--cream-50)',
          border: 'none',
          padding: '12px 24px',
          borderRadius: '10px',
          fontSize: '14px',
          fontWeight: 600,
          cursor: 'pointer',
          fontFamily: "'Source Sans 3', sans-serif"
        }}
      >
        Back to Home
      </button>
    </div>
  )
}

export default VBlog
