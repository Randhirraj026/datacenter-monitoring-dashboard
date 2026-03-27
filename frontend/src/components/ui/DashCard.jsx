export default function DashCard({ children, delay = 0, className = '' }) {
  return (
    <div className={`dash-card ${className}`} data-delay={delay}>
      {children}
    </div>
  )
}

export function CardHeader({ title, badge, actions }) {
  return (
    <div className="flex justify-between items-center mb-5">
      <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">{title}</span>
      <div className="flex items-center gap-2">
        {actions}
        {badge}
      </div>
    </div>
  )
}

export function StatsGrid({ children }) {
  return (
    <div className="grid grid-cols-2 gap-3 mt-4 sm:grid-cols-4">
      {children}
    </div>
  )
}

export function StatItem({ value, label, colorClass = 'text-blue-600', className = '' }) {
  return (
    <div className={`flex h-full flex-col items-center justify-center rounded-xl border border-gray-100 bg-gray-50 p-3 text-center ${className}`}>
      <div className={`text-lg font-extrabold ${colorClass}`}>{value ?? '–'}</div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-gray-500">{label}</div>
    </div>
  )
}
