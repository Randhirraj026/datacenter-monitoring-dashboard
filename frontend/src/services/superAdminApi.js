import { API } from '../constants/config'
import { clearAuthSession, getAuthHeader } from './api'

const mockHosts = [
  { id: 1, name: 'OrIoN-ESXi-01', totalCores: 48, totalMemory: '256 GB' },
  { id: 2, name: 'PROTELION-ESXi-02', totalCores: 64, totalMemory: '384 GB' },
  { id: 3, name: 'RND-ESXi-03', totalCores: 32, totalMemory: '192 GB' },
]

const mockDatastores = [
  { id: 101, name: 'OrIoN_DS01' },
  { id: 102, name: 'PROTELION_SAN01' },
  { id: 103, name: 'RND_SAN02' },
  { id: 104, name: 'GEN_AI_DS03' },
]

const mockVms = [
  { id: 201, name: 'orion-app-01', hostId: 1 },
  { id: 202, name: 'orion-db-01', hostId: 1 },
  { id: 203, name: 'protelion-web-01', hostId: 2 },
  { id: 204, name: 'protelion-api-01', hostId: 2 },
  { id: 205, name: 'rnd-build-01', hostId: 3 },
  { id: 206, name: 'rnd-gpu-01', hostId: 3 },
]

function buildQuery(params = {}) {
  const search = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value != null) {
      search.set(key, value)
    }
  })

  const result = search.toString()
  return result ? `?${result}` : ''
}

async function apiGet(path) {
  try {
    const res = await fetch(`${API}${path}`, {
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
    })

    if (res.status === 401) {
      clearAuthSession()
      window.location.href = '/login'
      return null
    }

    if (!res.ok) return null
    return await res.json()
  } catch (_error) {
    return null
  }
}

async function apiRequest(path, method, body) {
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...getAuthHeader(),
      },
      body: body ? JSON.stringify(body) : undefined,
    })

    if (res.status === 401) {
      clearAuthSession()
      window.location.href = '/login'
      throw new Error('Session expired')
    }

    const data = await res.json().catch(() => null)
    if (!res.ok) {
      throw new Error(data?.error || data?.message || 'Request failed')
    }

    return data
  } catch (error) {
    throw error instanceof Error ? error : new Error('Request failed')
  }
}

export async function fetchSuperAdminDashboard() {
  return apiGet('/superadmin/dashboard')
}

export async function fetchRecentAlerts() {
  const data = await apiGet('/alerts/recent')
  return data || []
}

export async function fetchAlertConfiguration() {
  return apiGet('/alerts/config')
}

export async function updateSmtpSettings(payload) {
  return apiRequest('/alerts/smtp-settings', 'PUT', payload)
}

export async function updateAlertRules(payload) {
  return apiRequest('/alerts/rules', 'PUT', payload)
}

export async function fetchBiometricEmployees() {
  return apiGet('/biometric/employees')
}

export async function fetchUnknownFaces(limit = 25) {
  try {
    const res = await fetch(`http://${window.location.hostname}:5000/unknown_list`)
    if (!res.ok) return []
    return await res.json()
  } catch (error) {
    console.error("Error fetching unknown faces from Flask:", error)
    return []
  }
}

export async function fetchUnknownFaceImage(unknownFaceId) {
  // The Flask backend already provides the full image_path in the record.
  // We just need to construct the URL to the /unknown route we added.
  // We'll return the URL directly instead of a blob since it's publicly accessible on the Flask server.
  return null; // This is handled in the UI now by constructing the URL from the filename
}

export async function upsertBiometricEmployee(payload) {
  return apiRequest('/biometric/employees', 'PUT', payload)
}

export async function addBiometricEmployeeWithPhoto(payload) {
  return apiRequest('/biometric/add-employee', 'POST', payload)
}

export async function addBiometricEmployeePhoto(employeeId, payload) {
  return apiRequest(`/biometric/employees/${encodeURIComponent(employeeId)}/photos`, 'POST', payload)
}

