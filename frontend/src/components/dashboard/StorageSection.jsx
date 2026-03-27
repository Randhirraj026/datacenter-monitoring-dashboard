import { useEffect, useMemo, useRef } from 'react'
import { Chart, registerables } from 'chart.js'
import DashCard, { CardHeader, StatItem } from '../ui/DashCard'
import Badge, { getBadgeVariant } from '../ui/Badge'
import SectionHeader from '../ui/SectionHeader'
import HistoryRangeSelect from '../ui/HistoryRangeSelect'
import { mapIpName } from '../../services/ipMapper'
import { filterRowsByRange, latestByKey } from '../../services/superAdminHistory'

Chart.register(...registerables)

function formatStorageValueTB(value) {
  if (value == null) return '-'
  return `${value.toFixed(2)}TB`
}

function normalizeDatastore(ds = {}, index = 0) {
  const totalGB = ds.totalCapacityGb ?? ds.totalCapacityGB ?? ds.capacityGB ?? 0
  const usedGB = ds.usedSpaceGb ?? ds.usedSpaceGB ?? 0
  const freeGB = ds.freeSpaceGb ?? ds.freeSpaceGB ?? Math.max(totalGB - usedGB, 0)
  const usedPct = ds.usedPct ?? ds.usagePct ?? ds.usagePercent ?? (totalGB > 0 ? Math.round((usedGB / totalGB) * 100) : 0)

  return {
    key: `${ds?.datastoreName || ds?.name || 'datastore'}-${index}`,
    name: mapIpName(ds?.datastoreName || ds?.name || `Datastore ${index + 1}`),
    usedGB,
    totalGB,
    freeGB,
    usedPct,
  }
}

export default function StorageSection({ data = {}, getHistoryRange, setHistoryRange }) {
  const storageChartRef = useRef(null)
  const storageChartInst = useRef(null)
  const historyRows = data.history?.datastoreUsage || []
  const chartRange = getHistoryRange?.('storage_chart') || '7d'
  const arrayRange = getHistoryRange?.('storage_arrays') || '7d'

  const chartRows = useMemo(() => {
    if (!historyRows.length) return (data.datastores || []).map(normalizeDatastore)
    return latestByKey(filterRowsByRange(historyRows, chartRange), 'datastoreId').map(normalizeDatastore)
  }, [chartRange, data.datastores, historyRows])
  const arrayRows = useMemo(() => {
    if (!historyRows.length) return (data.datastores || []).map(normalizeDatastore)
    return latestByKey(filterRowsByRange(historyRows, arrayRange), 'datastoreId').map(normalizeDatastore)
  }, [arrayRange, data.datastores, historyRows])

  useEffect(() => {
    const ctx = storageChartRef.current
    if (!ctx) return undefined

    const labels = chartRows.map((row) => row.name)
    const usedData = chartRows.map((row) => row.usedGB)
    const freeData = chartRows.map((row) => row.freeGB)

    if (storageChartInst.current) {
      storageChartInst.current.data.labels = labels
      storageChartInst.current.data.datasets[0].data = usedData
      storageChartInst.current.data.datasets[1].data = freeData
      storageChartInst.current.update()
      return undefined
    }

    storageChartInst.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Used (GB)', data: usedData, backgroundColor: 'rgba(76, 108, 231, 0.82)', borderRadius: 6, stack: 'storage' },
          { label: 'Free (GB)', data: freeData, backgroundColor: 'rgba(111, 194, 110, 0.86)', borderRadius: 6, stack: 'storage' },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { stacked: true, grid: { display: false } },
          y: { stacked: true, beginAtZero: true, grid: { color: 'rgba(148, 163, 184, 0.18)' } },
        },
      },
    })

    return () => {
      storageChartInst.current?.destroy()
      storageChartInst.current = null
    }
  }, [chartRows])

  const totalGB = arrayRows.reduce((sum, row) => sum + row.totalGB, 0)
  const usedGB = arrayRows.reduce((sum, row) => sum + row.usedGB, 0)
  const freeGB = arrayRows.reduce((sum, row) => sum + row.freeGB, 0)
  const pct = totalGB > 0
    ? Number(((usedGB / totalGB) * 100).toFixed(2))
    : Number(data.storagePct ?? 0)
  const badgeVariant = getBadgeVariant(pct, 75, 90)
  const badgeLabel = pct >= 90 ? 'Critical' : pct >= 75 ? 'High' : 'Normal'

  return (
    <section className="mb-12">
      <SectionHeader icon={'💿'} title="Storage Management" />
      <div className="grid gap-6 xl:grid-cols-[1.1fr_1.1fr]">
        <DashCard delay={400} className="flex h-full min-h-[430px] flex-col">
          <CardHeader
            title="Datastore Chart"
            actions={setHistoryRange ? <HistoryRangeSelect value={chartRange} onChange={(value) => setHistoryRange('storage_chart', value)} /> : null}
            badge={<Badge variant={badgeVariant}>{badgeLabel}</Badge>}
          />
          <div className="chart-wrap mt-5 min-h-[300px] flex-1">
            {chartRows.length === 0 ? (
              <div className="flex h-full items-center justify-center text-gray-400">No datastore data available</div>
            ) : (
              <canvas ref={storageChartRef} />
            )}
          </div>
        </DashCard>

        <DashCard delay={500} className="flex h-full min-h-[430px] flex-col">
          <CardHeader
            title="Storage Arrays"
            actions={setHistoryRange ? <HistoryRangeSelect value={arrayRange} onChange={(value) => setHistoryRange('storage_arrays', value)} /> : null}
          />
          <div className="mt-2 grid flex-1 gap-4 xl:grid-cols-[minmax(0,1.35fr)_220px]">
            <div className="flex min-h-0 flex-col rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">Datastore Usage</div>
                <div className="text-xs font-semibold text-slate-400">{arrayRows.length} items</div>
              </div>

              <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
                {arrayRows.length === 0 && (
                  <div className="flex flex-1 items-center justify-center py-12 text-center text-gray-400">
                    No datastore data available
                  </div>
                )}

                {arrayRows.map((row) => (
                  <div key={row.key} className="rounded-xl border border-white/80 bg-white px-3 py-3 shadow-sm">
                    <div className="mb-2 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-700">{row.name}</div>
                        <div className="mt-0.5 text-xs font-medium text-slate-400">{row.usedPct}% utilized</div>
                      </div>
                      <div className="whitespace-nowrap text-sm font-bold text-slate-800">{Math.round(row.usedGB)}GB / {Math.round(row.totalGB)}GB</div>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(row.usedPct, 100)}%`,
                          background: row.usedPct >= 60
                            ? 'linear-gradient(90deg, #4169e1 0%, #7aa2ff 100%)'
                            : 'linear-gradient(90deg, #58bd5f 0%, #97cf87 100%)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3">
              <StatItem value={formatStorageValueTB(totalGB / 1024)} label="Total Capacity" colorClass="text-blue-600" className="min-h-[84px]" />
              <StatItem value={formatStorageValueTB(usedGB / 1024)} label="Used" colorClass="text-red-500" className="min-h-[84px]" />
              <StatItem value={formatStorageValueTB(freeGB / 1024)} label="Available" colorClass="text-green-500" className="min-h-[84px]" />
              <StatItem value={arrayRows.length} label="Datastores" colorClass="text-amber-500" className="min-h-[84px]" />
            </div>
          </div>
        </DashCard>
      </div>
    </section>
  )
}
