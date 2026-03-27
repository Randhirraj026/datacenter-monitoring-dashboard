import { useCallback, useEffect, useRef, useState } from 'react'
import { POLL_INTERVAL_MS } from '../constants/config'
import { fetchSuperAdminBundle } from '../services/superAdminApi'

const INITIAL = {
  cpuPct: null,
  cpuCores: null,
  cpuSpeed: null,
  hostsOnline: null,
  memPct: null,
  memUsed: null,
  memTotal: null,
  memFree: null,
  storagePct: null,
  storageUsedTB: null,
  storageTotalTB: null,
  storageFreeTB: null,
  datastoreCount: null,
  datastores: [],
  vmCount: null,
  vmRunning: null,
  vmStopped: null,
  vmSuspended: null,
  allVMs: [],
  hosts: [],
  totalServers: null,
  totalCores: null,
  totalMemory: null,
  totalStorage: null,
  iloServers: [],
  powerKW: null,
  powerCapKW: null,
  powerPct: null,
  powerPsuCount: null,
  powerPsuOk: null,
  powerHistory: [],
  inletTemp: null,
  alerts: [],
  serverNames: ['Server 1', 'Server 2', 'Server 3'],
  history: {
    labels: [],
    hostMetrics: [],
    datastoreUsage: [],
    overallPowerHourly: [],
    vmLifecycle: [],
    vmActivity: [],
  },
  lastSnapshotAt: null,
}

