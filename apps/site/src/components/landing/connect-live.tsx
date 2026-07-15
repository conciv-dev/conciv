import {useCallback, useRef, useState} from 'react'
import {Badge} from '@/components/ui/badge'
import {Button} from '@/components/ui/button'
import {CONNECT_PORTS, findCore, mountWidget} from '@/lib/connect-live'
import {CopyButton} from './copy-button'

type Phase = 'idle' | 'waiting' | 'connected' | 'dev'

const ORIGIN = 'https://conciv.dev'

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      resolve()
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal.addEventListener('abort', onAbort, {once: true})
  })
}

async function healthy(base: string, signal: AbortSignal): Promise<boolean> {
  try {
    const response = await fetch(`${base}/health`, {signal})
    return response.ok
  } catch {
    return false
  }
}

async function watchHealth(base: string, signal: AbortSignal): Promise<void> {
  while (!signal.aborted && (await healthy(base, signal))) await sleep(5000, signal)
}

async function connectLoop(token: string, signal: AbortSignal, onPhase: (phase: Phase) => void): Promise<void> {
  while (!signal.aborted) {
    const base = await findCore(token, CONNECT_PORTS, (input, init) => fetch(input, init), signal)
    if (!base) {
      await sleep(2000, signal)
      continue
    }
    mountWidget(base)
    onPhase('connected')
    await watchHealth(base, signal)
    onPhase('waiting')
  }
}

function CopyRow({label, text}: {label: string; text: string}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border bg-secondary py-2 pl-3.5 pr-2 font-mono text-[12.5px]">
      <span className="min-w-0 flex-1 truncate" title={text}>
        {text}
      </span>
      <CopyButton.Root text={text}>
        <CopyButton.Trigger label={label} />
        <CopyButton.Feedback />
      </CopyButton.Root>
    </div>
  )
}

export function ConnectLive() {
  const [phase, setPhase] = useState<Phase>('idle')
  const [token, setToken] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const cleanupRef = useCallback((node: HTMLDivElement | null) => {
    if (node) return
    abortRef.current?.abort()
    abortRef.current = null
  }, [])

  const open = () => {
    if (document.querySelector('[data-conciv-root]')) {
      setPhase('dev')
      return
    }
    const freshToken = crypto.randomUUID()
    setToken(freshToken)
    setPhase('waiting')
    const controller = new AbortController()
    abortRef.current = controller
    void connectLoop(freshToken, controller.signal, setPhase)
  }

  if (phase === 'idle') {
    return (
      <div ref={cleanupRef} className="mt-6">
        <Button variant="outline" onClick={open}>
          <span className="size-1.5 rounded-full bg-primary" aria-hidden /> Try it live — connect your agent
        </Button>
      </div>
    )
  }

  if (phase === 'dev') {
    return (
      <div ref={cleanupRef} className="mt-6">
        <Badge variant="outline" className="gap-2 border-primary/30 text-primary">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden /> dev widget active
        </Badge>
      </div>
    )
  }

  if (phase === 'connected') {
    return (
      <div ref={cleanupRef} className="mt-6">
        <Badge variant="outline" className="gap-2 border-primary/30 text-primary">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden /> connected — agent on your machine
        </Badge>
      </div>
    )
  }

  return (
    <div ref={cleanupRef} className="mt-6 max-w-[52ch] rounded-xl border bg-card p-4">
      <p className="mb-3 text-[13px] font-semibold">Paste into Claude Code (or any agent CLI):</p>
      <CopyRow label="Copy agent prompt" text={`Read ${ORIGIN}/pair/${token} and follow the instructions`} />
      <p className="mb-3 mt-3 text-[13px] text-muted-foreground">Or run it yourself:</p>
      <CopyRow label="Copy connect command" text={`npx @conciv/try --token ${token}`} />
      <p className="mt-4 flex items-center gap-2 text-[12.5px] text-muted-foreground">
        <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
        waiting for your agent… Chrome will ask to allow local network access — that&apos;s your agent connecting.
      </p>
      <p className="mt-2 text-[12px] text-muted-foreground">
        Everything stays on your machine — prompts, code, and page snapshots never touch our servers.
      </p>
    </div>
  )
}
