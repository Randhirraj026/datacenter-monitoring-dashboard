const RANGE_TO_MS = {
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
}

export function filterRowsByRange(rows = [], range = '1h', timeKey = 'ts') {
  if (!Array.isArray(rows) || rows.length === 0) return []
  const newest = rows.reduce((max, row) => {
    const ts = new Date(row?.[timeKey] || 0).getTime()
    return ts > max ? ts : max
  }, 0)

  if (!newest || !RANGE_TO_MS[range]) return rows

  const cutoff = newest - RANGE_TO_MS[range]
  return rows.filter((row) => new Date(row?.[timeKey] || 0).getTime() >= cutoff)
}

export function latestByKey(rows = [], key) {
  const latest = new Map()
  rows.forEach((row) => {
    latest.set(row[key], row)
  })
  return Array.from(latest.values())
}

export function average(rows = [], key) {
  if (!rows.length) return 0
  return Number((rows.reduce((sum, row) => sum + Number(row?.[key] || 0), 0) / rows.length).toFixed(2))
}
