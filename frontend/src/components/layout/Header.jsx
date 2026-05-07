import { useLocation, useNavigate } from 'react-router-dom'
import { logout } from '../../services/api'
import AlertNotification from './AlertNotification'
import dnnlogo from '../../assets/Images/dnnlogo.png'

export default function Header({ stats = {} }) {
  const navigate = useNavigate()
  const location = useLocation()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const headerStats = [
    { id: 'totalServers', label: 'ESXi Hosts', value: stats.totalServers },
    { id: 'totalCores', label: 'Total Cores', value: stats.totalCores },
    { id: 'totalMemory', label: 'Total Memory', value: stats.totalMemory ? stats.totalMemory : null },
    { id: 'totalStorage', label: 'Total Storage', value: stats.totalStorage ? stats.totalStorage : null },
  ]

  return (
    <header
      className="sticky top-0 z-[100] flex items-center justify-between border-b border-gray-200 bg-white/90 px-10 py-4 shadow-sm backdrop-blur-xl"
      style={{ position: 'relative' }}
    >
      <div className="flex items-center gap-4">
        <img
          src={dnnlogo}
          alt="Kristellar DNN"
          className="h-[72px] w-[160px] object-contain object-center"
        />
      </div>

      <div
        className="absolute left-1/2 top-1/2 hidden gap-10 md:flex"
        style={{ transform: 'translate(-50%, -50%)' }}
      >
        {headerStats.map((stat) => (
          <div key={stat.id} className="text-center">
            <div className="text-2xl font-bold" style={{ color: '#0066ff' }}>
              {stat.value ?? '-'}
            </div>
            <div className="text-[0.7rem] font-medium uppercase tracking-widest text-gray-500">
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-4">
        <AlertNotification />
        <button
          onClick={handleLogout}
          className="rounded-lg px-4 py-1.5 text-xs font-semibold tracking-widest transition-all duration-200 hover:scale-105"
          style={{
            background: 'rgba(255,71,87,0.15)',
            border: '1px solid rgba(255,71,87,0.3)',
            color: '#ff6b7a',
          }}
        >
          {location.pathname === '/superadmin' ? 'Admin Exit' : 'Logout'}
        </button>
      </div>
    </header>
  )
}
