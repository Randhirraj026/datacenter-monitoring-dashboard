import { useMemo } from 'react'
import { Bar, Line } from 'react-chartjs-2'
import DashCard, { CardHeader } from '../ui/DashCard'
import Badge from '../ui/Badge'
import SectionHeader from '../ui/SectionHeader'
import HistoryRangeSelect from '../ui/HistoryRangeSelect'
import { filterRowsByRange } from '../../services/superAdminHistory'

function EmptyState({ text }) {
  return <div className="flex h-full items-center justify-center py-16 text-sm text-gray-400">{text}</div>
}

function getColor(index, alpha = 1) {
  const colors = [
    `rgba(0, 102, 255, ${alpha})`,
    `rgba(0, 194, 255, ${alpha})`,
    `rgba(34, 197, 94, ${alpha})`,
    `rgba(245, 158, 11, ${alpha})`,
    `rgba(239, 68, 68, ${alpha})`,
    `rgba(124, 58, 237, ${alpha})`,
  ]

  return colors[index % colors.length]
}

function buildSeries(rows, key) {
  const grouped = new Map()

  rows.forEach((row) => {
    const list = grouped.get(row.hostName) || []
    list.push(row[key])
    grouped.set(row.hostName, list)
  })

  return Array.from(grouped.entries())
}

function buildLabels(rows, timeKey = 'ts') {
  const values = rows.map((row) => row[timeKey]).filter(Boolean)
  return Array.from(new Set(values)).map((value) => {
    if (timeKey === 'ts') {
      return String(value).replace('T', ' ').slice(0, 16)
    }
    return value
  })
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top',
      labels: {
        color: '#475569',
        usePointStyle: true,
        boxWidth: 10,
        font: { size: 11, weight: '600' },
      },
    },
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { color: '#64748b', maxRotation: 0, autoSkip: true, font: { size: 10 } },
    },
    y: {
      beginAtZero: true,
      ticks: { color: '#64748b' },
      grid: { color: 'rgba(148,163,184,0.16)' },
    },
  },
}

