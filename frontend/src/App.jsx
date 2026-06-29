import React, { useState } from 'react'
import UploadForm from './components/UploadForm.jsx'
import LoadingScreen from './components/LoadingScreen.jsx'
import SplitView from './components/SplitView.jsx'
import AdminLogin from './components/AdminLogin.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'
import { getCandidates } from './api/client.js'

function App() {
  const [screen, setScreen] = useState(
    window.location.pathname === '/admin' ? 'admin-login' : 'upload'
  )
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [adminKey, setAdminKey] = useState(null)

  const handleAnalysis = (data) => {
    setResults(data)
    setScreen('results')
    setError(null)
  }

  const handleError = (msg) => {
    setError(msg)
    setScreen('upload')
  }

  const handleReset = () => {
    setScreen('upload')
    setResults(null)
    setError(null)
    window.history.pushState({}, '', '/')
  }

  const handleAdminLogin = async (key) => {
    await getCandidates(key)
    setAdminKey(key)
    setScreen('admin-dashboard')
    setError(null)
  }

  const handleAdminLogout = () => {
    setAdminKey(null)
    setScreen('admin-login')
    window.history.pushState({}, '', '/admin')
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1 onClick={handleReset} style={{ cursor: 'pointer' }}>CV Analyzer</h1>
        <p className="subtitle">AI-Powered Resume Analysis for German Healthcare</p>
      </header>

      <main className="app-main">
        {error && <div className="error-banner">{error}</div>}

        {screen === 'upload' && (
          <UploadForm
            onAnalysis={handleAnalysis}
            onError={handleError}
            onLoading={() => setScreen('loading')}
          />
        )}

        {screen === 'loading' && <LoadingScreen />}

        {screen === 'results' && results && (
          <SplitView results={results} onReset={handleReset} />
        )}

        {screen === 'admin-login' && (
          <AdminLogin onLogin={handleAdminLogin} />
        )}

        {screen === 'admin-dashboard' && adminKey && (
          <AdminDashboard adminKey={adminKey} onLogout={handleAdminLogout} />
        )}
      </main>
    </div>
  )
}

export default App
