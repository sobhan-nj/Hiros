import React, { useState } from 'react'

function AdminLogin({ onLogin }) {
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!key.trim()) {
      setError('Please enter your admin key')
      return
    }
    setLoading(true)
    setError('')
    try {
      await onLogin(key)
    } catch {
      setError('Invalid admin key or server error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-login">
      <div className="admin-login-card">
        <h2>Admin Access</h2>
        <p className="admin-login-subtitle">Enter your admin API key to continue</p>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="admin-key">API Key</label>
            <input
              id="admin-key"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter admin key"
              autoFocus
            />
          </div>
          <button type="submit" className="btn-analyze" disabled={loading}>
            {loading ? 'Verifying...' : 'Access Dashboard'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default AdminLogin
