import { formatWholePercent } from '../../services/numberFormat'

const CARDS = [
  { icon: '🖥️', iconBg: 'bg-blue-100',   iconColor: 'text-blue-600',   valueKey: 'cpuPct',     label: 'CPU Usage',      sub: 'vSphere Data', fmt: v => formatWholePercent(v) },
  { icon: '💾', iconBg: 'bg-purple-100', iconColor: 'text-purple-600', valueKey: 'memPct',     label: 'Memory Usage',   sub: 'vSphere Data', fmt: v => formatWholePercent(v) },
  { icon: '💿', iconBg: 'bg-cyan-100',   iconColor: 'text-cyan-600',   valueKey: 'storagePct', label: 'Storage Used',   sub: 'Datastores',   fmt: v => `${v}%`     },
  { icon: '⚡', iconBg: 'bg-green-100',  iconColor: 'text-green-600',  valueKey: 'powerKW',    label: 'Power Draw',     sub: 'From iLO',     fmt: v => `${v} kW`   },
  { icon: '🌡️', iconBg: 'bg-orange-100', iconColor: 'text-orange-600', valueKey: 'inletTemp',  label: 'Avg Inlet Temp', sub: 'From iLO',     fmt: v => `${v}°C`    },
  { icon: '🖧',  iconBg: 'bg-red-100',   iconColor: 'text-red-500',    valueKey: 'vmRunning',  label: 'Running VMs',    sub: 'vSphere Data', fmt: v => `${v}`      },
]

export default function SummaryRow({ data = {} }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-4 mb-8">
      {CARDS.map((c, i) => {
        const raw     = data[c.valueKey]
        const display = raw != null ? c.fmt(raw) : '–'
        return (
          <div key={i} className="summary-card" data-delay={i * 80}>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 ${c.iconBg} ${c.iconColor}`}>
              {c.icon}
            </div>
            <div className="min-w-0">
              <div className="text-xl font-extrabold text-gray-800 leading-tight">{display}</div>
              <div className="text-xs text-gray-500 font-medium mt-0.5">{c.label}</div>
              <div className="text-[0.68rem] font-semibold mt-1" style={{ color: '#0066ff' }}>{c.sub}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
