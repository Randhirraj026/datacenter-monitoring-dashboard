import { useMemo, useState } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import { Chart, registerables } from 'chart.js'
import { useNavigate } from 'react-router-dom'
import BackgroundAnimation from '../components/ui/BackgroundAnimation'
import LoadingOverlay from '../components/ui/LoadingOverlay'
import StatusBadge from '../components/ui/StatusBadge'
import Footer from '../components/layout/Footer'
import SuperAdminHistoricalPanel from '../components/superadmin/SuperAdminHistoricalPanel'
import SuperAdminDetailsModal from '../components/superadmin/SuperAdminDetailsModal'
import PredictionPanel from '../components/superadmin/PredictionPanel'
import { useSuperAdminBundleData, useSuperAdminDashboardSnapshot, useSuperAdminSectionData } from '../hooks/useSuperAdminHistoricalData'
import { logout } from '../services/api'

Chart.register(...registerables)

const colors = ['#2563eb', '#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6']

function formatTs(value) {
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function latestByGroup(rows = [], key = 'hostName') {
  const map = new Map()
  rows.forEach((row) => {
    map.set(row[key], row)
  })
  return Array.from(map.values())
}

function buildGroupedLineData(rows = [], groupKey, valueKey, labelFormatter = (value) => value) {
  const labels = Array.from(new Set(rows.map((row) => row.timestamp))).sort((a, b) => new Date(a) - new Date(b))
  const grouped = new Map()

  rows.forEach((row) => {
    const name = row[groupKey] || 'Unknown'
    const bucket = grouped.get(name) || new Map()
    bucket.set(row.timestamp, Number(row[valueKey] || 0))
    grouped.set(name, bucket)
  })

  return {
    labels: labels.map(formatTs),
    datasets: Array.from(grouped.entries()).slice(0, 6).map(([name, values], index) => ({
      label: labelFormatter(name),
      data: labels.map((label) => values.get(label) ?? null),
      borderColor: colors[index % colors.length],
      backgroundColor: `${colors[index % colors.length]}20`,
      fill: false,
      pointRadius: 0,
      tension: 0.32,
      borderWidth: 2,
    })),
  }
}

function aggregateStorage(rows = []) {
  const grouped = new Map()

  rows.forEach((row) => {
    const current = grouped.get(row.timestamp) || {
      used: 0,
      free: 0,
      total: 0,
    }

    current.used += Number(row.usedSpaceGb || 0)
    current.free += Number(row.freeSpaceGb || 0)
    current.total += Number(row.totalCapacityGb || 0)
    grouped.set(row.timestamp, current)
  })

  const labels = Array.from(grouped.keys()).sort((a, b) => new Date(a) - new Date(b))
  return {
    labels: labels.map(formatTs),
    datasets: [
      {
        label: 'Used GB',
        data: labels.map((label) => Number(grouped.get(label)?.used?.toFixed(2) || 0)),
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239,68,68,0.16)',
        fill: true,
        pointRadius: 0,
        tension: 0.28,
        borderWidth: 2,
      },
      {
        label: 'Free GB',
        data: labels.map((label) => Number(grouped.get(label)?.free?.toFixed(2) || 0)),
        borderColor: '#22c55e',
        backgroundColor: 'rgba(34,197,94,0.10)',
        fill: true,
        pointRadius: 0,
        tension: 0.28,
        borderWidth: 2,
      },
      {
        label: 'Total GB',
        data: labels.map((label) => Number(grouped.get(label)?.total?.toFixed(2) || 0)),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0)',
        fill: false,
        pointRadius: 0,
        tension: 0.28,
        borderWidth: 2,
        borderDash: [6, 4],
      },
    ],
  }
}

function aggregatePower(rows = []) {
  const grouped = new Map()
  rows.forEach((row) => {
    grouped.set(row.timestamp, (grouped.get(row.timestamp) || 0) + Number(row.powerKw || 0))
  })
  const labels = Array.from(grouped.keys()).sort((a, b) => new Date(a) - new Date(b))

  return {
    labels: labels.map(formatTs),
    datasets: [
      {
        label: 'Power kW',
        data: labels.map((label) => Number((grouped.get(label) || 0).toFixed(3))),
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22,163,74,0.12)',
        fill: true,
        pointRadius: 0,
        tension: 0.32,
        borderWidth: 2,
      },
    ],
  }
}

