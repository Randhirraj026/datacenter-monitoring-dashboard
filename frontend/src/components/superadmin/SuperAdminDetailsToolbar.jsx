import { useState } from 'react'

const RANGE_OPTIONS = [
  { value: '15m', label: 'Last 15 Min' },
  { value: '1h', label: 'Last 1 Hr' },
  { value: '6h', label: 'Last 6 Hr' },
  { value: '24h', label: 'Last 24 Hr' },
  { value: '7d', label: 'Last 7 Days' },
]

const DETAIL_CARDS = [
  { section: 'cpu', title: 'CPU Metrics', description: '2-minute CPU utilization records from DB.' },
  { section: 'memory', title: 'Memory Metrics', description: 'Historical memory usage snapshots by host.' },
  { section: 'storage', title: 'Storage Metrics', description: 'Datastore capacity, used, free, and status records.' },
  { section: 'power', title: 'Power Metrics', description: 'Per-host power draw written from iLO snapshots.' },
  { section: 'temperature', title: 'Temperature Metrics', description: 'Inlet and thermal-related records by host.' },
  { section: 'vm', title: 'VM Activity', description: 'VM creation, deletion, and power-state changes.' },
  { section: 'alerts', title: 'Alert Records', description: 'Stored alert snapshots for the selected duration.' },
  { section: 'network', title: 'Network Records', description: 'Captured network inventory snapshots from DB.' },
  { section: 'ilo', title: 'iLO Hardware', description: 'Stored iLO hardware and health metrics snapshots.' },
]

export default function SuperAdminDetailsToolbar({ onOpen }) {
  const [selectedRanges, setSelectedRanges] = useState({})

  function handleRangeChange(section, range) {
    setSelectedRanges((current) => ({ ...current, [section]: '' }))
    if (range) onOpen(section, range)
  }

  return (
    <section className="mb-8 rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">Database Drilldown</div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">Open Detailed SuperAdmin Records</h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-500">
            Pick a time range for any section to open a DB-backed modal with 2-minute interval records.
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {DETAIL_CARDS.map((card) => (
          <div key={card.section} className="rounded-3xl border border-slate-200 bg-slate-50/85 p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-extrabold uppercase tracking-[0.2em] text-slate-700">{card.title}</div>
                <div className="mt-2 text-sm leading-6 text-slate-500">{card.description}</div>
              </div>
            </div>

            <div className="mt-4">
              <label className="mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400">
                Select Duration
              </label>
              <select
                value={selectedRanges[card.section] || ''}
                onChange={(event) => handleRangeChange(card.section, event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              >
                <option value="">Choose time range</option>
                {RANGE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
