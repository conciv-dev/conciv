import {createSignal, createUniqueId, Match, onCleanup, onMount, Show, Switch, type JSX} from 'solid-js'
import type {UIMessage} from '@conciv/protocol/chat-types'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import type {ToolCallPart} from '@tanstack/ai-client'
import {makeExtRpcClient} from '@conciv/extension'
import type {TerminalRouter} from '../server.js'
import {ChevronRight} from 'lucide-solid'
import {Button, createResizable, readStorage, writeStorage} from '@conciv/ui-kit-system'
import {Activity, useActivity} from '@conciv/ui-kit-chat'
import {builtinToolCards, nowTitle} from '@conciv/ui-kit-chat-tools'

type MirrorStatus = 'connecting' | 'open' | 'error'

const OPEN_KEY = 'conciv.terminal.rail.open'
const WIDTH_KEY = 'conciv.terminal.rail.width'

async function consumeMirror(
  client: ReturnType<typeof makeExtRpcClient<TerminalRouter>>,
  sessionId: string,
  signal: AbortSignal,
  onMessages: (messages: UIMessage[]) => void,
  onStatus: (status: MirrorStatus) => void,
): Promise<void> {
  onStatus('connecting')
  const iterator = await client.mirror({sessionId}, {signal, context: {retry: Number.POSITIVE_INFINITY}})
  onStatus('open')
  for await (const payload of iterator) {
    onMessages(payload.messages)
    onStatus('open')
  }
}

function connectMirror(
  apiBase: string,
  sessionId: string | null,
  onMessages: (messages: UIMessage[]) => void,
  onStatus: (status: MirrorStatus) => void,
): () => void {
  const controller = new AbortController()
  const client = makeExtRpcClient<TerminalRouter>(apiBase, 'terminal', {
    onRetry: () => onStatus('connecting'),
  })
  if (!sessionId) {
    onStatus('error')
    return () => controller.abort()
  }
  void consumeMirror(client, sessionId, controller.signal, onMessages, onStatus).catch(() => {
    if (!controller.signal.aborted) onStatus('error')
  })
  return () => controller.abort()
}

const PLACEHOLDER = 'text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)] px-3 py-4 leading-[1.5] text-center'

function statusDotClass(status: MirrorStatus): Record<string, boolean> {
  return {
    'bg-pw-success': status === 'open',
    'bg-pw-danger': status === 'error',
    'bg-pw-text-3 anim-pulse motion-reduce:animate-none': status === 'connecting',
  }
}

function RailPlaceholder(props: {status: MirrorStatus}): JSX.Element {
  return (
    <p class={PLACEHOLDER}>
      <Switch>
        <Match when={props.status === 'error'}>Can’t reach activity, retrying…</Match>
        <Match when={props.status === 'connecting'}>Connecting…</Match>
        <Match when={props.status === 'open'}>
          Claude’s replies, reasoning and tool calls appear here as it works.
        </Match>
      </Switch>
    </p>
  )
}

const SHIMMER =
  '[background-image:linear-gradient(90deg,var(--chat-text-3),var(--chat-text-hi),var(--chat-text-3))] [background-size:200%_100%] bg-clip-text text-transparent anim-think-shimmer motion-reduce:animate-none motion-reduce:[color:var(--chat-text-3)]'

function RailHeader(props: {
  status: MirrorStatus
  open: boolean
  logId: string
  count: number
  onToggle: () => void
}): JSX.Element {
  const activity = useActivity()
  const collapsedTitle = () => {
    const call = activity.activeCall()
    return !props.open && activity.live() && call ? activity.label(call) : null
  }
  return (
    <div class="flex shrink-0 min-w-0 items-center">
      <Button
        variant="ghost"
        size="sm"
        class="m-1 gap-1.5 min-w-0"
        aria-expanded={props.open}
        aria-controls={props.logId}
        onClick={() => props.onToggle()}
      >
        <ChevronRight
          class="size-3.5 trans-tf150 motion-reduce:transition-none"
          classList={{'rotate-90': props.open}}
          aria-hidden="true"
        />
        <span class="rounded-full size-1.75 trans-bg" classList={statusDotClass(props.status)} aria-hidden="true" />
        Activity
        <Show when={props.count > 0}>
          <span class="text-pw-text-3 tabular-nums">{props.count}</span>
        </Show>
        <Show when={collapsedTitle()}>
          {(title) => <span class={`text-pw-text-3 min-w-0 truncate ${SHIMMER}`}>{title()}</span>}
        </Show>
      </Button>
    </div>
  )
}

export function MirrorRail(props: {
  apiBase: string
  sessionId: () => string | null
  ctx: ToolViewCtx
  busy: () => boolean
}): JSX.Element {
  const [open, setOpen] = createSignal(
    readStorage(OPEN_KEY, (raw) => (raw === 'true' ? true : raw === 'false' ? false : undefined), true),
  )
  const setOpenPersisted = (next: boolean) => {
    setOpen(next)
    writeStorage(OPEN_KEY, next)
  }
  const resize = createResizable({
    initial: 352,
    min: 220,
    storageKey: WIDTH_KEY,
    grow: () => 'left',
    collapseAt: 140,
    onCollapse: () => open() && setOpenPersisted(false),
  })
  const [messages, setMessages] = createSignal<UIMessage[]>([])
  const [status, setStatus] = createSignal<MirrorStatus>('connecting')
  onMount(() => {
    const stop = connectMirror(props.apiBase, props.sessionId(), setMessages, setStatus)
    onCleanup(stop)
  })
  const titles = Object.fromEntries(
    builtinToolCards.flatMap((entry) =>
      entry.streamTitle ? entry.names.map((name) => [name, entry.streamTitle ?? '']) : [],
    ),
  )
  const label = (part: ToolCallPart) => nowTitle(part, titles)
  const logId = createUniqueId()
  return (
    <div
      class="flex flex-1 shrink-0 flex-col max-w-[60vw] min-h-0 min-w-0 relative"
      classList={{'[border-left:1px_solid_var(--chat-line)]': open()}}
      style={{width: open() ? `${resize.size()}px` : undefined}}
    >
      <Show when={open()}>
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize activity panel"
          aria-valuenow={Math.round(resize.size())}
          tabIndex={0}
          class="rounded-full w-1.5 cursor-ew-resize trans-bg bottom-0 left-0 top-0 absolute z-10 hover:bg-pw-fill-strong -translate-x-1/2"
          classList={{'bg-pw-fill-strong': resize.isResizing()}}
          onPointerDown={resize.onPointerDown}
          onKeyDown={resize.onKeyDown}
        />
      </Show>
      <Activity.Root
        messages={messages()}
        live={props.busy()}
        label={label}
        tools={builtinToolCards}
        ctx={props.ctx}
        class="flex-1 min-h-0"
      >
        <RailHeader
          status={status()}
          open={open()}
          logId={logId}
          count={messages().length}
          onToggle={() => setOpenPersisted(!open())}
        />
        <Show when={open()}>
          <Show when={messages().length > 0} fallback={<RailPlaceholder status={status()} />}>
            <Activity.Timeline id={logId} aria-label="Terminal activity" />
          </Show>
          <Activity.Now />
        </Show>
      </Activity.Root>
    </div>
  )
}
