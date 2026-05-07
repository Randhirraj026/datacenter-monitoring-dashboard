export function roundWholeNumber(value) {
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.round(numeric) : null
}

export function formatWholeNumber(value, suffix = '') {
  const rounded = roundWholeNumber(value)
  return rounded == null ? '-' : `${rounded}${suffix}`
}

export function formatWholePercent(value) {
  return formatWholeNumber(value, '%')
}

export function roundCpuMemoryTableValue(key, value) {
  if (value == null || value === '') return '-'
  const normalizedKey = String(key || '').toLowerCase()
  const isCpuMemoryPercent =
    normalizedKey.includes('cpu') && normalizedKey.includes('pct')
      || normalizedKey.includes('memory') && normalizedKey.includes('pct')
      || normalizedKey.includes('mempct')

  if (isCpuMemoryPercent) {
    const rounded = roundWholeNumber(value)
    return rounded == null ? '-' : rounded
  }

  return value
}
