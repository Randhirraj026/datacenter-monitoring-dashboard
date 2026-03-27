const OPTIONS = [
  { value: '1h', label: '1 Hour' },
  { value: '24h', label: '1 Day' },
  { value: '7d', label: '7 Days' },
]

export default function HistoryRangeSelect({ value = '1h', onChange }) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[0.72rem] font-semibold text-slate-600 outline-none transition focus:border-blue-400"
    >
      {OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
