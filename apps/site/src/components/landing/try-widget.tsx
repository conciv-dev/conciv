import {getRouteApi} from '@tanstack/react-router'
import {useCallback, useRef, useState} from 'react'
import {Button} from '@/components/ui/button'
import {CONNECT_PORTS, mountWidget, probeCore} from '@/lib/connect-live'
import {dismissTry, getTrySession} from '@/lib/try-session.functions'
import {shouldAutoOpen} from '@/lib/try-state'
import {TryLauncher} from './try-launcher'
import {TryPanel} from './try-panel'

type Phase = 'boot' | 'waiting' | 'connected' | 'live'
type Navigate = ReturnType<typeof route.useNavigate>

const route = getRouteApi('/')
const PREFLIGHT_TIMEOUT_MS = 2500
const POLL_INTERVAL_MS = 2000
const CONNECTED_FLASH_MS = 800

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

function probe(token: string, signal: AbortSignal): Promise<string | null> {
  return probeCore(token, CONNECT_PORTS, (input, init) => fetch(input, init), signal)
}

function autoOpen(navigate: Navigate, dismissed: boolean): void {
  const tryParam = new URLSearchParams(window.location.search).get('try') === '1'
  if (shouldAutoOpen({tryParam, dismissed, widgetPresent: false})) void navigate({search: {try: 1}, replace: true})
}

async function pollForCore(token: string, signal: AbortSignal, onPhase: (phase: Phase) => void): Promise<void> {
  while (!signal.aborted) {
    await sleep(POLL_INTERVAL_MS, signal)
    const base = signal.aborted ? null : await probe(token, signal)
    if (!base) continue
    onPhase('connected')
    mountWidget(base)
    await sleep(CONNECTED_FLASH_MS, signal)
    onPhase('live')
    return
  }
}

async function beginSession(
  signal: AbortSignal,
  navigate: Navigate,
  onToken: (token: string) => void,
  onPhase: (phase: Phase) => void,
): Promise<void> {
  const {token, dismissed} = await getTrySession()
  const preflight = signal.aborted
    ? null
    : await probe(token, AbortSignal.any([signal, AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS)]))
  if (signal.aborted) return
  if (preflight) {
    mountWidget(preflight)
    onPhase('live')
    return
  }
  onToken(token)
  onPhase('waiting')
  autoOpen(navigate, dismissed)
  await pollForCore(token, signal, onPhase)
}

function TryOverlay({
  open,
  token,
  connected,
  onClose,
  onOpen,
}: {
  open: boolean
  token: string
  connected: boolean
  onClose: () => void
  onOpen: () => void
}) {
  if (!open || !token) return <TryLauncher label="Open the live demo panel" onActivate={onOpen} />
  return (
    <>
      <TryLauncher label="Hide the live demo panel" onActivate={onClose} />
      <TryPanel token={token} connected={connected} onClose={onClose} />
    </>
  )
}

export function TryWidget() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [phase, setPhase] = useState<Phase>('boot')
  const [token, setToken] = useState('')
  const [hidden, setHidden] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const startedRef = useRef(false)

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const start = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return stop()
      if (startedRef.current) return
      startedRef.current = true
      if (document.querySelector('[data-conciv-root]')) return setHidden(true)
      const controller = new AbortController()
      abortRef.current = controller
      void beginSession(controller.signal, navigate, setToken, setPhase).catch((error: unknown) =>
        console.error('conciv try session failed', error),
      )
    },
    [navigate, stop],
  )

  const closePanel = () => {
    void dismissTry()
      .catch(() => {})
      .then(() => navigate({search: {}, replace: true}))
  }
  const openPanel = () => void navigate({search: {try: 1}})

  if (hidden || phase === 'live') return null
  return (
    <div ref={start}>
      {phase === 'waiting' || phase === 'connected' ? (
        <TryOverlay
          open={search.try === 1}
          token={token}
          connected={phase === 'connected'}
          onClose={closePanel}
          onOpen={openPanel}
        />
      ) : null}
    </div>
  )
}

export function TryLiveButton() {
  const navigate = route.useNavigate()
  const [hidden, setHidden] = useState(false)
  const watch = useCallback((node: HTMLElement | null) => {
    if (!node) return
    if (document.querySelector('[data-conciv-root]')) setHidden(true)
    window.addEventListener('conciv:widget-mounted', () => setHidden(true), {once: true})
  }, [])

  if (hidden) return null
  return (
    <div ref={watch} className="mt-6">
      <Button variant="outline" onClick={() => void navigate({search: {try: 1}})}>
        <span className="size-1.5 rounded-full bg-primary" aria-hidden /> Try it live — connect your agent
      </Button>
    </div>
  )
}
