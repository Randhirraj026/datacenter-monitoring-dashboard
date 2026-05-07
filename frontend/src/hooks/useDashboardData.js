import { useState, useEffect, useRef, useCallback } from 'react'
import {
  fetchRealtime, fetchHosts, fetchVMs,
  fetchDatastores, fetchAlerts, fetchILO, fetchPowerHistory, fetchRduSummary
} from '../services/api'
import { POLL_INTERVAL_MS } from '../constants/config'
import { getUniqueHostDisplayName } from '../services/ipMapper'

const INITIAL = {
  cpuPct: null, cpuCores: null, cpuSpeed: null, hostsOnline: null,
  memPct: null, memUsed: null, memTotal: null, memFree: null,
  storagePct: null, storageUsedTB: null, storageTotalTB: null,
  storageFreeTB: null, datastoreCount: null, datastores: [],
  vmCount: null, vmRunning: null, vmStopped: null, vmSuspended: null,
  allVMs: [], hosts: [],
  totalServers: null, totalCores: null, totalMemory: null, totalStorage: null,
  iloServers: [],
  powerKW: null, powerCapKW: null, powerPct: null,
  powerPsuCount: null, powerPsuOk: null, powerHistory: [],
  inletTemp: null,
  alerts: [],
  rdu: {
    ok: false,
    reason: 'RDU feed not configured',
    metrics: {
      rackFrontTempC: null,
      rackRearTempC: null,
      rackFrontHumidityPct: null,
      rackRearHumidityPct: null,
      humidityPct: null,
      acSupplyAirC: null,
      powerCutActive: null,
      upsBatteryPct: null,
      upsBatteryMinutesLeft: null,
      mainsStatus: null,
      rduStatus: null,
    },
    alerts: [],
    sensors: [],
  },
  serverNames: ['Server 1', 'Server 2', 'Server 3'],
}

