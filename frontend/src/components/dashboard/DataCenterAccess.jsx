import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Hls from 'hls.js'

import SectionHeader from '../ui/SectionHeader'
import DashCard, { CardHeader } from '../ui/DashCard'
import {
  APP_TIMEZONE,
  SERVER_ROOM_ACCESS_POLL_INTERVAL_MS,
  SERVER_ROOM_CAMERA_URL,
  SERVER_ROOM_CAMERA_HLS_PLAYLIST_URL,
  SERVER_ROOM_CAMERA_LOAD_TIMEOUT_MS,
  SERVER_ROOM_CAMERA_RELOAD_INTERVAL_MS,
  SERVER_ROOM_CAMERA_REFRESH_IMAGE_MS,
  SERVER_ROOM_CAMERA_STATUS_POLL_INTERVAL_MS,
} from '../../constants/config'
import {
  fetchServerRoomAccessLogsByDate,
  getAuthToken,
  fetchServerRoomCameraStatus,
} from '../../services/api'

function getTodayDateInputValue() {
  const now = new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = formatter.formatToParts(now).reduce((acc, part) => {
    if (part.type !== 'literal') {
      acc[part.type] = part.value
    }
    return acc
  }, {})
  const year = parts.year
  const month = parts.month
  const day = parts.day
  return `${year}-${month}-${day}`
}

function sortLogsByLatest(logs) {
  return [...logs].sort((left, right) => {
    const leftTime = new Date(String(left.timestamp || '').replace(' ', 'T')).getTime()
    const rightTime = new Date(String(right.timestamp || '').replace(' ', 'T')).getTime()
    return rightTime - leftTime
  })
}

function AccessBadge({ value }) {
  const normalized = String(value || '').toUpperCase()
  const classes = normalized === 'IN'
    ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
    : normalized === 'OUT'
      ? 'border border-red-200 bg-red-50 text-red-700'
      : 'border border-slate-200 bg-slate-50 text-slate-600'

  return (
    <span className={`inline-flex min-w-[58px] justify-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] ${classes}`}>
      {normalized || 'N/A'}
    </span>
  )
}

function getContainRect(containerWidth, containerHeight, mediaWidth, mediaHeight) {
  if (!containerWidth || !containerHeight || !mediaWidth || !mediaHeight) {
    return null
  }

  const containerRatio = containerWidth / containerHeight
  const mediaRatio = mediaWidth / mediaHeight

  if (containerRatio > mediaRatio) {
    const height = containerHeight
    const width = height * mediaRatio
    return {
      x: (containerWidth - width) / 2,
      y: 0,
      width,
      height,
    }
  }

  const width = containerWidth
  const height = width / mediaRatio
  return {
    x: 0,
    y: (containerHeight - height) / 2,
    width,
    height,
  }
}

function getDetectionLabel(detection = {}) {
  const classification = String(detection.classification || '').toUpperCase()
  if (classification === 'AUTHORIZED') {
    const name = String(detection.employeeName || detection.label || 'EMPLOYEE').toUpperCase()
    const employeeId = String(detection.employeeId || '').trim().toUpperCase()
    return employeeId ? `${name} | ${employeeId}` : name
  }
  if (classification === 'IMPOSTER') return 'IMPOSTER'
  return 'UNKNOWN'
}

const SERVER_ROOM_ACCESS_CACHE_PREFIX = 'serverRoomAccessCache:'

function readServerRoomAccessCache(date) {
  try {
    const raw = sessionStorage.getItem(`${SERVER_ROOM_ACCESS_CACHE_PREFIX}${date}`)
    if (!raw) return null

    const parsed = JSON.parse(raw)
    return {
      logs: Array.isArray(parsed?.logs) ? parsed.logs : [],
      windowInfo: {
        windowStart: parsed?.windowInfo?.windowStart || '',
        windowEnd: parsed?.windowInfo?.windowEnd || '',
      },
      lastFetchedAt: parsed?.lastFetchedAt || '',
    }
  } catch (_error) {
    return null
  }
}

function writeServerRoomAccessCache(date, payload) {
  try {
    sessionStorage.setItem(
      `${SERVER_ROOM_ACCESS_CACHE_PREFIX}${date}`,
      JSON.stringify({
        logs: Array.isArray(payload?.logs) ? payload.logs : [],
        windowInfo: {
          windowStart: payload?.windowInfo?.windowStart || '',
          windowEnd: payload?.windowInfo?.windowEnd || '',
        },
        lastFetchedAt: payload?.lastFetchedAt || '',
      })
    )
  } catch (_error) {
    // Session storage may be unavailable in restrictive browser modes.
  }
}

