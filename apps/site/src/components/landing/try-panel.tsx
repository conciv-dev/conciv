import {Check, X} from 'lucide-react'
import {useCallback, useRef, useState, type ReactNode} from 'react'
import {stepStates, type StepState, type TryStep} from '@/lib/try-steps'
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

function CopyRow({label, text, onCopy}: {label: string; text: string; onCopy: () => void}) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border bg-secondary py-2 pl-3.5 pr-2 font-mono text-[12.5px]">
      <span className="min-w-0 flex-1 truncate" title={text}>
        {text}
      </span>
      <CopyButton.Root text={text} onCopy={onCopy}>
        <CopyButton.Trigger label={label} />
        <CopyButton.Feedback />
      </CopyButton.Root>
    </div>
  )
}

const STEP_TITLES: Record<TryStep, string> = {
  copy: 'Copy the agent prompt',
  run: 'Run it in your terminal',
  approve: "Approve Chrome's local-network prompt",
}

function StepMarker({index, state}: {index: number; state: StepState}) {
  if (state === 'done') {
    return (
      <span className="inline-grid size-5 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-200">
        <Check className="size-3" aria-hidden />
      </span>
    )
  }
  return (
    <span
      data-state={state}
      className="inline-grid size-5 shrink-0 place-items-center rounded-full border text-[11px] text-muted-foreground transition-colors duration-200 data-[state=active]:border-primary data-[state=active]:text-primary"
    >
      {index}
    </span>
  )
}

function Step({index, state, title, children}: {index: number; state: StepState; title: string; children?: ReactNode}) {
  return (
    <li data-state={state} className="group flex gap-3">
      <StepMarker index={index} state={state} />
      <div className="flex min-w-0 flex-1 flex-col gap-2 pt-px">
        <p className="text-[13px] font-semibold transition-colors duration-200 group-data-[state=pending]:text-muted-foreground">
          {title}
        </p>
        {children}
      </div>
    </li>
  )
}

export function TryPanel({token, connected, onClose}: {token: string; connected: boolean; onClose: () => void}) {
  const [stagger] = useState(claimStagger)
  const [copied, setCopied] = useState(false)
  const [slow, setSlow] = useState(false)
  const slowTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const slowTimer = useCallback((node: HTMLElement | null) => {
    if (node) {
      slowTimerRef.current = setTimeout(() => setSlow(true), SLOW_HINT_MS)
      return
    }
    clearTimeout(slowTimerRef.current)
  }, [])
  const states = stepStates({copied, connected})
  const markCopied = () => setCopied(true)

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
          <p className="text-[15px] font-semibold">Drive this page with your agent.</p>
        </Item>
        <Item stagger={stagger} order={1}>
          <p className="text-[13px] text-muted-foreground">
            Your coding agent connects from <b className="font-semibold text-foreground">your</b> machine and takes the
            wheel — nothing to sign up for.
          </p>
        </Item>
        <Item stagger={stagger} order={2}>
          <ol className="mt-1 flex flex-col gap-4">
            <Step index={1} state={states.copy} title={STEP_TITLES.copy}>
              <CopyRow
                label="Copy agent prompt"
                text={`Read ${ORIGIN}/pair/${token} and follow the instructions`}
                onCopy={markCopied}
              />
              <details>
                <summary className="w-fit cursor-pointer text-[12.5px] text-muted-foreground transition-colors duration-150 hover:text-foreground">
                  or run it yourself
                </summary>
                <div className="mt-2">
                  <CopyRow label="Copy connect command" text={`npx @conciv/try --token ${token}`} onCopy={markCopied} />
                </div>
              </details>
            </Step>
            <Step index={2} state={states.run} title={STEP_TITLES.run}>
              <p className="text-[12.5px] text-muted-foreground">First run installs the package (~30s).</p>
            </Step>
            <Step index={3} state={states.approve} title={STEP_TITLES.approve}>
              <p className="text-[12.5px] text-muted-foreground">
                Chrome asks to allow local network access — that&apos;s your agent connecting. Approve it.
              </p>
            </Step>
          </ol>
        </Item>
        {connected ? (
          <p
            role="status"
            className="mt-auto flex items-center gap-2 text-[13px] font-semibold text-primary motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-1 motion-safe:duration-200"
          >
            <Check className="size-4" aria-hidden /> Agent connected
          </p>
        ) : (
          <p className="mt-auto flex items-center gap-2 text-[12.5px] text-muted-foreground">
            <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
            waiting for your agent…
          </p>
        )}
        {slow && !connected ? (
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
