import {createSignal, Match, onCleanup, onMount, Show, Switch, type JSX} from 'solid-js'
import {getHostApi, makeExtRpcClient} from '@conciv/extension'
import type {TerminalRouter} from '../server.js'

type Snapshot = {state: string; source: string; lastSeenAt: number}

const STALE_AFTER_MS = 60_000
const TICK_MS = 15_000

const PILL =
  'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-pw-pill text-[0.6875rem] text-pw-text-2 bg-pw-fill border border-pw-line'

async function consumePresence(
  client: ReturnType<typeof makeExtRpcClient<TerminalRouter>>,
  sessionId: string,
  signal: AbortSignal,
  onSnapshot: (snapshot: Snapshot) => void,
): Promise<void> {
  const iterator = await client.presence({sessionId}, {signal, context: {retry: Number.POSITIVE_INFINITY}})
  for await (const snapshot of iterator) onSnapshot(snapshot)
}

function connectPresence(
  apiBase: string,
  sessionId: string | null,
  onSnapshot: (snapshot: Snapshot) => void,
): () => void {
  const controller = new AbortController()
  if (!sessionId) return () => controller.abort()
  const client = makeExtRpcClient<TerminalRouter>(apiBase, 'terminal')
  void consumePresence(client, sessionId, controller.signal, onSnapshot).catch(() => {})
  return () => controller.abort()
}

function minutesAgo(lastSeenAt: number, now: number): number {
  return Math.max(1, Math.round((now - lastSeenAt) / 60_000))
}

export function TerminalPresencePill(): JSX.Element {
  const host = getHostApi()
  const apiBase = host.useApiBase()
  const sessionId = host.useSessionId()
  const [snapshot, setSnapshot] = createSignal<Snapshot | null>(null)
  const [now, setNow] = createSignal(Date.now())

  onMount(() => {
    const stop = connectPresence(apiBase, sessionId(), (next) => {
      setSnapshot(next)
      setNow(Date.now())
    })
    const timer = setInterval(() => setNow(Date.now()), TICK_MS)
    onCleanup(() => {
      stop()
      clearInterval(timer)
    })
  })

  const live = () => {
    const current = snapshot()
    return current && current.state !== 'idle' ? current : null
  }
  const stale = () => {
    const current = live()
    return current !== null && now() - current.lastSeenAt >= STALE_AFTER_MS
  }

  return (
    <Show when={live()}>
      {(current) => (
        <span class={PILL}>
          <span
            class="rounded-full size-1.75"
            classList={{
              'bg-pw-success': !stale() && current().state === 'connected',
              'bg-pw-accent anim-pulse': !stale() && current().state === 'working',
              'bg-pw-text-3 anim-pulse': !stale() && current().state === 'launching',
              'bg-pw-text-3': stale(),
            }}
            aria-hidden="true"
          />
          <Switch>
            <Match when={stale()}>Terminal seen {minutesAgo(current().lastSeenAt, now())}m ago</Match>
            <Match when={current().state === 'working'}>Terminal working…</Match>
            <Match when={current().state === 'launching'}>Terminal opening…</Match>
            <Match when={current().state === 'connected'}>Terminal connected</Match>
          </Switch>
        </span>
      )}
    </Show>
  )
}
