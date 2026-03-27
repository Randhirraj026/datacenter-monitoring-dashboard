export default function MetricSelector({ value, onChange }) {
  const options = [
    { value: 'cpu', label: 'CPU Usage %' },
    { value: 'memory', label: 'Memory Usage %' },
    { value: 'power', label: 'Power (kW)' },
    { value: 'temperature', label: 'Temp (°C)' }
  ];

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-xl text-sm font-semibold transition-all ${
            value === opt.value
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
