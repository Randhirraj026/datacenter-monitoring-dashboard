import { circumference } from '../../constants/config'

export default function GaugeChart({ id, pct = 0, value, label, gradientId, gradientColors = ['#0066ff','#00c2ff'] }) {
  const dash = `${(pct / 100) * circumference} ${circumference}`

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-[200px] h-[200px]">
        <svg width="200" height="200" viewBox="0 0 200 200">
          <circle className="gauge-bg" cx="100" cy="100" r="85" />
          <circle
            className="gauge-fill"
            cx="100" cy="100" r="85"
            stroke={`url(#${gradientId})`}
            strokeDasharray={dash}
          />
          <defs>
            <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%"   stopColor={gradientColors[0]} />
              <stop offset="100%" stopColor={gradientColors[1]} />
            </linearGradient>
          </defs>
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className="text-2xl font-extrabold text-gray-800">{value ?? '–'}</div>
          <div className="text-xs text-gray-500 font-medium mt-1">{label}</div>
        </div>
      </div>
    </div>
  )
}
