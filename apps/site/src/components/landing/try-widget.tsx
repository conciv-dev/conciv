import {getRouteApi} from '@tanstack/react-router'
import {useCallback, useRef, useState} from 'react'
import {Button} from '@/components/ui/button'
import {CONNECT_PORTS, findCore, mountWidget, seedOpenPanel} from '@/lib/connect-live'
import {dismissTry, getTrySession} from '@/lib/try-session.functions'
import {shouldAutoOpen} from '@/lib/try-state'
import {TryLauncher} from './try-launcher'
import {TryPanel} from './try-panel'

type Phase = 'waiting' | 'going-live' | 'live'
type Navigate = ReturnType<typeof route.useNavigate>

const route = getRouteApi('/')
const GOING_LIVE_MS = 600

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function connectLoop(token: string, signal: AbortSignal, onPhase: (phase: Phase) => void): Promise<void> {
  while (!signal.aborted) {
    const base = await findCore(token, CONNECT_PORTS, (input, init) => fetch(input, init), signal)
    if (!base) {
      await sleep(2000, signal)
      continue
    }
    onPhase('going-live')
    await seedOpenPanel(base).catch((error: unknown) => console.error('conciv seed failed', error))
    await sleep(GOING_LIVE_MS, signal)
    mountWidget(base)
    onPhase('live')
    return
  }
}

async function beginSession(
  signal: AbortSignal,
  navigate: Navigate,
  tryParam: boolean,
  onToken: (token: string) => void,
  onPhase: (phase: Phase) => void,
): Promise<void> {
  const {token, dismissed} = await getTrySession()
  if (signal.aborted) return
  onToken(token)
  if (shouldAutoOpen({tryParam, dismissed, widgetPresent: false})) {
    void navigate({search: {try: 1}, replace: true})
  }
  await connectLoop(token, signal, onPhase)
}

function TryOverlay({
  open,
  token,
  phase,
  onClose,
  onOpen,
}: {
  open: boolean
  token: string
  phase: Phase
  onClose: () => void
  onOpen: () => void
}) {
  if (!open || !token) return <TryLauncher label="Open the live demo panel" onActivate={onOpen} />
  return (
    <>
      <TryLauncher label="Hide the live demo panel" onActivate={onClose} />
      <TryPanel token={token} phase={phase === 'going-live' ? 'going-live' : 'waiting'} onClose={onClose} />
    </>
  )
}

export function TryWidget() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [phase, setPhase] = useState<Phase>('waiting')
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
      const tryParam = new URLSearchParams(window.location.search).get('try') === '1'
      void beginSession(controller.signal, navigate, tryParam, setToken, setPhase).catch((error: unknown) =>
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
      <TryOverlay open={search.try === 1} token={token} phase={phase} onClose={closePanel} onOpen={openPanel} />
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
