import { API } from '../constants/config'

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
  const token = localStorage.getItem('authToken')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export function getAuthRole() {
  const token = localStorage.getItem('authToken')
  const payload = decodeTokenPayload(token)
  const tokenRole = payload?.role
  const storedRole = localStorage.getItem('authRole')

  if (tokenRole) {
    if (storedRole !== tokenRole) {
      localStorage.setItem('authRole', tokenRole)
    }
    return tokenRole
  }

  if (storedRole) return storedRole
  return 'dashboard'
}

export function setAuthSession({ token, role = 'dashboard' }) {
  localStorage.setItem('authToken', token)
  localStorage.setItem('authRole', role)
}

export function clearAuthSession() {
  localStorage.removeItem('authToken')
  localStorage.removeItem('authRole')
}

async function apiFetch(path) {
  const res = await fetch(`${API}${path}`, {
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
  clearAuthSession()
  try {
    await fetch(`${API}/logout`, { method: 'POST', headers: getAuthHeader() })
  } catch (_error) {
    // no-op
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
