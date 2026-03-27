import { useEffect } from 'react'
import { exportRowsToCsv } from '../../services/superAdminApi'

const RANGE_OPTIONS = [
  { value: '15m', label: 'Last 15 Min' },
  { value: '1h', label: 'Last 1 Hr' },
  { value: '6h', label: 'Last 6 Hr' },
  { value: '24h', label: 'Last 24 Hr' },
  { value: '7d', label: 'Last 7 Days' },
]

function formatCellValue(key, value) {
  if (key === 'timestamp' && value) {
    return new Date(value).toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  }

  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (value == null || value === '') return '-'
  return value
}

export default function SuperAdminDetailsModal({
  open,
  details,
  loading,
  error,
  section,
  range,
  sort,
  page,
  onClose,
  onRangeChange,
  onSortChange,
  onPageChange,
}) {
  useEffect(() => {
    if (!open) return undefined

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open) return null

  const rows = details?.rows || []
  const columns = details?.columns || []
  const total = Number(details?.total || 0)
  const pageSize = Number(details?.pageSize || 50)
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const canGoPrev = page > 1
  const canGoNext = page < totalPages

  return (
    <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-slate-950/45 px-4 py-6 backdrop-blur-sm">
      <div className="flex max-h-[90vh] w-full max-w-7xl flex-col overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-[0_30px_120px_rgba(15,23,42,0.24)]">
        <div className="flex flex-col gap-4 border-b border-slate-200 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.28em] text-slate-400">SuperAdmin Detail View</div>
            <h3 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
              {details?.title || 'Detailed Records'}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Section: <span className="font-semibold text-slate-700">{section}</span>
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <select
              value={range}
              onChange={(event) => onRangeChange(event.target.value)}
              className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => onSortChange(sort === 'desc' ? 'asc' : 'desc')}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Sort: {sort === 'desc' ? 'Newest First' : 'Oldest First'}
            </button>

            <button
              type="button"
              onClick={() => exportRowsToCsv(`superadmin-${section}-${range}.csv`, rows)}
              disabled={!rows.length}
              className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              Export CSV
            </button>

            <button
              type="button"
              onClick={onClose}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-b border-slate-100 bg-slate-50/70 px-6 py-3 text-sm text-slate-500">
          <div>{loading ? 'Loading records from DB...' : `${total} total records`}</div>
          <div>Stored every 2 minutes</div>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {loading ? (
            <div className="flex min-h-[320px] items-center justify-center text-sm font-semibold text-slate-500">
              Fetching detailed records...
            </div>
          ) : error ? (
            <div className="flex min-h-[320px] items-center justify-center px-6 text-center text-sm font-semibold text-red-500">
              {error}
            </div>
          ) : !rows.length ? (
            <div className="flex min-h-[320px] items-center justify-center px-6 text-center text-sm font-semibold text-slate-400">
              No data available for the selected section and time range.
            </div>
          ) : (
            <div className="overflow-auto px-6 py-5">
              <table className="min-w-full border-separate border-spacing-0 overflow-hidden rounded-3xl border border-slate-200">
                <thead className="sticky top-0 z-10 bg-slate-900 text-left text-xs uppercase tracking-[0.18em] text-slate-200">
                  <tr>
                    {columns.map((column) => (
                      <th key={column.key} className="border-b border-slate-800 px-4 py-4 font-bold">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white text-sm text-slate-700">
                  {rows.map((row, rowIndex) => (
                    <tr key={`${row.timestamp || rowIndex}-${rowIndex}`} className={rowIndex % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                      {columns.map((column) => (
                        <td key={column.key} className="border-b border-slate-100 px-4 py-3 align-top">
                          {formatCellValue(column.key, row[column.key])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-slate-500">
            Page <span className="font-semibold text-slate-700">{page}</span> of{' '}
            <span className="font-semibold text-slate-700">{totalPages}</span>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={!canGoPrev}
              onClick={() => onPageChange(page - 1)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              disabled={!canGoNext}
              onClick={() => onPageChange(page + 1)}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
