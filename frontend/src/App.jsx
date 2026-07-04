import React, { useState, useEffect, useRef } from 'react'
import UploadForm from './components/UploadForm.jsx'
import Questionnaire from './components/Questionnaire.jsx'
import SplitView from './components/SplitView.jsx'
import AdminLogin from './components/AdminLogin.jsx'
import AdminDashboard from './components/AdminDashboard.jsx'
import LoadingScreen from './components/LoadingScreen.jsx'
import { getCandidates, parseResume, analyzeResume } from './api/client.js'

function App() {
  const [screen, setScreen] = useState(
    window.location.pathname === '/admin' ? 'admin-login' : 'upload'
  )
  const [error, setError] = useState(null)
  const [adminKey, setAdminKey] = useState(null)

  const [parsedData, setParsedData] = useState(null)
  const [originalFile, setOriginalFile] = useState(null)
  const [parseDone, setParseDone] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [analysisDone, setAnalysisDone] = useState(false)
  const [allQuestionsDone, setAllQuestionsDone] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [pendingSeniority, setPendingSeniority] = useState(null)
  const [loadingStep, setLoadingStep] = useState(null)
  const [answers, setAnswers] = useState({ seniority: 'mid', targetCountry: 'germany', referralSource: '' })
  const analyzingRef = useRef(false)

  useEffect(() => {
    if (analysisDone && analysisResult && screen === 'loading') {
      setScreen('results')
      setError(null)
    }
  }, [analysisDone, analysisResult, screen])

  useEffect(() => {
    if (parseDone && parsedData && pendingSeniority && !analyzingRef.current) {
      analyzingRef.current = true
      setAnalyzing(true)
      analyzeResume({
        resume_text: parsedData.resume_text,
        resume_markdown: parsedData.resume_markdown,
        raw_keywords: JSON.stringify(parsedData.raw_keywords),
        seniority: pendingSeniority,
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
  }, [parseDone, parsedData, pendingSeniority, answers.targetCountry, answers.referralSource])

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
      setScreen('upload')
    })
  }

  const handleParseError = (msg) => {
    setError(msg)
    setScreen('upload')
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
    if (stepKey === 'seniority') {
      setPendingSeniority(value)
    }
  }

  const handleReset = () => {
    setScreen('upload')
    setParsedData(null)
    setOriginalFile(null)
    setParseDone(false)
    setAnalysisResult(null)
    setAnalysisDone(false)
    setAllQuestionsDone(false)
    setAnalyzing(false)
    setPendingSeniority(null)
    setLoadingStep(null)
    analyzingRef.current = false
    setAnswers({ seniority: 'mid', targetCountry: 'germany', referralSource: '' })
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
      </header>

      <main className="app-main">
        {error && <div className="error-banner">{error}</div>}

        {screen === 'upload' && (
          <UploadForm
            onSubmit={handleSubmit}
            onError={handleParseError}
          />
        )}

        {screen === 'questionnaire' && (
          <Questionnaire
            onComplete={handleQuestionnaireComplete}
            onStepAnswer={handleStepAnswer}
            analyzing={analyzing}
            analysisDone={analysisDone}
            onSeeResults={handleSeeResults}
            answers={answers}
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
