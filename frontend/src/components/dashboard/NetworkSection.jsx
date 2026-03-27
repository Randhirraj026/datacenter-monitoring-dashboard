import { useEffect, useRef } from 'react'
import { Chart, registerables } from 'chart.js'
import DashCard, { CardHeader, StatsGrid, StatItem } from '../ui/DashCard'
import Badge from '../ui/Badge'
import SectionHeader from '../ui/SectionHeader'

Chart.register(...registerables)

const SERVER_DELAYS = [1600, 1700, 1800]

function NetworkServerCard({ serverName, delay, idx }) {
  const chartRef  = useRef(null)
  const chartInst = useRef(null)
  const rxRef     = useRef(null)
  const txRef     = useRef(null)

  useEffect(() => {
    const ctx = chartRef.current
    if (!ctx) return

    const labels  = Array.from({ length: 24 }, (_, i) => `-${24 - i}m`)
    const rxData  = Array(24).fill(0).map(() => parseFloat((Math.random() * 8 + 2).toFixed(1)))
    const txData  = Array(24).fill(0).map(() => parseFloat((Math.random() * 5 + 1.5).toFixed(1)))

    if (rxRef.current) rxRef.current.textContent  = rxData[rxData.length - 1] + ' Gbps'
    if (txRef.current) txRef.current.textContent  = txData[txData.length - 1] + ' Gbps'

    if (chartInst.current) {
      chartInst.current.data.datasets[0].data = rxData
      chartInst.current.data.datasets[1].data = txData
      chartInst.current.update()
      return
    }

    chartInst.current = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'RX',
            data: rxData,
            borderColor: '#00c853',
            backgroundColor: 'rgba(0,200,83,0.08)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 2,
          },
          {
            label: 'TX',
            data: txData,
            borderColor: '#0066ff',
            backgroundColor: 'rgba(0,102,255,0.06)',
            borderWidth: 2,
            fill: true,
            tension: 0.4,
            pointRadius: 2,
          },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } },
          x: { grid: { display: false }, ticks: { maxTicksLimit: 6, font: { size: 9 } } },
        },
      },
    })

    return () => { chartInst.current?.destroy(); chartInst.current = null }
  }, [serverName])

  return (
    <DashCard delay={delay}>
      <CardHeader
        title={`${serverName} Network`}
        badge={<Badge variant="info">Active</Badge>}
      />
      <div style={{ height: 250 }} className="relative">
        <canvas ref={chartRef} />
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4">
        <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
          <div ref={rxRef} className="text-lg font-extrabold text-green-600">–</div>
          <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mt-0.5">RX (Gbps)</div>
        </div>
        <div className="bg-gray-50 rounded-xl p-3 text-center border border-gray-100">
          <div ref={txRef} className="text-lg font-extrabold text-blue-600">–</div>
          <div className="text-xs text-gray-500 uppercase tracking-wide font-medium mt-0.5">TX (Gbps)</div>
        </div>
      </div>
    </DashCard>
  )
}

export default function NetworkSection({ data = {} }) {
  const serverNames = data.serverNames || ['Server 1', 'Server 2', 'Server 3']

  return (
    <section className="mb-12">
      <SectionHeader icon="🖧" title="Individual Server Network Performance" />
      <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))' }}>
        {serverNames.map((name, i) => (
          <NetworkServerCard key={i} serverName={name} delay={SERVER_DELAYS[i] || 1600 + i * 100} idx={i} />
        ))}
      </div>
    </section>
  )
}