export function useDashboardData() {
  const [data, setData] = useState(INITIAL)
  const [status, setStatus] = useState({ ok: false, text: 'Connecting...', loading: true })
  const [lastUpdate, setLastUpdate] = useState(null)
  const powerHistRef = useRef([])
  const lastPowerPointAtRef = useRef(null)
  const fetchInFlight = useRef(false)

  const fetchAll = useCallback(async () => {
    if (fetchInFlight.current) return
    fetchInFlight.current = true

    try {
      const [rt, hostsRes, vmsRes, dsRes, alertsRes, iloRes, pwrRes, rduRes] = await Promise.allSettled([
        fetchRealtime(),
        fetchHosts(),
        fetchVMs(),
        fetchDatastores(),
        fetchAlerts(),
        fetchILO(),
        fetchPowerHistory(),
        fetchRduSummary(),
      ])

      const get = (result) => result.status === 'fulfilled' ? result.value : null
      const rtData = get(rt)
      const hostsData = get(hostsRes)
      const vmsData = get(vmsRes)
      const dsData = get(dsRes)
      const alertsData = get(alertsRes)
      const iloData = get(iloRes)
      const pwrData = get(pwrRes) || []
      const rduData = get(rduRes)

      const coreOk = !!(rtData || hostsData || vmsData)
      const iloOk = !!(iloData && !iloData.error)

      const cpu = rtData?.compute?.cpuUsagePercent ?? null
      const mem = rtData?.compute?.memoryUsagePercent ?? null
      const stor = rtData?.storage?.usagePercent ?? null
      const vmRun = vmsData?.running ?? rtData?.vms?.running ?? null

      const hostList = hostsData?.hosts || []
      const hostCount = hostList.length || rtData?.hosts || null
      const totalCores = rtData?.compute?.totalCores || hostList.reduce((sum, host) => sum + (host.cpuCores || 0), 0) || null
      const totalMemGB = rtData?.compute?.totalMemoryGB || hostList.reduce((sum, host) => sum + (host.totalMemoryGB || 0), 0) || null
      const storageTB = dsData?.totalCapacityTB || rtData?.storage?.totalTB || null
      const cpuSpeed = rtData?.compute?.cpuSpeedGHz ?? null

      let totalMemDisplay = null
      if (totalMemGB > 0) {
        totalMemDisplay = totalMemGB >= 1024
          ? `${(totalMemGB / 1024).toFixed(1)}TB`
          : `${Math.round(totalMemGB)}GB`
      }

      const memUsed = totalMemGB && mem != null ? Math.round(totalMemGB * (mem / 100)) : null
      const memFree = totalMemGB && mem != null ? Math.round(totalMemGB * (1 - mem / 100)) : null

      const datastores = dsData?.datastores || []
      const storagePct = dsData?.overallUsagePct ?? stor ?? null
      const storageUsedTB = dsData?.totalUsedTB ?? null
      const storageTotalTB = dsData?.totalCapacityTB ?? storageTB ?? null
      const storageFreeTB = storageTotalTB && storageUsedTB != null
        ? Math.max(0, storageTotalTB - storageUsedTB)
        : null

      const allVMs = vmsData?.list || []
      const vmCount = vmsData?.total ?? null
      const vmStopped = vmsData?.stopped ?? null
      const vmSuspended = vmsData?.suspended ?? null

      const mappedHosts = hostList.map((host) => ({
        name: host.name,
        hostId: host.hostId,
        cpuPct: host.cpuUsagePercent ?? host.cpuPct ?? null,
        memPct: host.memoryUsagePercent ?? host.memPct ?? null,
        memUsedGB: host.usedMemoryGB ?? null,
        memTotalGB: host.totalMemoryGB ?? null,
        connectionState: host.connectionState,
        displayName: getUniqueHostDisplayName(host, hostList),
      }))

      const iloServers = iloData?.servers || []
      const iloSummary = iloData?.summary || {}
      const totalKW = iloSummary.totalPowerKW ?? 0
      const inletAvg = iloSummary.avgInletTempC ?? null

      if (Array.isArray(pwrData) && pwrData.length > 0) {
        powerHistRef.current = pwrData

        if (totalKW > 0) {
          const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          powerHistRef.current = [...powerHistRef.current.slice(-71), { t: now, v: totalKW }]
        }
      } else if (totalKW > 0) {
        const nowDate = new Date()
        const lastPointAt = lastPowerPointAtRef.current
        const shouldAddPoint = !lastPointAt || (nowDate.getTime() - lastPointAt) >= (5 * 60 * 1000)

        if (shouldAddPoint) {
          const now = nowDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          powerHistRef.current = [...powerHistRef.current.slice(-71), { t: now, v: totalKW }]
          lastPowerPointAtRef.current = nowDate.getTime()
        } else if (powerHistRef.current.length > 0) {
          powerHistRef.current = [
            ...powerHistRef.current.slice(0, -1),
            { ...powerHistRef.current[powerHistRef.current.length - 1], v: totalKW },
          ]
        } else {
          const now = nowDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          powerHistRef.current = [{ t: now, v: totalKW }]
          lastPowerPointAtRef.current = nowDate.getTime()
        }
      }

      const reachable = iloServers.filter((server) => server.reachable)
      let totalCapW = 0
      let totalPsuCount = 0
      let totalPsuOk = 0

      reachable.forEach((server) => {
        ;(server.psus || []).forEach((psu) => {
          totalPsuCount += 1
          if (psu.status === 'OK' || psu.state === 'Enabled') totalPsuOk += 1
        })
        if (server._rawPowerCapW) totalCapW += server._rawPowerCapW
      })

      const capKW = totalCapW > 0 ? (totalCapW / 1000) : null
      const powerPctRaw = capKW && totalKW > 0
        ? (totalKW / capKW) * 100
        : totalKW > 0 ? (totalKW / (totalKW * 1.4)) * 100 : 0
      const powerPct = Number(Math.min(powerPctRaw, 100).toFixed(1))

      const { getServerDisplayName } = await import('../services/ipMapper')
      const serverNames = iloServers.length > 0
        ? iloServers.slice(0, 3).map((server, index) => getServerDisplayName(server, index, mappedHosts))
        : mappedHosts.slice(0, 3).map((host, index) => host.displayName || host.name || `Server ${index + 1}`)

      setData({
        cpuPct: cpu,
        cpuCores: totalCores,
        cpuSpeed,
        hostsOnline: hostCount,
        memPct: mem,
        memUsed,
        memTotal: totalMemGB,
        memFree,
        storagePct,
        storageUsedTB,
        storageTotalTB,
        storageFreeTB,
        datastoreCount: datastores.length || null,
        datastores,
        vmCount,
        vmRunning: vmRun,
        vmStopped,
        vmSuspended,
        allVMs,
        hosts: mappedHosts,
        totalServers: hostCount,
        totalCores,
        totalMemory: totalMemDisplay,
        totalStorage: storageTotalTB ? `${storageTotalTB.toFixed(1)}TB` : null,
        iloServers,
        powerKW: totalKW > 0 ? totalKW : null,
        powerCapKW: capKW != null ? capKW.toFixed(2) : null,
        powerPct,
        powerPsuCount: totalPsuCount || null,
        powerPsuOk: totalPsuCount ? `${totalPsuOk} / ${totalPsuCount}` : null,
        powerHistory: [...powerHistRef.current],
        inletTemp: inletAvg,
        alerts: Array.isArray(alertsData) ? alertsData : (alertsData?.alerts || []),
        rdu: rduData?.metrics || rduData?.alerts || rduData?.sensors || rduData?.reason
          ? {
              ok: rduData?.ok !== false,
              reason: rduData?.reason || '',
              metrics: {
                rackFrontTempC: rduData?.metrics?.rackFrontTempC ?? null,
                rackRearTempC: rduData?.metrics?.rackRearTempC ?? null,
                rackFrontHumidityPct: rduData?.metrics?.rackFrontHumidityPct ?? null,
                rackRearHumidityPct: rduData?.metrics?.rackRearHumidityPct ?? null,
                humidityPct: rduData?.metrics?.humidityPct ?? null,
                acSupplyAirC: rduData?.metrics?.acSupplyAirC ?? null,
                powerCutActive: rduData?.metrics?.powerCutActive ?? null,
                upsBatteryPct: rduData?.metrics?.upsBatteryPct ?? null,
                upsBatteryMinutesLeft: rduData?.metrics?.upsBatteryMinutesLeft ?? null,
                mainsStatus: rduData?.metrics?.mainsStatus ?? null,
                rduStatus: rduData?.metrics?.rduStatus ?? null,
              },
              alerts: Array.isArray(rduData?.alerts) ? rduData.alerts : [],
              sensors: Array.isArray(rduData?.sensors) ? rduData.sensors : [],
              fetchedAt: rduData?.fetchedAt || null,
            }
          : INITIAL.rdu,
        serverNames: serverNames.length ? serverNames : ['Server 1', 'Server 2', 'Server 3'],
      })

      if (coreOk) {
        const iloTxt = iloOk ? ' | iLO OK' : ' | iLO unavailable'
        setStatus({ ok: true, text: `vCenter connected${iloTxt}`, loading: false })
      } else if (iloOk) {
        setStatus({ ok: false, text: 'Partial: vCenter unreachable', loading: false })
      } else {
        setStatus({ ok: false, text: 'Backend unreachable', loading: false })
      }

      setLastUpdate(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    } catch (_e) {
      console.error('Dashboard fetch error:', _e)
      setStatus({ ok: false, text: 'Connection error', loading: false })
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
