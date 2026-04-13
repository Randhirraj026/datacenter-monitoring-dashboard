import { API } from '../constants/config'
import { getAuthHeader } from './api'

function buildQueryPath(folder, table, filters = {}) {
  const params = new URLSearchParams()

  if (filters.customFrom) params.set('customFrom', filters.customFrom)
  if (filters.customTo) params.set('customTo', filters.customTo)

  const query = params.toString()
  return `/archive/${encodeURIComponent(folder)}/${encodeURIComponent(table)}${query ? `?${query}` : ''}`
}

async function apiGet(path) {
  const response = await fetch(`${API}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
    },
  })

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}))
    throw new Error(payload.error || 'Request failed')
  }

  return response.json()
}

export function fetchArchiveFolders() {
  return apiGet('/archive/list')
}

export function fetchArchiveTable(folder, table, filters = {}) {
  return apiGet(buildQueryPath(folder, table, filters))
}
