import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, setAuthSession } from '../services/api'
import BackgroundAnimation from '../components/ui/BackgroundAnimation'
import dnnlogo from '../assets/Images/dnnlogo.png'


export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPwd, setShowPwd] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [shake, setShake] = useState(false)
  const cardRef = useRef(null)

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (loading) return

    setError('')
    setLoading(true)

    try {
      const { ok, data } = await login(username.trim(), password)

      if (ok && data.success) {
        setAuthSession({ token: data.token, role: data.role })
        setSuccess(true)
        setTimeout(() => navigate(data.route || '/dashboard'), 800)
      } else {
        setError('Invalid credentials. Please try again.')
        setPassword('')
        setShake(true)
        setTimeout(() => setShake(false), 500)
      }
    } catch (_error) {
      setError('Cannot reach server. Check backend availability.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <BackgroundAnimation />

      <div className="relative z-10 w-full max-w-[460px] px-5">
        <div
          ref={cardRef}
          className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-white px-9 py-10 animate-card-in ${shake ? 'animate-shake' : ''}`}
          style={{ boxShadow: '0 20px 25px -5px rgba(0,0,0,.1), 0 10px 10px -5px rgba(0,0,0,.04), 0 10px 40px -10px rgba(0,102,255,.3)' }}
        >
          <div
            className="absolute left-0 right-0 top-0 h-1 rounded-t-2xl"
            style={{ background: 'linear-gradient(90deg, #0066ff, #00c2ff)' }}
          />

          <div className="mb-8 text-center">
            <img src={dnnlogo} alt="Kristellar DNN" className="mx-auto h-[110px] w-[300px] object-contain" />
          </div>

          {error && (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
              <span>!</span>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="mb-5 flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
              {/* <span>OK</span> */}
              <span>Authentication successful. Redirecting...</span>
            </div>
          )}

          <form onSubmit={handleSubmit} autoComplete="off" noValidate>
            <div className="mb-5">
              <label className="mb-2 block text-[0.7rem] font-bold uppercase tracking-widest text-gray-500">
                User ID
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm">👤</span>
                <input
                  type="text"
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value)
                    setError('')
                  }}
                  placeholder="Enter your user ID"
                  required
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3.5 pl-10 pr-4 text-sm font-medium text-gray-800 outline-none transition-all duration-200 placeholder:font-normal placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,102,255,0.12)]"
                />
              </div>
            </div>

            <div className="mb-6">
              <label className="mb-2 block text-[0.7rem] font-bold uppercase tracking-widest text-gray-500">
                Password
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm">🔒</span>
                <input
                  type={showPwd ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setError('')
                  }}
                  placeholder="Enter your password"
                  required
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3.5 pl-10 pr-11 text-sm font-medium text-gray-800 outline-none transition-all duration-200 placeholder:font-normal placeholder:text-gray-400 focus:border-blue-500 focus:bg-white focus:shadow-[0_0_0_3px_rgba(0,102,255,0.12)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((value) => !value)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-sm text-gray-400 transition-colors hover:text-gray-600"
                >
                  {showPwd ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="relative w-full overflow-hidden rounded-xl py-3.5 text-sm font-bold uppercase tracking-widest text-white transition-all duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-55"
              style={{
                background: 'linear-gradient(135deg, #0066ff 0%, #00c2ff 100%)',
                boxShadow: '0 10px 40px -10px rgba(0,102,255,.4)',
              }}
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 animate-spin-fast rounded-full border-2 border-white/30 border-t-white" />
                  <span>Authenticating...</span>
                </div>
              ) : (
                'Sign In'
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
