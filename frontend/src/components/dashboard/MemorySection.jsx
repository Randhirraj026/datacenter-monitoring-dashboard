import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Chart, registerables } from 'chart.js'
import DashCard, { CardHeader, StatsGrid, StatItem } from '../ui/DashCard'
import GaugeChart from '../ui/GaugeChart'
import Badge, { getBadgeVariant } from '../ui/Badge'
import SectionHeader from '../ui/SectionHeader'
import ProgressBar from '../ui/ProgressBar'
import { mapIpName } from '../../services/ipMapper'
import { formatWholePercent } from '../../services/numberFormat'

Chart.register(...registerables)

function formatMemoryValue(value) {
  if (value == null) return '-'
  if (value >= 1024) return `${(value / 1024).toFixed(1)}TB`
  return `${Math.round(value)}GB`
}

function normalizeVmState(vm) {
  const state = String(vm?.powerState || vm?.runtime?.powerState || '').toUpperCase()
  if (state === 'POWERED_ON' || state === 'RUNNING') return 'running'
  if (state === 'SUSPENDED') return 'suspended'
  return 'stopped'
}

function getVmHostKey(vm) {
  const candidates = [
    vm?.hostName,
    vm?.host?.name,
    vm?.host,
    vm?.serverName,
    vm?.runtime?.hostName,
    vm?.runtime?.host,
    vm?.summary?.runtime?.hostName,
    vm?.summary?.runtime?.host,
    vm?.esxiHost,
    vm?.parentHost,
  ]

  const value = candidates.find((candidate) => typeof candidate === 'string' && candidate.trim())
  return value ? mapIpName(value).trim().toLowerCase() : null
}

