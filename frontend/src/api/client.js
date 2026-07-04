import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.PROD ? '' : '/api',
})

export const parseResume = async (file, turnstileToken) => {
  const formData = new FormData()
  formData.append('file', file)
  const headers = { 'Content-Type': 'multipart/form-data' }
  const apiKey = import.meta.env.VITE_ANALYSIS_API_KEY
  if (apiKey) headers['x-api-key'] = apiKey
  if (turnstileToken) headers['x-turnstile-token'] = turnstileToken
  const response = await api.post('/parse', formData, {
    headers,
    timeout: 120000,
  })
  return response.data
}

export const analyzeResume = async (params, turnstileToken) => {
  const formData = new FormData()
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      formData.append(key, typeof val === 'object' ? JSON.stringify(val) : val)
    }
  }
  const headers = { 'Content-Type': 'multipart/form-data' }
  const apiKey = import.meta.env.VITE_ANALYSIS_API_KEY
  if (apiKey) headers['x-api-key'] = apiKey
  if (turnstileToken) headers['x-turnstile-token'] = turnstileToken
  const response = await api.post('/analyze', formData, {
    headers,
    timeout: 300000,
  })
  return response.data
}

export const getCandidates = async (key) => {
  const response = await api.get('/admin/candidates', {
    headers: { 'x-admin-key': key },
  })
  return response.data
}

export const getCandidate = async (key, id) => {
  const response = await api.get(`/admin/candidates/${id}`, {
    headers: { 'x-admin-key': key },
  })
  return response.data
}

export const getStats = async (key) => {
  const response = await api.get('/admin/stats', {
    headers: { 'x-admin-key': key },
  })
  return response.data
}

export const analyzeResumeStream = async (params, { onStep, onResult, onError }) => {
  const formData = new FormData()
  for (const [key, val] of Object.entries(params)) {
    if (val !== undefined && val !== null) {
      formData.append(key, typeof val === 'object' ? JSON.stringify(val) : val)
    }
  }
  const headers = {}
  const apiKey = import.meta.env.VITE_ANALYSIS_API_KEY
  if (apiKey) headers['x-api-key'] = apiKey

  const baseUrl = import.meta.env.PROD ? '' : '/api'
  const response = await fetch(`${baseUrl}/analyze/stream`, {
    method: 'POST',
    body: formData,
    headers,
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ detail: 'Analysis failed' }))
    onError(error.detail || 'Analysis failed')
    return
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()

    let eventType = ''
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7)
      } else if (line.startsWith('data: ')) {
        const data = line.slice(6)
        try {
          const parsed = JSON.parse(data)
          if (eventType === 'step') {
            onStep(parsed)
          } else if (eventType === 'result') {
            onResult(parsed)
          } else if (eventType === 'error') {
            onError(parsed.detail)
          }
        } catch (e) {
          // skip malformed events
        }
      }
    }
  }
}


