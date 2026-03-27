import SectionHeader from '../ui/SectionHeader'
import { getServerDisplayName, mapIpName } from '../../services/ipMapper'

function ILOCard({ s, idx, allHosts }) {
  const displayName = getServerDisplayName(s, idx, allHosts)
  const healthClass = s.health === 'OK' ? 'bg-green-100 text-green-700' : s.health === 'Warning' ? 'bg-orange-100 text-orange-700' : s.health === 'Critical' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'
  const healthIcon  = s.health === 'OK' ? '✓' : s.health === 'Warning' ? '⚠' : '✗'

  const inletC = s.temperature?.inlet
  const cpuC   = s.temperature?.cpuAvg
  const watts  = s.power?.consumedWatts || 0
  const memGB  = s.memory?.totalGB || 0

  if (!s.reachable) {
    return (
      <div className="ilo-card" data-delay={idx * 150}>
        <div className="flex justify-between items-start mb-5">
          <div>
            <div className="text-lg font-extrabold text-gray-800">{displayName}</div>
            <div className="text-xs text-blue-600 font-semibold mt-1">iLO: {mapIpName(s.ip)}</div>
          </div>
          <span className="px-3.5 py-1.5 rounded-full text-xs font-bold bg-red-100 text-red-600">✗ Unreachable</span>
        </div>
        <div className="text-center py-8">
          <div className="text-4xl mb-3">🔌</div>
          <div className="font-bold text-red-500">Cannot reach iLO</div>
          <div className="text-xs text-gray-400 mt-1">{s.error || ''}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="ilo-card" data-delay={idx * 150}>
      {/* Header */}
      <div className="flex justify-between items-start mb-5">
        <div>
          <div className="text-lg font-extrabold text-gray-800">{displayName}</div>
          <div className="text-xs text-gray-400 mt-0.5">{s.model || ''}</div>
        </div>
        <span className={`px-3.5 py-1.5 rounded-full text-xs font-bold ${healthClass}`}>
          {healthIcon} {s.health}
        </span>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {[
          { label: 'Inlet Temp', value: inletC != null ? `${inletC}°C` : '–', color: 'text-orange-500' },
          { label: 'CPU Temp',   value: cpuC   != null ? `${cpuC}°C`   : '–', color: 'text-red-500' },
          { label: 'Power',      value: watts  ? `${watts}W` : '–',           color: 'text-green-600' },
          { label: 'RAM',        value: memGB  ? `${memGB}GB` : '–',          color: 'text-blue-600' },
        ].map((m, i) => (
          <div key={i} className="bg-gray-50 rounded-xl p-3.5 text-center border border-gray-100">
            <div className={`text-xl font-extrabold ${m.color}`}>{m.value}</div>
            <div className="text-[0.68rem] text-gray-400 uppercase tracking-wider font-semibold mt-1">{m.label}</div>
          </div>
        ))}
      </div>

      {/* Processor */}
      <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Processor</div>
      <div className="text-sm p-2.5 bg-gray-50 rounded-xl border border-gray-100 mb-4 text-gray-700">
        {s.processor?.model || '–'} · {s.processor?.count || 0} CPU(s)
      </div>

      {/* Fans */}
      <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Fans</div>
      <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))' }}>
        {(s.fans || []).slice(0, 6).map((f, fi) => {
          const col = f.status === 'OK' ? '#00c853' : '#ff9800'
          return (
            <div key={fi} className="bg-gray-50 rounded-xl p-2.5 text-center border border-gray-100">
              <div className="text-xs text-gray-400 font-semibold truncate mb-1">{f.name}</div>
              <div className="text-sm font-bold" style={{ color: col }}>{f.rpm ? f.rpm + (f.pct != null ? '%' : ' RPM') : '–'}</div>
              <div className="text-xs font-semibold mt-0.5" style={{ color: col }}>{f.status}</div>
            </div>
          )
        })}
      </div>

      {/* PSUs */}
      <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Power Supplies</div>
      <div className="grid grid-cols-2 gap-2 mb-4">
        {(s.psus || []).map((p, pi) => (
          <div key={pi} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
            <div className="text-xs font-bold text-gray-700 mb-1">{p.name}</div>
            <div className="text-base font-extrabold text-green-600">{p.inputWatts ? `${p.inputWatts}W` : '–'}</div>
            <div className="text-xs font-semibold mt-0.5" style={{ color: p.status === 'OK' ? '#00c853' : '#ff9800' }}>
              {p.status} · {p.state}
            </div>
          </div>
        ))}
        {!s.psus?.length && <div className="text-sm text-gray-400 col-span-2">No PSU data</div>}
      </div>

      {/* Storage */}
      {/* <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Storage Controllers</div>
      {(s.storage || []).map((st, sti) => (
        <div key={sti} className="flex justify-between text-sm py-1.5 border-b border-gray-100">
          <span className="truncate">{mapIpName(st.name)}</span>
          <span className="ml-2 font-semibold" style={{ color: st.status === 'OK' ? '#00c853' : '#ff9800' }}>
            {st.status} · {st.drives} drives
          </span>
        </div> */}
      {/* ))} */}
      {!s.storage?.length && <div className="text-sm text-gray-400">–</div>}
    </div>
  )
}

export default function ILOSection({ data = {} }) {
  const iloServers = data.iloServers || []
  const allHosts   = data.hosts || []

  return (
    <section className="mb-12">
      <SectionHeader icon="🔧" title="iLO Hardware Monitor" />
      {iloServers.length === 0 ? (
        <div className="text-center py-16 text-gray-400">Loading iLO data…</div>
      ) : (
        <div className="grid gap-6" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))' }}>
          {iloServers.map((s, i) => (
            <ILOCard key={i} s={s} idx={i} allHosts={allHosts} />
          ))}
        </div>
      )}
    </section>
  )
}
