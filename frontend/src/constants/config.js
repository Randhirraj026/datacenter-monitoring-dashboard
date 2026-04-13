// ── API base URL ────────────────────────────────────────────────
const devHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:3000'
  : `${window.location.protocol}//${window.location.hostname}:3000`

export const API = `${devHost}/api`

export const POLL_INTERVAL_MS = 5_000

export const MAX_POWER_HISTORY = 24

// ── IP → friendly name map ───────────────────────────────────────
export const IP_NAME_MAP = {
  '10.10.10.2':   'PROTELION',
  '10.10.10.65':  'GENERATIVE_AI',
  '10.10.10.150': 'R & D',
  '10.10.10.71':  'PROTELION',
  '10.10.10.75':  'GENERATIVE_AI',
  '10.10.10.76':  'R & D',
}

export const VC_HOST = '10.10.10.151'

export const circumference = 2 * Math.PI * 85
