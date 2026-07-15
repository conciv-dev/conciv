import {getRouteApi} from '@tanstack/react-router'
import {useCallback, useRef, useState} from 'react'
import {Button} from '@/components/ui/button'
import {CONNECT_PORTS, findCore, mountWidget, seedOpenPanel} from '@/lib/connect-live'
import {TRY_DISMISSED_KEY, shouldAutoOpen} from '@/lib/try-state'
import {TryLauncher} from './try-launcher'
import {TryPanel} from './try-panel'

type Phase = 'waiting' | 'going-live' | 'live'

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

export function TryWidget() {
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const [phase, setPhase] = useState<Phase>('waiting')
  const [token, setToken] = useState('')
  const [hidden, setHidden] = useState(false)
  const [everOpened, setEverOpened] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const startedRef = useRef(false)

  const start = useCallback(
    (node: HTMLDivElement | null) => {
      if (!node) {
        abortRef.current?.abort()
        abortRef.current = null
        return
      }
      if (startedRef.current) return
      startedRef.current = true
      if (document.querySelector('[data-conciv-root]')) {
        setHidden(true)
        return
      }
      const freshToken = crypto.randomUUID()
      setToken(freshToken)
      const controller = new AbortController()
      abortRef.current = controller
      void connectLoop(freshToken, controller.signal, setPhase)
      const tryParam = new URLSearchParams(window.location.search).get('try') === '1'
      const dismissed = localStorage.getItem(TRY_DISMISSED_KEY) === '1'
      if (shouldAutoOpen({tryParam, dismissed, widgetPresent: false})) {
        void navigate({search: {try: 1}, replace: true})
      }
    },
    [navigate],
  )

  const close = () => {
    localStorage.setItem(TRY_DISMISSED_KEY, '1')
    void navigate({search: {}, replace: true})
  }
  const open = () => {
    setEverOpened(true)
    void navigate({search: {try: 1}})
  }

  if (hidden || phase === 'live') return null
  const isOpen = search.try === 1
  if (isOpen && !everOpened) setEverOpened(true)

  return (
    <div ref={start}>
      {isOpen && token ? (
        <TryPanel
          token={token}
          phase={phase === 'going-live' ? 'going-live' : 'waiting'}
          stagger={!everOpened}
          onClose={close}
        />
      ) : (
        <TryLauncher onOpen={open} />
      )}
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