function aggregateIlo(rows = []) {
  const grouped = new Map()
  rows.forEach((row) => {
    const current = grouped.get(row.timestamp) || {
      inlet: [],
      cpu: [],
      power: [],
    }
    if (row.inletTempC != null) current.inlet.push(Number(row.inletTempC))
    if (row.cpuTempC != null) current.cpu.push(Number(row.cpuTempC))
    if (row.powerKw != null) current.power.push(Number(row.powerKw))
    grouped.set(row.timestamp, current)
  })
  const labels = Array.from(grouped.keys()).sort((a, b) => new Date(a) - new Date(b))

  const avg = (items) => (items.length ? Number((items.reduce((sum, item) => sum + item, 0) / items.length).toFixed(2)) : null)

  return {
    labels: labels.map(formatTs),
    datasets: [
      {
        label: 'Avg Inlet C',
        data: labels.map((label) => avg(grouped.get(label)?.inlet || [])),
        borderColor: '#f97316',
        backgroundColor: 'rgba(249,115,22,0.12)',
        yAxisID: 'temp',
        pointRadius: 0,
        tension: 0.3,
        borderWidth: 2,
      },
      {
        label: 'Avg CPU C',
        data: labels.map((label) => avg(grouped.get(label)?.cpu || [])),
        borderColor: '#dc2626',
        backgroundColor: 'rgba(220,38,38,0.12)',
        yAxisID: 'temp',
        pointRadius: 0,
        tension: 0.3,
        borderWidth: 2,
      },
      {
        label: 'Avg Power kW',
        data: labels.map((label) => avg(grouped.get(label)?.power || [])),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.12)',
        yAxisID: 'power',
        pointRadius: 0,
        tension: 0.3,
        borderWidth: 2,
      },
    ],
  }
}

function aggregateNetwork(rows = []) {
  const grouped = new Map()
  rows.forEach((row) => {
    grouped.set(row.timestamp, (grouped.get(row.timestamp) || 0) + 1)
  })
  const labels = Array.from(grouped.keys()).sort((a, b) => new Date(a) - new Date(b))
  return {
    labels: labels.map(formatTs),
    datasets: [
      {
        label: 'Captured Networks',
        data: labels.map((label) => grouped.get(label) || 0),
        borderColor: '#7c3aed',
        backgroundColor: 'rgba(124,58,237,0.12)',
        fill: true,
        pointRadius: 0,
        tension: 0.3,
        borderWidth: 2,
      },
    ],
  }
}