export async function fetchBiometricEmployeePhoto(employeeId) {
  const res = await fetch(`${API}/biometric/employees/${encodeURIComponent(employeeId)}/photo`, {
    headers: getAuthHeader(),
  })

  if (res.status === 401) {
    clearAuthSession()
    window.location.href = '/login'
    return null
  }

  if (!res.ok) return null

  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export async function deleteBiometricEmployee(id) {
  return apiRequest(`/biometric/employees/${id}`, 'DELETE')
}

export async function sendAlertTestEmail() {
  return apiRequest('/alerts/test-email', 'POST')
}

export async function reviewUnknownFace(payload) {
  // Payload: { unknown_face_id, employee_id, name, department, approved }
  try {
    const res = await fetch(`http://${window.location.hostname}:5000/assign_employee`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unknown_id: payload.unknown_face_id,
        employee_id: payload.employee_id,
        image_path: payload.image_path // We'll need to pass this through
      })
    })
    return await res.json()
  } catch (error) {
    throw new Error("Failed to reach Flask backend for assignment")
  }
}

export async function captureLiveUnknownFace() {
  return apiRequest('/biometric/capture-unknown', 'POST')
}

function pad2(value) {
  return String(value).padStart(2, '0')
}

function formatDateLabel(date, includeTime = true) {
  const d = new Date(date)
  const day = `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`
  if (!includeTime) return day
  return `${day} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function formatHourLabel(date) {
  const d = new Date(date)
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)} ${pad2(d.getHours())}:00`
}

function buildTimeAxis(range, customFrom, customTo) {
  const end = customTo ? new Date(customTo) : new Date()
  let start = customFrom ? new Date(customFrom) : new Date(end)
  let stepMinutes = 5

  if (!customFrom || !customTo) {
    if (range === '1h') {
      start = new Date(end.getTime() - 60 * 60 * 1000)
      stepMinutes = 5
    } else if (range === '24h') {
      start = new Date(end.getTime() - 24 * 60 * 60 * 1000)
      stepMinutes = 60
    } else if (range === '7d') {
      start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)
      stepMinutes = 6 * 60
    } else {
      start = new Date(end.getTime() - 3 * 24 * 60 * 60 * 1000)
      stepMinutes = 60
    }
  } else {
    const diffHours = Math.max((end - start) / (1000 * 60 * 60), 1)
    stepMinutes = diffHours > 72 ? 6 * 60 : diffHours > 24 ? 60 : 10
  }

  const points = []
  for (let cursor = new Date(start); cursor <= end; cursor = new Date(cursor.getTime() + stepMinutes * 60 * 1000)) {
    points.push(new Date(cursor))
  }

  return { start, end, points, stepMinutes }
}

function statusFromMetrics(cpu, memory, temp) {
  if (cpu >= 90 || memory >= 92 || temp >= 42) return 'Critical'
  if (cpu >= 75 || memory >= 80 || temp >= 35) return 'Warning'
  return 'Normal'
}

