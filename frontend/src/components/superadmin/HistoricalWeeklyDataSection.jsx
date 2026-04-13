import { useEffect, useMemo, useState } from 'react'
import { Bar } from 'react-chartjs-2'
import { useArchiveFolders, useArchiveTableData } from '../../hooks/useWeeklyArchiveData'

const SECTION_OPTIONS = [
  { value: 'cpu', label: 'CPU & Processor Metrics', tables: ['host_metrics'], preferredColumns: ['cpu_usage_pct'] },
  { value: 'memory', label: 'Memory Statistics', tables: ['host_metrics'], preferredColumns: ['memory_usage_pct'] },
  { value: 'power', label: 'Power Consumption', tables: ['host_metrics'], preferredColumns: ['power_kw'] },
  { value: 'temperature', label: 'Temperature Records', tables: ['host_metrics'], preferredColumns: ['temperature_c'] },
  { value: 'storage', label: 'Storage Management', tables: ['datastore_metrics'], preferredColumns: ['used_space_gb', 'free_space_gb'] },
  { value: 'alerts', label: 'Alerts', tables: ['alerts'], preferredColumns: [] },
  { value: 'network', label: 'Network Performance', tables: ['network_metrics'], preferredColumns: [] },
  { value: 'ilo', label: 'iLO Hardware Monitor', tables: ['ilo_server_metrics'], preferredColumns: ['power_kw', 'inlet_temp_c'] },
  { value: 'rdu', label: 'Smart Rack Monitoring', tables: ['rdu_snapshots'], preferredColumns: ['rack_front_temp_c', 'humidity_pct'] },
]

function prettifyLabel(value = '') {
  return String(value)
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatCellValue(value) {
  if (value == null) return '-'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function findFolderTables(folders, selectedFolder) {
  return folders.find((item) => item.folder === selectedFolder)?.tables || []
}

function resolveTableForSection(folders, selectedFolder, selectedSection) {
  const folderTables = findFolderTables(folders, selectedFolder)
  const sectionConfig = SECTION_OPTIONS.find((section) => section.value === selectedSection)
  if (!sectionConfig) return ''

  return sectionConfig.tables.find((table) => folderTables.includes(table)) || ''
}

function pickAxisKey(columns = [], timestampColumn) {
  if (timestampColumn && columns.includes(timestampColumn)) return timestampColumn

  const preferredKeys = ['ts', 'timestamp', 'created_at', 'updated_at', 'date', 'id']
  return preferredKeys.find((key) => columns.includes(key)) || columns[0] || ''
}

function pickNumericKeys(rows = [], columns = [], preferredColumns = []) {
  const numericColumns = columns.filter((column) =>
    rows.some((row) => typeof row[column] === 'number' && Number.isFinite(row[column]))
  )

  const preferred = preferredColumns.filter((column) => numericColumns.includes(column))
  if (preferred.length) return preferred.slice(0, 2)
  return numericColumns.slice(0, 2)
}

function buildChartData(rows = [], columns = [], timestampColumn, sectionValue) {
  const sectionConfig = SECTION_OPTIONS.find((section) => section.value === sectionValue)
  const axisKey = pickAxisKey(columns, timestampColumn)
  const numericKeys = pickNumericKeys(rows, columns, sectionConfig?.preferredColumns || []).filter((key) => key !== axisKey)

  if (!axisKey || !numericKeys.length) {
    return null
  }

  const palette = [
    { border: '#2563eb', background: 'rgba(37,99,235,0.22)' },
    { border: '#16a34a', background: 'rgba(22,163,74,0.22)' },
  ]

  const sampleRows = rows.slice(0, 40)

  return {
    labels: sampleRows.map((row, index) => {
      const value = row[axisKey]
      return value != null ? String(value) : `Row ${index + 1}`
    }),
    datasets: numericKeys.map((key, index) => ({
      label: prettifyLabel(key),
      data: sampleRows.map((row) => row[key] ?? null),
      borderColor: palette[index % palette.length].border,
      backgroundColor: palette[index % palette.length].background,
      borderRadius: 10,
    })),
  }
}

function getDefaultFilterWindow(selectedFolder) {
  const [start] = String(selectedFolder || '').split('_to_')
  if (!start) {
    return { customFrom: '', customTo: '' }
  }

  const normalizedStart = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}$/.test(start)
    ? start.replace(/^(.{13})-(\d{2})$/, '$1:$2')
    : /^\d{4}-\d{2}-\d{2}$/.test(start)
      ? `${start}T00:00`
      : ''
  const from = normalizedStart
  const toDate = normalizedStart ? new Date(`${normalizedStart}:00`) : new Date(Number.NaN)
  if (Number.isNaN(toDate.getTime())) {
    return { customFrom: '', customTo: '' }
  }

  toDate.setDate(toDate.getDate() + 6)
  const yyyy = toDate.getFullYear()
  const mm = String(toDate.getMonth() + 1).padStart(2, '0')
  const dd = String(toDate.getDate()).padStart(2, '0')
  const to = `${yyyy}-${mm}-${dd}T23:59`

  return { customFrom: from, customTo: to }
}

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      labels: {
        color: '#475569',
      },
    },
  },
  scales: {
    x: {
      ticks: {
        color: '#64748b',
      },
      grid: {
        display: false,
      },
    },
    y: {
      beginAtZero: true,
      ticks: {
        color: '#64748b',
      },
      grid: {
        color: 'rgba(148,163,184,0.16)',
      },
    },
  },
}