function aggregateSummaryMetrics(cpuRows = [], memoryRows = [], storageRows = [], powerRows = []) {
  const grouped = new Map()

  cpuRows.forEach((row) => {
    const current = grouped.get(row.ts) || {
      cpu: [],
      memory: [],
      power: [],
      storageUsed: 0,
      storageTotal: 0,
    }
    current.cpu.push(Number(row.cpuUsagePct || 0))
    grouped.set(row.ts, current)
  })

  memoryRows.forEach((row) => {
    const current = grouped.get(row.ts) || {
      cpu: [],
      memory: [],
      power: [],
      storageUsed: 0,
      storageTotal: 0,
    }
    current.memory.push(Number(row.memoryUsagePct || 0))
    grouped.set(row.ts, current)
  })

  powerRows.forEach((row) => {
    const current = grouped.get(row.ts) || {
      cpu: [],
      memory: [],
      power: [],
      storageUsed: 0,
      storageTotal: 0,
    }
    if (row.powerKw != null) current.power.push(Number(row.powerKw))
    grouped.set(row.ts, current)
  })

  storageRows.forEach((row) => {
    const current = grouped.get(row.ts || row.timestamp) || {
      cpu: [],
      memory: [],
      power: [],
      storageUsed: 0,
      storageTotal: 0,
    }
    current.storageUsed += Number(row.usedSpaceGb || 0)
    current.storageTotal += Number(row.totalCapacityGb || 0)
    grouped.set(row.ts || row.timestamp, current)
  })

  const labels = Array.from(grouped.keys()).sort((a, b) => new Date(a) - new Date(b))
  const average = (values) => (values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null)

  return {
    labels: labels.map(formatTs),
    datasets: [
      {
        label: 'CPU Avg %',
        data: labels.map((label) => average(grouped.get(label)?.cpu || [])),
        borderColor: '#2563eb',
        backgroundColor: 'rgba(37,99,235,0.08)',
        yAxisID: 'percent',
        pointRadius: 0,
        tension: 0.32,
        borderWidth: 2,
      },
      {
        label: 'Memory Avg %',
        data: labels.map((label) => average(grouped.get(label)?.memory || [])),
        borderColor: '#8b5cf6',
        backgroundColor: 'rgba(139,92,246,0.08)',
        yAxisID: 'percent',
        pointRadius: 0,
        tension: 0.32,
        borderWidth: 2,
      },
      {
        label: 'Storage Used %',
        data: labels.map((label) => {
          const bucket = grouped.get(label)
          return bucket?.storageTotal > 0 ? Number(((bucket.storageUsed / bucket.storageTotal) * 100).toFixed(2)) : null
        }),
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245,158,11,0.08)',
        yAxisID: 'percent',
        pointRadius: 0,
        tension: 0.32,
        borderWidth: 2,
      },
      {
        label: 'Power kW',
        data: labels.map((label) => Number(((grouped.get(label)?.power || []).reduce((sum, value) => sum + value, 0)).toFixed(3))),
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22,163,74,0.08)',
        yAxisID: 'power',
        pointRadius: 0,
        tension: 0.32,
        borderWidth: 2,
      },
    ],
  }
}

const SUMMARY_METRIC_OPTIONS = [
  { value: 'cpu', label: 'CPU Avg %' },
  { value: 'memory', label: 'Memory Avg %' },
  { value: 'storage', label: 'Storage Used %' },
  { value: 'power', label: 'Power kW' },
]

function getSummaryMetricHostId(metric, hostId) {
  return metric === 'storage' ? '' : hostId
}

function filterSummaryChart(chart, metric) {
  if (!chart?.datasets?.length) return chart

  const labelByMetric = {
    cpu: 'CPU Avg %',
    memory: 'Memory Avg %',
    storage: 'Storage Used %',
    power: 'Power kW',
  }

  return {
    ...chart,
    datasets: chart.datasets.filter((dataset) => dataset.label === labelByMetric[metric]),
  }
}

const lineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top',
      onClick: () => {},
      labels: {
        usePointStyle: true,
        boxWidth: 10,
        color: '#475569',
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#64748b', maxTicksLimit: 8 },
    },
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(148,163,184,0.16)' },
      ticks: { color: '#64748b' },
    },
  },
}

const iloOptions = {
  ...lineOptions,
  scales: {
    x: lineOptions.scales.x,
    temp: {
      type: 'linear',
      position: 'left',
      beginAtZero: true,
      grid: { color: 'rgba(148,163,184,0.16)' },
      ticks: { color: '#64748b' },
    },
    power: {
      type: 'linear',
      position: 'right',
      beginAtZero: true,
      grid: { display: false },
      ticks: { color: '#64748b' },
    },
  },
}

const summaryOptions = {
  ...lineOptions,
  scales: {
    x: lineOptions.scales.x,
    percent: {
      type: 'linear',
      position: 'left',
      beginAtZero: true,
      max: 100,
      grid: { color: 'rgba(148,163,184,0.16)' },
      ticks: { color: '#64748b' },
    },
    power: {
      type: 'linear',
      position: 'right',
      beginAtZero: true,
      grid: { display: false },
      ticks: { color: '#64748b' },
    },
  },
}

