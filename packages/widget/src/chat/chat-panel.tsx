import {createMemo, createEffect, createSignal, For, Index, Match, onCleanup, Show, Switch, type JSX} from 'solid-js'
import {Progress} from '@mandarax/ui-kit-system'
import {useChat, fetchServerSentEvents, createChatClientOptions} from '@tanstack/ai-solid'
import type {MessagePart, ToolCallPart, ToolResultPart, UIMessage} from '@tanstack/ai-client'
import {apiError, type SessionClient} from '@mandarax/api-client'
import {invalidateSessions} from '../client/session-store-client.js'
import {createDebouncer} from '@tanstack/solid-pacer'
import {GenUi} from './gen-ui.js'
import {ToolCallCard, ChainOfThought, Reasoning, NowLine, nowTitle, type ToolViewCtx, type ToolCardEntry} from '@mandarax/tool-ui'
import {Markdown} from './markdown.js'
import type {PendingApproval} from '../shell/approval-modal.js'
import {ArrowRight, Square, SquarePen, FoldVertical} from 'lucide-solid'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {MANDARAX_UI_EVENT, UiSpecSchema, type UiSpec} from '@mandarax/protocol/ui-types'
import {
  MANDARAX_USAGE_EVENT,
  UsageSnapshotSchema,
  tokenUsageToSnapshot,
  type UsageSnapshot,
} from '@mandarax/protocol/usage-types'
import type {ComposerActionDef, ComposerControlDef, PanelDef} from '../shell/widget-shell.js'
import {GrabReference} from '../page/react-grab/grab-reference.js'
import type {Grab, GrabApi} from '@mandarax/grab'
import {ExtensionSurface, type ExtensionHostBag, type ExtensionInstance} from '../extension/extension-slots.js'
import {EmptyStateSlot} from '../shell/empty-state.js'
import {grabApi} from '../page/grab-api.js'

// One message's tool-call ↔ tool-result pairing. Each tool-call renders one card (from
// @mandarax/tool-ui) with its sibling result inline; the standalone result part is then hidden.
// An orphan result (no matching call — rare) still renders via the fallback.
type ResultPairing = {byCallId: Map<string, ToolResultPart>; hiddenResultIds: Set<string>}

function pairResults(parts: ReadonlyArray<MessagePart>): ResultPairing {
  const callIds = new Set<string>()
  for (const p of parts) if (p.type === 'tool-call' && p.id) callIds.add(p.id)
  const byCallId = new Map<string, ToolResultPart>()
  const hiddenResultIds = new Set<string>()
  for (const p of parts) {
    if (p.type !== 'tool-result' || !p.toolCallId) continue
    byCallId.set(p.toolCallId, p)
    if (callIds.has(p.toolCallId)) hiddenResultIds.add(p.toolCallId)
  }
  return {byCallId, hiddenResultIds}
}

// A tool call is settled once its result lands (complete/error) or its own output is populated.
function callSettled(part: ToolCallPart, result: ToolResultPart | undefined): boolean {
  return result?.state === 'complete' || result?.state === 'error' || part.output !== undefined
}

// The present-tense label of the most recent still-running tool call in a message, for the now-line.
function activeCallTitle(parts: ReadonlyArray<MessagePart>, titleByName: Record<string, string>): string | null {
  const {byCallId} = pairResults(parts)
  let title: string | null = null
  for (const p of parts) {
    if (p.type !== 'tool-call' || !p.id) continue
    title = callSettled(p, byCallId.get(p.id)) ? title : nowTitle(p, titleByName)
  }
  return title
}

// Width the staged grab preview scales to fit — sits comfortably inside the min (300px) panel width.
const GRAB_PREVIEW_MAX_W = 280

// Composed utility strings (no .pw-* classes). Each background/display lives on its own variant so
// UnoCSS never has to break a same-property tie. Message rows + composer carry data-pw-msg /
// data-pw-input hooks (hydrating compound + IT/qt). Icons are `size-5 block`; sr-only is a uno.config shortcut.
const SEND_SHELL =
  'ml-auto size-8.5 rounded-pw-pill [border:none] cursor-pointer text-[1rem] shrink-0 inline-flex items-center justify-center trans-send [&:active:not(:disabled)]:scale-[0.92] [&:disabled]:opacity-40 [&:disabled]:cursor-default'
const SEND = `${SEND_SHELL} bg-pw-accent text-pw-on-accent [&:hover:not(:disabled)]:bg-pw-accent-hi`
const STOP = `${SEND_SHELL} bg-pw-text-3 text-pw-panel [&:hover:not(:disabled)]:bg-pw-text-2`
const ACT =
  'size-8.5 rounded-pw-pill [border:none] bg-transparent text-pw-text-2 cursor-pointer shrink-0 inline-flex items-center justify-center trans-color-bg hover:text-pw-text-hi hover:bg-pw-fill-strong'
