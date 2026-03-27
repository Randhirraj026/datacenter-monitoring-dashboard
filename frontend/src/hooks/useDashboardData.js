import { useState, useEffect, useRef, useCallback } from 'react'
import {
  fetchRealtime, fetchHosts, fetchVMs,
  fetchDatastores, fetchAlerts, fetchILO, fetchNetworks, fetchPowerHistory
} from '../services/api'
import { POLL_INTERVAL_MS } from '../constants/config'

const INITIAL = {
  // CPU
  cpuPct: null, cpuCores: null, cpuSpeed: null, hostsOnline: null,
  // Memory
  memPct: null, memUsed: null, memTotal: null, memFree: null,
  // Storage
  storagePct: null, storageUsedTB: null, storageTotalTB: null,
  storageFreeTB: null, datastoreCount: null, datastores: [],
  // VMs
  vmCount: null, vmRunning: null, vmStopped: null, vmSuspended: null,
  allVMs: [], hosts: [],
  // Header stats
  totalServers: null, totalCores: null, totalMemory: null, totalStorage: null,
  // iLO
  iloServers: [],
  // Power (from iLO)
  powerKW: null, powerCapKW: null, powerPct: null,
  powerPsuCount: null, powerPsuOk: null, powerHistory: [],
  // Temperature (from iLO)
  inletTemp: null,
  // Alerts
  alerts: [],
  // Server names
  serverNames: ['Server 1', 'Server 2', 'Server 3'],
}

