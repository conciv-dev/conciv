import {X} from 'lucide-react'
import {useCallback, useRef, useState, type ReactNode} from 'react'
import {CopyButton} from './copy-button'

const ORIGIN = 'https://conciv.dev'
const SLOW_HINT_MS = 60_000

let hasStaggered = false

function claimStagger(): boolean {
  const first = !hasStaggered
  hasStaggered = true
  return first
}

function Item({stagger, order, children}: {stagger: boolean; order: number; children: ReactNode}) {
  if (!stagger) return children
  return (
    <div
      className="motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-backwards motion-safe:duration-300"
      style={{animationDelay: `${order * 40}ms`}}
    >
      {children}
    </div>
  )
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

export function TryPanel({token, onClose}: {token: string; onClose: () => void}) {
  const [stagger] = useState(claimStagger)
  const [slow, setSlow] = useState(false)
  const slowTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const slowTimer = useCallback((node: HTMLElement | null) => {
    if (node) {
      slowTimerRef.current = setTimeout(() => setSlow(true), SLOW_HINT_MS)
      return
    }
    clearTimeout(slowTimerRef.current)
  }, [])

  return (
    <section
      ref={slowTimer}
      aria-label="Try conciv live"
      className="fixed bottom-[5.25rem] right-5 z-40 flex h-[35rem] max-h-[calc(100vh-7.5rem)] w-[30rem] max-w-[calc(100vw-2.5rem)] origin-bottom-right animate-in flex-col overflow-hidden rounded-xl border bg-card fade-in slide-in-from-bottom-2 zoom-in-[0.97] shadow-xl duration-200 ease-out motion-reduce:zoom-in-100 motion-reduce:slide-in-from-bottom-0"
    >
      <header className="flex items-center justify-between border-b px-4 py-3">
        <span className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="size-1.5 rounded-full bg-primary" aria-hidden /> conciv — live demo
        </span>
        <button
          type="button"
          aria-label="Close the live demo panel"
          onClick={onClose}
          className="inline-grid size-7 place-items-center rounded-md text-muted-foreground transition-[color,transform] duration-150 hover:text-foreground active:scale-[0.97]"
        >
          <X className="size-4" />
        </button>
      </header>
      <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
        <Item stagger={stagger} order={0}>
          <p className="text-[14px]">
            No agent connected yet. Point <b className="font-semibold">your</b> coding agent at this page and it drives
            the widget for real — from your machine.
          </p>
        </Item>
        <Item stagger={stagger} order={1}>
          <p className="text-[13px] font-semibold">Paste into Claude Code (or any agent CLI):</p>
        </Item>
        <Item stagger={stagger} order={2}>
          <CopyRow label="Copy agent prompt" text={`Read ${ORIGIN}/pair/${token} and follow the instructions`} />
        </Item>
        <Item stagger={stagger} order={3}>
          <p className="text-[13px] text-muted-foreground">Or run it yourself:</p>
        </Item>
        <Item stagger={stagger} order={4}>
          <CopyRow label="Copy connect command" text={`npx @conciv/try --token ${token}`} />
        </Item>
        <p className="mt-auto flex items-center gap-2 text-[12.5px] text-muted-foreground">
          <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
          waiting for your agent… Chrome will ask to allow local network access — that&apos;s your agent connecting.
        </p>
        {slow ? (
          <p className="text-[12px] text-muted-foreground">
            Taking a while? See the{' '}
            <a href="/docs" className="underline underline-offset-2">
              quickstart
            </a>{' '}
            for setup help.
          </p>
        ) : null}
        <p className="text-[12px] text-muted-foreground">
          Everything stays on your machine — prompts, code, and page snapshots never touch our servers.
        </p>
      </div>
      <footer className="border-t p-3">
        <input
          type="text"
          disabled
          placeholder="Connect an agent to start chatting…"
          aria-label="Message input, disabled until an agent connects"
          className="w-full rounded-lg border bg-secondary px-3 py-2 text-[13px] disabled:opacity-60"
        />
      </footer>
    </section>
  )
}
