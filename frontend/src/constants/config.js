// API base URL
const configuredApiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').trim().replace(/\/$/, '')
const fallbackApiBaseUrl = `${window.location.protocol}//${window.location.hostname}:3000/api`
export const API = configuredApiBaseUrl || fallbackApiBaseUrl
export const APP_TIMEZONE = (import.meta.env.VITE_APP_TIMEZONE || 'Asia/Kolkata').trim() || 'Asia/Kolkata'

export const POLL_INTERVAL_MS = 5_000
export const SERVER_ROOM_ACCESS_POLL_INTERVAL_MS = Number.parseInt(import.meta.env.VITE_SERVER_ROOM_ACCESS_POLL_INTERVAL_MS || '5000', 10)
export const SERVER_ROOM_CAMERA_STATUS_POLL_INTERVAL_MS = Number.parseInt(import.meta.env.VITE_SERVER_ROOM_CAMERA_STATUS_POLL_INTERVAL_MS || '1000', 10)
export const SERVER_ROOM_CAMERA_URL = `${API}/camera/server-room/`
export const SERVER_ROOM_CAMERA_HLS_STATUS_URL = `${API}/camera/server-room/live/status`
export const SERVER_ROOM_CAMERA_HLS_PLAYLIST_URL = `${API}/camera/server-room/live/index.m3u8`
export const SERVER_ROOM_CAMERA_RELOAD_INTERVAL_MS = Number.parseInt(import.meta.env.VITE_SERVER_ROOM_CAMERA_RELOAD_INTERVAL_MS || '45000', 10)
export const SERVER_ROOM_CAMERA_LOAD_TIMEOUT_MS = Number.parseInt(import.meta.env.VITE_SERVER_ROOM_CAMERA_LOAD_TIMEOUT_MS || '30000', 10)
export const SERVER_ROOM_CAMERA_REFRESH_IMAGE_MS = Number.parseInt(import.meta.env.VITE_SERVER_ROOM_CAMERA_REFRESH_IMAGE_MS || '4000', 10)

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