export default function SuperAdminHistorySection({ data = {}, getHistoryRange, setHistoryRange }) {
  const cpuRange = getHistoryRange?.('history_cpu') || '1h'
  const memoryRange = getHistoryRange?.('history_memory') || '1h'
  const datastoreRange = getHistoryRange?.('history_datastore') || '7d'
  const powerRange = getHistoryRange?.('history_power') || '1h'
  const vmRange = getHistoryRange?.('history_vm') || '1h'
  const hostMetrics = data?.history?.hostMetrics || []
  const datastoreUsage = data?.history?.datastoreUsage || []
  const powerRows = data?.history?.overallPowerHourly || []
  const vmLifecycle = data?.history?.vmLifecycle || []
  const cpuRows = filterRowsByRange(hostMetrics, cpuRange)
  const memoryRows = filterRowsByRange(hostMetrics, memoryRange)
  const datastoreRows = filterRowsByRange(datastoreUsage, datastoreRange)
  const filteredPowerRows = filterRowsByRange(powerRows, powerRange, 'bucket')
  const filteredVmLifecycle = filterRowsByRange(vmLifecycle.map((row) => ({ ...row, ts: `${row.statDate}T23:59:59` })), vmRange)

  const cpuHistoryData = useMemo(() => ({
    labels: buildLabels(cpuRows),
    datasets: buildSeries(cpuRows, 'cpuUsagePct').map(([label, values], index) => ({
      label,
      data: values,
      borderColor: getColor(index),
      backgroundColor: getColor(index, 0.12),
      pointRadius: 0,
      tension: 0.34,
      fill: false,
      borderWidth: 2.2,
    })),
  }), [cpuRows])

  const memoryHistoryData = useMemo(() => ({
    labels: buildLabels(memoryRows),
    datasets: buildSeries(memoryRows, 'memoryUsagePct').map(([label, values], index) => ({
      label,
      data: values,
      borderColor: getColor(index),
      backgroundColor: getColor(index, 0.12),
      pointRadius: 0,
      tension: 0.34,
      fill: false,
      borderWidth: 2.2,
    })),
  }), [memoryRows])

  const datastoreHistoryData = useMemo(() => {
    const grouped = new Map()

    datastoreRows.forEach((row) => {
        const list = grouped.get(row.datastoreName) || []
        list.push(row.usedPct)
        grouped.set(row.datastoreName, list)
    })

    return {
      labels: buildLabels(datastoreRows),
      datasets: Array.from(grouped.entries()).map(([label, values], index) => ({
        label,
        data: values,
        borderColor: getColor(index),
        backgroundColor: getColor(index, 0.12),
        pointRadius: 0,
        tension: 0.34,
        fill: false,
        borderWidth: 2.2,
      })),
    }
  }, [datastoreRows])

  const powerHistoryData = useMemo(() => ({
    labels: filteredPowerRows.map((row) => row.bucket),
    datasets: [
      {
        label: 'Power (kW)',
        data: filteredPowerRows.map((row) => row.totalKw),
        borderColor: 'rgba(34, 197, 94, 1)',
        backgroundColor: 'rgba(34, 197, 94, 0.14)',
        fill: true,
        pointRadius: 2,
        tension: 0.32,
        borderWidth: 2.4,
      },
    ],
  }), [filteredPowerRows])

  const vmLifecycleData = useMemo(() => ({
    labels: filteredVmLifecycle.map((row) => row.statDate),
    datasets: [
      {
        label: 'VMs Created',
        data: filteredVmLifecycle.map((row) => row.createdCount),
        backgroundColor: 'rgba(0, 102, 255, 0.78)',
        borderRadius: 8,
      },
      {
        label: 'VMs Deleted',
        data: filteredVmLifecycle.map((row) => row.deletedCount),
        backgroundColor: 'rgba(239, 68, 68, 0.72)',
        borderRadius: 8,
      },
    ],
  }), [filteredVmLifecycle])

  return (
    <section className="mb-12">
      <SectionHeader icon="📈" title="Historical Analytics" />
      <div className="grid gap-6 xl:grid-cols-2">
        <DashCard delay={1050} className="flex min-h-[360px] flex-col">
          <CardHeader
            title="CPU History"
            actions={setHistoryRange ? <HistoryRangeSelect value={cpuRange} onChange={(value) => setHistoryRange('history_cpu', value)} /> : null}
            badge={<Badge variant="info">History</Badge>}
          />
          <div className="chart-wrap min-h-[280px] flex-1">
            {cpuHistoryData.datasets.length === 0 ? <EmptyState text="No CPU history found in DB." /> : <Line data={cpuHistoryData} options={chartOptions} />}
          </div>
        </DashCard>

        <DashCard delay={1100} className="flex min-h-[360px] flex-col">
          <CardHeader
            title="Memory History"
            actions={setHistoryRange ? <HistoryRangeSelect value={memoryRange} onChange={(value) => setHistoryRange('history_memory', value)} /> : null}
            badge={<Badge variant="info">History</Badge>}
          />
          <div className="chart-wrap min-h-[280px] flex-1">
            {memoryHistoryData.datasets.length === 0 ? <EmptyState text="No memory history found in DB." /> : <Line data={memoryHistoryData} options={chartOptions} />}
          </div>
        </DashCard>

        <DashCard delay={1150} className="flex min-h-[360px] flex-col">
          <CardHeader
            title="Datastore History"
            actions={setHistoryRange ? <HistoryRangeSelect value={datastoreRange} onChange={(value) => setHistoryRange('history_datastore', value)} /> : null}
            badge={<Badge variant="default">History</Badge>}
          />
          <div className="chart-wrap min-h-[280px] flex-1">
            {datastoreHistoryData.datasets.length === 0 ? <EmptyState text="No datastore history found in DB." /> : <Line data={datastoreHistoryData} options={chartOptions} />}
          </div>
        </DashCard>

        <DashCard delay={1200} className="flex min-h-[360px] flex-col">
          <CardHeader
            title="Power History"
            actions={setHistoryRange ? <HistoryRangeSelect value={powerRange} onChange={(value) => setHistoryRange('history_power', value)} /> : null}
            badge={<Badge variant="success">History</Badge>}
          />
          <div className="chart-wrap min-h-[280px] flex-1">
            {powerHistoryData.datasets[0].data.length === 0 ? <EmptyState text="No power history found in DB." /> : <Line data={powerHistoryData} options={chartOptions} />}
          </div>
        </DashCard>

        <DashCard delay={1250} className="xl:col-span-2 flex min-h-[390px] flex-col">
          <CardHeader
            title="VM Created Day Wise"
            actions={setHistoryRange ? <HistoryRangeSelect value={vmRange} onChange={(value) => setHistoryRange('history_vm', value)} /> : null}
            badge={<Badge variant="warning">History</Badge>}
          />
          <div className="chart-wrap min-h-[300px] flex-1">
            {vmLifecycleData.labels.length === 0 ? <EmptyState text="No VM creation history found in DB." /> : <Bar data={vmLifecycleData} options={chartOptions} />}
          </div>
        </DashCard>
      </div>
    </section>
  )
}
