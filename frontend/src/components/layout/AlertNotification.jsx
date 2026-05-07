import { useState, useEffect, useRef } from 'react'
import { fetchRecentAlerts } from '../../services/superAdminApi'

function normalizeAlertRows(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((alert, index) => ({
      id: alert.id || `${alert.type || 'alert'}-${alert.timestamp || index}`,
      timestamp: alert.timestamp || new Date().toISOString(),
      type: alert.alertType || alert.type || 'SYSTEM',
      severity: alert.severity || 'Info',
      message: alert.message || alert.title || 'Alert generated',
      source: alert.source || 'system',
    }))
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
}

export default function AlertNotification() {
  const [alerts, setAlerts] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const popoverRef = useRef(null)

  const LS_KEY = 'last_read_alert_ts'

  useEffect(() => {
    loadAlerts()
    const id = setInterval(loadAlerts, 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    function handleClickOutside(event) {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadAlerts() {
    setLoading(true)
    try {
      const data = await fetchRecentAlerts()
      const sorted = normalizeAlertRows(Array.isArray(data) ? data : data?.alerts)
      setAlerts(sorted)

      const lastReadTs = localStorage.getItem(LS_KEY) || 0
      const unread = sorted.filter((item) => new Date(item.timestamp).getTime() > new Date(lastReadTs).getTime()).length
      setUnreadCount(unread)
    } catch (err) {
      console.error('Failed to load notifications:', err)
    } finally {
      setLoading(false)
    }
  }

  function togglePopover() {
    if (!isOpen) {
      loadAlerts()
    }

    if (!isOpen && alerts.length > 0) {
      const latestTs = alerts[0].timestamp
      localStorage.setItem(LS_KEY, latestTs)
      setUnreadCount(0)
    }

    setIsOpen(!isOpen)
  }

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={togglePopover}
        className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100/50 text-slate-600 transition-all hover:bg-slate-100 hover:text-blue-600 active:scale-95"
      >
        <svg
          className="h-6 w-6"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute right-2 top-2 flex h-5 w-5 animate-bounce items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-lg shadow-red-500/30">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-[110] mt-3 w-80 translate-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/50">
            <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase tracking-widest text-slate-900">Recent Alerts</h3>
                <span className="rounded-lg bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">Live</span>
              </div>
            </div>

            <div className="max-h-[400px] overflow-y-auto p-2">
              {loading && alerts.length === 0 ? (
                <div className="flex h-32 items-center justify-center">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                </div>
              ) : alerts.length === 0 ? (
                <div className="flex h-32 flex-col items-center justify-center text-center">
                  <div className="mb-2 text-2xl">-</div>
                  <p className="text-xs font-bold text-slate-400">All systems optimal</p>
                  <p className="text-[10px] text-slate-500">No recent alerts to show</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {alerts.map((alert, idx) => (
                    <div
                      key={idx}
                      className="group flex flex-col rounded-2xl p-4 transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`rounded-lg px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                          alert.severity === 'Critical'
                            ? 'bg-red-100 text-red-700'
                            : alert.severity === 'Warning'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-blue-100 text-blue-700'
                        }`}>
                          {alert.severity}
                        </span>
                        <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                          {String(alert.source || 'system').replace(/_/g, ' ')}
                        </span>
                        <span className="text-[10px] font-medium text-slate-400">
                          {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-700">{alert.message}</p>
                      <div className="mt-2 border-t border-slate-100 pt-2 opacity-0 transition-opacity group-hover:opacity-100">
                        <span className="text-[10px] font-medium text-slate-400 italic">
                          {new Date(alert.timestamp).toLocaleDateString()} - {alert.type}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {alerts.length > 0 && (
              <div className="border-t border-slate-100 bg-slate-50/30 p-4 text-center">
                <button
                  onClick={loadAlerts}
                  className="text-[10px] font-bold uppercase tracking-widest text-slate-400 transition hover:text-blue-600"
                >
                  Refresh Alerts
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
