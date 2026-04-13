import SectionHeader from '../ui/SectionHeader'
import DashCard, { CardHeader, StatItem } from '../ui/DashCard'

function formatMetric(value, suffix = '') {
  if (value == null || value === '') return '–'
  return `${value}${suffix}`
}

function AlertPill({ alert }) {
  const severity = String(alert.severity || 'unknown').toLowerCase()
  const classes = severity === 'critical'
    ? 'bg-red-100 text-red-700 border-red-200'
    : severity === 'warning'
      ? 'bg-orange-100 text-orange-700 border-orange-200'
      : severity === 'info'
        ? 'bg-blue-100 text-blue-700 border-blue-200'
        : 'bg-slate-100 text-slate-700 border-slate-200'

  return (
    <div className={`rounded-xl border px-3 py-2 ${classes}`}>
      <div className="text-sm font-bold">{alert.title}</div>
      <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide opacity-80">
        {alert.severity || 'unknown'} · {alert.status || 'active'}
      </div>
    </div>
  )
}

export default function RDUSection({ data = {} }) {
  const rdu = data.rdu || {}
  const metrics = rdu.metrics || {}
  const alerts = Array.isArray(rdu.alerts) ? rdu.alerts : []
  const preferredSensorNames = [
    'Return Air Temp',
    'Supply Air Temp',
    'Smoke Sensor',
    'Water Leakage Sensor',
    'Front Door',
    'Rear Door',
    'UPS Battery Runtime',
    'UPS Battery Capacity',
    'UPS Power Supply',
    'UPS Input Status',
  ]
  const sensorNameAliases = {
    'Return Air Temp': ['Return Air Temp', 'AC Return Air Temp'],
    'Supply Air Temp': ['Supply Air Temp', 'AC Supply Air Temp'],
    'Smoke Sensor': ['Smoke Sensor 1'],
    'Water Leakage Sensor': ['Smoke Sensor 2', 'Smoke Sensor 2 / Water Leak'],
    'Front Door': ['Front Door'],
    'Rear Door': ['Rear Door'],
    'UPS Battery Runtime': ['UPS Battery Runtime'],
    'UPS Battery Capacity': ['UPS Battery Capacity'],
    'UPS Power Supply': ['UPS Power Supply'],
    'UPS Input Status': ['UPS Input Status', 'UPS Input Power Status'],
  }
  
  const sensors = Array.isArray(rdu.sensors)
    ? preferredSensorNames
        .map((name) => {
          const sensor = rdu.sensors.find((item) => sensorNameAliases[name]?.includes(item.name))
          return sensor ? { ...sensor, name } : null
        })
        .filter(Boolean)
        .slice(0, 8)
    : []
  const rearHumidityPct = metrics.rackRearHumidityPct
  const frontHumidityPct = metrics.rackFrontHumidityPct

  return (
    <section className="mb-12">
      <SectionHeader icon="📡" title="Smart Rack Monitoring" />
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
                <StatItem value={formatMetric(metrics.rackFrontTempC, '°C')} label="Front Temp" colorClass="text-orange-600" className="min-w-0 px-2 py-4" />
                <StatItem value={formatMetric(frontHumidityPct, '%')} label="Front Humidity" colorClass="text-cyan-600" className="min-w-0 px-2 py-4" />
                <StatItem value={formatMetric(metrics.rackRearTempC, '°C')} label="Rear Temp" colorClass="text-red-500" className="min-w-0 px-2 py-4" />
                <StatItem value={formatMetric(rearHumidityPct, '%')} label="Rear Humidity" colorClass="text-sky-600" className="min-w-0 px-2 py-4" />
              </div>
            </div>

            <div>
              <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.28em] text-slate-400">Power And UPS</div>
              <div className="grid grid-cols-2 gap-3">
                <StatItem
                  value={metrics.powerCutActive == null ? '–' : metrics.powerCutActive ? 'Active' : 'Normal'}
                  label="Power Cut"
                  colorClass={metrics.powerCutActive ? 'text-red-600' : 'text-green-600'}
                  className="min-w-0 px-2 py-4"
                />
                <StatItem value={formatMetric(metrics.upsBatteryPct, '%')} label="UPS Battery" colorClass="text-green-600" className="min-w-0 px-2 py-4" />
                <StatItem value={formatMetric(metrics.upsBatteryMinutesLeft, ' min')} label="Runtime Left" colorClass="text-blue-600" className="min-w-0 px-2 py-4" />
                <StatItem value={metrics.mainsStatus || metrics.rduStatus || '–'} label="Power Status" colorClass="text-slate-700" className="min-w-0 px-2 py-4" />
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

        <DashCard delay={1240} className="flex h-full min-h-[340px] flex-col">
          <CardHeader title="Detected Sensors" />
          <div className="grid flex-1 gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {!sensors.length && (
              <div className="col-span-full flex h-full items-center justify-center text-sm font-medium text-slate-400">
                No sensor labels were detected from the current RDU payload
              </div>
            )}
            {sensors.map((sensor) => (
              <div key={sensor.id} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm font-bold text-slate-800">{sensor.name}</div>
                <div className="mt-1 text-lg font-extrabold text-slate-900">
                  {sensor.value ?? '–'}
                </div>
                <div className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {sensor.status || 'status unknown'}
                </div>
              </div>
            ))}
          </div>
        </DashCard>
      </div>
    </section>
  )
}
