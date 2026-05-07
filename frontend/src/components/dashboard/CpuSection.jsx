import { useEffect, useMemo, useRef, useState } from 'react'
import { Chart } from 'chart.js'
import DashCard, { CardHeader, StatItem } from '../ui/DashCard'
import GaugeChart from '../ui/GaugeChart'
import Badge, { getBadgeVariant } from '../ui/Badge'
import ProgressBar from '../ui/ProgressBar'
import SectionHeader from '../ui/SectionHeader'
import HostDetailsModal from '../ui/HostDetailsModal'
import HistoryRangeSelect from '../ui/HistoryRangeSelect'
import { mapIpName, getUniqueHostDisplayName } from '../../services/ipMapper'
import { formatWholePercent } from '../../services/numberFormat'
import { average, filterRowsByRange, latestByKey } from '../../services/superAdminHistory'

export default function CpuSection({ data = {}, getHistoryRange, setHistoryRange }) {
  const coreChartRef = useRef(null)
  const coreChartInst = useRef(null)
  const [selectedHost, setSelectedHost] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)

  const historyRows = data.history?.hostMetrics || []
  const hostMetaMap = useMemo(() => new Map((data.hosts || []).map((host) => [host.hostId, host])), [data.hosts])

  const cpuOverallRange = getHistoryRange?.('cpu_overall') || '1h'
  const cpuChartRange = getHistoryRange?.('cpu_hosts_chart') || '1h'
  const cpuStatusRange = getHistoryRange?.('cpu_host_status') || '1h'

  const overallRows = useMemo(() => filterRowsByRange(historyRows, cpuOverallRange), [historyRows, cpuOverallRange])
  const chartHosts = useMemo(() => {
    if (!historyRows.length) return data.hosts || []

    return latestByKey(filterRowsByRange(historyRows, cpuChartRange), 'hostId').map((row) => ({
      ...hostMetaMap.get(row.hostId),
      name: row.hostName,
      cpuPct: row.cpuUsagePct,
      memPct: row.memoryUsagePct,
      displayName: getUniqueHostDisplayName({ name: row.hostName, hostId: row.hostId }, data.hosts || []),
    }))
  }, [cpuChartRange, data.hosts, historyRows, hostMetaMap])
  const statusHosts = useMemo(() => {
    if (!historyRows.length) return data.hosts || []

    return latestByKey(filterRowsByRange(historyRows, cpuStatusRange), 'hostId').map((row) => ({
      ...hostMetaMap.get(row.hostId),
      name: row.hostName,
      cpuPct: row.cpuUsagePct,
      memPct: row.memoryUsagePct,
      displayName: getUniqueHostDisplayName({ name: row.hostName, hostId: row.hostId }, data.hosts || []),
    }))
  }, [cpuStatusRange, data.hosts, historyRows, hostMetaMap])

  useEffect(() => {
    const ctx = coreChartRef.current
    if (!ctx) return
    if (!chartHosts.length) return

    const labels = chartHosts.map((h, i) => h.displayName || mapIpName(h.name) || `Host ${i + 1}`)
    const cpuData = chartHosts.map((h) => h.cpuPct ?? 0)
    const memData = chartHosts.map((h) => h.memPct ?? 0)

    if (coreChartInst.current) {
      coreChartInst.current.data.labels = labels
      coreChartInst.current.data.datasets[0].data = cpuData
      coreChartInst.current.data.datasets[1].data = memData
      coreChartInst.current.update()
      return
    }

    coreChartInst.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'CPU %',
            data: cpuData,
            backgroundColor: 'rgba(0,102,255,0.7)',
            borderRadius: 6,
          },
          {
            label: 'Memory %',
            data: memData,
            backgroundColor: 'rgba(0,194,255,0.6)',
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: true, position: 'top' } },
        scales: {
          y: { beginAtZero: true, max: 100, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } },
        },
      },
    })

    return () => {
      coreChartInst.current?.destroy()
      coreChartInst.current = null
    }
  }, [chartHosts])

  const cpuPct = overallRows.length ? average(overallRows, 'cpuUsagePct') : (data.cpuPct ?? 0)
  const badgeVariant = getBadgeVariant(cpuPct, 70, 90)
  const badgeLabel = cpuPct >= 90 ? 'Critical' : cpuPct >= 70 ? 'High' : 'Normal'
  const formatPct = (value) => formatWholePercent(value).replace('%', '')

  return (
    <section className="mb-12">
      <SectionHeader icon="🖥️" title="CPU & Processor Metrics" />
      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
        <DashCard delay={0}>
          <CardHeader
            title="Overall CPU Load"
            actions={setHistoryRange ? <HistoryRangeSelect value={cpuOverallRange} onChange={(value) => setHistoryRange('cpu_overall', value)} /> : null}
            badge={<Badge variant={badgeVariant}>{badgeLabel}</Badge>}
          />
          <GaugeChart
            pct={cpuPct}
            value={formatWholePercent(cpuPct)}
            label="Average Load"
            gradientId="cpuGradient"
            gradientColors={['#0066ff', '#00c2ff']}
          />
          <div className="mt-6 flex justify-center">
            <div className="flex gap-6">
              <StatItem value={data.cpuCores} label="Total Cores" />
              <StatItem value={data.cpuSpeed ?? null} label="Speed (GHz)" />
              <StatItem value={data.hostsOnline} label="Hosts Online" />
            </div>
          </div>
        </DashCard>

        <DashCard delay={100}>
          <CardHeader
            title="Per-Host CPU & Memory"
            actions={setHistoryRange ? <HistoryRangeSelect value={cpuChartRange} onChange={(value) => setHistoryRange('cpu_hosts_chart', value)} /> : null}
          />
          <div className="chart-wrap mt-20" style={{ height: '220px' }}>
            <canvas ref={coreChartRef} />
          </div>
        </DashCard>

        <DashCard delay={200}>
          <CardHeader
            title="Host Status"
            actions={setHistoryRange ? <HistoryRangeSelect value={cpuStatusRange} onChange={(value) => setHistoryRange('cpu_host_status', value)} /> : null}
          />
          <div className="mt-14 flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
            {statusHosts.length === 0 && (
              <div className="py-1 text-center text-gray-400">Loading host data...</div>
            )}
            {statusHosts.map((h, i) => (
              <div
                key={i}
                onClick={() => {
                  setSelectedHost(h)
                  setIsModalOpen(true)
                }}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3 transition-all hover:border-blue-300 hover:bg-blue-50 hover:shadow-md"
              >
                <div className="flex flex-shrink-0 gap-1.5">
                  <div className="h-2 w-2 rounded-full animate-led" style={{ background: '#00c853', boxShadow: '0 0 6px #00c853' }} />
                  <div className="h-2 w-2 rounded-full animate-led" style={{ background: '#0066ff', boxShadow: '0 0 6px #0066ff', animationDelay: '.3s' }} />
                </div>
                  <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-gray-800">{h.displayName || mapIpName(h.name) || `Host ${i + 1}`}</div>
                  <div className="mt-0.5 text-xs text-gray-500">CPU: {formatPct(h.cpuPct)}% | Mem: {formatPct(h.memPct)}%</div>
                  <ProgressBar pct={Number(h.cpuPct ?? 0)} color="#0066ff" className="mt-1.5" />
                </div>
                <div className="flex-shrink-0 text-right">
                  <div className="text-sm font-bold text-blue-600">{formatPct(h.cpuPct)}%</div>
                  <div className="text-xs text-gray-400">CPU</div>
                </div>
              </div>
            ))}
          </div>
        </DashCard>

        <HostDetailsModal
          host={selectedHost}
          iloServers={data.iloServers || []}
          storageUsedTB={data.storageUsedTB}
          storageTotalTB={data.storageTotalTB}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false)
            setSelectedHost(null)
          }}
        />
      </div>
    </section>
  )
}
