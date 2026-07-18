import React, { useState, useEffect, useRef } from 'react'
import LandingPage from './components/LandingPage.jsx'
import VBlog from './components/VBlog.jsx'
import Questionnaire from './components/Questionnaire.jsx'
import SplitView from './components/SplitView.jsx'
import AdminLogin from './components/AdminLogin.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'
import LoadingScreen from './components/LoadingScreen.jsx'
import { getCandidates, parseResume, analyzeResume } from './api/client.js'

function getInitialScreen() {
  const path = window.location.pathname
  if (path === '/admin') return 'admin-login'
  if (path === '/vblog') return 'vblog'
  return 'landing'
}

function App() {
  const [screen, setScreen] = useState(getInitialScreen)
  const [error, setError] = useState(null)
  const [adminKey, setAdminKey] = useState(null)

  const [parsedData, setParsedData] = useState(null)
  const [originalFile, setOriginalFile] = useState(null)
  const [parseDone, setParseDone] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [analysisDone, setAnalysisDone] = useState(false)
  const [allQuestionsDone, setAllQuestionsDone] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [pendingIndustry, setPendingIndustry] = useState(null)
  const [pendingSeniority, setPendingSeniority] = useState(null)
  const [loadingStep, setLoadingStep] = useState(null)
  const [answers, setAnswers] = useState({ industry: 'health', seniority: 'mid', targetCountry: 'germany', referralSource: '' })
  const analyzingRef = useRef(false)

  useEffect(() => {
    if (analysisDone && analysisResult && screen === 'loading') {
      setScreen('results')
      setError(null)
    }
  }, [analysisDone, analysisResult, screen])

  useEffect(() => {
    if (parseDone && parsedData && pendingIndustry && pendingSeniority && !analyzingRef.current) {
      analyzingRef.current = true
      setAnalyzing(true)
      analyzeResume({
        resume_text: parsedData.resume_text,
        resume_markdown: parsedData.resume_markdown,
        raw_keywords: JSON.stringify(parsedData.raw_keywords),
        seniority: pendingSeniority,
        industry: pendingIndustry,
        target_country: answers.targetCountry,
        referral_source: answers.referralSource,
        resume_filename: parsedData.filename,
      }).then(data => {
        setAnalysisResult(data)
        setAnalysisDone(true)
        setAnalyzing(false)
        setLoadingStep(null)
        analyzingRef.current = false
      }).catch(err => {
        const msg = err.response?.data?.detail || err.message || 'Analysis failed'
        setError(msg)
        setAnalyzing(false)
        setLoadingStep(null)
        analyzingRef.current = false
      })
    }
  }, [parseDone, parsedData, pendingIndustry, pendingSeniority, answers.targetCountry, answers.referralSource])

  const handleSubmit = (file) => {
    setError(null)
    setOriginalFile(file)
    setScreen('questionnaire')

    parseResume(file).then(data => {
      setParsedData(data)
      setParseDone(true)
    }).catch(err => {
      const msg = err.response?.data?.detail || err.message || 'Failed to parse resume'
      setError(msg)
      setScreen('landing')
    })
  }

  const handleParseError = (msg) => {
    setError(msg)
    setScreen('landing')
  }

  const handleQuestionnaireComplete = (finalAnswers) => {
    setAnswers(finalAnswers)
    setAllQuestionsDone(true)
  }

  const handleSeeResults = () => {
    setScreen('loading')
    setError(null)
  }

  const handleStepAnswer = (stepKey, value) => {
    setAnswers(prev => ({ ...prev, [stepKey]: value }))
    if (stepKey === 'industry') {
      setPendingIndustry(value)
    }
    if (stepKey === 'seniority') {
      setPendingSeniority(value)
    }
  }

  const handleReset = () => {
    setScreen('landing')
    setParsedData(null)
    setOriginalFile(null)
    setParseDone(false)
    setAnalysisResult(null)
    setAnalysisDone(false)
    setAllQuestionsDone(false)
    setAnalyzing(false)
    setPendingIndustry(null)
    setPendingSeniority(null)
    setLoadingStep(null)
    analyzingRef.current = false
    setAnswers({ industry: 'health', seniority: 'mid', targetCountry: 'germany', referralSource: '' })
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

  const handleNavigate = (target) => {
    if (target === 'landing') {
      window.history.pushState({}, '', '/')
      setScreen('landing')
    } else if (target === 'vblog') {
      window.history.pushState({}, '', '/vblog')
      setScreen('vblog')
    }
  }

  const showHeader = screen !== 'landing' && screen !== 'vblog'

  return (
    <div className="app">
      {showHeader && (
        <header className="app-header">
          <h1 onClick={handleReset} style={{ cursor: 'pointer' }}>CV Analyzer</h1>
          <p className="subtitle">Find your CV flaws before the recruiter does</p>
        </header>
      )}

      <main className="app-main">
        {error && <div className="error-banner">{error}</div>}

        {screen === 'landing' && (
          <LandingPage
            onSubmit={handleSubmit}
            onError={handleParseError}
          />
        )}

        {screen === 'vblog' && (
          <VBlog onNavigate={handleNavigate} />
        )}

        {screen === 'questionnaire' && (
          <Questionnaire
            onComplete={handleQuestionnaireComplete}
            onStepAnswer={handleStepAnswer}
            onSeeResults={handleSeeResults}
            answers={answers}
            analyzing={analyzing}
          />
        )}

        {screen === 'loading' && (
          <LoadingScreen analysisDone={analysisDone} />
        )}

        {screen === 'results' && analysisResult && (
          <SplitView results={analysisResult} onReset={handleReset} />
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