function buildCurrentState(bundle) {
  const rows = bundle?.charts?.hostMetrics || []
  const datastores = bundle?.charts?.datastoreUsage || []
  const vmLifecycle = bundle?.charts?.vmLifecycle || []
  const filterHosts = bundle?.filters?.hosts || []

  const latestByHost = new Map()
  rows.forEach((row) => latestByHost.set(row.hostId, row))
  const hosts = Array.from(latestByHost.values()).map((row) => {
    const hostMeta = filterHosts.find((host) => String(host.id) === String(row.hostId))
    const memTotalGB = hostMeta?.totalMemory ? Number(String(hostMeta.totalMemory).split(' ')[0]) : 0
    const memUsedGB = memTotalGB > 0 ? Number(((memTotalGB * Number(row.memoryUsagePct || 0)) / 100).toFixed(2)) : null

    return {
      name: row.hostName,
      hostId: row.hostId,
      cpuPct: Number(row.cpuUsagePct || 0),
      memPct: Number(row.memoryUsagePct || 0),
      memUsedGB,
      memTotalGB,
      connectionState: 'connected',
      powerKw: row.powerKw != null ? Number(row.powerKw) : 0,
      temperatureC: row.temperatureC != null ? Number(row.temperatureC) : null,
      status: row.status || 'Normal',
      ts: row.ts,
    }
  })

  const latestDatastoreMap = new Map()
  datastores.forEach((row) => latestDatastoreMap.set(row.datastoreId, row))
  const latestDatastores = Array.from(latestDatastoreMap.values()).map((row) => ({
    name: row.datastoreName,
    totalCapacityGB: Number(row.totalCapacityGb || 0),
    usedSpaceGB: Number(row.usedSpaceGb || 0),
    freeSpaceGB: Number(row.freeSpaceGb || 0),
    usagePct: Number(row.usedPct || 0),
    status: row.status || 'Normal',
  }))

  const totalMemoryGb = hosts.reduce((sum, row) => sum + Number(row.memTotalGB || 0), 0)
  const totalUsedMemoryGb = hosts.reduce((sum, row) => sum + Number(row.memUsedGB || 0), 0)
  const totalStorageGb = latestDatastores.reduce((sum, row) => sum + Number(row.totalCapacityGB || 0), 0)
  const totalUsedStorageGb = latestDatastores.reduce((sum, row) => sum + Number(row.usedSpaceGB || 0), 0)
  const totalFreeStorageGb = latestDatastores.reduce((sum, row) => sum + Number(row.freeSpaceGB || 0), 0)
  const powerHistory = (bundle?.charts?.overallPowerHourly || []).map((row) => ({
    t: row.bucket,
    v: Number(row.totalKw || 0),
  }))

  const hostsWithTemperature = hosts.filter((row) => row.temperatureC != null)
  const inletTemp = hostsWithTemperature.length
    ? Number((hostsWithTemperature.reduce((sum, row) => sum + Number(row.temperatureC || 0), 0) / hostsWithTemperature.length).toFixed(2))
    : null

  const currentVms = bundle?.currentVms || []
  const currentPowerKw = Number(hosts.reduce((sum, row) => sum + Number(row.powerKw || 0), 0).toFixed(2))
  const peakPowerKw = powerHistory.reduce((max, row) => Math.max(max, Number(row.v || 0)), 0)

  return {
    cpuPct: hosts.length ? Number((hosts.reduce((sum, row) => sum + Number(row.cpuPct || 0), 0) / hosts.length).toFixed(2)) : null,
    cpuCores: bundle?.summary?.totalCores ?? 0,
    cpuSpeed: null,
    hostsOnline: hosts.length,
    memPct: hosts.length ? Number((hosts.reduce((sum, row) => sum + Number(row.memPct || 0), 0) / hosts.length).toFixed(2)) : null,
    memUsed: Number(totalUsedMemoryGb.toFixed(2)),
    memTotal: totalMemoryGb,
    memFree: Math.max(Number((totalMemoryGb - totalUsedMemoryGb).toFixed(2)), 0),
    storagePct: totalStorageGb > 0 ? Number(((totalUsedStorageGb / totalStorageGb) * 100).toFixed(2)) : null,
    storageUsedTB: Number((totalUsedStorageGb / 1024).toFixed(2)),
    storageTotalTB: Number((totalStorageGb / 1024).toFixed(2)),
    storageFreeTB: Number((totalFreeStorageGb / 1024).toFixed(2)),
    datastoreCount: latestDatastores.length,
    datastores: latestDatastores,
    vmCount: currentVms.length,
    vmRunning: currentVms.filter((vm) => vm.powerState === 'RUNNING').length,
    vmStopped: currentVms.filter((vm) => vm.powerState !== 'RUNNING').length,
    vmSuspended: 0,
    allVMs: currentVms,
    hosts,
    totalServers: hosts.length,
    totalCores: bundle?.summary?.totalCores ?? 0,
    totalMemory: bundle?.summary?.totalMemory ?? null,
    totalStorage: bundle?.summary?.totalStorage ?? null,
    iloServers: hosts.map((row) => ({
      serverName: row.name,
      reachable: true,
      health: row.status === 'Critical' ? 'Critical' : row.status === 'Warning' ? 'Warning' : 'OK',
      temperature: { inlet: row.temperatureC, cpuAvg: row.temperatureC },
      power: { consumedWatts: row.powerKw ? Math.round(row.powerKw * 1000) : 0 },
      memory: { totalGB: row.memTotalGB },
      processor: { model: 'PostgreSQL Snapshot', count: row.cpuPct != null ? 1 : 0 },
      psus: [],
      fans: [],
      storage: [],
    })),
    powerKW: currentPowerKw,
    powerCapKW: peakPowerKw > 0 ? peakPowerKw.toFixed(2) : null,
    powerPct: peakPowerKw > 0 ? Number(((currentPowerKw / peakPowerKw) * 100).toFixed(1)) : 0,
    powerPsuCount: null,
    powerPsuOk: null,
    powerHistory,
    inletTemp,
    alerts: [],
    serverNames: hosts.slice(0, 3).map((row) => row.name),
    history: {
      labels: bundle?.labels || [],
      hostMetrics: rows,
      datastoreUsage: datastores,
      overallPowerHourly: bundle?.charts?.overallPowerHourly || [],
      vmLifecycle,
      vmActivity: bundle?.tables?.vmActivity || [],
    },
    lastSnapshotAt: bundle?.lastSnapshotAt || hosts.at(-1)?.ts || null,
  }
}

export function useSuperAdminDashboardData(range = '1h') {
  const [data, setData] = useState(INITIAL)
  const [status, setStatus] = useState({ ok: false, text: 'Loading DB history...', loading: true })
  const [lastUpdate, setLastUpdate] = useState(null)
  const fetchInFlight = useRef(false)

  const fetchSnapshot = useCallback(async () => {
    if (fetchInFlight.current) return
    fetchInFlight.current = true

    try {
      const bundle = await fetchSuperAdminBundle({ range })

      if (!bundle) {
        setStatus({ ok: false, text: 'DB history unavailable', loading: false })
        return
      }

      const mapped = buildCurrentState(bundle)
      setData({
        ...INITIAL,
        ...mapped,
        serverNames: mapped.serverNames?.length ? mapped.serverNames : INITIAL.serverNames,
      })

      setStatus({ ok: true, text: 'DB history loaded', loading: false })
      setLastUpdate(
        mapped.lastSnapshotAt
          ? new Date(mapped.lastSnapshotAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      )
    } catch (_error) {
      setStatus({ ok: false, text: 'Failed to read DB history', loading: false })
    } finally {
      fetchInFlight.current = false
    }
  }, [range])

  useEffect(() => {
    fetchSnapshot()
    const id = setInterval(fetchSnapshot, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchSnapshot])

  return { data, status, lastUpdate }
}