export function useDashboardData() {
  const [data, setData]             = useState(INITIAL)
  const [status, setStatus]         = useState({ ok: false, text: 'Connecting…', loading: true })
  const [lastUpdate, setLastUpdate] = useState(null)
  const powerHistRef  = useRef([])
  const lastPowerPointAtRef = useRef(null)
  const fetchInFlight = useRef(false)

  const fetchAll = useCallback(async () => {
    if (fetchInFlight.current) return
    fetchInFlight.current = true

    try {
      const [rt, hostsRes, vmsRes, dsRes, alertsRes, iloRes, pwrRes] = await Promise.allSettled([
        fetchRealtime(),
        fetchHosts(),
        fetchVMs(),
        fetchDatastores(),
        fetchAlerts(),
        fetchILO(),
        fetchPowerHistory(),
      ])

      const get  = r => r.status === 'fulfilled' ? r.value : null
      const rtData     = get(rt)
      const hostsData  = get(hostsRes)
      const vmsData    = get(vmsRes)
      const dsData     = get(dsRes)
      const alertsData = get(alertsRes)
      const iloData    = get(iloRes)
      const pwrData    = get(pwrRes) || []

      const coreOk = !!(rtData || hostsData || vmsData)
      const iloOk  = !!(iloData && !iloData.error)

      // ── Parse realtime ──────────────────────────────────────────
      const cpu    = rtData?.compute?.cpuUsagePercent    ?? null
      const mem    = rtData?.compute?.memoryUsagePercent ?? null
      const stor   = rtData?.storage?.usagePercent       ?? null
      const vmRun  = rtData?.vms?.running ?? vmsData?.running ?? null

      const hostList   = hostsData?.hosts || []
      const hostCount  = hostList.length || rtData?.hosts || null
      const totalCores = rtData?.compute?.totalCores   || hostList.reduce((s,h) => s + (h.cpuCores||0), 0) || null
      const totalMemGB = rtData?.compute?.totalMemoryGB || hostList.reduce((s,h) => s + (h.totalMemoryGB||0), 0) || null
      const storageTB  = dsData?.totalCapacityTB || rtData?.storage?.totalTB || null
      const cpuSpeed   = rtData?.compute?.cpuSpeedGHz ?? null

      // Total memory display (same logic as original)
      let totalMemDisplay = null
      if (totalMemGB > 0) {
        totalMemDisplay = totalMemGB >= 1024
          ? (totalMemGB / 1024).toFixed(1) + 'TB'
          : Math.round(totalMemGB) + 'GB'
      }

      // Memory used/free
      const memUsed = totalMemGB && mem != null ? Math.round(totalMemGB * (mem/100)) : null
      const memFree = totalMemGB && mem != null ? Math.round(totalMemGB * (1 - mem/100)) : null

      // ── Parse datastores ────────────────────────────────────────
      const datastores    = dsData?.datastores || []
      const storagePct    = dsData?.overallUsagePct ?? stor ?? null
      const storageUsedTB = dsData?.totalUsedTB ?? null
      const storageTotalTB = dsData?.totalCapacityTB ?? (storageTB || null)
      const storageFreeTB  = storageTotalTB && storageUsedTB != null
        ? Math.max(0, storageTotalTB - storageUsedTB)
        : null

      // ── Parse VMs ───────────────────────────────────────────────
      const allVMs     = vmsData?.list      || []
      const vmCount    = vmsData?.total     ?? null
      const vmStopped  = vmsData?.stopped   ?? null
      const vmSuspended = vmsData?.suspended ?? null

      // Map hosts to shape CpuSection expects
      const mappedHosts = hostList.map(h => ({
        name:       h.name,
        hostId:     h.hostId,
        cpuPct:     h.cpuUsagePercent  ?? h.cpuPct  ?? null,
        memPct:     h.memoryUsagePercent ?? h.memPct ?? null,
        memUsedGB:  h.usedMemoryGB     ?? null,
        memTotalGB: h.totalMemoryGB    ?? null,
        connectionState: h.connectionState,
      }))

      // ── Parse iLO ───────────────────────────────────────────────
      const iloServers = iloData?.servers || []
      const iloSummary = iloData?.summary || {}
      const totalKW    = iloSummary.totalPowerKW ?? 0
      const inletAvg   = iloSummary.avgInletTempC ?? null

      // Power history (from DB)
      if (Array.isArray(pwrData) && pwrData.length > 0) {
        powerHistRef.current = pwrData;
        
        // Append current live data point to the end so it's perfectly up to date
        if (totalKW > 0) {
            const now = new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
            powerHistRef.current = [...powerHistRef.current.slice(-71), { t: now, v: totalKW }]
        }
      } else if (totalKW > 0) {
        const nowDate = new Date()
        const lastPointAt = lastPowerPointAtRef.current
        const shouldAddPoint = !lastPointAt || (nowDate.getTime() - lastPointAt) >= (5 * 60 * 1000)

        if (shouldAddPoint) {
          const now = nowDate.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
          powerHistRef.current = [...powerHistRef.current.slice(-71), { t: now, v: totalKW }]
          lastPowerPointAtRef.current = nowDate.getTime()
        } else if (powerHistRef.current.length > 0) {
          powerHistRef.current = [
            ...powerHistRef.current.slice(0, -1),
            { ...powerHistRef.current[powerHistRef.current.length - 1], v: totalKW },
          ]
        } else {
          const now = nowDate.toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })
          powerHistRef.current = [{ t: now, v: totalKW }]
          lastPowerPointAtRef.current = nowDate.getTime()
        }
      }

      // PSU calc from iLO servers
      const reachable = iloServers.filter(s => s.reachable)
      let totalCapW = 0, totalPsuCount = 0, totalPsuOk = 0
      reachable.forEach(s => {
        ;(s.psus || []).forEach(p => {
          totalPsuCount++
          if (p.status === 'OK' || p.state === 'Enabled') totalPsuOk++
        })
        if (s._rawPowerCapW) totalCapW += s._rawPowerCapW
      })
      const capKW = totalCapW > 0 ? (totalCapW / 1000) : null
      const powerPctRaw = capKW && totalKW > 0
        ? (totalKW / capKW) * 100
        : totalKW > 0 ? (totalKW / (totalKW * 1.4)) * 100 : 0
      const powerPct = Number(Math.min(powerPctRaw, 100).toFixed(1))

      // Server names from iLO
      const { getServerDisplayName } = await import('../services/ipMapper')
      const serverNames = iloServers.length > 0
        ? iloServers.slice(0, 3).map((s, i) => getServerDisplayName(s, i, mappedHosts))
        : mappedHosts.slice(0, 3).map(h => h.name || `Server ${h+1}`)

      setData({
        // CPU
        cpuPct:       cpu,
        cpuCores:     totalCores,
        cpuSpeed:     cpuSpeed,
        hostsOnline:  hostCount,
        // Memory
        memPct:       mem,
        memUsed,
        memTotal:     totalMemGB,
        memFree,
        // Storage
        storagePct,
        storageUsedTB,
        storageTotalTB,
        storageFreeTB,
        datastoreCount: datastores.length || null,
        datastores,
        // VMs
        vmCount,
        vmRunning:   vmRun,
        vmStopped,
        vmSuspended,
        allVMs,
        hosts:       mappedHosts,
        // Header stats
        totalServers:  hostCount,
        totalCores,
        totalMemory:   totalMemDisplay,
        totalStorage:  storageTotalTB ? storageTotalTB.toFixed(1) + 'TB' : null,
        // iLO
        iloServers,
        // Power
        powerKW:       totalKW > 0 ? totalKW : null,
        powerCapKW:    capKW != null ? capKW.toFixed(2) : null,
        powerPct,
        powerPsuCount: totalPsuCount || null,
        powerPsuOk:    totalPsuCount ? `${totalPsuOk} / ${totalPsuCount}` : null,
        powerHistory:  [...powerHistRef.current],
        // Temperature
        inletTemp:     inletAvg,
        // Alerts
        alerts: Array.isArray(alertsData) ? alertsData : (alertsData?.alerts || []),
        // Server names for network charts
        serverNames: serverNames.length ? serverNames : ['Server 1', 'Server 2', 'Server 3'],
      })

      if (coreOk) {
        const iloTxt = iloOk ? ' · iLO ✓' : ' · iLO ✗'
        setStatus({ ok: true, text: '✓ vCenter' + iloTxt, loading: false })
      } else if (iloOk) {
        setStatus({ ok: false, text: '⚠ Partial — vCenter unreachable', loading: false })
      } else {
        setStatus({ ok: false, text: '✗ Backend unreachable', loading: false })
      }

      setLastUpdate(new Date().toLocaleTimeString([], { hour:'2-digit', minute:'2-digit', second:'2-digit' }))

    } catch (_e) {
      console.error('Dashboard fetch error:', _e)
      setStatus({ ok: false, text: '✗ Connection Error', loading: false })
    } finally {
      fetchInFlight.current = false
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const id = setInterval(fetchAll, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchAll])

  return { data, status, lastUpdate }
}

