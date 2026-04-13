function formatAlertTime(value) {
  if (!value) return 'Just now'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Just now'

  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function severityClasses(severity) {
  const level = String(severity || 'info').toLowerCase()

  if (level === 'critical') {
    return {
      badge: 'bg-red-100 text-red-700',
      border: 'border-red-200',
      dot: 'bg-red-500',
    }
  }

  if (level === 'warning') {
    return {
      badge: 'bg-amber-100 text-amber-700',
      border: 'border-amber-200',
      dot: 'bg-amber-500',
    }
  }

  return {
    badge: 'bg-blue-100 text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  }
}

export default function RecentAlertsSection({ alerts = [], title = 'Recent Alerts', subtitle = 'Latest infrastructure and VM events' }) {
  const rows = Array.isArray(alerts) ? alerts.slice(0, 8) : []

  return (
    <section className="mb-8 rounded-[28px] border border-slate-200/80 bg-white/92 p-6 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="mb-5 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-slate-600">
          {rows.length} live
        </div>
      </div>

      {!rows.length && (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-5 py-8 text-center text-sm font-medium text-slate-500">
          No recent alerts
        </div>
      )}

      {!!rows.length && (
        <div className="grid gap-3">
          {rows.map((alert, index) => {
            const styles = severityClasses(alert.severity)
            return (
              <article
                key={alert.id || `${alert.type || 'alert'}-${alert.timestamp || index}`}
                className={`rounded-3xl border bg-white px-4 py-4 shadow-sm ${styles.border}`}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} />
                  <span className={`rounded-full px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.16em] ${styles.badge}`}>
                    {alert.severity || 'info'}
                  </span>
                  <span className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                    {alert.type || 'system'}
                  </span>
                  <span className="ml-auto text-xs font-semibold text-slate-400">
                    {formatAlertTime(alert.timestamp)}
                  </span>
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-800">
                  {alert.message || 'Alert generated'}
                </p>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
