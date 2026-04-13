import { useEffect, useState } from 'react'
import BackgroundAnimation from '../components/ui/BackgroundAnimation'
import LoadingOverlay from '../components/ui/LoadingOverlay'
import StatusBadge from '../components/ui/StatusBadge'
import Header from '../components/layout/Header'
import Footer from '../components/layout/Footer'
import SummaryRow from '../components/dashboard/SummaryRow'
import CpuSection from '../components/dashboard/CpuSection'
import MemorySection from '../components/dashboard/MemorySection'
import StorageSection from '../components/dashboard/StorageSection'
import PowerSection from '../components/dashboard/PowerSection'
import ILOSection from '../components/dashboard/ILOSection'
import NetworkSection from '../components/dashboard/NetworkSection'
import RDUSection from '../components/dashboard/RDUSection'
import { useDashboardData } from '../hooks/useDashboardData'
import { useCardAnimation } from '../hooks/useCardAnimation'
import { getServerDisplayName } from '../services/ipMapper'
import { POLL_INTERVAL_MS } from '../constants/config'

export default function DashboardPage() {
  const { data, status, lastUpdate } = useDashboardData()
  const containerRef = useCardAnimation([data])
  const [liveClock, setLiveClock] = useState(() =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  )

  useEffect(() => {
    const id = setInterval(() => {
      setLiveClock(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
    }, 1000)

    return () => clearInterval(id)
  }, [])

  const serverNames = (data.iloServers || []).map((s, i) => getServerDisplayName(s, i, data.hosts))

  return (
    <div className="relative flex min-h-screen flex-col font-inter">
      <BackgroundAnimation />
      <LoadingOverlay visible={status.loading} />
      <StatusBadge ok={status.ok} text={status.text} />

      {lastUpdate && (
        <div
          className="fixed bottom-5 left-5 z-[9999] rounded-lg px-4 py-2.5 text-xs font-medium text-white"
          style={{ background: 'rgba(0,102,255,.95)', boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}
        >
        
          <div className="mt-1"><strong>Last Update:</strong> {lastUpdate}</div>

        </div>
      )}

      <Header stats={data} />

      <main ref={containerRef} className="mx-auto flex-1 w-full max-w-[1800px] px-5 py-5">
        <SummaryRow data={data} />
        <CpuSection data={data} />
        <MemorySection data={data} />
        <StorageSection data={data} />
        <PowerSection data={data} />
        <ILOSection data={data} />
        <NetworkSection data={{ ...data, serverNames: serverNames.length ? serverNames : ['Server 1', 'Server 2', 'Server 3'] }} />
        <RDUSection data={data} />
      </main>

      <Footer />
    </div>
  )
}
