import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.PROD ? '' : '/api',
})

export const analyzeResume = async (formData, turnstileToken) => {
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

export const adminLogin = async (key) => {
  const response = await api.get('/admin/candidates', {
    headers: { 'x-admin-key': key },
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

export const downloadCV = async (key, id) => {
  const response = await api.get(`/admin/candidates/${id}/download`, {
    headers: { 'x-admin-key': key },
    responseType: 'blob',
  })
  return response
}
