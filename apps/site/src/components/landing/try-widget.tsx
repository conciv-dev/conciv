import {getRouteApi} from '@tanstack/react-router'
import {useCallback, useRef, useState} from 'react'
import {Button} from '@/components/ui/button'
import {CONNECT_PORTS, findCore, mountWidget, seedOpenPanel} from '@/lib/connect-live'
import {TRY_DISMISSED_KEY, shouldAutoOpen} from '@/lib/try-state'
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

function maybeAutoOpen(navigate: Navigate): void {
  const tryParam = new URLSearchParams(window.location.search).get('try') === '1'
  const dismissed = localStorage.getItem(TRY_DISMISSED_KEY) === '1'
  if (shouldAutoOpen({tryParam, dismissed, widgetPresent: false})) void navigate({search: {try: 1}, replace: true})
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
  if (!open || !token) return <TryLauncher onOpen={onOpen} />
  return <TryPanel token={token} phase={phase === 'going-live' ? 'going-live' : 'waiting'} onClose={onClose} />
}

export function TryWidget() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [phase, setPhase] = useState<Phase>('waiting')
  const [token, setToken] = useState('')
  const [hidden, setHidden] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const startedRef = useRef(false)

  const boot = useCallback((navigateTo: Navigate): AbortController | null => {
    if (document.querySelector('[data-conciv-root]')) return null
    const freshToken = crypto.randomUUID()
    setToken(freshToken)
    const controller = new AbortController()
    void connectLoop(freshToken, controller.signal, setPhase)
    maybeAutoOpen(navigateTo)
    return controller
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const start = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) return stop()
      if (startedRef.current) return
      startedRef.current = true
      const controller = boot(navigate)
      if (!controller) return setHidden(true)
      abortRef.current = controller
    },
    [boot, navigate, stop],
  )

  const closePanel = () => {
    localStorage.setItem(TRY_DISMISSED_KEY, '1')
    void navigate({search: {}, replace: true})
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
