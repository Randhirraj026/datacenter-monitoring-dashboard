import { useEffect, useState } from 'react'

export default function StatusBadge({ ok, text }) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    setVisible(true)
    if (ok) {
      const t = setTimeout(() => setVisible(false), 2000)
      return () => clearTimeout(t)
    }
  }, [ok, text])

  if (!visible) return null

  return (
    <div
      className="fixed top-5 right-5 z-[10000] flex items-center gap-2.5 px-4 py-2.5
                 bg-white/95 backdrop-blur-sm rounded-lg shadow-lg border text-sm font-medium
                 transition-all duration-300"
      style={{ borderColor: ok ? '#00c853' : '#f44336' }}
    >
      <div
        className="w-2.5 h-2.5 rounded-full transition-colors duration-300"
        style={{ background: ok ? '#00c853' : '#f44336' }}
      />
      <span>{text}</span>
    </div>
  )
}