function generateMockBundle(filters = {}) {
  const { points } = buildTimeAxis(filters.range, filters.customFrom, filters.customTo)
  const activeHosts = filters.hostId ? mockHosts.filter((host) => String(host.id) === String(filters.hostId)) : mockHosts
  const activeDatastores = filters.datastoreId
    ? mockDatastores.filter((datastore) => String(datastore.id) === String(filters.datastoreId))
    : mockDatastores
  const activeVms = filters.vmId ? mockVms.filter((vm) => String(vm.id) === String(filters.vmId)) : mockVms

  const hostMetricsRows = []
  const powerLogs = []
  const datastoreLogs = []
  const memoryHourPoints = buildTimeAxis('1h').points

  activeHosts.forEach((host, hostIndex) => {
    points.forEach((point, pointIndex) => {
      const cpu = Math.max(18, Math.min(96, 46 + hostIndex * 8 + Math.sin(pointIndex / 2.5 + hostIndex) * 18))
      const memory = Math.max(28, Math.min(94, 54 + hostIndex * 6 + Math.cos(pointIndex / 3 + hostIndex) * 14))
      const power = Math.max(1.8, 3.4 + hostIndex * 0.55 + Math.sin(pointIndex / 2.2) * 0.35)
      const temp = Math.max(22, 28 + hostIndex * 2.8 + Math.cos(pointIndex / 2.8) * 4.6)
      const status = statusFromMetrics(cpu, memory, temp)

      hostMetricsRows.push({
        id: `${host.id}-${point.toISOString()}`,
        ts: point.toISOString(),
        hostId: host.id,
        hostName: host.name,
        cpuUsagePct: Number(cpu.toFixed(2)),
        memoryUsagePct: Number(memory.toFixed(2)),
        powerKw: Number(power.toFixed(2)),
        temperatureC: Number(temp.toFixed(2)),
        status,
      })

      powerLogs.push({
        id: `p-${host.id}-${point.toISOString()}`,
        ts: point.toISOString(),
        hostId: host.id,
        hostName: host.name,
        powerKw: Number(power.toFixed(2)),
        status,
      })
    })
  })

  activeDatastores.forEach((datastore, datastoreIndex) => {
    points.forEach((point, pointIndex) => {
      const total = 3600 + datastoreIndex * 950
      const used = Math.max(400, Math.min(total - 100, total * (0.28 + datastoreIndex * 0.08) + Math.sin(pointIndex / 2.1) * 140))
      const free = total - used
      const pct = (used / total) * 100

      datastoreLogs.push({
        id: `d-${datastore.id}-${point.toISOString()}`,
        ts: point.toISOString(),
        datastoreId: datastore.id,
        datastoreName: datastore.name,
        totalCapacityGb: Number(total.toFixed(2)),
        usedSpaceGb: Number(used.toFixed(2)),
        freeSpaceGb: Number(free.toFixed(2)),
        usedPct: Number(pct.toFixed(2)),
        status: pct >= 85 ? 'Critical' : pct >= 70 ? 'Warning' : 'Normal',
      })
    })
  })

  const dayCount = Math.max(7, Math.ceil((points.at(-1) - points[0]) / (1000 * 60 * 60 * 24)))
  const vmLifecycle = Array.from({ length: dayCount }).map((_, index) => {
    const day = new Date(points.at(-1).getTime() - (dayCount - index - 1) * 24 * 60 * 60 * 1000)
    const created = 2 + (index % 3)
    const deleted = index % 4 === 0 ? 1 : 0
    const running = Math.max(8, activeVms.length + 6 + (index % 2))
    const stopped = Math.max(1, activeVms.length - 2 - (index % 2))

    return {
      statDate: day.toISOString().slice(0, 10),
      createdCount: created,
      deletedCount: deleted,
      runningCount: running,
      stoppedCount: stopped,
    }
  })

  const vmActivityLogs = activeVms.flatMap((vm, index) => {
    const host = mockHosts.find((candidate) => candidate.id === vm.hostId)
    const createdAt = new Date(Date.now() - (index + 2) * 36 * 60 * 60 * 1000)
    const deletionBase = index % 5 === 0 ? new Date(createdAt.getTime() + 20 * 60 * 60 * 1000) : null

    return [
      {
        id: `created-${vm.id}`,
        ts: createdAt.toISOString(),
        vmId: vm.id,
        vmName: vm.name,
        hostId: host?.id,
        hostName: host?.name || '-',
        eventType: 'CREATED',
        status: 'Running',
      },
      {
        id: `power-${vm.id}`,
        ts: new Date(createdAt.getTime() + 2 * 60 * 60 * 1000).toISOString(),
        vmId: vm.id,
        vmName: vm.name,
        hostId: host?.id,
        hostName: host?.name || '-',
        eventType: index % 2 === 0 ? 'POWER_ON' : 'POWER_OFF',
        status: index % 2 === 0 ? 'Running' : 'Stopped',
      },
      ...(deletionBase
        ? [{
            id: `deleted-${vm.id}`,
            ts: deletionBase.toISOString(),
            vmId: vm.id,
            vmName: vm.name,
            hostId: host?.id,
            hostName: host?.name || '-',
            eventType: 'DELETED',
            status: 'Stopped',
          }]
        : []),
    ]
  }).sort((left, right) => new Date(right.ts) - new Date(left.ts))

  const latestHostRows = activeHosts.map((host) => {
    return hostMetricsRows.filter((row) => row.hostId === host.id).at(-1)
  }).filter(Boolean)

  const latestDatastores = activeDatastores.map((datastore) => {
    return datastoreLogs.filter((row) => row.datastoreId === datastore.id).at(-1)
  }).filter(Boolean)

  const totalPower = latestHostRows.reduce((sum, row) => sum + row.powerKw, 0)
  const warningCount = latestHostRows.filter((row) => row.status === 'Warning').length
  const criticalCount = latestHostRows.filter((row) => row.status === 'Critical').length
  const runningVms = vmLifecycle.at(-1)?.runningCount ?? 0
  const stoppedVms = vmLifecycle.at(-1)?.stoppedCount ?? 0
  const selectedServer = activeHosts[0] || mockHosts[0]

  const previousHourMemory = memoryHourPoints.map((point, pointIndex) => {
    const hostIndex = mockHosts.findIndex((host) => host.id === selectedServer.id)
    const memory = Math.max(24, Math.min(95, 56 + hostIndex * 7 + Math.sin(pointIndex / 1.7 + hostIndex) * 11))

    return {
      ts: point.toISOString(),
      hostId: selectedServer.id,
      hostName: selectedServer.name,
      memoryUsagePct: Number(memory.toFixed(2)),
    }
  })

  const overallPowerHourlyMap = new Map()
  powerLogs.forEach((row) => {
    const bucket = formatHourLabel(row.ts)
    const current = overallPowerHourlyMap.get(bucket) || 0
    overallPowerHourlyMap.set(bucket, current + row.powerKw)
  })

  const overallPowerHourly = Array.from(overallPowerHourlyMap.entries()).map(([bucket, totalKw]) => ({
    bucket,
    totalKw: Number(totalKw.toFixed(2)),
  }))

  return {
    filters: {
      hosts: mockHosts,
      vms: mockVms.map((vm) => ({ ...vm, hostName: mockHosts.find((host) => host.id === vm.hostId)?.name || '-' })),
      datastores: mockDatastores,
    },
    summary: {
      totalHosts: activeHosts.length,
      totalVms: runningVms + stoppedVms,
      runningVms,
      stoppedVms,
      avgPowerKw: Number((totalPower / Math.max(latestHostRows.length, 1)).toFixed(2)),
      warningCount,
      criticalCount,
      totalCores: activeHosts.reduce((sum, host) => sum + host.totalCores, 0),
      totalMemory: `${activeHosts.reduce((sum, host) => sum + Number(host.totalMemory.split(' ')[0]), 0)} GB`,
      totalStorage: `${(latestDatastores.reduce((sum, row) => sum + row.totalCapacityGb, 0) / 1024).toFixed(2)} TB`,
    },
    charts: {
      powerTrend: powerLogs,
      hostMetrics: hostMetricsRows,
      vmLifecycle,
      datastoreUsage: datastoreLogs,
      overallPowerHourly,
      previousHourMemory,
    },
    tables: {
      hostMetrics: [...hostMetricsRows].sort((left, right) => new Date(right.ts) - new Date(left.ts)),
      vmActivity: vmActivityLogs,
      powerLogs: [...powerLogs].sort((left, right) => new Date(right.ts) - new Date(left.ts)),
      datastoreLogs: [...datastoreLogs].sort((left, right) => new Date(right.ts) - new Date(left.ts)),
    },
    drilldowns: {
      hosts: activeHosts.map((host) => ({
        id: host.id,
        hostName: host.name,
        details: host,
        history: hostMetricsRows.filter((row) => row.hostId === host.id).slice(-24),
      })),
      vms: activeVms.map((vm) => ({
        id: vm.id,
        vmName: vm.name,
        details: {
          ...vm,
          hostName: mockHosts.find((host) => host.id === vm.hostId)?.name || '-',
        },
        history: vmActivityLogs.filter((row) => row.vmId === vm.id),
      })),
    },
    selectedServer,
    labels: points.map((point, index) => formatDateLabel(point, points.length <= 18 || index === 0 || index === points.length - 1)),
  }
}

