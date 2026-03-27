export default function RangeSelector({ value, onChange }) {
  const options = [
    { value: '24h', label: 'Next 24 Hours' },
    { value: '7d', label: 'Next 7 Days' }
  ];

  return (
    <div className="flex bg-slate-100/80 p-1 rounded-xl w-fit border border-slate-200/50">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 rounded-lg text-sm font-bold transition-all ${
            value === opt.value
              ? 'bg-white text-blue-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