// MSG_SHELL carries no marker; the message rows get `data-pw-msg` so the hydrating compound matches.
const MSG_SHELL = 'rounded-pw-md max-w-[90%] anim-msg'
const MSG = `${MSG_SHELL} py-2 px-2.75`
const MSG_USER = 'self-end bg-pw-accent text-pw-on-accent'
const MSG_ASSISTANT = 'self-start bg-pw-fill [&>:first-child]:mt-0 [&>:last-child]:mb-0'
const TOOL_GLYPH = 'size-2.75 shrink-0 inline-block rounded-[50%]'
const TOOL_DISCLOSURE = 'mt-1.5 text-pw-text-2'
const TOOL_SUMMARY = 'cursor-pointer [user-select:none] text-[0.6875rem]'
const TOOL_PRE =
  'mt-1.5 mx-0 py-1.75 px-2 bg-pw-sunken rounded-[0.4375rem] overflow-x-auto whitespace-pre-wrap [word-break:break-word] text-[0.6875rem] leading-[1.4]'
// Stagger delay lives inside the animation shorthand (static literals; a separate [animation-delay:] is reset by the shorthand).
const DOT = 'w-1.5 h-1.5 rounded-[50%] bg-pw-text-2'
const ERROR = 'flex gap-2 items-center text-pw-danger text-[0.75rem]'
const RETRY =
  'py-1.5 px-2.5 min-h-8 rounded-[0.4375rem] border border-pw-danger-line bg-transparent text-pw-danger cursor-pointer font-semibold text-[0.75rem] leading-none font-pw shrink-0 trans-bg hover:bg-pw-danger-14'
const DIVIDER =
  "self-stretch flex items-center gap-2.5 my-1.5 mx-0.5 anim-msg before:content-[''] before:flex-1 before:h-px before:bg-pw-line-soft after:content-[''] after:flex-1 after:h-px after:bg-pw-line-soft"
const DIVIDER_LABEL =
  'inline-flex items-center gap-1.25 text-[0.6875rem] font-medium tracking-[0.06em] [text-transform:uppercase]'

function asText(content: ToolResultPart['content']): string {
  if (typeof content === 'string') return content
  return JSON.stringify(content, null, 2)
}

// Fallback for an ORPHAN tool-result part (no matching tool-call in the message — rare). Paired
// results are rendered inside their tool card and hidden here; this only catches the stray case.
function ToolResult(props: {part: ToolResultPart}): JSX.Element {
  return (
    <Show
      when={props.part.state === 'error'}
      fallback={
        <details class={TOOL_DISCLOSURE}>
          <summary class={TOOL_SUMMARY}>result</summary>
          <pre class={TOOL_PRE}>{asText(props.part.content)}</pre>
        </details>
      }
    >
      <div class="text-[0.6875rem] text-pw-danger mt-1.5 flex gap-1.5 items-center">
        <span class={`${TOOL_GLYPH} bg-pw-danger`} aria-hidden="true" />
        {props.part.error ?? asText(props.part.content)}
      </div>
    </Show>
  )
}

function TextPartView(props: {content: string; streaming: boolean}): JSX.Element {
  return (
    <div class="m-0">
      <Markdown text={props.content} streaming={props.streaming} />
    </div>
  )
}

// Narrowing accessors: read the discriminated part as its concrete type for the matched branch,
// returning null otherwise (no `as` casts — the type guard narrows the value Solid hands back).
// Accept undefined so an out-of-range index lookup (noUncheckedIndexedAccess) renders nothing.
function asTextPart(part: MessagePart | undefined): Extract<MessagePart, {type: 'text'}> | null {
  return part?.type === 'text' ? part : null
}
function asThinkingPart(part: MessagePart | undefined): Extract<MessagePart, {type: 'thinking'}> | null {
  return part?.type === 'thinking' && part.content.trim().length > 0 ? part : null
}
function asToolCallPart(part: MessagePart | undefined): ToolCallPart | null {
  return part?.type === 'tool-call' ? part : null
}
function asResultPart(part: MessagePart | undefined): ToolResultPart | null {
  return part?.type === 'tool-result' ? part : null
}

function ChainPart(props: {
  part: MessagePart | undefined
  pairing: ResultPairing
  ctx: ToolViewCtx
  tools?: () => ToolCardEntry[]
  durationFor?: (toolCallId: string) => number | undefined
}): JSX.Element {
  return (
    <Switch>
      <Match when={asThinkingPart(props.part)}>{(p) => <Reasoning content={p().content} />}</Match>
      <Match when={asToolCallPart(props.part)}>
        {(p) => (
          <ToolCallCard
            part={p()}
            result={props.pairing.byCallId.get(p().id)}
            ctx={props.ctx}
            tools={props.tools}
            durationMs={props.durationFor?.(p().id)}
          />
        )}
      </Match>
      <Match when={asResultPart(props.part)}>
        {(p) => (
          <Show when={!props.pairing.hiddenResultIds.has(p().toolCallId)}>
            <ToolResult part={p()} />
          </Show>
        )}
      </Match>
    </Switch>
  )
}

function ReplyPart(props: {part: MessagePart | undefined; streaming: boolean}): JSX.Element {
  return (
    <Show when={asTextPart(props.part)}>
      {(p) => <TextPartView content={p().content} streaming={props.streaming} />}
    </Show>
  )
}

type ChainSegment = {kind: 'chain'; indices: number[]}
type ReplySegment = {kind: 'reply'; index: number}
type Segment = ChainSegment | ReplySegment