export async function fetchSuperAdminBundle(filters = {}) {
  const query = buildQuery({
    range: filters.range,
    customFrom: filters.customFrom,
    customTo: filters.customTo,
    hostId: filters.hostId,
    vmId: filters.vmId,
    datastoreId: filters.datastoreId,
  })

  const liveBundle = await apiGet(`/superadmin/bundle${query}`)
  return liveBundle
}

export async function fetchSuperAdminBundleFromDb(filters = {}) {
  const query = buildQuery({
    range: filters.range,
    customFrom: filters.customFrom,
    customTo: filters.customTo,
    hostId: filters.hostId,
    vmId: filters.vmId,
    datastoreId: filters.datastoreId,
  })

  return apiGet(`/superadmin/bundle${query}`)
}

function buildFallbackDetailsFromBundle(bundle, filters = {}) {
  const section = String(filters.section || '').toLowerCase()
  const sort = filters.sort === 'asc' ? 'asc' : 'desc'
  const page = Number(filters.page || 1)
  const pageSize = Number(filters.pageSize || 50)

  const definitions = {
    cpu: {
      title: 'CPU Records',
      columns: [
        { key: 'timestamp', label: 'Timestamp' },
        { key: 'hostName', label: 'Host' },
        { key: 'cpuUsagePct', label: 'CPU Usage %' },
        { key: 'status', label: 'Status' },
      ],
      rows: (bundle?.charts?.hostMetrics || []).map((row) => ({
        timestamp: row.ts,
        hostName: row.hostName,
        cpuUsagePct: row.cpuUsagePct,
        status: row.status,
      })),
    },
    memory: {
      title: 'Memory Records',
      columns: [
        { key: 'timestamp', label: 'Timestamp' },
        { key: 'hostName', label: 'Host' },
        { key: 'memoryUsagePct', label: 'Memory Usage %' },
        { key: 'status', label: 'Status' },
      ],
      rows: (bundle?.charts?.hostMetrics || []).map((row) => ({
        timestamp: row.ts,
        hostName: row.hostName,
        memoryUsagePct: row.memoryUsagePct,
        status: row.status,
      })),
    },
    storage: {
      title: 'Storage Records',
      columns: [
        { key: 'timestamp', label: 'Timestamp' },
        { key: 'datastoreName', label: 'Datastore' },
        { key: 'totalCapacityGb', label: 'Total GB' },
        { key: 'usedSpaceGb', label: 'Used GB' },
        { key: 'freeSpaceGb', label: 'Free GB' },
        { key: 'usedPct', label: 'Usage %' },
        { key: 'status', label: 'Status' },
      ],
      rows: (bundle?.charts?.datastoreUsage || []).map((row) => ({
        timestamp: row.ts,
        datastoreName: row.datastoreName,
        totalCapacityGb: row.totalCapacityGb,
        usedSpaceGb: row.usedSpaceGb,
        freeSpaceGb: row.freeSpaceGb,
        usedPct: row.usedPct,
        status: row.status,
      })),
    },
    power: {
      title: 'Power Records',
      columns: [
        { key: 'timestamp', label: 'Timestamp' },
        { key: 'hostName', label: 'Host' },
        { key: 'powerKw', label: 'Power kW' },
        { key: 'status', label: 'Status' },
      ],
      rows: (bundle?.tables?.powerLogs || []).map((row) => ({
        timestamp: row.ts,
        hostName: row.hostName,
        powerKw: row.powerKw,
        status: row.status,
      })),
    },
    temperature: {
      title: 'Temperature Records',
      columns: [
        { key: 'timestamp', label: 'Timestamp' },
        { key: 'hostName', label: 'Host' },
        { key: 'temperatureC', label: 'Temperature C' },
        { key: 'status', label: 'Status' },
      ],
      rows: (bundle?.charts?.hostMetrics || [])
        .filter((row) => row.temperatureC != null)
        .map((row) => ({
          timestamp: row.ts,
          hostName: row.hostName,
          temperatureC: row.temperatureC,
          status: row.status,
        })),
    },
    vm: {
      title: 'VM Activity Records',
      columns: [
        { key: 'timestamp', label: 'Timestamp' },
        { key: 'vmName', label: 'VM' },
        { key: 'hostName', label: 'Host' },
        { key: 'eventType', label: 'Event' },
        { key: 'status', label: 'Status' },
      ],
      rows: (bundle?.tables?.vmActivity || []).map((row) => ({
        timestamp: row.ts,
        vmName: row.vmName,
        hostName: row.hostName,
        eventType: row.eventType,
        status: row.status,
      })),
    },
  }

  const definition = definitions[section]
  if (!definition) return null

  const sortedRows = [...definition.rows].sort((left, right) => {
    const leftTs = new Date(left.timestamp || 0).getTime()
    const rightTs = new Date(right.timestamp || 0).getTime()
    return sort === 'asc' ? leftTs - rightTs : rightTs - leftTs
  })

  const start = (page - 1) * pageSize
  const pagedRows = sortedRows.slice(start, start + pageSize)

  return {
    section,
    title: definition.title,
    range: filters.range || '1h',
    sort,
    page,
    pageSize,
    total: sortedRows.length,
    columns: definition.columns,
    rows: pagedRows,
  }
}

export async function fetchSuperAdminDetails(filters = {}) {
  const query = buildQuery({
    section: filters.section,
    range: filters.range,
    page: filters.page,
    pageSize: filters.pageSize,
    sort: filters.sort,
    hostId: filters.hostId,
    customFrom: filters.customFrom,
    customTo: filters.customTo,
  })

  const liveDetails = await apiGet(`/superadmin/details${query}`)
  return liveDetails
}

export function exportRowsToCsv(filename, rows) {
  if (!rows?.length) return

  const headers = Object.keys(rows[0])
  const csv = [
    headers.join(','),
    ...rows.map((row) => headers.map((header) => JSON.stringify(row[header] ?? '')).join(',')),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
