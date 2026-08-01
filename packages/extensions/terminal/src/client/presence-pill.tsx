import {createSignal, Match, onCleanup, onMount, Show, Switch, type JSX} from 'solid-js'
import {getHostApi} from '@conciv/extension'
import type {SessionSnapshot} from '@conciv/session-observer/types'
import {observeTerminal} from './terminal-context.js'

const TICK_MS = 15_000

const PILL =
  'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pw-pill text-[0.6875rem] text-pw-text-2 bg-pw-fill border border-pw-line max-w-full min-w-0'

const RELATIVE_TIME = new Intl.RelativeTimeFormat(undefined, {numeric: 'auto'})

function seenLabel(lastEvidenceWallAt: number, now: number): string {
  const minutes = Math.min(-1, Math.round((lastEvidenceWallAt - now) / 60_000))
  if (minutes > -60) return RELATIVE_TIME.format(minutes, 'minute')
  return RELATIVE_TIME.format(Math.round(minutes / 60), 'hour')
}

function failed(snapshot: SessionSnapshot): boolean {
  return snapshot.health.ok === false
}

export function PresencePillView(props: {snapshot: SessionSnapshot | null; now: number}): JSX.Element {
  const live = (): SessionSnapshot | null => {
    const current = props.snapshot
    if (current === null) return null
    if (current.state === 'idle' && !failed(current)) return null
    return current
  }
  return (
    <span class="flex items-center min-h-5 min-w-0" aria-live="polite" aria-atomic="true">
      <Show when={live()}>
        {(current) => (
          <span class={PILL}>
            <span
              class="rounded-full shrink-0 size-1.75"
              classList={{
                'bg-pw-danger': failed(current()),
                'bg-pw-warn': !failed(current()) && current().state === 'stale',
                'bg-pw-success': !failed(current()) && current().state === 'connected',
                'bg-pw-accent anim-pulse': !failed(current()) && current().state === 'working',
                'bg-pw-text-3 anim-pulse': !failed(current()) && current().state === 'launching',
              }}
              aria-hidden="true"
            />
            <span class="min-w-0 truncate">
              <Switch>
                <Match when={failed(current())}>Can’t read the terminal transcript</Match>
                <Match when={current().state === 'stale'}>
                  Terminal may still be busy · seen {seenLabel(current().lastEvidenceWallAt, props.now)}
                </Match>
                <Match when={current().state === 'working'}>Terminal working…</Match>
                <Match when={current().state === 'launching'}>Terminal opening…</Match>
                <Match when={current().state === 'connected'}>Terminal connected</Match>
              </Switch>
            </span>
          </span>
        )}
      </Show>
    </span>
  )
}

export function TerminalPresencePill(): JSX.Element {
  const host = getHostApi()
  const apiBase = host.useApiBase()
  const sessionId = host.useSessionId()
  const observation = observeTerminal(apiBase(), sessionId())
  const [now, setNow] = createSignal(Date.now())

  onMount(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    onCleanup(() => clearInterval(timer))
  })

  return <PresencePillView snapshot={observation.snapshot()} now={now()} />
}
