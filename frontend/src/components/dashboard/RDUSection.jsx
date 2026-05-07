import SectionHeader from '../ui/SectionHeader'
import DashCard, { CardHeader, StatItem } from '../ui/DashCard'

function formatMetric(value, suffix = '') {
  if (value == null || value === '') return '-'
  return `${value}${suffix}`
}

function toneClasses(state) {
  const level = String(state || 'normal').toLowerCase()

  if (level === 'critical') {
    return {
      card: 'border-red-200 bg-red-50/95 shadow-[0_10px_30px_rgba(239,68,68,0.12)]',
      badge: 'bg-red-100 text-red-700',
      value: 'text-red-700',
      dot: 'bg-red-500',
      glow: 'animate-pulse',
    }
  }

  if (level === 'warning') {
    return {
      card: 'border-amber-200 bg-amber-50/95 shadow-[0_10px_30px_rgba(245,158,11,0.12)]',
      badge: 'bg-amber-100 text-amber-700',
      value: 'text-amber-700',
      dot: 'bg-amber-500',
      glow: '',
    }
  }

  if (level === 'offline') {
    return {
      card: 'border-slate-200 bg-slate-100/90',
      badge: 'bg-slate-200 text-slate-700',
      value: 'text-slate-700',
      dot: 'bg-slate-500',
      glow: '',
    }
  }

  return {
    card: 'border-slate-200 bg-white/80',
    badge: 'bg-blue-100 text-blue-700',
    value: 'text-slate-900',
    dot: 'bg-blue-500',
    glow: '',
  }
}

function AlertPill({ alert }) {
  const severity = String(alert.severity || 'info').toLowerCase()
  const classes = severity === 'critical'
    ? 'bg-red-100 text-red-700 border-red-200'
    : severity === 'warning'
      ? 'bg-amber-100 text-amber-700 border-amber-200'
      : 'bg-blue-100 text-blue-700 border-blue-200'

  return (
    <div className={`rounded-2xl border px-3 py-3 ${classes}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-bold">{alert.title || alert.message || 'Alert'}</div>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] opacity-70">
          {alert.category || alert.source || 'RDU'}
        </span>
      </div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide opacity-80">
        {String(alert.severity || 'info').toUpperCase()} - {alert.status || 'active'}
      </div>
      <p className="mt-2 text-xs font-medium leading-relaxed opacity-90">
        {alert.message || alert.title}
      </p>
    </div>
  )
}

export default function RDUSection({ data = {} }) {
  const rdu = data.rdu || {}
  const metrics = rdu.metrics || {}
  const alerts = Array.isArray(rdu.alerts) ? rdu.alerts : []
  const sensors = Array.isArray(rdu.sensors) ? rdu.sensors : []
  const visibleSensors = sensors.filter((sensor) => {
    const key = String(sensor.key || '').trim()
    const name = String(sensor.name || '').trim().toLowerCase()

    return ![
      '-99|501|5',
      '-99|501|68',
      '-99|501|9',
      '-99|501|72',
      '5|4031|17',
      '5|4031|25',
      '5|4031|72',
      '5|4031|79',
    ].includes(key) && ![
      'rack front temp',
      'rack front humidity',
      'rack rear temp',
      'rack rear humidity',
      'ups battery runtime',
      'ups capacity',
      'ups battery',
      'power cut',
      'power status',
    ].includes(name)
  })
  const rearHumidityPct = metrics.rackRearHumidityPct
  const frontHumidityPct = metrics.rackFrontHumidityPct

  return (
    <section className="mb-12">
      <SectionHeader icon="RDU" title="Smart Rack Monitoring" />
      <div className="grid gap-6 xl:grid-cols-3">
        <DashCard delay={1050} className="flex h-full min-h-[340px] flex-col">
          <CardHeader title="Environmental Metrics And Power / UPS" />
          {!rdu.ok && (
            <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {rdu.reason || 'RDU feed is not available yet.'}
            </div>
          )}
          <div className="grid gap-5">
            <div>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">Environment</div>
              <div className="grid grid-cols-2 gap-3">
                <StatItem value={formatMetric(metrics.rackFrontTempC, '\u00B0C')} label="Front Temp" colorClass="text-orange-600" className="min-w-0 px-2 py-4" />
                <StatItem value={formatMetric(frontHumidityPct, '%')} label="Front Humidity" colorClass="text-cyan-600" className="min-w-0 px-2 py-4" />
                <StatItem value={formatMetric(metrics.rackRearTempC, '\u00B0C')} label="Rear Temp" colorClass="text-red-500" className="min-w-0 px-2 py-4" />
                <StatItem value={formatMetric(rearHumidityPct, '%')} label="Rear Humidity" colorClass="text-sky-600" className="min-w-0 px-2 py-4" />
              </div>
            </div>

            <div>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">Power And UPS</div>
              <div className="grid grid-cols-2 gap-3">
                <StatItem
                  value={metrics.powerCutActive == null ? '-' : metrics.powerCutActive ? 'Active' : 'Normal'}
                  label="Power Cut"
                  colorClass={metrics.powerCutActive ? 'text-red-600' : 'text-green-600'}
                  className="min-w-0 px-2 py-4"
                />
                <StatItem value={formatMetric(metrics.upsBatteryPct, '%')} label="UPS Battery" colorClass="text-green-600" className="min-w-0 px-2 py-4" />
                <StatItem value={formatMetric(metrics.upsBatteryMinutesLeft, ' min')} label="Runtime Left" colorClass="text-blue-600" className="min-w-0 px-2 py-4" />
                <StatItem value={metrics.mainsStatus || metrics.rduStatus || '-'} label="Power Status" colorClass="text-slate-700" className="min-w-0 px-2 py-4" />
              </div>
            </div>
          </div>
        </DashCard>

        <DashCard delay={1180} className="flex h-full min-h-[340px] flex-col">
          <CardHeader title="Active Alerts" />
          <div className="flex flex-1 flex-col gap-3 overflow-y-auto pr-1">
            {!alerts.length && (
              <div className="flex h-full items-center justify-center text-sm font-medium text-slate-400">
                No active RDU alerts
              </div>
            )}
            {alerts.slice(0, 12).map((alert) => (
              <AlertPill key={alert.id} alert={alert} />
            ))}
          </div>
        </DashCard>

        <DashCard delay={1240} className="flex h-[540px] flex-col">
          <CardHeader title="Detected Sensors" />
          <div className="grid flex-1 auto-rows-min gap-5 overflow-y-auto pr-1 content-start sm:grid-cols-2 xl:grid-cols-2">
            {!sensors.length && (
              <div className="col-span-full flex h-full items-center justify-center text-sm font-medium text-slate-400">
                No sensor labels were detected from the current RDU payload
              </div>
            )}
            {visibleSensors.map((sensor) => {
              const classes = toneClasses(sensor.state)
              const status = String(sensor.status || sensor.state || 'Normal')

              return (
                <div
                  key={sensor.id || sensor.key || sensor.name}
                  className={`flex min-h-[104px] flex-col justify-start rounded-xl border px-4 py-3 transition-all duration-200 ${classes.card} ${classes.glow}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="break-words text-sm font-semibold leading-snug text-slate-900">
                        {sensor.name}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className={`whitespace-nowrap text-lg font-extrabold leading-none ${classes.value}`}>
                        {sensor.value ?? '-'}
                      </div>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-start gap-2">
                    <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.16em] ${classes.badge}`}>
                      <span className={`h-2.5 w-2.5 rounded-full ${classes.dot}`} />
                      {status}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </DashCard>
      </div>
    </section>
  )
}