export default function SuperAdminPage() {
  const navigate = useNavigate()
  const [sectionHosts, setSectionHosts] = useState({
    summary: '',
    cpu: '',
    memory: '',
    power: '',
    analytics: '',
    ilo: '',
  })
  const [summaryMetric, setSummaryMetric] = useState('cpu')
  const [headerSummaryRange, setHeaderSummaryRange] = useState('24h')
  const [cpuRange, setCpuRange] = useState('24h')
  const [memoryRange, setMemoryRange] = useState('24h')
  const [storageRange, setStorageRange] = useState('24h')
  const [powerRange, setPowerRange] = useState('24h')
  const [analyticsRange, setAnalyticsRange] = useState('24h')
  const [iloRange, setIloRange] = useState('24h')
  const [networkRange, setNetworkRange] = useState('24h')
  const [detailsState, setDetailsState] = useState({
    open: false,
    section: 'cpu',
    range: '24h',
    sort: 'desc',
    page: 1,
  })

  const dashboardSnapshot = useSuperAdminDashboardSnapshot()
  const analyticsBundle = useSuperAdminBundleData({ range: analyticsRange, hostId: sectionHosts.analytics })
  const cpuData = useSuperAdminSectionData({ section: 'cpu', range: cpuRange, hostId: sectionHosts.cpu })
  const memoryData = useSuperAdminSectionData({ section: 'memory', range: memoryRange, hostId: sectionHosts.memory })
  const storageData = useSuperAdminSectionData({ section: 'storage', range: storageRange })
  const powerData = useSuperAdminSectionData({ section: 'power', range: powerRange, hostId: sectionHosts.power })
  const iloData = useSuperAdminSectionData({ section: 'ilo', range: iloRange, hostId: sectionHosts.ilo })
  const networkData = useSuperAdminSectionData({ section: 'network', range: networkRange })
  const detailsData = useSuperAdminSectionData({
    section: detailsState.section,
    range: detailsState.range,
    hostId: detailsState.hostId,
    page: detailsState.page,
    pageSize: 50,
    sort: detailsState.sort,
  })

  // Dedicated data fetch for Header Summary to decouple it from the panels below
  const summaryDedicatedData = useSuperAdminSectionData({
    section: summaryMetric,
    range: headerSummaryRange,
    hostId: summaryMetric === 'storage' ? '' : sectionHosts.summary
  })

  const hostOptions = dashboardSnapshot.data?.hosts?.map((host) => ({ id: host.hostId, name: host.name })) || []
  const latestCpuRows = latestByGroup(cpuData.data?.rows || [])
  const latestMemoryRows = latestByGroup(memoryData.data?.rows || [])
  const latestIloRows = latestByGroup(iloData.data?.rows || [], 'serverName')
  
  // Build completely dedicated chart dataset for Header Summary
  const summaryFilteredChart = (() => {
    const rows = summaryDedicatedData.data?.rows || []
    if (!rows.length) return { labels: [], datasets: [] }
    
    // We reuse group/aggregate mechanics to build the single selected metric
    const mockCpu = summaryMetric === 'cpu' ? rows.map(r => ({ ts: r.timestamp, cpuUsagePct: r.cpuUsagePct })) : []
    const mockMem = summaryMetric === 'memory' ? rows.map(r => ({ ts: r.timestamp, memoryUsagePct: r.memoryUsagePct })) : []
    const mockStore = summaryMetric === 'storage' ? rows.map(r => ({ timestamp: r.timestamp, usedSpaceGb: r.usedSpaceGb, totalCapacityGb: r.totalCapacityGb })) : []
    const mockPower = summaryMetric === 'power' ? rows.map(r => ({ ts: r.timestamp, powerKw: r.powerKw })) : []
    
    const aggregated = aggregateSummaryMetrics(mockCpu, mockMem, mockStore, mockPower)
    return filterSummaryChart(aggregated, summaryMetric)
  })()

  const vmLifecycle = analyticsBundle.data?.charts?.vmLifecycle || []
  const vmLifecycleChart = {
    labels: vmLifecycle.map((row) => row.statDate),
    datasets: [
      {
        type: 'bar',
        label: 'Created',
        data: vmLifecycle.map((row) => row.createdCount),
        backgroundColor: 'rgba(37,99,235,0.78)',
        borderRadius: 8,
      },
      {
        type: 'bar',
        label: 'Deleted',
        data: vmLifecycle.map((row) => row.deletedCount),
        backgroundColor: 'rgba(239,68,68,0.72)',
        borderRadius: 8,
      },
      {
        type: 'line',
        label: 'Running',
        data: vmLifecycle.map((row) => row.runningCount),
        borderColor: '#16a34a',
        backgroundColor: 'rgba(22,163,74,0.12)',
        tension: 0.3,
        pointRadius: 2,
        borderWidth: 2,
      },
    ],
  }

  const summaryGraphError = cpuData.error || memoryData.error || storageData.error || powerData.error
  const pageLoading = dashboardSnapshot.loading && !dashboardSnapshot.data
  const status = summaryGraphError || dashboardSnapshot.error
    ? { ok: false, text: summaryGraphError || dashboardSnapshot.error }
    : { ok: true, text: 'Historical DB data loaded' }

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  function setSectionHost(section, hostId) {
    setSectionHosts((current) => ({ ...current, [section]: hostId }))
  }

  function openDetails(section, range, hostId = '') {
    setDetailsState({
      open: true,
      section,
      range,
      hostId,
      sort: 'desc',
      page: 1,
    })
  }

  return (
    <div className="relative flex min-h-screen flex-col font-inter">
      <BackgroundAnimation />
      <LoadingOverlay visible={pageLoading} />
      <StatusBadge ok={status.ok} text={status.text} />

      <header className="sticky top-0 z-[100] flex items-center justify-between border-b border-gray-200 bg-white/90 px-10 py-4 shadow-sm backdrop-blur-xl">
        <div className="flex items-center gap-4">
          <img
            src="/dnnlogo.png"
            alt="Kristellar DNN"
            className="h-[72px] w-[160px] object-contain object-center"
          />
        </div>
        <h1 className="text-3xl font-black tracking-tight text-slate-950">Database Analytics Dashboard</h1>

        <button
          onClick={handleLogout}
          className="rounded-lg px-4 py-1.5 text-xs font-semibold tracking-widest transition-all duration-200 hover:scale-105"
          style={{
            background: 'rgba(255,71,87,0.15)',
            border: '1px solid rgba(255,71,87,0.3)',
            color: '#ff6b7a',
          }}
        >
          Admin Exit
        </button>
      </header>

      <main className="mx-auto flex-1 w-full max-w-[1800px] px-5 py-5">
        {/* <section className="mb-8 rounded-[30px] border border-slate-200/80 bg-white/92 px-6 py-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
          <h1 className="text-3xl font-black tracking-tight text-slate-950">Database Analytics Dashboard</h1>
        </section> */}
        
        <PredictionPanel hostOptions={hostOptions} />

        <div className="grid gap-6 xl:grid-cols-2">
          <SuperAdminHistoricalPanel
            title="Header Summary"
            subtitle="Historical summary trends from database snapshots"
            range={headerSummaryRange}
            onRangeChange={setHeaderSummaryRange}
            hostId={sectionHosts.summary}
            onHostChange={(value) => setSectionHost('summary', value)}
            hostOptions={hostOptions}
            loading={summaryDedicatedData.loading}
            error={summaryDedicatedData.error}
            empty={!summaryFilteredChart?.datasets?.length || !summaryFilteredChart?.datasets?.some((dataset) => dataset.data?.some((value) => value != null))}
            emptyText="No summary records found for the selected host and metric."
            footer={
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex flex-wrap gap-3">
                  {SUMMARY_METRIC_OPTIONS.map((option) => (
                    <label key={option.value} className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                      <input
                        type="radio"
                        name="summaryMetric"
                        value={option.value}
                        checked={summaryMetric === option.value}
                        onChange={() => setSummaryMetric(option.value)}
                        className="h-4 w-4 accent-blue-600"
                      />
                      <span>{option.label}</span>
                    </label>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => openDetails(summaryMetric, headerSummaryRange, getSummaryMetricHostId(summaryMetric, sectionHosts.summary))}
                  className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700"
                >
                  Open Detailed Records
                </button>
              </div>
            }
          >
            <div className="h-[320px]">
              <Line key={summaryMetric} data={summaryFilteredChart} options={summaryOptions} />
            </div>
          </SuperAdminHistoricalPanel>

          <SuperAdminHistoricalPanel
            title="CPU & Processor Metrics"
            subtitle="CPU usage trend by host from database snapshots"
            range={cpuRange}
            onRangeChange={setCpuRange}
            hostId={sectionHosts.cpu}
            onHostChange={(value) => setSectionHost('cpu', value)}
            hostOptions={hostOptions}
            loading={cpuData.loading}
            error={cpuData.error}
            empty={!cpuData.data?.rows?.length}
            emptyText="No CPU records found in the selected DB window."
            footer={
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-500">
                  Latest processors tracked: <span className="font-bold text-slate-700">{latestCpuRows.length || 0}</span>
                </div>
                <button type="button" onClick={() => openDetails('cpu', cpuRange, sectionHosts.cpu)} className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700">
                  Open Detailed Records
                </button>
              </div>
            }
          >
            <div className="h-[320px]">
              <Line data={buildGroupedLineData(cpuData.data?.rows || [], 'hostName', 'cpuUsagePct')} options={lineOptions} />
            </div>
          </SuperAdminHistoricalPanel>

          <SuperAdminHistoricalPanel
            title="Memory Statistics"
            subtitle="Memory usage trend by host from database snapshots"
            range={memoryRange}
            onRangeChange={setMemoryRange}
            hostId={sectionHosts.memory}
            onHostChange={(value) => setSectionHost('memory', value)}
            hostOptions={hostOptions}
            loading={memoryData.loading}
            error={memoryData.error}
            empty={!memoryData.data?.rows?.length}
            emptyText="No memory records found in the selected DB window."
            footer={
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-500">
                  Latest hosts with memory data: <span className="font-bold text-slate-700">{latestMemoryRows.length || 0}</span>
                </div>
                <button type="button" onClick={() => openDetails('memory', memoryRange, sectionHosts.memory)} className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700">
                  Open Detailed Records
                </button>
              </div>
            }
          >
            <div className="h-[320px]">
              <Line data={buildGroupedLineData(memoryData.data?.rows || [], 'hostName', 'memoryUsagePct')} options={lineOptions} />
            </div>
          </SuperAdminHistoricalPanel>

          <SuperAdminHistoricalPanel
            title="Storage Management"
            subtitle="Aggregated datastore usage from DB snapshots"
            range={storageRange}
            onRangeChange={setStorageRange}
            loading={storageData.loading}
            error={storageData.error}
            empty={!storageData.data?.rows?.length}
            emptyText="No storage records found in the selected DB window."
            footer={
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-500">
                  Datastore rows captured: <span className="font-bold text-slate-700">{storageData.data?.total || 0}</span>
                </div>
                <button type="button" onClick={() => openDetails('storage', storageRange)} className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700">
                  Open Detailed Records
                </button>
              </div>
            }
          >
            <div className="h-[320px]">
              <Line data={aggregateStorage(storageData.data?.rows || [])} options={lineOptions} />
            </div>
          </SuperAdminHistoricalPanel>

          <SuperAdminHistoricalPanel
            title="Power Consumption"
            subtitle="Power draw trend stored every 2 minutes"
            range={powerRange}
            onRangeChange={setPowerRange}
            hostId={sectionHosts.power}
            onHostChange={(value) => setSectionHost('power', value)}
            hostOptions={hostOptions}
            loading={powerData.loading}
            error={powerData.error}
            empty={!powerData.data?.rows?.length}
            emptyText="No power records found in the selected DB window."
            footer={
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-500">
                  Latest power records: <span className="font-bold text-slate-700">{powerData.data?.total || 0}</span>
                </div>
                <button type="button" onClick={() => openDetails('power', powerRange, sectionHosts.power)} className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700">
                  Open Detailed Records
                </button>
              </div>
            }
          >
            <div className="h-[320px]">
              <Line data={aggregatePower(powerData.data?.rows || [])} options={lineOptions} />
            </div>
          </SuperAdminHistoricalPanel>

          <SuperAdminHistoricalPanel
            title="Historical Analytics"
            subtitle="VM lifecycle trends from historical DB events"
            range={analyticsRange}
            onRangeChange={setAnalyticsRange}
            hostId={sectionHosts.analytics}
            onHostChange={(value) => setSectionHost('analytics', value)}
            hostOptions={hostOptions}
            loading={analyticsBundle.loading}
            error={analyticsBundle.error}
            empty={!vmLifecycle.length}
            emptyText="No VM lifecycle records found in the selected DB window."
            footer={
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-500">
                  VM lifecycle points: <span className="font-bold text-slate-700">{vmLifecycle.length || 0}</span>
                </div>
                <button type="button" onClick={() => openDetails('vm', analyticsRange, sectionHosts.analytics)} className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700">
                  Open Detailed Records
                </button>
              </div>
            }
          >
            <div className="h-[320px]">
              <Bar data={vmLifecycleChart} options={lineOptions} />
            </div>
          </SuperAdminHistoricalPanel>

          <SuperAdminHistoricalPanel
            title="iLO Hardware Monitor"
            subtitle="Stored iLO temperatures, health, and power over time"
            range={iloRange}
            onRangeChange={setIloRange}
            hostId={sectionHosts.ilo}
            onHostChange={(value) => setSectionHost('ilo', value)}
            hostOptions={hostOptions}
            loading={iloData.loading}
            error={iloData.error}
            empty={!iloData.data?.rows?.length}
            emptyText="No iLO hardware records found in the selected DB window."
            footer={
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                  <span>Servers: <strong className="text-slate-700">{latestIloRows.length || 0}</strong></span>
                  <span>
                    Health: <strong className="text-slate-700">{latestIloRows[0]?.health || 'Unknown'}</strong>
                  </span>
                </div>
                <button type="button" onClick={() => openDetails('ilo', iloRange, sectionHosts.ilo)} className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700">
                  Open Detailed Records
                </button>
              </div>
            }
          >
            <div className="h-[320px]">
              <Line data={aggregateIlo(iloData.data?.rows || [])} options={iloOptions} />
            </div>
          </SuperAdminHistoricalPanel>

          <SuperAdminHistoricalPanel
            title="Individual Server Network Performance"
            subtitle="Network snapshot history captured in the database"
            range={networkRange}
            onRangeChange={setNetworkRange}
            loading={networkData.loading}
            error={networkData.error}
            empty={!networkData.data?.rows?.length}
            emptyText="No network records found in the selected DB window."
            footer={
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-500">
                  Network rows captured: <span className="font-bold text-slate-700">{networkData.data?.total || 0}</span>
                </div>
                <button type="button" onClick={() => openDetails('network', networkRange)} className="rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700">
                  Open Detailed Records
                </button>
              </div>
            }
          >
            <div className="h-[320px]">
              <Line data={aggregateNetwork(networkData.data?.rows || [])} options={lineOptions} />
            </div>
          </SuperAdminHistoricalPanel>
        </div>
      </main>

      <Footer />

      <SuperAdminDetailsModal
        open={detailsState.open}
        details={detailsData.data}
        loading={detailsData.loading}
        error={detailsData.error}
        section={detailsState.section}
        range={detailsState.range}
        sort={detailsState.sort}
        page={detailsState.page}
        onClose={() => setDetailsState((current) => ({ ...current, open: false }))}
        onRangeChange={(range) => setDetailsState((current) => ({ ...current, range, page: 1 }))}
        onSortChange={(sort) => setDetailsState((current) => ({ ...current, sort, page: 1 }))}
        onPageChange={(page) => setDetailsState((current) => ({ ...current, page }))}
      />
    </div>
  )
}