export default function DataCenterAccess() {
  const imgRef = useRef(null)
  const videoRef = useRef(null)
  const feedContainerRef = useRef(null)
  const hlsRef = useRef(null)
  const lastImageLoadAtRef = useRef(Date.now())
  const lastVideoProgressAtRef = useRef(Date.now())
  const lastVideoTimeRef = useRef(0)
  const hlsRecoveryAttemptRef = useRef(0)
  const initialDate = getTodayDateInputValue()
  const initialCache = readServerRoomAccessCache(initialDate)
  const [logs, setLogs] = useState(initialCache?.logs || [])
  const [loading, setLoading] = useState(!initialCache)
  const [error, setError] = useState('')
  const [feedError, setFeedError] = useState('')
  const [useHls, setUseHls] = useState(true)
  const [feedReloadNonce, setFeedReloadNonce] = useState(0)
  const [cameraStatus, setCameraStatus] = useState(null)
  const [feedViewportSize, setFeedViewportSize] = useState({ width: 0, height: 0 })
  const [feedMediaSize, setFeedMediaSize] = useState({ width: 0, height: 0 })

  const [selectedDate, setSelectedDate] = useState(initialDate)
  const [followToday, setFollowToday] = useState(true)
  const [windowInfo, setWindowInfo] = useState(initialCache?.windowInfo || { windowStart: '', windowEnd: '' })

  const token = getAuthToken()

  const feedUrl = useMemo(() => {
    const base = SERVER_ROOM_CAMERA_URL
    const separator = base.includes('?') ? '&' : '?'
    const authPart = token ? `${separator}access_token=${encodeURIComponent(token)}` : ''
    return `${base}${authPart}`
  }, [token])

  const hlsUrl = useMemo(() => {
    if (!token) return SERVER_ROOM_CAMERA_HLS_PLAYLIST_URL
    const separator = SERVER_ROOM_CAMERA_HLS_PLAYLIST_URL.includes('?') ? '&' : '?'
    return `${SERVER_ROOM_CAMERA_HLS_PLAYLIST_URL}${separator}access_token=${encodeURIComponent(token)}`
  }, [token])

  const checkHlsStatus = useCallback(async () => {
    try {
      const response = await fetchServerRoomCameraStatus()
      const isOnline = Boolean(response?.ready)
      setCameraStatus(response)
      setUseHls(isOnline)
    } catch (_error) {
      setUseHls(false)
      setCameraStatus(null)
    }
  }, [])

  const refreshFeed = useCallback((force = false) => {
    setFeedError('')
    setFeedReloadNonce((value) => value + 1)

    if (!useHls) {
      if (!force && document.visibilityState === 'hidden') return

      const img = imgRef.current
      if (!img) return

      const nextSrc = (() => {
        const url = new URL(feedUrl)
        url.searchParams.set('ts', String(Date.now()))
        return url.toString()
      })()

      const loader = new window.Image()
      loader.onload = () => {
        window.requestAnimationFrame(() => {
          if (img.isConnected) {
            img.src = nextSrc
          }
        })
      }
      loader.src = nextSrc
    } else {
      hlsRecoveryAttemptRef.current = 0
    }
  }, [useHls, feedUrl])

  const loadLogsForDate = useCallback(async (date, { silent = false } = {}) => {
    if (!silent) setLoading(true)

    try {
      const response = await fetchServerRoomAccessLogsByDate(date)
      const nextLogs = Array.isArray(response?.logs) ? response.logs : []
      const nextWindowInfo = {
        windowStart: response?.windowStart || '',
        windowEnd: response?.windowEnd || '',
      }

      setLogs(sortLogsByLatest(nextLogs))
      setWindowInfo(nextWindowInfo)
      setError('')

      writeServerRoomAccessCache(date, {
        logs: nextLogs,
        windowInfo: nextWindowInfo,
        lastFetchedAt: new Date().toISOString(),
      })
    } catch (fetchError) {
      setError(fetchError.message || 'Failed to load biometric access logs')
    } finally {
      if (!silent) {
        setLoading(false)
      }
    }
  }, [])

  const loadLogs = useCallback((options = {}) => loadLogsForDate(selectedDate, options), [loadLogsForDate, selectedDate])

  // Poll HLS status occasionally
  useEffect(() => {
    checkHlsStatus()
    const id = setInterval(checkHlsStatus, 30_000)
    return () => clearInterval(id)
  }, [checkHlsStatus])

  useEffect(() => {
    if (!Number.isFinite(SERVER_ROOM_CAMERA_STATUS_POLL_INTERVAL_MS) || SERVER_ROOM_CAMERA_STATUS_POLL_INTERVAL_MS <= 0) {
      return undefined
    }

    const id = setInterval(() => {
      checkHlsStatus()
    }, SERVER_ROOM_CAMERA_STATUS_POLL_INTERVAL_MS)

    return () => clearInterval(id)
  }, [checkHlsStatus])

  // Initialize HLS
  useEffect(() => {
    if (!useHls || !hlsUrl) {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
      return undefined
    }

    const video = videoRef.current
    if (!video) return undefined

    if (Hls.isSupported()) {
      if (hlsRef.current) hlsRef.current.destroy()

      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 0,
        manifestLoadingMaxRetry: 10,
        levelLoadingMaxRetry: 10,
        liveSyncDurationCount: 1.5,
        liveMaxLatencyDurationCount: 3,
        maxLiveSyncPlaybackRate: 1.5,
        enableLowLatencyQueuing: true,
      })

      hlsRef.current = hls
      hls.loadSource(hlsUrl)
      hls.attachMedia(video)
      lastVideoProgressAtRef.current = Date.now()
      lastVideoTimeRef.current = 0

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) {
          return
        }

        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          hls.startLoad()
          hlsRecoveryAttemptRef.current += 1
          return
        }

        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError()
          hlsRecoveryAttemptRef.current += 1
          return
        }

        if (hlsRecoveryAttemptRef.current < 2) {
          hlsRecoveryAttemptRef.current += 1
          setFeedReloadNonce((value) => value + 1)
          return
        }

        console.warn('HLS unrecoverable error, falling back to snapshot:', data.type)
        setUseHls(false)
      })
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = hlsUrl
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy()
        hlsRef.current = null
      }
    }
  }, [useHls, hlsUrl, feedReloadNonce])

  useEffect(() => {
    loadLogs({ silent: Boolean(initialCache) })
    const intervalId = setInterval(() => loadLogs({ silent: true }), SERVER_ROOM_ACCESS_POLL_INTERVAL_MS)

    return () => {
      clearInterval(intervalId)
    }
  }, [loadLogs])

  useEffect(() => {
    if (!followToday) return undefined

    const syncToday = () => {
      setSelectedDate(getTodayDateInputValue())
    }

    syncToday()
    const intervalId = setInterval(syncToday, 60_000)

    return () => clearInterval(intervalId)
  }, [followToday])

  useEffect(() => {
    if (!Number.isFinite(SERVER_ROOM_CAMERA_REFRESH_IMAGE_MS) || SERVER_ROOM_CAMERA_REFRESH_IMAGE_MS <= 0) {
      return undefined
    }

    const intervalId = setInterval(() => {
      if (!useHls) refreshFeed(false)
    }, SERVER_ROOM_CAMERA_REFRESH_IMAGE_MS)

    return () => clearInterval(intervalId)
  }, [useHls, refreshFeed])

  useEffect(() => {
    if (!Number.isFinite(SERVER_ROOM_CAMERA_RELOAD_INTERVAL_MS) || SERVER_ROOM_CAMERA_RELOAD_INTERVAL_MS <= 0) {
      return undefined
    }
    const intervalId = setInterval(() => refreshFeed(true), SERVER_ROOM_CAMERA_RELOAD_INTERVAL_MS)
    return () => clearInterval(intervalId)
  }, [refreshFeed])

  useEffect(() => {
    const timeoutMs = Number.isFinite(SERVER_ROOM_CAMERA_LOAD_TIMEOUT_MS) && SERVER_ROOM_CAMERA_LOAD_TIMEOUT_MS > 0
      ? SERVER_ROOM_CAMERA_LOAD_TIMEOUT_MS
      : 30_000

    const intervalId = setInterval(() => {
      if (document.visibilityState !== 'visible') return

      if (useHls) {
        const video = videoRef.current
        if (!video) return

        const currentTime = video.currentTime || 0
        if (currentTime > lastVideoTimeRef.current + 0.05) {
          lastVideoTimeRef.current = currentTime
          lastVideoProgressAtRef.current = Date.now()
          hlsRecoveryAttemptRef.current = 0
          return
        }

        if (Date.now() - lastVideoProgressAtRef.current > timeoutMs) {
          setFeedError('Camera stream paused. Reconnecting...')
          setFeedReloadNonce((value) => value + 1)
          lastVideoProgressAtRef.current = Date.now()
        }
        return
      }

      if (Date.now() - lastImageLoadAtRef.current > timeoutMs) {
        setFeedError('Camera feed is stale. Refreshing...')
        refreshFeed(true)
        lastImageLoadAtRef.current = Date.now()
      }
    }, 5000)

    return () => clearInterval(intervalId)
  }, [useHls, refreshFeed])

  useEffect(() => {
    const handleResume = () => {
      if (document.visibilityState !== 'visible') return
      const nextDate = followToday ? getTodayDateInputValue() : selectedDate

      if (followToday && nextDate !== selectedDate) {
        setSelectedDate(nextDate)
      } else {
        loadLogsForDate(nextDate, { silent: true })
      }

      checkHlsStatus()
      refreshFeed(true)
      lastImageLoadAtRef.current = Date.now()
      lastVideoProgressAtRef.current = Date.now()
    }

    window.addEventListener('focus', handleResume)
    window.addEventListener('pageshow', handleResume)
    document.addEventListener('visibilitychange', handleResume)

    return () => {
      window.removeEventListener('focus', handleResume)
      window.removeEventListener('pageshow', handleResume)
      document.removeEventListener('visibilitychange', handleResume)
    }
  }, [followToday, loadLogsForDate, checkHlsStatus, selectedDate, refreshFeed])

  const sortedLogs = useMemo(() => sortLogsByLatest(logs), [logs])
  const recognition = cameraStatus?.recognition || {}
  const liveDetections = recognition.latestDetections?.length ? recognition.latestDetections : recognition.latestFaces || []
  const primaryDetection = useMemo(() => {
    if (!liveDetections.length) return {}
    const authorized = liveDetections.find((detection) => String(detection.classification || '').toUpperCase() === 'AUTHORIZED')
    return authorized || liveDetections[0] || {}
  }, [liveDetections])
  const isEmployee = (
    String(recognition.latestDecision || '').toUpperCase() === 'EMPLOYEE'
    || String(primaryDetection.classification || '').toUpperCase() === 'AUTHORIZED'
  )
  const securityLabel = isEmployee ? 'EMPLOYEE' : 'UNKNOWN'
  const securityName = isEmployee
    ? [
        recognition.confirmedEmployeeName || primaryDetection.employeeName || 'Employee',
        recognition.confirmedEmployeeId || primaryDetection.employeeId || '',
      ].filter(Boolean).join(' | ')
    : 'Unknown'
  const securitySimilarity = Number.isFinite(Number(recognition.confirmedSimilarity))
    ? Number(recognition.confirmedSimilarity).toFixed(3)
    : primaryDetection.similarity != null
      ? Number(primaryDetection.similarity).toFixed(3)
      : 'n/a'
  const displayRect = useMemo(
    () => getContainRect(
      feedViewportSize.width,
      feedViewportSize.height,
      feedMediaSize.width,
      feedMediaSize.height
    ),
    [feedViewportSize, feedMediaSize]
  )
  const overlayDetections = useMemo(() => {
    if (!displayRect || !feedMediaSize.width || !feedMediaSize.height) {
      return []
    }

    return liveDetections
      .map((detection, index) => {
        const box = detection.boundingBox || {}
        const boxWidth = Number(box.width || 0)
        const boxHeight = Number(box.height || 0)
        const boxX = Number(box.x || 0)
        const boxY = Number(box.y || 0)

        if (boxWidth <= 0 || boxHeight <= 0) {
          return null
        }

        const squareSize = Math.max(boxWidth, boxHeight)
        const squareX = boxX + (boxWidth / 2) - (squareSize / 2)
        const squareY = boxY + (boxHeight / 2) - (squareSize / 2)
        const x = displayRect.x + (squareX / feedMediaSize.width) * displayRect.width
        const y = displayRect.y + (squareY / feedMediaSize.height) * displayRect.height
        const width = (squareSize / feedMediaSize.width) * displayRect.width
        const height = (squareSize / feedMediaSize.height) * displayRect.height

        return {
          id: `${detection.trackId || detection.signature || index}-${index}`,
          x,
          y,
          width,
          height,
          label: getDetectionLabel(detection),
          isAuthorized: String(detection.classification || '').toUpperCase() === 'AUTHORIZED',
          isImposter: String(detection.classification || '').toUpperCase() === 'IMPOSTER',
        }
      })
      .filter(Boolean)
  }, [displayRect, feedMediaSize, liveDetections])

  useEffect(() => {
    const element = feedContainerRef.current
    if (!element) return undefined

    const updateSize = () => {
      setFeedViewportSize({
        width: Math.max(0, element.clientWidth),
        height: Math.max(0, element.clientHeight),
      })
    }

    updateSize()

    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(updateSize)
      observer.observe(element)
      return () => observer.disconnect()
    }

    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [useHls])

  return (
    <section className="mb-12">
      <SectionHeader icon="🎥" title="Physical Security Monitoring" />
      <div className="grid gap-6 xl:grid-cols-[4fr_3fr]">
        <DashCard delay={1000} className="flex h-[72vh] min-h-[340px] flex-col overflow-hidden">
          <CardHeader
            title="Server Room Camera"
            badge={
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => refreshFeed(true)}
                  className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.24em] text-blue-700 transition hover:bg-blue-100"
                >
                  Refresh Feed
                </button>
              </div>
            }
          />

          <div ref={feedContainerRef} className="relative flex min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-slate-950">
            <div className="flex min-h-full w-full items-center justify-center bg-slate-950">
              {useHls ? (
                <video
                  ref={videoRef}
                  className="h-full w-full object-contain"
                  autoPlay
                  muted
                  playsInline
                  onLoadedMetadata={(event) => {
                    const media = event.currentTarget
                    setFeedMediaSize({
                      width: media.videoWidth || 0,
                      height: media.videoHeight || 0,
                    })
                  }}
                  onTimeUpdate={() => {
                    lastVideoProgressAtRef.current = Date.now()
                    lastVideoTimeRef.current = videoRef.current?.currentTime || 0
                    setFeedError('')
                  }}
                  onBlur={() => {}} // dummy to avoid linter issues if any
                />
              ) : (
                <img
                  ref={imgRef}
                  src={feedUrl}
                  alt="Server room live surveillance feed"
                  className="h-full w-full object-contain"
                  style={{ imageRendering: 'pixelated' }}
                  loading="eager"
                  onLoad={(event) => {
                    const media = event.currentTarget
                    setFeedMediaSize({
                      width: media.naturalWidth || 0,
                      height: media.naturalHeight || 0,
                    })
                    lastImageLoadAtRef.current = Date.now()
                    setFeedError('')
                  }}
                  onError={() => {
                    setFeedError('Unable to connect to camera frame proxy. Retrying...')
                    window.setTimeout(() => refreshFeed(true), 3000)
                  }}
                />
              )}
            </div>



            {feedError && (
              <div className="pointer-events-none absolute left-4 bottom-4 max-w-[calc(100%-2rem)] rounded-2xl border border-red-400/50 bg-red-600/90 px-4 py-3 text-sm font-semibold text-white shadow-xl">
                {feedError}
              </div>
            )}
          </div>
        </DashCard>

        <DashCard delay={1360} className="flex h-[72vh] min-h-[340px] flex-col overflow-hidden">
          <CardHeader
            title="Biometric Access Logs"
            actions={(
              <input
                type="date"
                value={selectedDate}
                onChange={(event) => {
                  const nextDate = event.target.value
                  setSelectedDate(nextDate)
                  setFollowToday(nextDate === getTodayDateInputValue())
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none transition focus:border-blue-400"
              />
            )}
          />

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          )}


          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-2xl border border-slate-200 bg-white">
            <div className="h-full w-full pr-2">
              <table className="w-full table-fixed divide-y divide-slate-200 text-left">
                <thead className="sticky top-0 bg-slate-50">
                  <tr>
                    <th className="w-[44%] px-3 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Employee</th>
                    <th className="w-[16%] px-3 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Access</th>
                    <th className="w-[40%] px-3 py-3 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading && (
                    <tr>
                      <td colSpan="3" className="px-3 py-10 text-center text-sm font-medium text-slate-400">
                        Loading access logs...
                      </td>
                    </tr>
                  )}

                  {!loading && !sortedLogs.length && !error && (
                    <tr>
                      <td colSpan="3" className="px-3 py-10 text-center text-sm font-medium text-slate-400">
                        No access logs available
                      </td>
                    </tr>
                  )}

                  {!loading && sortedLogs.map((log, index) => (
                    <tr key={`${log.employeeId}-${log.timestamp}-${index}`} className="hover:bg-slate-50/80">
                      <td className="truncate px-3 py-3 text-sm font-semibold text-slate-700">{log.name || log.employeeId || 'N/A'}</td>
                      <td className="px-3 py-3 text-sm">
                        <AccessBadge value={log.access} />
                      </td>
                      <td className="truncate px-3 py-3 text-sm text-slate-500">{log.timestamp || 'N/A'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </DashCard>
      </div>
    </section>
  )
}
