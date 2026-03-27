import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { mapIpName } from '../../services/ipMapper'

export default function HostDetailsModal({ host, iloServers = [], storageUsedTB, storageTotalTB, isOpen, onClose }) {
  const hostName = host ? mapIpName(host.name) || 'Host' : 'Host'

  const matchingIlo = host
    ? iloServers.find((s) =>
        mapIpName(s.ip) === hostName ||
        mapIpName(s.serverName) === hostName ||
        s.hostId === host.hostId
      ) || null
    : null

  const storageUsed = typeof storageUsedTB === 'number' ? storageUsedTB : null
  const storageTotal = typeof storageTotalTB === 'number' ? storageTotalTB : null

  useEffect(() => {
    if (!isOpen) return undefined

    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return undefined

    const scrollY = window.scrollY
    const previousBodyOverflow = document.body.style.overflow
    const previousBodyPosition = document.body.style.position
    const previousBodyTop = document.body.style.top
    const previousBodyWidth = document.body.style.width
    const previousHtmlOverflow = document.documentElement.style.overflow

    document.documentElement.style.overflow = 'hidden'
    document.body.style.overflow = 'hidden'
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'

    return () => {
      document.documentElement.style.overflow = previousHtmlOverflow
      document.body.style.overflow = previousBodyOverflow
      document.body.style.position = previousBodyPosition
      document.body.style.top = previousBodyTop
      document.body.style.width = previousBodyWidth
      window.scrollTo(0, scrollY)
    }
  }, [isOpen])

  if (!isOpen || !host) return null

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] bg-black/50 p-4 sm:p-6"
      onClick={onClose}
      aria-modal="true"
      role="dialog"
    >
      <div className="flex min-h-full items-start justify-center overflow-y-auto sm:items-center">
        <div
          className="my-4 flex max-h-[calc(100vh-2rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:my-0 sm:max-h-[90vh]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 flex items-start justify-between bg-gradient-to-r from-blue-500 to-blue-600 p-6 text-white">
            <div>
              <h2 className="text-2xl font-bold">{hostName}</h2>
              <p className="mt-1 text-sm text-blue-100">Host Details & Metrics</p>
            </div>
            <button
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-white transition hover:bg-blue-700"
              aria-label="Close host details"
            >
              
            </button>
          </div>

          <div className="flex-1 space-y-6 overflow-y-auto overscroll-contain p-6">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Host Profile</h3>

              <div className="mb-3">
                <div className="text-xs text-gray-500">Processor</div>
                <div className="text-sm font-semibold text-gray-800">
                  {matchingIlo?.processor?.model || 'Unknown'}
                  {matchingIlo?.processor?.count ? ` (${matchingIlo.processor.count} sockets)` : ''}
                </div>
                {/* <div className="mt-1 text-xs text-gray-500">Status: {matchingIlo?.processor?.status || 'Unknown'}</div> */}
              </div>

              <div className="mb-3">
                <div className="text-xs text-gray-500">RAM Usage</div>
                <div className="text-sm font-semibold text-gray-800">
                  {host.memUsedGB != null && host.memTotalGB != null
                    ? `${host.memUsedGB} GB / ${host.memTotalGB} GB`
                    : host.memPct != null
                      ? `${host.memPct}%`
                      : '-'}
                </div>
              </div>

              <div>
                <div className="text-xs text-gray-500">Storage Used</div>
                <div className="text-sm font-semibold text-gray-800">
                  {storageUsed != null && storageTotal != null
                    ? `${storageUsed.toFixed(1)} TB / ${storageTotal.toFixed(1)} TB`
                    : '-'}
                </div>
                {storageUsed != null && storageTotal != null && storageTotal > 0 && (
                  <div className="mt-1 text-xs text-gray-500">{Math.round((storageUsed / storageTotal) * 100)}% used</div>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h3 className="mb-3 text-sm font-semibold text-gray-700">Status</h3>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded-full bg-green-500 animate-pulse" />
                <span className="text-sm text-gray-800">
                  {host.connectionState === 'connected' ? 'Connected' : host.connectionState ? host.connectionState : 'Connected'}
                </span>
              </div>
            </div>

            {matchingIlo ? (
              <>
                {matchingIlo.temperature && (
                  <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-gray-700">Temperature</h3>
                    <div className="space-y-2">
                      {matchingIlo.temperature.inlet != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">Inlet</span>
                          <span className="text-sm font-bold text-orange-600">{matchingIlo.temperature.inlet}°C</span>
                        </div>
                      )}
                      {matchingIlo.temperature.cpuAvg != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">CPU Avg</span>
                          <span className="text-sm font-bold text-orange-600">{matchingIlo.temperature.cpuAvg}°C</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {matchingIlo.power && (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-gray-700">Power</h3>
                    <div className="space-y-2">
                      {matchingIlo.power.consumedWatts != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">Consumed</span>
                          <span className="text-sm font-bold text-green-600">{matchingIlo.power.consumedWatts} W</span>
                        </div>
                      )}
                      {matchingIlo.power.inputWatts != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">Input</span>
                          <span className="text-sm font-bold text-green-600">{matchingIlo.power.inputWatts} W</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {matchingIlo.memory && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-gray-700">iLO Memory</h3>
                    <div className="space-y-2">
                      {matchingIlo.memory.totalGB != null && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">Total</span>
                          <span className="text-sm font-bold text-blue-600">{matchingIlo.memory.totalGB} GB</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {matchingIlo.health && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
                    <h3 className="mb-3 text-sm font-semibold text-gray-700">System Health</h3>
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          matchingIlo.health === 'OK'
                            ? 'bg-green-100 text-green-700'
                            : matchingIlo.health === 'Warning'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {matchingIlo.health}
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-yellow-200 bg-yellow-50 p-3">
                <p className="text-sm text-yellow-800">iLO details are not available for this host at the moment.</p>
              </div>
            )}
          </div>

          <div className="border-t border-gray-200 bg-gray-50 p-4">
            <button
              onClick={onClose}
              className="w-full rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white transition hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
