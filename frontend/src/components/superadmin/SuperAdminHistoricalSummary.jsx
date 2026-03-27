function formatValue(value, suffix = '') {
  if (value == null || value === '') return '-'
  return `${value}${suffix}`
}

export default function SuperAdminHistoricalSummary({ summary = {}, lastSnapshotAt, loading }) {
  const cards = [
    { label: 'Hosts', value: summary?.totalHosts },
    { label: 'VMs', value: summary?.totalVms },
    { label: 'CPU Average', value: summary?.cpuAverage, suffix: '%' },
    { label: 'Memory Average', value: summary?.memoryAverage, suffix: '%' },
    { label: 'Storage Total', value: summary?.totalStorage },
    { label: 'Avg Power', value: summary?.avgPowerKw, suffix: ' kW' },
  ]

  return (
    <section className="mb-8 rounded-[32px] border border-slate-200/80 bg-white/92 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Historical SuperAdmin</div>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Database Analytics Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">Every chart on this page is rendered from 2-minute interval DB snapshots.</p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-600">
          Last DB snapshot: {lastSnapshotAt ? new Date(lastSnapshotAt).toLocaleString() : 'Not available'}
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-6">
        {cards.map((card) => (
          <div key={card.label} className="rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
            <div className="text-xs font-bold uppercase tracking-[0.22em] text-slate-400">{card.label}</div>
            <div className="mt-3 text-3xl font-black tracking-tight text-slate-900">
              {loading ? '...' : formatValue(card.value, card.suffix)}
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