function MemoryVmModal({ title, items = [], isOpen, onClose }) {
  useEffect(() => {
    if (!isOpen) return undefined

    const handleEscape = (event) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return undefined

    const scrollY = window.scrollY
    const previousBodyOverflow = document.body.style.overflow
    const previousBodyPosition = document.body.style.position
    const previousBodyTop = document.body.style.top
    const previousBodyWidth = document.body.style.width
    const previousHtmlOverflow = document.documentElement.style.overflow

    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow
      document.body.style.overflow = previousBodyOverflow
      document.body.style.position = previousBodyPosition
      document.body.style.top = previousBodyTop
      document.body.style.width = previousBodyWidth
      window.scrollTo(0, scrollY)
    }
  }, [isOpen])

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] bg-slate-900/50 p-4 backdrop-blur-sm"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="flex min-h-full items-center justify-center">
        <div
          className="flex max-h-[88vh] w-full max-w-3xl flex-col overflow-hidden rounded-[28px] bg-white shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-6 py-5">
            <div>
              <h3 className="text-xl font-extrabold text-slate-800">{title}</h3>
              <p className="mt-1 text-sm text-slate-500">Live virtual machine details from the VM API</p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close VM details"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            >
              x
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {items.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-slate-500">
                No VMs available for this selection.
              </div>
            ) : (
              <div className="space-y-3">
                {items.map((vm, index) => {
                  const state = normalizeVmState(vm)
                  const hostLabel = mapIpName(vm?.hostName || vm?.host?.name || vm?.host || vm?.serverName || '-')
                  const statusColor = state === 'running' ? 'bg-green-500' : state === 'suspended' ? 'bg-amber-500' : 'bg-rose-500'
                  const statusText = state === 'running' ? 'Running' : state === 'suspended' ? 'Suspended' : 'Stopped'
                  const memoryMB = vm?.memoryMB ?? vm?.memory ?? vm?.config?.hardware?.memoryMB ?? null
                  return (
                    <div key={`${vm?.id || vm?.name || 'vm'}-${index}`} className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
                      <span className={`h-3 w-3 flex-shrink-0 rounded-full ${statusColor}`} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-bold text-slate-800">{vm?.name || `VM ${index + 1}`}</div>
                        <div className="mt-1 text-sm text-slate-500">
                          {hostLabel} | {vm?.guestOs || vm?.osType || 'Unknown OS'} | CPU: {vm?.cpuCount ?? vm?.config?.hardware?.numCPU ?? '-'} | Mem: {memoryMB != null ? `${memoryMB} MB` : '-'}
                        </div>
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold text-slate-700 border border-slate-200">
                        {statusText}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function MemorySection({ data = {} }) {
  const vmChartRef = useRef(null)
  const vmChartInst = useRef(null)
  const [modalState, setModalState] = useState({
    isOpen: false,
    title: '',
    mode: null,
    hostLabel: null,
    vmState: null,
  })

  const memPct = data.memPct ?? 0
  const memUsed = data.memUsed ?? 0
  const memTotal = data.memTotal ?? 0
  const memFree = data.memFree ?? Math.max(memTotal - memUsed, 0)
  const vmCount = data.vmCount ?? 0
  const vmRunning = data.vmRunning ?? 0
  const vmStopped = data.vmStopped ?? Math.max(vmCount - vmRunning, 0)
  const vmSuspended = data.vmSuspended ?? 0
  const activeVmTotal = Math.max(vmRunning + vmStopped + vmSuspended, 0)
  const runningPct = activeVmTotal > 0 ? Math.round((vmRunning / activeVmTotal) * 100) : 0
  const badgeVariant = getBadgeVariant(memPct, 75, 90)
  const badgeLabel = memPct >= 90 ? 'Critical' : memPct >= 75 ? 'High' : 'Normal'

  const hostVmRows = useMemo(() => {
    const hostMap = new Map(
      (data.hosts || []).map((host, index) => {
        const label = mapIpName(host.name) || `Host ${index + 1}`
        return [label.trim().toLowerCase(), { host, label, running: [], stopped: [], suspended: [], all: [] }]
      })
    )

    for (const vm of data.allVMs || []) {
      const hostKey = getVmHostKey(vm)
      if (!hostKey || !hostMap.has(hostKey)) continue

      const bucket = hostMap.get(hostKey)
      const state = normalizeVmState(vm)
      bucket.all.push(vm)
      if (state === 'running') bucket.running.push(vm)
      else if (state === 'suspended') bucket.suspended.push(vm)
      else bucket.stopped.push(vm)
    }

    return Array.from(hostMap.values()).map(({ host, label, running, stopped, suspended, all }) => ({
      host,
      label,
      all,
      running,
      stopped,
      suspended,
      total: all.length,
      runningCount: running.length,
      stoppedCount: stopped.length,
      suspendedCount: suspended.length,
      memPct: host.memPct ?? 0,
      memTotalGB: host.memTotalGB ?? null,
      memUsedGB: host.memUsedGB ?? null,
    }))
  }, [data.allVMs, data.hosts])

  const modalItems = useMemo(() => {
    if (!modalState.isOpen) return []

    if (modalState.mode === 'state') {
      return (data.allVMs || []).filter((vm) => normalizeVmState(vm) === modalState.vmState)
    }

    if (modalState.mode === 'host') {
      const matchingRow = hostVmRows.find((row) => row.label === modalState.hostLabel)
      return matchingRow?.all || []
    }

    return []
  }, [data.allVMs, hostVmRows, modalState])

  useEffect(() => {
    const ctx = vmChartRef.current
    if (!ctx) return undefined

    const chartData = [vmRunning, vmStopped, vmSuspended].filter((value) => value > 0)
    const chartLabels = [
      vmRunning > 0 ? 'Running' : null,
      vmStopped > 0 ? 'Stopped' : null,
      vmSuspended > 0 ? 'Suspended' : null,
    ].filter(Boolean)
    const chartColors = [
      vmRunning > 0 ? '#4169e1' : null,
      vmStopped > 0 ? '#dbe3f0' : null,
      vmSuspended > 0 ? '#f4a533' : null,
    ].filter(Boolean)

    const dataset = chartData.length ? chartData : [1]
    const labels = chartLabels.length ? chartLabels : ['No Data']
    const colors = chartColors.length ? chartColors : ['#e2e8f0']

    if (vmChartInst.current) {
      vmChartInst.current.data.labels = labels
      vmChartInst.current.data.datasets[0].data = dataset
      vmChartInst.current.data.datasets[0].backgroundColor = colors
      vmChartInst.current.update()
      return undefined
    }

    vmChartInst.current = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [
          {
            data: dataset,
            backgroundColor: colors,
            borderWidth: 0,
            hoverOffset: 6,
            spacing: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '90%',
        plugins: {
          legend: {
            position: 'Center',
            labels: {
              usePointStyle: true,
              pointStyle: 'circle',
              boxWidth: 10,
              color: '#475569',
              font: { size: 12, weight: '600' },
              padding: 18,
            },
          },
          tooltip: {
            callbacks: {
              label: (context) => `${context.label}: ${context.raw}`,
            },
          },
        },
      },
    })

    return () => {
      vmChartInst.current?.destroy()
      vmChartInst.current = null
    }
  }, [vmRunning, vmStopped, vmSuspended])

  const openVmModal = (nextState) => {
    setModalState({
      isOpen: true,
      title: nextState.title,
      mode: nextState.mode,
      hostLabel: nextState.hostLabel ?? null,
      vmState: nextState.vmState ?? null,
    })
  }

  return (
    <section className="mb-12">
      <SectionHeader icon={'\uD83D\uDCBE'} title="Memory Statistics" />
      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))' }}>
       <DashCard delay={300} className="flex min-h-[490px] max-h-[490px] flex-col">
          <CardHeader
            title="Memory Usage"
            badge={<Badge variant={badgeVariant}>{badgeLabel}</Badge>}
          />

          <div className="flex flex-1 flex-col">
            <div className="flex min-h-[285px] items-center justify-center">
          <GaugeChart
                pct={memPct}
                value={formatWholePercent(memPct)}
                label="Used"
                gradientId="memGradient"
                gradientColors={['#c044ff', '#8b3dff']}
              />
            </div>

            <div className="mt-auto flex justify-center pt-2">
              <div className="flex flex-wrap justify-center gap-5">
                <StatItem value={formatMemoryValue(memTotal)} label="TOTAL RAM" colorClass="text-blue-600" />
                <StatItem value={formatMemoryValue(memUsed)} label="USED" colorClass="text-red-500" />
                <StatItem value={formatMemoryValue(memFree)} label="AVAILABLE" colorClass="text-green-600" />
              </div>
            </div>
          </div>
        </DashCard>

        <DashCard delay={400} className="flex min-h-[490px] max-h-[490px] flex-col">
          <CardHeader title="VM Distribution" />

          <div className="flex flex-1 flex-col">
            <div className="flex min-h-[295px] items-center justify-center">
              <GaugeChart
                pct={Math.min(vmCount, 100)}
                value={`${vmCount}`}
                label="Total VMs"
                gradientId="vmGradient"
                gradientColors={['#7c3aed', '#d946ef']}
              />
            </div>

            <div className="mt-auto flex justify-center pt-2">
              <div className="flex flex-wrap justify-center gap-4">
                <StatItem value={vmCount} label="TOTAL VMS" />
                <StatItem value={`${runningPct}%`} label="RUNNING" colorClass="text-green-600" />
                <StatItem value={activeVmTotal > 0 ? `${Math.round((vmStopped / activeVmTotal) * 100)}%` : '0%'} label="STOPPED" colorClass="text-red-500" />
              </div>
            </div>
          </div>
        </DashCard>

        <DashCard delay={500} className="flex min-h-[490px] max-h-[490px] flex-col bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(255,255,255,0.98))]">
            <CardHeader title="Virtual Machine States" />

            <button
              type="button"
              onClick={() => openVmModal({ title: 'Running VMs', mode: 'state', vmState: 'running' })}
              className="block w-full rounded-2xl border border-emerald-100 bg-[linear-gradient(135deg,rgba(240,253,244,0.95),rgba(255,255,255,0.98))] px-4 py-2.5 text-left shadow-[0_12px_30px_rgba(16,185,129,0.08)] transition hover:-translate-y-0.5 hover:border-emerald-200"
            >
              <div className="flex items-center justify-between gap-4 text-gray-600">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-4 w-4 rounded-full bg-[radial-gradient(circle_at_30%_30%,#bbf7d0,#22c55e)] shadow-[0_0_16px_rgba(34,197,94,0.3)]" />
                  <span className="min-w-0 text-left">
                    <span className="text-sm font-bold text-gray-800">Running VMs </span>
                    <span className="text-xs font-semibold text-blue-600">(click to view)</span>
                  </span>
                </div>
                <span className="whitespace-nowrap rounded-full bg-white/80 px-3 py-1 text-sm font-bold text-emerald-700 shadow-sm">{vmRunning} / {vmCount}</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/80">
                <div className="h-full rounded-full" style={{ width: `${vmCount > 0 ? (vmRunning / vmCount) * 100 : 0}%`, background: 'linear-gradient(90deg, #72bf6a 0%, #9ccb88 100%)' }} />
              </div>
            </button>

            <button
              type="button"
              onClick={() => openVmModal({ title: 'Stopped VMs', mode: 'state', vmState: 'stopped' })}
              className="mt-3 block w-full rounded-2xl border border-rose-100 bg-[linear-gradient(135deg,rgba(255,241,242,0.95),rgba(255,255,255,0.98))] px-4 py-2.5 text-left shadow-[0_12px_30px_rgba(244,63,94,0.08)] transition hover:-translate-y-0.5 hover:border-rose-200"
            >
              <div className="flex items-center justify-between gap-4 text-gray-600">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="h-4 w-4 rounded-full bg-[radial-gradient(circle_at_30%_30%,#fecdd3,#f43f5e)] shadow-[0_0_16px_rgba(244,63,94,0.22)]" />
                  <span className="min-w-0 text-left">
                    <span className="text-sm font-bold text-gray-800">Stopped VMs </span>
                    <span className="text-xs font-semibold text-blue-600">(click to view)</span>
                  </span>
                </div>
                <span className="whitespace-nowrap rounded-full bg-white/80 px-3 py-1 text-sm font-bold text-rose-700 shadow-sm">{vmStopped} / {vmCount}</span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-white/80">
                <div className="h-full rounded-full" style={{ width: `${vmCount > 0 ? (vmStopped / vmCount) * 100 : 0}%`, background: 'linear-gradient(90deg, #d75d45 0%, #f0b6b6 100%)' }} />
              </div>
            </button>

            <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-[24px] border border-slate-200/80 bg-white/80 p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
              <div className="text-xs font-bold uppercase tracking-widest text-gray-500">
                VMs By Server <span className="ml-3 text-sm normal-case tracking-normal text-blue-600">(click any row to drill in)</span>
              </div>
              <div className="mt-3 flex-1 space-y-2.5 overflow-y-auto pr-1">
                {hostVmRows.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center text-slate-500">
                    Waiting for host data...
                  </div>
                )}

                {hostVmRows.map((row, index) => (
                  <button
                    key={`${row.label}-${index}`}
                    type="button"
                    onClick={() => openVmModal({ title: `${row.label} VMs`, mode: 'host', hostLabel: row.label })}
                    className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-[linear-gradient(135deg,#ffffff,#f8fafc)] px-4 py-2 text-left transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-gray-800">{row.label}</div>
                      <div className="mt-0.5 text-xs text-gray-500">
                        Mem: {formatWholePercent(row.memPct ?? 0)} · Total VMs: {row.total}
                      </div>
                      <ProgressBar pct={row.memPct ?? 0} color="#7c3aed" className="mt-1.5" />
                    </div>
                    <div className="flex items-center gap-4 text-sm font-bold">
                      <span className="flex items-center gap-1.5 text-green-600">
                        <span className="h-3 w-3 rounded-full bg-green-500" />
                        {row.runningCount}
                      </span>
                      <span className="flex items-center gap-1.5 text-red-500">
                        <span className="h-3 w-3 rounded-full bg-red-400" />
                        {row.stoppedCount}
                      </span>
                      {row.suspendedCount > 0 && (
                        <span className="flex items-center gap-1.5 text-amber-500">
                          <span className="h-3 w-3 rounded-full bg-amber-400" />
                          {row.suspendedCount}
                        </span>
                      )}
                      <span className="text-xs font-semibold text-blue-600">details</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
        </DashCard>
      </div>

      <MemoryVmModal
        title={modalState.title}
        items={modalItems}
        isOpen={modalState.isOpen}
        onClose={() => setModalState({ isOpen: false, title: '', mode: null, hostLabel: null, vmState: null })}
      />
    </section>
  )
}
