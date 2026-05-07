import { API } from '../constants/config'

export const SESSION_KEYS = {
  authToken: 'authToken',
  authRole: 'authRole',
  loginTime: 'loginTime',
  hasRefreshed: 'hasRefreshed',
}

function decodeTokenPayload(token) {
  try {
    const payload = token?.split('.')[1]
    if (!payload) return null

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const decoded = atob(normalized)
    return JSON.parse(decoded)
  } catch (_error) {
    return null
  }
}

export function getAuthHeader() {
  const token = localStorage.getItem(SESSION_KEYS.authToken)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function getAuthToken() {
  return localStorage.getItem(SESSION_KEYS.authToken) || ''
}

export function getAuthRole() {
  const token = localStorage.getItem(SESSION_KEYS.authToken)
  const payload = decodeTokenPayload(token)
  const tokenRole = payload?.role
  const storedRole = localStorage.getItem(SESSION_KEYS.authRole)

  if (tokenRole) {
    if (storedRole !== tokenRole) {
      localStorage.setItem(SESSION_KEYS.authRole, tokenRole)
    }
    return tokenRole
  }

  if (storedRole) return storedRole
  return 'dashboard'
}

export function setAuthSession({ token, role = 'dashboard' }) {
  localStorage.clear()
  sessionStorage.clear()

  localStorage.setItem(SESSION_KEYS.authToken, token)
  localStorage.setItem(SESSION_KEYS.authRole, role)
  localStorage.setItem(SESSION_KEYS.loginTime, String(Date.now()))
  localStorage.setItem(SESSION_KEYS.hasRefreshed, 'false')
}

export function clearAuthSession() {
  localStorage.clear()
  sessionStorage.clear()
}

async function apiFetch(path) {
  const res = await fetch(`${API}${path}`, {
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  })

  if (res.status === 401) {
    clearAuthSession()
    window.location.href = '/login'
    return null
  }

  if (!res.ok) return null
  return res.json()
}

export async function login(username, password) {
  const res = await fetch(`${API}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })

  const data = await res.json()

  return {
    ok: res.ok,
    data: {
      ...data,
      role: data?.role || 'dashboard',
      route: data?.route || (data?.role === 'superadmin' ? '/superadmin' : '/dashboard'),
    },
  }
}

export async function logout() {
  const headers = getAuthHeader()
  try {
    await fetch(`${API}/logout`, { method: 'POST', headers })
  } catch (_error) {
    // no-op
  } finally {
    clearAuthSession()
  }
}

export async function fetchRealtime() {
  try { return await apiFetch('/datacenter/realtime') } catch (_error) { return null }
}

export async function fetchHosts() {
  try { return await apiFetch('/hosts') } catch (_error) { return null }
}

export async function fetchVMs() {
  try { return await apiFetch('/vms') } catch (_error) { return null }
}

export async function fetchDatastores() {
  try { return await apiFetch('/datastores') } catch (_error) { return null }
}

export async function fetchAlerts() {
  try { return await apiFetch('/alerts') } catch (_error) { return null }
}

export async function fetchILO() {
  try { return await apiFetch('/ilo/all') } catch (_error) { return null }
}

export async function fetchNetworks() {
  try { return await apiFetch('/networks') } catch (_error) { return null }
}

export async function fetchPowerHistory() {
  try { return await apiFetch('/datacenter/power/history') } catch (_error) { return [] }
}

export async function fetchRduSummary() {
  try { return await apiFetch('/rdu/summary') } catch (_error) { return null }
}

export async function fetchServerRoomAccessLogsByDate(date) {
  const query = date ? `?date=${encodeURIComponent(date)}` : ''
  const res = await fetch(`${API}/biometric/server-room${query}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  })

  if (res.status === 401) {
    clearAuthSession()
    window.location.href = '/login'
    return []
  }

  if (!res.ok) {
    let message = 'Failed to load biometric access logs'

    try {
      const errorData = await res.json()
      message = errorData?.error || message
    } catch (_error) {
      // no-op
    }

    throw new Error(message)
  }

  return res.json()
}

export async function fetchServerRoomCameraStatus() {
  const res = await fetch(`${API}/camera/server-room/live/status`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  })

  if (!res.ok) {
    let message = 'Failed to load camera stream status'

    try {
      const errorData = await res.json()
      message = errorData?.error || message
    } catch (_error) {
      // no-op
    }

    throw new Error(message)
  }

  return res.json()
}

export async function addEmployeeWithFaces(payload) {
  const res = await fetch(`${API}/biometric/add-employee`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => null)
    throw new Error(errorData?.error || 'Failed to add employee')
  }

  return res.json()
}

export async function reviewUnknownFace(payload) {
  const res = await fetch(`${API}/biometric/review-unknown`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => null)
    throw new Error(errorData?.error || 'Failed to review unknown face')
  }

  return res.json()
}
