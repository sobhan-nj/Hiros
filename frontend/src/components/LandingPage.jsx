import React, { useState, useRef, useEffect } from 'react'
import '../styles/landing.css'
import { getStats } from '../api/client.js'

function LandingPage({ onSubmit, onError }) {
  const [file, setFile] = useState(null)
  const [dragActive, setDragActive] = useState(false)
  const turnstileRef = useRef(null)
  const [turnstileToken, setTurnstileToken] = useState(null)
  const [stats, setStats] = useState(null)

  const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY

  useEffect(() => {
    if (!turnstileSiteKey || !window.turnstile) return
    const widgetId = window.turnstile.render(turnstileRef.current, {
      sitekey: turnstileSiteKey,
      callback: (token) => setTurnstileToken(token),
      'expired-callback': () => setTurnstileToken(null),
      theme: 'light',
    })
    return () => {
      if (window.turnstile) window.turnstile.remove(widgetId)
    }
  }, [turnstileSiteKey])

  useEffect(() => {
    getStats().then(data => setStats(data)).catch(() => {})
  }, [])

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0])
    }
  }

  const handleChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0])
    }
  }

  const handleSubmit = () => {
    if (!file) {
      onError('Please select a file to analyze.')
      return
    }
    if (turnstileSiteKey && !turnstileToken) {
      onError('Please complete the security check.')
      return
    }
    onSubmit(file)
  }

  const handleAboutClick = (e) => {
    e.preventDefault()
    document.getElementById('site-footer')?.scrollIntoView({ behavior: 'smooth' })
  }

  const cvCount = stats ? (stats.total_candidates || 0) + 50 : '1,200+'
  const formattedCvCount = typeof cvCount === 'number' ? cvCount.toLocaleString() + '+' : cvCount

  return (
    <div className="landing-page">
      <nav className="landing-nav">
        <a href="/" className="landing-logo">
          <img src="/logo.png" alt="Hiros mascot" className="landing-logo-icon" />
          <span>Hiros</span>
        </a>
        <div className="landing-nav-links">
          <a href="#site-footer" onClick={handleAboutClick}>About</a>
          <a href="https://github.com/sobhan-nj/Hiros.git" target="_blank" rel="noopener noreferrer" className="github-link" aria-label="View on GitHub" title="View source on GitHub">
            <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38
              0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01
              1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95
              0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27
              1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48
              0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z"/>
            </svg>
          </a>
        </div>
      </nav>

      <header className="landing-hero">
        <span className="landing-eyebrow">Maximize your chances with your best CV</span>
        <h1>Find your CV flaws <em>before</em> the recruiter does.</h1>
        <p>Upload your CV and get a full readiness analysis — layout, content, red flags, and readability — tuned to how German employers actually read a physician's CV.</p>
      </header>

      <div className="landing-upload-wrap">
        <div
          className={`landing-dropzone ${dragActive ? 'drag-active' : ''} ${file ? 'has-file' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => !file && document.getElementById('landing-file-input')?.click()}
        >
          <input
            type="file"
            id="landing-file-input"
            accept=".pdf,.docx"
            onChange={handleChange}
            hidden
          />
          <div className="landing-dropzone-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 15V4M12 4L7 9M12 4L17 9" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M4 15V17.8C4 18.9 4.9 19.8 6 19.8H18C19.1 19.8 20 18.9 20 17.8V15" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
          </div>
          {file ? (
            <span className="landing-file-name">{file.name}</span>
          ) : (
            <>
              <h3>Drop your CV here</h3>
              <p>PDF or Word — takes about 30 seconds</p>
              <button className="landing-btn-primary" type="button" onClick={(e) => { e.stopPropagation(); document.getElementById('landing-file-input')?.click() }}>
                Choose file
              </button>
            </>
          )}
          <div className="landing-file-meta">Max 10MB · Your data isn't shared with third parties</div>
        </div>

        {file && (
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <button className="landing-btn-primary" onClick={handleSubmit}>
              Start Analysis
            </button>
          </div>
        )}

        {turnstileSiteKey && (
          <div className="landing-turnstile">
            <div ref={turnstileRef}></div>
          </div>
        )}

        <div className="landing-trust-row">
          <span>
            <svg viewBox="0 0 16 16" fill="none"><path d="M2 8l4 4L14 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            No account required
          </span>
          <span>
            <svg viewBox="0 0 16 16" fill="none"><path d="M2 8l4 4L14 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Private &amp; secure
          </span>
          <span>
            <svg viewBox="0 0 16 16" fill="none"><path d="M2 8l4 4L14 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Results in under a minute
          </span>
        </div>
      </div>

      <div className="landing-proof-strip">
        <div className="landing-proof-stat">
          <div className="num">{formattedCvCount}</div>
          <div className="label">CVs analyzed</div>
        </div>
        <div className="landing-proof-stat">
          <div className="num">21</div>
          <div className="label">scoring dimensions</div>
        </div>
      </div>

      <div className="page">
        <div className="landing-screenshot-wrap">
          <div className="landing-screenshot-frame">
            <div className="landing-screenshot-chatbar">
              <div className="landing-quote-avatar">RM</div>
              <div>
                <div className="landing-screenshot-name">Dr. R. Moradi</div>
                <div className="landing-screenshot-sub">Med-AI Summit · Telegram group</div>
              </div>
            </div>
            <div className="landing-screenshot-body">
              <div className="landing-msg-bubble">
                Hiros caught things I never thought to fix — my photo, my Approbation section, even how I listed my rotations. I felt so much more prepared walking into interviews 🙏
                <span className="landing-msg-meta">10:42 <svg className="landing-msg-check" viewBox="0 0 16 11" width="14" height="10" fill="none"><path d="M1 5.5L4.5 9L10 1.5M6 5.5L9.5 9L15 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
              </div>
            </div>
          </div>
          <div className="landing-screenshot-caption">Shared by a physician in the Med-AI Summit community</div>
        </div>
      </div>

      <div className="landing-tips-section">
        <div className="landing-section-head">
          <span className="landing-eyebrow">Before you upload</span>
          <h2>Three things recruiters check first</h2>
        </div>
        <div className="landing-tips-grid">
          <div className="landing-tip-card">
            <div className="landing-tip-number">1</div>
            <h4>Photo &amp; formatting norms</h4>
            <p>German CVs (Lebenslauf) traditionally include a professional photo and follow a tabular, reverse-chronological layout — different from US/UK conventions.</p>
          </div>
          <div className="landing-tip-card">
            <div className="landing-tip-number">2</div>
            <h4>Approbation status</h4>
            <p>Recruiters look for your license recognition status immediately. Ambiguity here is one of the most common reasons applications stall.</p>
          </div>
          <div className="landing-tip-card">
            <div className="landing-tip-number">3</div>
            <h4>Unexplained gaps</h4>
            <p>Rotation and training gaps raise questions if left unaddressed. A one-line explanation next to a gap reads far better than silence.</p>
          </div>
        </div>
      </div>

      <footer className="landing-footer" id="site-footer">
        <div className="landing-footer-inner">
          <div className="landing-footer-about">
            <h5>About Hiros</h5>
            <p>Hiros is an AI-powered CV analysis tool built for physicians pursuing careers abroad. Built by a founder and medical student who's navigated this process personally — and it's growing into a place where physicians share what actually worked for them.</p>
            <div className="landing-footer-cta">
              <span className="landing-footer-cta-label">Got a tip or a story from your own move?</span>
              <a href="/vblog" className="landing-footer-cta-link">Share your experience in our blog →</a>
            </div>
          </div>
          <div className="landing-footer-col">
            <h6>Product</h6>
            <a href="#" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>How it works</a>
            <a href="#" onClick={(e) => e.preventDefault()}>Twitter / X</a>
            <a href="/vblog">Blog</a>
          </div>
          <div className="landing-footer-col">
            <h6>Community</h6>
            <a href="#" onClick={(e) => e.preventDefault()}>LinkedIn</a>
            <a href="https://t.me/Hirosai" target="_blank" rel="noopener noreferrer">Telegram group</a>
            <a href="#" onClick={(e) => e.preventDefault()}>Contact</a>
          </div>
        </div>
        <div className="landing-footer-bottom">
          <span>© 2026 Hiros</span>
          <span>hiros.online</span>
        </div>
      </footer>
    </div>
  )
}

export default LandingPage