const isReplyText = (part: MessagePart): boolean => part.type === 'text' && part.content.trim().length > 0

// Consecutive reasoning + tool parts fold into one chain; a non-empty reply text breaks it.
function groupSegments(parts: ReadonlyArray<MessagePart>): Segment[] {
  return parts.reduce<Segment[]>((segments, part, index) => {
    if (isReplyText(part)) return [...segments, {kind: 'reply', index}]
    const last = segments.at(-1)
    return last?.kind === 'chain'
      ? [...segments.slice(0, -1), {kind: 'chain', indices: [...last.indices, index]}]
      : [...segments, {kind: 'chain', indices: [index]}]
  }, [])
}

function MessageParts(props: {
  parts: ReadonlyArray<MessagePart>
  streaming: boolean
  ctx: ToolViewCtx
  tools?: () => ToolCardEntry[]
  durationFor?: (toolCallId: string) => number | undefined
}): JSX.Element {
  const pairing = createMemo(() => pairResults(props.parts))
  const segments = createMemo(() => groupSegments(props.parts))
  const lastTextIndex = createMemo(() => props.parts.map((p) => p.type).lastIndexOf('text'))
  const asChain = (seg: Segment): ChainSegment | null => (seg.kind === 'chain' ? seg : null)
  const asReply = (seg: Segment): ReplySegment | null => (seg.kind === 'reply' ? seg : null)
  const isLastSegment = (index: number) => index === segments().length - 1
  return (
    <Index each={segments()}>
      {(seg, segIndex) => (
        <Switch>
          <Match when={asChain(seg())}>
            {(chain) => (
              <ChainOfThought streaming={props.streaming && isLastSegment(segIndex)}>
                <Index each={chain().indices}>
                  {(partIndex) => (
                    <ChainPart
                      part={props.parts[partIndex()]}
                      pairing={pairing()}
                      ctx={props.ctx}
                      tools={props.tools}
                      durationFor={props.durationFor}
                    />
                  )}
                </Index>
              </ChainOfThought>
            )}
          </Match>
          <Match when={asReply(seg())}>
            {(reply) => (
              <ReplyPart
                part={props.parts[reply().index]}
                streaming={props.streaming && reply().index === lastTextIndex()}
              />
            )}
          </Match>
        </Switch>
      )}
    </Index>
  )
}

// One user question and the AI's full answer span several messages (think → tool → think → … → reply).
// Coalesce consecutive assistant messages into one turn so the whole answer renders as a single
// chain-of-thought plus its reply, not one box per step.
type Turn = {key: string; role: UIMessage['role']; parts: MessagePart[]; start: number; end: number}

function coalesceTurns(messages: ReadonlyArray<UIMessage>): Turn[] {
  return messages.reduce<Turn[]>((turns, m, index) => {
    const last = turns.at(-1)
    if (m.role === 'assistant' && last?.role === 'assistant') {
      return [...turns.slice(0, -1), {...last, parts: [...last.parts, ...m.parts], end: index}]
    }
    return [...turns, {key: m.id, role: m.role, parts: [...m.parts], start: index, end: index}]
  }, [])
}

// A session boundary in the scrollback: a hairline rule with a quiet centered label. Marks where a
// new session began or the context was compacted; everything above stays readable and scrollable.
// `pending` (a compaction still running) shows "Compacting…" with a spinning icon, so the label never
// claims "Context compacted" before the turn finishes.
function Divider(props: {kind: 'new' | 'compact'; pending?: boolean}): JSX.Element {
  const Icon = props.kind === 'new' ? SquarePen : FoldVertical
  const label = () => (props.kind === 'new' ? 'New session' : props.pending ? 'Compacting…' : 'Context compacted')
  return (
    <div
      class={DIVIDER}
      classList={{'text-pw-accent-link': props.pending, 'text-pw-text-3': !props.pending}}
      role="separator"
      aria-label={label()}
    >
      <span class={DIVIDER_LABEL}>
        <Icon class={`size-3 ${props.pending ? '[transform-origin:center] anim-compact' : ''}`} aria-hidden="true" />
        {label()}
      </span>
    </div>
  )
}

// Shown in the Send slot while a compaction runs. Claude's /compact reports no numeric progress
// (only compacting→done), so this is an indeterminate spinner: an Ark Progress circle rendered as a
// fixed arc (value=25) and spun via CSS. The wrapper carries the live status for screen readers; the
// Progress itself is aria-hidden so SR doesn't announce a misleading "25%".
function CompactSpinner(): JSX.Element {
  return (
    <div
      class="ml-auto inline-flex shrink-0 size-8.5 items-center justify-center"
      role="status"
      aria-label="Compacting context…"
    >
      <Progress.Root value={25} class="block [--size:1.375rem] [--thickness:0.15625rem]" aria-hidden="true">
        <Progress.Circle class="[transform-origin:center] anim-compact">
          <Progress.CircleTrack class="stroke-pw-line-2" />
          <Progress.CircleRange class="[stroke-linecap:round] stroke-pw-accent" />
        </Progress.Circle>
      </Progress.Root>
    </div>
  )
}

