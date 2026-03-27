import { useEffect, useState } from 'react'
import { fetchSuperAdminBundleFromDb, fetchSuperAdminDashboard, fetchSuperAdminDetails } from '../services/superAdminApi'

export function useSuperAdminBundleData({ range = '24h', hostId = '' } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        const response = await fetchSuperAdminBundleFromDb({ range, hostId: hostId || undefined })
        console.debug('[SuperAdmin][bundle]', { range, hostId, ok: !!response })

        if (cancelled) return
        if (!response) {
          setError('Failed to fetch historical DB data.')
          setData(null)
          return
        }

        setData(response)
      } catch (err) {
        console.error('[SuperAdmin][bundle]', err)
        if (!cancelled) {
          setError('Failed to fetch historical DB data.')
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const intervalId = setInterval(load, 10000)
    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [hostId, range])

  return { data, loading, error }
}

export function useSuperAdminSectionData({ section, range = '24h', hostId = '', page = 1, pageSize = 500, sort = 'asc' } = {}) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!section) return undefined

    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        const response = await fetchSuperAdminDetails({
          section,
          range,
          hostId: hostId || undefined,
          page,
          pageSize,
          sort,
        })

        console.debug(`[SuperAdmin][${section}]`, { range, hostId, page, sort, ok: !!response, total: response?.total || 0 })

        if (cancelled) return
        if (!response) {
          setError('Failed to fetch historical DB data.')
          setData(null)
          return
        }

        setData(response)
      } catch (err) {
        console.error(`[SuperAdmin][${section}]`, err)
        if (!cancelled) {
          setError('Failed to fetch historical DB data.')
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const intervalId = setInterval(load, 10000)
    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [hostId, page, pageSize, range, section, sort])

  return { data, loading, error }
}

export function useSuperAdminDashboardSnapshot() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        const response = await fetchSuperAdminDashboard()
        console.debug('[SuperAdmin][dashboard]', { ok: !!response })

        if (cancelled) return
        if (!response) {
          setError('Failed to fetch dashboard snapshot from DB.')
          setData(null)
          return
        }

        setData(response)
      } catch (err) {
        console.error('[SuperAdmin][dashboard]', err)
        if (!cancelled) {
          setError('Failed to fetch dashboard snapshot from DB.')
          setData(null)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    const intervalId = setInterval(load, 10000)
    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [])

  return { data, loading, error }
}
