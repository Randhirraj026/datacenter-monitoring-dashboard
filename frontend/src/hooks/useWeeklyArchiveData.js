import { useEffect, useState } from 'react'
import { fetchArchiveFolders, fetchArchiveTable } from '../services/archiveApi'

export function useArchiveFolders() {
  const [folders, setFolders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      setError('')

      try {
        const response = await fetchArchiveFolders()
        if (cancelled) return
        setFolders(response?.folders || [])
      } catch (err) {
        if (cancelled) return
        setError(err.message || 'Failed to load archive folders.')
        setFolders([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { folders, loading, error }
}

export function useArchiveTableData() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadArchiveTable(folder, table, filters = {}) {
    setLoading(true)
    setError('')

    try {
      const response = await fetchArchiveTable(folder, table, filters)
      setData(response)
      return response
    } catch (err) {
      setError(err.message || 'Failed to load archive table data.')
      setData(null)
      return null
    } finally {
      setLoading(false)
    }
  }

  return {
    data,
    loading,
    error,
    loadArchiveTable,
  }
}