export default function HistoricalWeeklyDataSection() {
  const { folders, loading: foldersLoading, error: foldersError } = useArchiveFolders()
  const { data, loading: dataLoading, error: dataError, loadArchiveTable } = useArchiveTableData()
  const [selectedFolder, setSelectedFolder] = useState('')
  const [selectedSection, setSelectedSection] = useState('cpu')
  const [selectedTable, setSelectedTable] = useState('')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')

  useEffect(() => {
    if (!selectedFolder && folders.length) {
      setSelectedFolder(folders[0].folder)
    }
  }, [folders, selectedFolder])

  useEffect(() => {
    if (!selectedFolder) return

    const defaultWindow = getDefaultFilterWindow(selectedFolder)
    setCustomFrom((current) => current || defaultWindow.customFrom)
    setCustomTo((current) => current || defaultWindow.customTo)
  }, [selectedFolder])

  useEffect(() => {
    const resolvedTable = resolveTableForSection(folders, selectedFolder, selectedSection)
    setSelectedTable(resolvedTable)
  }, [folders, selectedFolder, selectedSection])

  const chartData = useMemo(
    () => buildChartData(data?.rows || [], data?.columns || [], data?.timestampColumn, selectedSection),
    [data, selectedSection]
  )

  const selectedSectionLabel = useMemo(
    () => SECTION_OPTIONS.find((section) => section.value === selectedSection)?.label || 'Section',
    [selectedSection]
  )

  async function handleViewData() {
    if (!selectedFolder || !selectedTable) return

    await loadArchiveTable(selectedFolder, selectedTable, {
      customFrom: customFrom || undefined,
      customTo: customTo || undefined,
    })
  }

  return (
    <section className="mb-6 rounded-[30px] border border-slate-200/80 bg-white/92 p-5 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex flex-col gap-4 border-b border-slate-100 pb-4">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.24em] text-slate-400">Historical Weekly Data</div>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900">
            View archived CSV data by dashboard section with a custom date filter
          </h2>
        </div>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <select
            value={selectedFolder}
            onChange={(event) => {
              setSelectedFolder(event.target.value)
              setCustomFrom('')
              setCustomTo('')
            }}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Select Week</option>
            {folders.map((folder) => (
              <option key={folder.folder} value={folder.folder}>
                {folder.folder}
              </option>
            ))}
          </select>

          <select
            value={selectedSection}
            onChange={(event) => setSelectedSection(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          >
            {SECTION_OPTIONS.map((section) => (
              <option key={section.value} value={section.value}>
                {section.label}
              </option>
            ))}
          </select>

          <input
            type="datetime-local"
            value={customFrom}
            onChange={(event) => setCustomFrom(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />

          <input
            type="datetime-local"
            value={customTo}
            onChange={(event) => setCustomTo(event.target.value)}
            className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />

          <button
            type="button"
            onClick={handleViewData}
            disabled={!selectedFolder || !selectedTable || dataLoading}
            className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {dataLoading ? 'Loading...' : 'View Data'}
          </button>
        </div>
      </div>

      {foldersLoading ? (
        <div className="py-10 text-center text-sm font-semibold text-slate-500">Loading archive folders...</div>
      ) : foldersError ? (
        <div className="py-10 text-center text-sm font-semibold text-red-500">{foldersError}</div>
      ) : !folders.length ? (
        <div className="py-10 text-center text-sm font-semibold text-slate-400">No archived weeks are available yet.</div>
      ) : !selectedTable ? (
        <div className="py-10 text-center text-sm font-semibold text-slate-400">
          The selected week does not contain archived CSV data for this section yet.
        </div>
      ) : (
        <div className="mt-5 grid gap-6 xl:grid-cols-[1.15fr,0.85fr]">
          <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
              <span>{selectedSectionLabel}</span>
              {data?.filteredRows != null ? (
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {data.filteredRows} of {data.totalRows} rows
                </span>
              ) : null}
            </div>

            {dataError ? (
              <div className="p-6 text-sm font-semibold text-red-500">{dataError}</div>
            ) : !data?.rows?.length ? (
              <div className="p-6 text-sm font-semibold text-slate-400">
                Choose a section and custom filter to load archived CSV rows from the selected week.
              </div>
            ) : (
              <div className="max-h-[420px] overflow-auto">
                <table className="min-w-full text-left text-sm text-slate-700">
                  <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      {data.columns.map((column) => (
                        <th key={column} className="px-4 py-3 font-bold">
                          {prettifyLabel(column)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, rowIndex) => (
                      <tr key={`${rowIndex}-${selectedSection}`} className="border-t border-slate-100">
                        {data.columns.map((column) => (
                          <td key={`${rowIndex}-${column}`} className="max-w-[260px] px-4 py-3 align-top text-xs text-slate-600">
                            <div className="truncate" title={formatCellValue(row[column])}>
                              {formatCellValue(row[column])}
                            </div>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="rounded-[26px] border border-slate-200 bg-white p-4">
            <div className="border-b border-slate-100 pb-3 text-sm font-bold text-slate-700">
              Section Chart
            </div>

            {!chartData ? (
              <div className="flex h-[360px] items-center justify-center text-center text-sm font-semibold text-slate-400">
                This archived section has no numeric columns in the selected custom range.
              </div>
            ) : (
              <div className="h-[360px] pt-4">
                <Bar data={chartData} options={chartOptions} />
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  )
}
