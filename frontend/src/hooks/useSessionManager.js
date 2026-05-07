import { useEffect, useRef } from 'react'
import { clearAuthSession, getAuthToken, SESSION_KEYS } from '../services/api'

const AUTO_REFRESH_AFTER_MS = 12 * 60 * 60 * 1000
const AUTO_LOGOUT_AFTER_MS = 24 * 60 * 60 * 1000
const SESSION_CHECK_INTERVAL_MS = 60 * 1000
const STORAGE_SYNC_DELAY_MS = 100

function readLoginTime() {
  const rawValue = localStorage.getItem(SESSION_KEYS.loginTime)
  const parsedValue = Number(rawValue)

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null
}

function hasRefreshed() {
  return localStorage.getItem(SESSION_KEYS.hasRefreshed) === 'true'
}

function setRefreshedFlag(value) {
  localStorage.setItem(SESSION_KEYS.hasRefreshed, value ? 'true' : 'false')
}

export default function useSessionManager() {
  const storageSyncTimeoutRef = useRef(null)

  useEffect(() => {
    let active = true

    const redirectToLogin = () => {
      clearAuthSession()
      if (window.location.pathname !== '/login') {
        window.location.replace('/login')
      }
    }

    const ensureLoginTime = () => {
      if (readLoginTime() !== null) return true
      if (!getAuthToken()) return false

      localStorage.setItem(SESSION_KEYS.loginTime, String(Date.now()))
      setRefreshedFlag(false)
      return true
    }

    const evaluateSession = () => {
      if (!active) return

      const token = getAuthToken()
      if (!token) {
        if (window.location.pathname !== '/login') {
          window.location.replace('/login')
        }
        return
      }

      if (!ensureLoginTime()) return

      const loginTime = readLoginTime()
      if (loginTime === null) return

      const elapsed = Math.max(0, Date.now() - loginTime)

      if (elapsed >= AUTO_LOGOUT_AFTER_MS) {
        redirectToLogin()
        return
      }

      if (elapsed >= AUTO_REFRESH_AFTER_MS && !hasRefreshed()) {
        setRefreshedFlag(true)
        window.location.reload()
      }
    }

    const queueEvaluation = () => {
      window.clearTimeout(storageSyncTimeoutRef.current)
      storageSyncTimeoutRef.current = window.setTimeout(() => {
        evaluateSession()
      }, STORAGE_SYNC_DELAY_MS)
    }

    const onStorage = (event) => {
      const relevantKeys = new Set([
        SESSION_KEYS.authToken,
        SESSION_KEYS.authRole,
        SESSION_KEYS.loginTime,
        SESSION_KEYS.hasRefreshed,
      ])

      if (event.key === null || relevantKeys.has(event.key)) {
        queueEvaluation()
      }
    }

    evaluateSession()
    const intervalId = window.setInterval(evaluateSession, SESSION_CHECK_INTERVAL_MS)

    window.addEventListener('storage', onStorage)

    return () => {
      active = false
      window.clearInterval(intervalId)
      window.clearTimeout(storageSyncTimeoutRef.current)
      window.removeEventListener('storage', onStorage)
    }
  }, [])
}
