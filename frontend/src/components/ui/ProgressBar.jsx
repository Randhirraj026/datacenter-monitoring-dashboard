export default function ProgressBar({ pct = 0, color = '#0066ff', className = '' }) {
  return (
    <div className={`progress-bar ${className}`}>
      <div
        className="progress-fill"
        style={{
          width: `${Math.min(pct, 100)}%`,
          background: color,
        }}
      />
    </div>
  )
}