function ThinkingBubble(): JSX.Element {
  return (
    <div class={`${MSG_SHELL}  ${MSG_ASSISTANT} p-2.75 inline-flex gap-1 items-center`} data-pw-msg aria-hidden="true">
      <span class={`${DOT} anim-dot1`} aria-hidden="true" />
      <span class={`${DOT} anim-dot2`} aria-hidden="true" />
      <span class={`${DOT} anim-dot3`} aria-hidden="true" />
    </div>
  )
}

// One agent session: owns its useChat + generative-UI state and renders the thread log
// plus the composer. Layout-agnostic — the modal panel, a quick-terminal pane, and a PiP
// body all render this same component. Chrome (header, open/close, FAB) lives in the shell.
export function ChatPanel(props: {
  apiBase: string
  // The active harness id (claude/codex/…), passed to each tool card's ToolViewCtx so renderers can
  // adapt if needed. Known at mount from /models; threaded through chatPanelDef.
  harnessId: string
  // This surface's session client — owns the active mandarax_ id; switching it reloads the thread in
  // place. The single comms seam (session reads, the chat stream, the permission gate).
  client: SessionClient
  // The containing surface is visible/focused — focus the composer and hydrate on first show.
  active?: boolean
  // Live-region writer for switch/error announcements (owner provides one outside any inert pane).
  announce?: (msg: string, assertive?: boolean) => void
  // Reports whether the agent is thinking/streaming, so the shell can pulse the trigger.
  onWorkingChange?: (working: boolean) => void
  // The tool cards to dispatch by name (built-ins + extension tools), passed by the host like the
  // composer actions; ToolCallCard matches each tool-call part to its card.
  tools?: () => ToolCardEntry[]
  // Shell-registered composer-action buttons (e.g. the element picker), rendered in the actions row.
  composerActions?: () => ComposerActionDef[]
  // Shell-registered composer controls (e.g. the model selector), rendered in the actions row.
  composerControls?: () => ComposerControlDef[]
  // Reports the session's latest usage snapshot, so the shell can render a context tracker.
  onUsageChange?: (usage: UsageSnapshot | null) => void
  // Reports this thread's pending native approvals, so the shell can surface them while the panel
  // is closed. Cleared on unmount.
  onApprovalsChange?: (approvals: PendingApproval[]) => void
  // Reports the resolved session name for the chrome to surface a just-born row.
  onSessionLabel?: (name: string | null) => void
  // The surface's "new session" handler (modal opens a fresh panel); absent → in-place new session.
  onNewSession?: () => void | Promise<void>
  // The extensions to paint into the surface slots; each one's Component branches on useSlot().
  instances: ExtensionInstance[]
}): JSX.Element {
  const client = props.client
  const [genUi, setGenUi] = createSignal<UiSpec[]>([])
  const [usage, setUsage] = createSignal<UsageSnapshot | null>(null)
  // The agent's `mandarax ui …` calls arrive as AG-UI CUSTOM events; render each in the thread.
  // Live usage updates arrive on the same channel (injected by core mid-turn).
  const onMandaraxUi = (eventType: string, data: unknown) => {
    if (eventType === MANDARAX_USAGE_EVENT) {
      const parsed = UsageSnapshotSchema.safeParse(data)
      if (parsed.success) setUsage((prev) => ({...prev, ...parsed.data}))
      return
    }
    if (eventType !== MANDARAX_UI_EVENT) return
    const parsed = UiSpecSchema.safeParse(data)
    if (!parsed.success) return
    const spec = parsed.data
    setGenUi((prev) => {
      const existing = prev.find((g) => g.renderId === spec.renderId)
      // The vitest card is persistent and self-updating; don't replace it on a duplicate inject.
      if (existing && spec.kind === 'vitest') return prev
      return [...prev.filter((g) => g.renderId !== spec.renderId), spec]
    })
  }
  // Per-tool wall-clock for the card meta ("0.4s"). tanstack parts carry no timing slot, so we time
  // it off the raw event stream with the Performance API: mark on TOOL_CALL_START, measure when the
  // result lands. Keyed by toolCallId; the reactive map drives the card meta.
  const callStarts = new Map<string, number>()
  const [durations, setDurations] = createSignal<Record<string, number>>({})
  const durationFor = (toolCallId: string): number | undefined => durations()[toolCallId]
  // Usage rides RUN_FINISHED.usage (native AG-UI), read off the raw chunk stream.
  const onChunk = (chunk: StreamChunk) => {
    if (chunk.type === EventType.RUN_FINISHED && chunk.usage) setUsage(tokenUsageToSnapshot(chunk.usage))
    if (chunk.type === EventType.TOOL_CALL_START && !callStarts.has(chunk.toolCallId)) {
      callStarts.set(chunk.toolCallId, performance.now())
    }
    if (chunk.type === EventType.TOOL_CALL_RESULT) {
      const start = callStarts.get(chunk.toolCallId)
      if (start !== undefined) setDurations((prev) => ({...prev, [chunk.toolCallId]: performance.now() - start}))
    }
  }
  // Extra POST-body fields contributed by composer controls (e.g. the model selector's {model}).
  // The panel stays ignorant of their meaning; it just merges patches and ships them each turn.
  const [requestMeta, setRequestMeta] = createSignal<Record<string, unknown>>({})
  const mergeRequestMeta = (patch: Record<string, unknown>) => setRequestMeta((prev) => ({...prev, ...patch}))
  const chat = useChat({
    ...createChatClientOptions({
      connection: fetchServerSentEvents(client.chatStreamUrl(), () => ({
        credentials: 'include',
        headers: client.chatHeaders(),
        body: requestMeta(),
      })),
    }),
    onCustomEvent: onMandaraxUi,
    onChunk,
  })
  const [input, setInput] = createSignal('')
  // Grabbed-element previews staged above the composer (composer draft state, cleared on send). The
  // textarea holds only the user's prose — each grab's text context is kept here and composed in at
  // send time, so removing a chip drops exactly that grab and never touches what the user typed.
  const [grabs, setGrabs] = createSignal<Grab[]>([])
  // The session id whose thread is currently loaded into this panel. Shared by first-activation
  // hydrate and switching, so neither double-loads. undefined until the first load lands.
  const loadedSessionId = {current: null as string | null}
  const [switching, setSwitching] = createSignal(false)
  const [switchError, setSwitchError] = createSignal(false)
  const stickToBottom = {current: true}
  let inputEl: HTMLTextAreaElement | undefined
  let logEl: HTMLDivElement | undefined

  const isThinking = () => chat.status() === 'submitted'
  const isStreaming = () => chat.status() === 'streaming'
  const lastIndex = () => chat.messages().length - 1
  const isActiveAssistant = (index: number, role: string) =>
    isStreaming() && role === 'assistant' && index === lastIndex()

  // Host-app seams the tool cards need: send a follow-up message, answer a native tool approval.
  const toolCtx: ToolViewCtx = {
    apiBase: props.apiBase,
    harnessId: props.harnessId,
    sendMessage: (text) => void chat.sendMessage(text),
    // Answer a native tool approval out-of-band: the harness owns the loop and blocks on its gate, so
    // the decision can't ride the one-way stream back; this unblocks the pending gate in core.
    respondApproval: (approvalId, approved) => void client.permissionDecision({approvalId, approved}).catch(() => {}),
  }

  // Pending native approvals for this thread, derived straight from the messages. `answered` covers
  // the window between a click and the stream flipping the part off `approval-requested`, so a request
  // isn't shown twice. Reported up to the shell, which renders the modal when the panel is closed.
  const [answered, setAnswered] = createSignal<readonly string[]>([])
  const pendingApprovals = createMemo<PendingApproval[]>(() =>
    chat
      .messages()
      .flatMap((m) => m.parts)
      .map(asToolCallPart)
      .filter((p): p is ToolCallPart => !!p && p.state === 'approval-requested' && !!p.approval)
      .filter((p) => !answered().includes(p.approval!.id))
      .map((p) => ({
        id: p.approval!.id,
        title: nowTitle(p),
        decide: (approved: boolean) => {
          setAnswered((prev) => [...prev, p.approval!.id])
          toolCtx.respondApproval?.(p.approval!.id, approved)
        },
      })),
  )
  createEffect(() => props.onApprovalsChange?.(pendingApprovals()))
  onCleanup(() => props.onApprovalsChange?.([]))

  // The single morphing "now" line: the most recent still-running tool call's title while streaming,
  // else null (hidden). Settled cards stay in the thread above it; the stop control is pinned right.
  const streamTitles = (): Record<string, string> =>
    Object.fromEntries(
      (props.tools?.() ?? []).flatMap((entry) =>
        entry.streamTitle ? entry.names.map((name) => [name, entry.streamTitle ?? '']) : [],
      ),
    )
  const nowTitleText = (): string | null => {
    if (!isStreaming()) return null
    const last = chat.messages()[lastIndex()]
    if (!last || last.role !== 'assistant') return null
    return activeCallTitle(last.parts, streamTitles())
  }

  // Surface the working state for the shell's trigger pulse.
  createEffect(() => props.onWorkingChange?.(isThinking() || isStreaming()))

  // Surface the latest usage snapshot for the shell's context tracker.
  createEffect(() => props.onUsageChange?.(usage()))

  // When a turn finishes, the harness may have minted/renamed the session — refresh the label and
  // (debounced) the session list, since a new/renamed session may now exist on disk.
  const invalidate = createDebouncer(() => void invalidateSessions(props.apiBase), {wait: 400})
  let wasWorking = false
  createEffect(() => {
    const working = isThinking() || isStreaming()
    if (wasWorking && !working) {
      void client.session().then((s) => props.onSessionLabel?.(s.name))
      invalidate.maybeExecute()
    }
    wasWorking = working
  })

  // Screen-reader announcements. The log itself is aria-live="off" (streaming would otherwise
  // flood it token-by-token); instead we announce status transitions once into a polite region —
  // concise, not the message body (echoing a long reply into a live region can't be paused or
  // navigated; the reply text stays readable in the role="log" via browse mode).
  const [liveMsg, setLiveMsg] = createSignal('')
  let prevStatus = ''
  createEffect(() => {
    const s = chat.status()
    if (s === 'submitted') setLiveMsg('mandarax is thinking…')
    else if (prevStatus === 'streaming' && s !== 'streaming') setLiveMsg('mandarax replied.')
    prevStatus = s
  })

  const answerGenUi = (renderId: string, text: string) => {
    setGenUi((prev) => prev.filter((g) => g.renderId !== renderId))
    void chat.sendMessage(text)
  }

  // Auto-scroll to bottom as the agent streams, but only while the user is already at the bottom.
  const logRef = (el: HTMLDivElement) => {
    logEl = el
    const atBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight < 40
    el.addEventListener('scroll', () => {
      stickToBottom.current = atBottom()
    })
    // Coalesce the streaming mutation flood into one scroll write per frame — reading scrollHeight
    // and writing scrollTop on every token would force a layout per delta.
    let scheduled = false
    const observer = new MutationObserver(() => {
      if (!stickToBottom.current || scheduled) return
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        el.scrollTop = el.scrollHeight
      })
    })
    observer.observe(el, {childList: true, subtree: true, characterData: true})
    onCleanup(() => observer.disconnect())
  }

  // Load (or switch to) a session's thread. First load just hydrates; a real switch stops any
  // in-flight turn, shows the switching overlay, and load-then-swaps so the prior thread stays put
  // on failure (never a blank panel). setMessages happens only after a successful fetch.
  const loadSession = async (id: string | null) => {
    const isSwitch = loadedSessionId.current !== null
    setSwitchError(false)
    if (isSwitch) {
      chat.stop()
      setSwitching(true)
      logEl?.setAttribute('data-pw-hydrating', '')
      props.announce?.('Loading session…')
    }
    try {
      const session = await client.session()
      props.onSessionLabel?.(session.name)
      setUsage(session.usage ?? null)
      // No harness token → empty thread on a switch (the New-session action keeps scrollback instead).
      if (session.harnessSessionId === null) {
        if (isSwitch) chat.setMessages([])
        loadedSessionId.current = id
        void invalidateSessions(props.apiBase)
        return
      }
      const prior = await client.history()
      if (isSwitch || prior.length > 0) chat.setMessages(prior)
      loadedSessionId.current = id
    } catch {
      // First load: just start from the greeting. A switch: keep the current thread + flag the error.
      if (isSwitch) {
        setSwitchError(true)
        props.announce?.('Couldn’t load that session', true)
      }
    } finally {
      setSwitching(false)
      logEl?.removeAttribute('data-pw-hydrating')
    }
  }

  // First activation hydrates; thereafter a sessionId change (resolve/switch) drives an in-place
  // reload. client.sessionId() is reactive — it flips from null to our id once resolve lands.
  createEffect(() => {
    const id = client.sessionId()
    if (!props.active || !id) return
    if (id === loadedSessionId.current) {
      requestAnimationFrame(() => inputEl?.focus())
      return
    }
    void loadSession(id).then(() => requestAnimationFrame(() => inputEl?.focus()))
  })

  // Grow the composer with its content up to the CSS max-height (120px), then it scrolls.
  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const submit = (e: Event) => {
    e.preventDefault()
    const text = input().trim()
    if (!text || chat.isLoading() || compacting()) return
    // Each staged grab's element context grounds the message ahead of the user's instruction.
    const context = grabs()
      .map((g) => g.text)
      .join('\n')
    const message = context ? `${context}\n\n${text}` : text
    setInput('')
    setGrabs([])
    if (inputEl) inputEl.style.height = 'auto'
    void chat.sendMessage(message)
  }

  const focusInput = () =>
    requestAnimationFrame(() => {
      if (inputEl) {
        autoGrow(inputEl)
        inputEl.focus()
      }
    })

  // Append inserted text (e.g. a grabbed element reference) into THIS composer for the user to edit.
  const insert = (text: string) => {
    setInput((prev) => (prev ? `${prev}\n${text}` : text))
    focusInput()
  }

  // Stage a grabbed element as a preview chip. Its text context is held in `grabs`, not the input.
  const stageGrab = (g: Grab) => {
    setGrabs((prev) => [...prev, g])
    focusInput()
  }

  // Remove one staged chip (by reference). Pure draft state — the user's typed text is untouched.
  const removeGrab = (g: Grab) => setGrabs((prev) => prev.filter((x) => x !== g))

  // Session boundaries drawn into the scrollback — the prior thread is never wiped, just separated.
  // `afterCount` is the message count at insert time, so the divider renders before the next message.
  const dividerSeq = {n: 0}
  const [dividers, setDividers] = createSignal<{id: number; afterCount: number; kind: 'new' | 'compact'}[]>([])
  const addDivider = (kind: 'new' | 'compact'): number => {
    const id = (dividerSeq.n += 1)
    setDividers((prev) => [...prev, {id, afterCount: chat.messages().length, kind}])
    return id
  }
  const removeDivider = (id: number) => setDividers((prev) => prev.filter((d) => d.id !== id))
  const dividersAt = (i: number) => dividers().filter((d) => d.afterCount === i)
  const dividersInRange = (start: number, end: number) =>
    dividers().filter((d) => d.afterCount >= start && d.afterCount <= end)
  const resetUsage = () => setUsage(null)

  // In-place new session (quick-terminal): mark a divider, resolve a fresh id, pre-mark it loaded so
  // the reload is skipped (the prior thread stays as scrollback).
  const startNewSession = async () => {
    addDivider('new')
    const {sessionId} = await client.resolve()
    loadedSessionId.current = sessionId
    client.setSessionId(sessionId)
  }
  // The surface's handler wins (the modal opens a fresh pane); else the in-place flow above.
  const doNewSession = () => (props.onNewSession ? props.onNewSession() : startNewSession())

  // Compact the conversation. The turn runs OUT OF BAND — never through useChat — so NOTHING is
  // appended to the thread: no '/compact' command bubble, no summary. The divider is the only UI,
  // exactly like Claude Code's /compact. claude runs native /compact (emits no text anyway); other
  // harnesses run a summarize turn whose output we deliberately drain and discard. The stream MUST be
  // read to the end — closing early aborts the dev server's child mid-compaction.
  // pendingCompactId = the just-added compact divider while its turn is in flight. It drives BOTH the
  // Send-slot spinner and the divider wording, so the divider reads "Compacting…" until the turn
  // actually finishes, then flips to "Context compacted" (never claiming done while still running).
  const [pendingCompactId, setPendingCompactId] = createSignal<number | null>(null)
  const compacting = () => pendingCompactId() !== null
  const compact = async () => {
    if (chat.isLoading() || compacting()) return
    const id = addDivider('compact')
    setPendingCompactId(id)
    try {
      const res = await fetch(client.chatStreamUrl(), {
        method: 'POST',
        credentials: 'include',
        headers: {'content-type': 'application/json', ...client.chatHeaders()},
        body: JSON.stringify({
          messages: [{role: 'user', content: '/compact'}],
          forwardedProps: {...requestMeta(), intent: 'compact'},
        }),
      })
      if (!res.ok) throw apiError('/api/chat', res.status) // 409 session busy, etc.
      await res.body?.pipeTo(new WritableStream())
      // Server persisted post-compaction usage on RUN_FINISHED → reflect the smaller context.
      const session = await client.session()
      if (session.usage) setUsage(session.usage)
    } catch {
      // Any failure (HTTP non-2xx, network, abort): drop the optimistic boundary and tell the user,
      // so the divider never flips to the false "Context compacted".
      removeDivider(id)
      setLiveMsg('Compaction failed — the session may be busy. Try again in a moment.')
    } finally {
      setPendingCompactId(null)
    }
  }

  // Which action is mid-flight (e.g. lazy-loading react-grab), keyed by action id.
  // Transient notice above the composer (e.g. "command copied"); also mirrored to the aria-live
  // region. Auto-dismisses; re-notifying resets the timer.
  const [notice, setNotice] = createSignal('')
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  const notify = (message: string) => {
    setNotice(message)
    setLiveMsg(message)
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => setNotice(''), 5000)
  }

  const [busyAction, setBusyAction] = createSignal<string | null>(null)
  const runAction = (a: ComposerActionDef) => {
    void Promise.resolve(
      a.onClick({
        insert,
        stageGrab,
        setBusy: (b) => setBusyAction(b ? a.id : null),
        apiBase: props.apiBase,
        client,
        addDivider,
        newSession: doNewSession,
        resetUsage,
        compact,
        notify,
        requestMeta,
      }),
    )
  }

  // The per-panel host context every extension Component reads via useContext(). The element-grab API
  // is global (one picker) except stage, which lands in THIS panel's composer.
  const grab: GrabApi = {...grabApi, stage: stageGrab}
  const hostBag: ExtensionHostBag = {
    ...toolCtx,
    insert,
    notify,
    setBusy: (busy) => setBusyAction(busy ? `extension:${props.harnessId}` : null),
    newSession: () => void doNewSession(),
    addDivider: (kind) => void addDivider(kind),
    compact: () => void compact(),
    resetUsage,
    client,
    requestMeta,
    grab,
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(e)
    }
  }

  return (
    <>
      <ExtensionSurface name="header" instances={props.instances} bag={hostBag} />
      <ExtensionSurface name="widget" instances={props.instances} bag={hostBag} />
      <div class="p-3.5 flex flex-1 flex-col gap-2.5 relative overflow-y-auto" role="log" aria-live="off" ref={logRef}>
        <Show
          when={chat.messages().length > 0}
          fallback={
            <EmptyStateSlot
              onStarter={(s) => void chat.sendMessage(s)}
              instances={props.instances}
              bag={hostBag}
            />
          }
        >
          <Index each={coalesceTurns(chat.messages())}>
            {(turn) => (
              <>
                <For each={dividersInRange(turn().start, turn().end)}>
                  {(d) => <Divider kind={d.kind} pending={d.id === pendingCompactId()} />}
                </For>
                <div class={`${MSG}  ${turn().role === 'user' ? MSG_USER : MSG_ASSISTANT}`} data-pw-msg>
                  <MessageParts
                    parts={turn().parts}
                    streaming={isActiveAssistant(turn().end, turn().role)}
                    ctx={toolCtx}
                    tools={props.tools}
                    durationFor={durationFor}
                  />
                </div>
              </>
            )}
          </Index>
          {/* Boundaries inserted after the last message (e.g. right after New session, before the
              next turn streams) render here at the tail of the thread. */}
          <For each={dividersAt(chat.messages().length)}>
            {(d) => <Divider kind={d.kind} pending={d.id === pendingCompactId()} />}
          </For>
        </Show>
        <For each={genUi()}>
          {(spec) => <GenUi spec={spec} onAnswer={(text) => answerGenUi(spec.renderId, text)} />}
        </For>
        <Show when={isThinking()}>
          <ThinkingBubble />
        </Show>
        <Show when={nowTitleText()}>{(title) => <NowLine title={title()} onStop={() => chat.stop()} />}</Show>
        <Show when={chat.error()}>
          {(error) => (
            <div class={ERROR} role="alert">
              <span class="flex-1">{error().message}</span>
              <button type="button" class={RETRY} onClick={() => void chat.reload()}>
                Retry
              </button>
            </div>
          )}
        </Show>
        <Show when={switchError()}>
          <div class={ERROR} role="alert">
            <span class="flex-1">Couldn’t load that session</span>
            <button type="button" class={RETRY} onClick={() => void loadSession(client.sessionId())}>
              Retry
            </button>
          </div>
        </Show>
        <Show when={switching()}>
          <div
            class="bg-pw-panel-60 inset-0 absolute z-[5] anim-switching"
            role="status"
            aria-label="Loading session…"
            tabindex={-1}
          />
        </Show>
      </div>
      <ExtensionSurface name="status" instances={props.instances} bag={hostBag} />
      <ExtensionSurface name="footer" instances={props.instances} bag={hostBag} />
      <Show when={notice()}>
        <div class="text-[0.75rem] text-pw-text-2 leading-[1.4] font-medium font-pw mx-3 mb-2 px-2.5 py-2 border border-pw-line rounded-pw-md bg-pw-fill [word-break:break-word]">
          {notice()}
        </div>
      </Show>
      <form class="p-3 border-t border-t-pw-line-soft" onSubmit={submit}>
        <For each={grabs()}>
          {(g) => <GrabReference grab={g} maxWidth={GRAB_PREVIEW_MAX_W} onRemove={() => removeGrab(g)} />}
        </For>
        <div class="px-1.5 pb-1.5 pt-1 border border-pw-line rounded-pw-md bg-pw-fill trans-composer focus-within:border-pw-accent focus-within:ring-accent">
          <textarea
            class="text-pw-text leading-[1.45] px-2 pb-1 pt-2 bg-transparent max-h-30 w-full block resize-none [border:none] [font:inherit] focus:outline-none"
            data-pw-input
            rows={1}
            placeholder="Ask a question…"
            aria-label="Message the mandarax agent"
            value={input()}
            onInput={(e) => {
              setInput(e.currentTarget.value)
              autoGrow(e.currentTarget)
            }}
            onKeyDown={onKeyDown}
            ref={(el) => {
              inputEl = el
            }}
          />
          <div class="pt-0.5 flex gap-0.5 items-center">
            <For each={props.composerActions?.() ?? []}>
              {(a) => {
                const Icon = a.icon
                return (
                  <button
                    type="button"
                    class={ACT}
                    aria-label={a.label}
                    title={a.label}
                    classList={{'opacity-60': busyAction() === a.id, 'cursor-progress': busyAction() === a.id}}
                    onClick={() => runAction(a)}
                  >
                    <Icon class="size-5 block" />
                  </button>
                )
              }}
            </For>
            <ExtensionSurface name="composer" instances={props.instances} bag={hostBag} />
            <For each={props.composerControls?.() ?? []}>
              {(c) => c.create({apiBase: props.apiBase, setRequestMeta: mergeRequestMeta})}
            </For>
            <Switch
              fallback={
                <button type="submit" class={SEND} aria-label="Send" disabled={!input().trim()}>
                  <ArrowRight class="size-5 block" aria-hidden="true" />
                </button>
              }
            >
              <Match when={compacting()}>
                <CompactSpinner />
              </Match>
              <Match when={chat.isLoading()}>
                <button type="button" class={STOP} aria-label="Stop" onClick={() => chat.stop()}>
                  <Square class="size-5 block" fill="currentColor" aria-hidden="true" />
                </button>
              </Match>
            </Switch>
          </div>
        </div>
      </form>
      <div class="sr-only" role="status" aria-live="polite">
        {liveMsg()}
      </div>
    </>
  )
}

// The chat as a registerable shell panel. The modal hosts one; quick-terminal panes each create
// their own (a fresh agent session per pane).
export function chatPanelDef(
  apiBase: string,
  harnessId: string,
  tools: () => ToolCardEntry[],
  instances: ExtensionInstance[],
): PanelDef {
  return {
    id: 'chat',
    title: 'mandarax',
    apiBase,
    create: (ctx) => (
      <ChatPanel
        apiBase={apiBase}
        harnessId={harnessId}
        client={ctx.client}
        active={ctx.active()}
        announce={ctx.announce}
        onWorkingChange={ctx.onWorkingChange}
        onUsageChange={ctx.onUsageChange}
        onApprovalsChange={ctx.onApprovalsChange}
        onSessionLabel={ctx.onSessionLabel}
        onNewSession={ctx.onNewSession}
        tools={tools}
        instances={instances}
        composerActions={ctx.composerActions}
        composerControls={ctx.composerControls}
      />
    ),
  }
}
