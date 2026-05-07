import { IP_NAME_MAP } from '../constants/config'

export function mapIpName(val) {
  if (!val) return val
  const str = String(val).trim()
  if (IP_NAME_MAP[str]) return IP_NAME_MAP[str]
  let out = str
  Object.entries(IP_NAME_MAP).forEach(([ip, name]) => {
    out = out.split(ip).join(name)
  })
  return out
}

function getHostLabelParts(host = {}) {
  const rawName = String(host?.name || host?.hostName || host?.serverName || host?.ip || host?.hostId || '').trim()
  const mappedName = mapIpName(rawName) || rawName
  return { rawName, mappedName }
}

export function getUniqueHostDisplayName(host, allHosts = []) {
  const { rawName, mappedName } = getHostLabelParts(host)
  if (!mappedName) return rawName

  const labels = Array.isArray(allHosts)
    ? allHosts.map((item) => getHostLabelParts(item).mappedName)
    : []
  const collisionCount = labels.filter((label) => label === mappedName).length

  if (collisionCount > 1 && rawName && rawName !== mappedName) {
    return `${mappedName} (${rawName})`
  }

  return mappedName
}

// Check if a string is an IP pattern
export function isIpAddress(val) {
  if (!val) return false
  const str = String(val).trim()
  // Simple IP pattern check (x.x.x.x)
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(str)
}

// Get the original IP from a host name if it's in the map
export function getOriginalIp(displayName) {
  if (!displayName) return null
  const str = String(displayName).trim()
  for (const [ip, name] of Object.entries(IP_NAME_MAP)) {
    if (name === str) return ip
  }
  return null
}

export function isGenericServerLabel(name) {
  if (!name) return true
  const n = String(name).trim().toLowerCase()
  return /^server\s*\d+$/.test(n)
    || /^ilo[\s_-]*\d*$/.test(n)
    || /^computer\s*system$/.test(n)
    || /^system$/.test(n)
    || /^host\s*system$/.test(n)
}

export function getServerDisplayName(server, idx, allHosts = []) {
  const mappedIloIp = mapIpName(server?.ip || '')
  if (mappedIloIp && mappedIloIp !== (server?.ip || '')) return mappedIloIp

  const hostMatch = Array.isArray(allHosts)
    ? allHosts.find((host) => String(host.hostId || host.id) === String(server?.hostId))
    : null
  const hostName = mapIpName(hostMatch?.name || '')
  if (hostName) return hostName

  const iloName = mapIpName(server?.serverName || '')
  if (iloName && !isGenericServerLabel(iloName)) return iloName

  const vsphereName = mapIpName(allHosts?.[idx]?.name || '')
  if (vsphereName) return vsphereName

  const mappedIp = mapIpName(server?.ip || '')
  if (mappedIp) return mappedIp

  return `Server ${idx + 1}`
}
