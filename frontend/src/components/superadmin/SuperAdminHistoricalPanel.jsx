import { useState } from 'react'

export const SUPERADMIN_RANGE_OPTIONS = [
  { value: '15m', label: 'Last 15 Min' },
  { value: '1h', label: 'Last 1 Hr' },
  { value: '6h', label: 'Last 6 Hr' },
  { value: '24h', label: 'Last 24 Hr' },
  { value: '7d', label: 'Last 7 Days' },
  { value: 'custom', label: 'Custom Range' },
]

export default function SuperAdminHistoricalPanel({
  title,
  subtitle,
  range,
  onRangeChange,
  hostId,
  onHostChange,
  hostOptions = [],
  loading,
  error,
  empty,
  emptyText,
  children,
  footer,
  customFrom,
  customTo,
  onCustomDateChange,
}) {
  const [showCustomPicker, setShowCustomPicker] = useState(false)

  return (
    <section className="rounded-[30px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">{title}</div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">{subtitle}</h2>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          <select
            value={range}
            onChange={(event) => {
              const val = event.target.value
              onRangeChange(val)
              if (val === 'custom') {
                setShowCustomPicker(true)
              } else {
                setShowCustomPicker(false)
              }
            }}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            {SUPERADMIN_RANGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          {range === 'custom' && (
            <div className="relative flex items-center">
              <button
                type="button"
                onClick={() => setShowCustomPicker((prev) => !prev)}
                className="rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-700 transition hover:bg-blue-100"
              >
                {customFrom && customTo ? 'Dates Set' : 'Select Dates'}
              </button>

              {showCustomPicker && (
                <div className="absolute right-0 top-[calc(100%+8px)] z-[200] flex w-72 flex-col gap-4 rounded-3xl border border-slate-200/80 bg-white/95 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.15)] backdrop-blur-xl">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Custom Window</div>
                  
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-500">From:</label>
                    <input
                      type="datetime-local"
                      value={customFrom || ''}
                      onChange={(e) => onCustomDateChange?.(e.target.value, customTo)}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold text-slate-500">To:</label>
                    <input
                      type="datetime-local"
                      value={customTo || ''}
                      onChange={(e) => onCustomDateChange?.(customFrom, e.target.value)}
                      className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:bg-white focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                  
                  <button
                    type="button"
                    onClick={() => setShowCustomPicker(false)}
                    className="mt-1 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 shadow-sm"
                  >
                    Apply Filter
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {typeof onHostChange === 'function' && hostOptions.length ? (
        <div className="mt-4 flex flex-wrap gap-3 border-b border-slate-100 pb-4">
          <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            <input
              type="radio"
              name={`${title}-host`}
              value=""
              checked={!hostId}
              onChange={() => onHostChange('')}
              className="h-4 w-4 accent-blue-600"
            />
            <span>All Hosts</span>
          </label>

          {hostOptions.map((host) => (
            <label key={host.id} className="flex cursor-pointer items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              <input
                type="radio"
                name={`${title}-host`}
                value={host.id}
                checked={String(hostId) === String(host.id)}
                onChange={() => onHostChange(String(host.id))}
                className="h-4 w-4 accent-blue-600"
              />
              <span>{host.name}</span>
            </label>
          ))}
        </div>
      ) : null}

      <div className="mt-5 min-h-[340px]">
        {loading ? (
          <div className="flex min-h-[300px] items-center justify-center text-sm font-semibold text-slate-500">
            Loading historical data from DB...
          </div>
        ) : error ? (
          <div className="flex min-h-[300px] items-center justify-center text-center text-sm font-semibold text-red-500">
            {error}
          </div>
        ) : empty ? (
          <div className="flex min-h-[300px] items-center justify-center text-center text-sm font-semibold text-slate-400">
            {emptyText}
          </div>
        ) : (
          children
        )}
      </div>

      {footer ? <div className="mt-4 border-t border-slate-100 pt-4">{footer}</div> : null}
    </section>
  )
}
