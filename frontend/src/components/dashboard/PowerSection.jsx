import { useEffect, useMemo, useRef } from 'react'
import { Chart, registerables } from 'chart.js'
import DashCard, { CardHeader, StatItem } from '../ui/DashCard'
import GaugeChart from '../ui/GaugeChart'
import Badge from '../ui/Badge'
import SectionHeader from '../ui/SectionHeader'
import HistoryRangeSelect from '../ui/HistoryRangeSelect'
import { mapIpName } from '../../services/ipMapper'
import { average, filterRowsByRange, latestByKey } from '../../services/superAdminHistory'

Chart.register(...registerables)

export default function PowerSection({ data = {}, getHistoryRange, setHistoryRange }) {
  const powerChartRef = useRef(null)
  const powerChartInst = useRef(null)
  const historyRows = data.history?.hostMetrics || []
  const overallPowerRows = data.history?.overallPowerHourly || []

  const totalRange = getHistoryRange?.('power_total') || '1h'
  const historyRange = getHistoryRange?.('power_history') || '1h'
  const psuRange = getHistoryRange?.('power_psu') || '1h'

  const totalRows = useMemo(() => filterRowsByRange(historyRows, totalRange), [historyRows, totalRange])
  const latestTotalRows = useMemo(() => {
    if (!totalRows.length) return []
    return latestByKey(totalRows, 'hostId')
  }, [totalRows])
  const historyChartRows = useMemo(() => {
    if (!overallPowerRows.length) {
      return (data.powerHistory || []).map((row) => ({ bucket: row.t, totalKw: row.v }))
    }
    return filterRowsByRange(overallPowerRows, historyRange, 'bucket')
  }, [data.powerHistory, historyRange, overallPowerRows])
  const latestPowerRows = useMemo(() => {
    if (!historyRows.length) {
      return (data.iloServers || []).map((server, index) => ({
        hostId: server.hostId ?? index,
        hostName: server.serverName || `Server ${index + 1}`,
        powerKw: server.power?.consumedWatts != null ? Number((server.power.consumedWatts / 1000).toFixed(2)) : null,
      }))
    }
    return latestByKey(filterRowsByRange(historyRows, psuRange), 'hostId')
  }, [data.iloServers, historyRows, psuRange])

  useEffect(() => {
    const ctx = powerChartRef.current
    if (!ctx) return undefined
    const history = historyChartRows.map((row) => ({ t: row.bucket, v: row.totalKw }))

    if (powerChartInst.current) {
      powerChartInst.current.data.labels = history.map((p) => p.t)
      powerChartInst.current.data.datasets[0].data = history.map((p) => p.v)
      powerChartInst.current.update()
      return undefined
    }

    powerChartInst.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels: history.map((p) => p.t),
        datasets: [
          {
            label: 'Power (kW)',
            data: history.map((p) => p.v),
            borderColor: '#00c853',
            backgroundColor: 'rgba(0,200,83,0.1)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } },
        },
      },
    })

    return () => {
      powerChartInst.current?.destroy()
      powerChartInst.current = null
    }
  }, [historyChartRows])

  const powerKW = latestTotalRows.length
    ? Number(latestTotalRows.reduce((sum, row) => sum + Number(row.powerKw || 0), 0).toFixed(2))
    : Number(data.powerKW ?? 0)
  const capacityKw = Number(data.powerCapKW ?? 0)
  const peakHistoryKw = historyChartRows.reduce((max, row) => Math.max(max, Number(row.totalKw || 0)), 0)
  const peak = capacityKw > 0 ? capacityKw : peakHistoryKw
  const pct = peak > 0 ? Number(Math.min((powerKW / peak) * 100, 100).toFixed(1)) : Number(data.powerPct ?? 0)
  const badgeVariant = pct >= 90 ? 'danger' : pct >= 75 ? 'warning' : 'success'
  const badgeLabel = pct >= 90 ? 'Critical' : pct >= 75 ? 'High' : 'Optimal'
  const iloServers = latestPowerRows.map((row) => ({
    serverName: row.hostName,
    reachable: true,
    psus: [],
    powerKw: row.powerKw,
  }))

  return (
    <section className="mb-12">
      <SectionHeader icon={'⚡'} title="Power Consumption" />
      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
        <DashCard delay={800}>
          <CardHeader
            title="Total Power Draw"
            actions={setHistoryRange ? <HistoryRangeSelect value={totalRange} onChange={(value) => setHistoryRange('power_total', value)} /> : null}
            badge={<Badge variant={badgeVariant}>{badgeLabel}</Badge>}
          />
          <GaugeChart
            pct={Math.min(pct, 100)}
            value={powerKW != null ? `${powerKW} kW` : '-'}
            label="Current Draw"
            gradientId="powerGradient"
            gradientColors={['#00c853', '#69f0ae']}
          />
          <div className="mt-12 flex justify-center">
            <div className="flex gap-6">
              <StatItem value={peak ? `${peak.toFixed(2)} kW` : null} label="Max Capacity" colorClass="text-blue-600" />
              <StatItem value={`${pct}%`} label="Utilization" colorClass="text-green-600" />
              <StatItem value={latestPowerRows.length} label="Servers" colorClass="text-orange-500" />
            </div>
          </div>
        </DashCard>

        <DashCard delay={900} className="flex h-full min-h-[430px] flex-col">
          <CardHeader
            title="Power History"
            actions={setHistoryRange ? <HistoryRangeSelect value={historyRange} onChange={(value) => setHistoryRange('power_history', value)} /> : null}
          />
          <div className="chart-wrap min-h-[320px] flex-1">
            {historyChartRows.length === 0 ? (
              <div className="flex h-full items-center justify-center text-gray-400">No power history available</div>
            ) : (
              <canvas ref={powerChartRef} />
            )}
          </div>
        </DashCard>

        <DashCard delay={1000}>
          <CardHeader
            title="Server Power Detail"
            actions={setHistoryRange ? <HistoryRangeSelect value={psuRange} onChange={(value) => setHistoryRange('power_psu', value)} /> : null}
          />
          <div className="flex h-80 flex-col gap-4 overflow-y-auto pr-1">
            {latestPowerRows.length === 0 && (
              <div className="py-10 text-center text-gray-400">Loading power data...</div>
            )}
            {iloServers.map((s, si) => (
              <div key={si} className="rounded-xl border border-gray-100 bg-gray-50 p-3.5">
                <div className="mb-4 text-sm font-bold text-gray-800">{mapIpName(s.serverName || `Server ${si + 1}`)}</div>
                <div className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="text-xs font-bold text-gray-700 mb-1">Recorded Draw</div>
                  <div className="text-base font-extrabold text-green-600">{s.powerKw != null ? `${s.powerKw} kW` : '-'}</div>
                  <div className="mt-0.5 text-xs font-semibold text-slate-500">Latest value in selected range</div>
                </div>
              </div>
            ))}
          </div>
        </DashCard>
      </div>
    </section>
  )
}
