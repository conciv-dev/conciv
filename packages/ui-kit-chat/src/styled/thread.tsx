import {
  createContext,
  createMemo,
  mapArray,
  Match,
  onMount,
  Show,
  Switch,
  untrack,
  useContext,
  type Accessor,
  type Component,
  type JSX,
  type ParentProps,
} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {createStore} from 'solid-js/store'
import {Key} from '@solid-primitives/keyed'
import {isEqual, sumBy} from 'es-toolkit'
import ArrowDown from 'lucide-solid/icons/arrow-down'
import {TruncatedTextGroup} from '@conciv/ui-kit-system'
import {
  PromptPresentationSchema,
  type ChatMessage,
  type ChatPart,
  type ToolCallPart,
} from '@conciv/protocol/chat-message-types'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {useThread} from '../store/chat-context.js'
import {useToolCtx} from '../store/tool-context.js'
import {Thread as ThreadPrimitive} from '../primitives/thread/thread.js'
import {Message, shownAttachmentParts} from '../primitives/message/message.js'
import {useMessage} from '../primitives/message/message-context.js'
import {
  CHAIN_GROUP_KEY,
  groupNodeIdentity,
  groupParts,
  isOutsideTurn,
  shareGroupNodes,
  lastGroupedIndex,
  type GroupEntry,
  type GroupKey,
  type GroupNode,
  type GroupNodeGroup,
  type GroupNodePart,
  type GroupRenderProps,
  type Grouping,
  type Turn,
} from '../store/grouping.js'
import {summaryLine, turnRollup, type TurnRollup} from '../store/turn-rollup.js'
import {resolveRowMark} from '../tools/primitives/tool-row.js'
import {activeCallInParts} from '../store/active-call.js'
import {nowTitle} from '../tools/primitives/now-title.js'
import {createGrouping, type PageSessionConfig} from '../store/page-session.js'
import {useViewportInternal} from '../primitives/thread/viewport-internal.js'
import {useThreadViewport} from '../primitives/thread/viewport-context.js'
import {TurnEstimateProvider} from '../primitives/thread/turn-estimate.js'
import {createTurnEstimator} from './text-metrics.js'
import {
  ANSWER_ACTION_ROW_CLASS,
  ANSWER_CONTENT_CLASS,
  ANSWER_CONTENT_SETTLED_CLASS,
  ANSWER_ROW_CLASS,
  ASSISTANT_ROOT_CLASS,
  PROMPT_GUTTER_CLASS,
  PROMPT_BODY_CLASS,
  PROMPT_NOTES_ROW_CLASS,
  PROMPT_ROOT_CLASS,
  PROMPT_TEXT_CLASS,
  PROMPT_TIME_CLASS,
  TURN_FRAME_CLASS,
  USER_ROOT_CLASS,
  TURN_LEAD_CLASS,
} from './turn-classes.js'
import {AttachmentByMime, type AttachmentCardSlot} from './attachment-dispatch.js'
import {partIsModelOnly} from '../primitives/message-part/part-visibility.js'
import {primeHighlightWorkerPool} from '@conciv/solid-diffs'
import {HighlightedText, Markdown, warmHighlighter} from './markdown.js'
import {codeTheme} from '../theme/code-theme.js'
import {ToolPartRow, type ToolDisclosure, type ToolRender} from './tool-part-row.js'
import {Trace, type TraceBranch, type TraceItem} from './trace/trace.js'
import {TraceRunRow} from './trace/trace-row.js'
import {TraceBodyFrame} from './trace/output-block.js'
import {AssistantActionBar} from './action-bar.js'
import {FOCUS} from './classes.js'

export type ThreadComponents = {
  AssistantMessage?: Component
}

export type TurnPrefixSource = {key: string; role: Turn['role']; turn: Accessor<Turn>}

export type ThreadRootProps = ParentProps<{class?: string}>

export type ThreadMessagesProps = {
  sessionID?: string
  components?: ThreadComponents
  tools?: ToolCardEntry[]
  render?: ToolRender
  renderPending?: boolean
  turnPrefix?: (turn: TurnPrefixSource) => JSX.Element
  promptSuffix?: (turn: TurnPrefixSource) => JSX.Element
  attachmentCards?: readonly AttachmentCardSlot[]
  pageSession?: PageSessionConfig
  grouping?: Grouping
  groupEntries?: readonly GroupEntry[]
  readOnly?: boolean
  refreshDisabled?: boolean
}

const PLAN_LABEL = 'plan'
const REASONING_LABEL = 'reasoning'
const PLAN_INLINE_LENGTH = 90

const PROMPT_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {hour: '2-digit', minute: '2-digit', hour12: false})

function promptTimeLabel(createdAt: Date | undefined): string | undefined {
  if (!createdAt) return undefined
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt)
  return Number.isNaN(date.getTime()) ? undefined : PROMPT_TIME_FORMAT.format(date)
}

const EXCERPT_LENGTH = 60

const COUNT_PLURALS = new Intl.PluralRules('en')

function plainLine(line: string): string {
  return line
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(?:#{1,6}|>|[-*+]|\d+[.)])\s+/, '')
    .replace(/[*`~]|(?<!\w)_+|_+(?!\w)/g, '')
    .trim()
}

function promptExcerpt(turn: Turn): string {
  const line =
    collectPromptText(turn)
      .split('\n')
      .map(plainLine)
      .find((candidate) => candidate.length > 0) ?? ''
  const characters = Array.from(line)
  return characters.length > EXCERPT_LENGTH ? `${characters.slice(0, EXCERPT_LENGTH).join('')}…` : line
}

function promptLabel(turn: Turn): string {
  const excerpt = promptExcerpt(turn)
  if (excerpt) return `You: ${excerpt}`
  const attachments = shownAttachmentParts(turn.parts)
  const notes = sentNoteCount(turn)
  if (attachments.length === 0 && notes > 0) {
    return `You: ${notes} ${COUNT_PLURALS.select(notes) === 'one' ? 'note' : 'notes'}`
  }
  if (attachments.length === 1 && attachments[0]?.type === 'image') return 'You: image'
  const noun = COUNT_PLURALS.select(attachments.length) === 'one' ? 'attachment' : 'attachments'
  return `You: ${attachments.length} ${noun}`
}

function replyLabel(prompt: Turn | undefined): string {
  const excerpt = prompt?.role === 'user' ? promptExcerpt(prompt) : ''
  return excerpt ? `Reply to: ${excerpt}` : 'Reply'
}

function firstLine(text: string): string {
  return (text.split('\n')[0] ?? '').trim()
}

function asThinking(part: ChatPart | undefined): Extract<ChatPart, {type: 'thinking'}> | null {
  return part?.type === 'thinking' && part.content.trim().length > 0 ? part : null
}
function asToolCall(part: ChatPart | undefined): ToolCallPart | null {
  return part?.type === 'tool-call' ? part : null
}
function asText(part: ChatPart | undefined): Extract<ChatPart, {type: 'text'}> | null {
  return part?.type === 'text' && part.content.trim().length > 0 ? part : null
}

function asGroupNode(node: GroupNode): GroupNodeGroup | null {
  return node.type === 'group' ? node : null
}

function asPartNode(node: GroupNode): GroupNodePart | null {
  return node.type === 'part' ? node : null
}

function rollupOfParts(parts: readonly ChatPart[]): TurnRollup {
  return turnRollup({parts: [...parts]})
}

function planBody(part: () => Extract<ChatPart, {type: 'thinking'}>): (() => JSX.Element) | undefined {
  const text = part().content.trim()
  if (text.split('\n').length < 2 && text.length <= PLAN_INLINE_LENGTH) return undefined
  return () => <TraceBodyFrame>{text}</TraceBodyFrame>
}

function useOutsideAt(): (offset: number) => boolean {
  const message = useMessage()
  const thread = useThread()
  return (offset) => isOutsideTurn(thread.turns[message.index() + offset]?.turn())
}

function TurnFrame(props: ParentProps): JSX.Element {
  const message = useMessage()
  const outsideAt = useOutsideAt()
  const lead = createMemo(() => message.index() > 0 && !(outsideAt(0) && outsideAt(-1)))
  return <div class={lead() ? `${TURN_FRAME_CLASS} ${TURN_LEAD_CLASS}` : TURN_FRAME_CLASS}>{props.children}</div>
}

function AssistantTurn(props: {
  entries: ToolCardEntry[]
  render: ToolRender | undefined
  pageSession?: PageSessionConfig
  grouping?: Grouping
  groupEntries?: readonly GroupEntry[]
}): JSX.Element {
  const message = useMessage()
  const thread = useThread()
  const ctx = useToolCtx()
  const config = useContext(ThreadConfigContext)
  const parts = () => message.message().parts
  const turnParts = message.parts
  const [opened, setOpened] = createStore<Record<string, boolean>>({})
  const disclosure: ToolDisclosure = {
    open: (partId) => opened[partId],
    setOpen: (partId, open) => setOpened(partId, open),
  }
  const grouping = createMemo(() => props.grouping ?? createGrouping(props.pageSession, props.entries))
  const lastPartIndex = createMemo(() => turnParts.items().length - 1)
  const runActive = () => thread.isRunning && message.isLast()
  const nodes = createMemo<readonly GroupNode[]>(
    (previous) =>
      shareGroupNodes(previous, groupParts(parts(), grouping().grouper, {...grouping().context, live: runActive()})),
    [],
  )
  const liveAt = (index: number, part: ChatPart | undefined): boolean => {
    if (part === undefined || !runActive()) return false
    if (part.type === 'tool-call') return resolveRowMark(part, turnParts.resultFor(part.id)) === 'run'
    return index === lastPartIndex()
  }
  const partLive = (index: number): boolean => liveAt(index, turnParts.partAt(index))
  const lastGroupedPartIndex = createMemo(() => lastGroupedIndex(nodes()))
  const groupStillOpen = (node: GroupNodeGroup): boolean => (node.indices.at(-1) ?? -1) === lastGroupedPartIndex()
  const nodeLive = (node: GroupNode): boolean =>
    node.type === 'part' ? partLive(node.index) : node.indices.some(partLive) || (runActive() && groupStillOpen(node))
  const outsideAt = useOutsideAt()
  const outside = createMemo(() => outsideAt(0))
  const joinsBelow = createMemo(() => outside() && outsideAt(1))
  const actionRowIndex = createMemo(() =>
    runActive() || joinsBelow() ? undefined : parts().findLastIndex((part) => asText(part) !== null),
  )
  const latestTextTurnIndex = createMemo(() =>
    thread.turns.findLastIndex(
      (item) => item.role === 'assistant' && item.turn().parts.some((part) => asText(part) !== null),
    ),
  )
  const folded = () => !message.isLast() && !outside()
  const label = createMemo(() => replyLabel(outside() ? undefined : thread.turns[message.index() - 1]?.turn()))
  const ChainGroup = (groupProps: GroupRenderProps): JSX.Element => {
    const segmentItems = createMemo(() =>
      groupProps.node.indices.flatMap((partIndex) => turnParts.items()[partIndex] ?? []),
    )
    const segmentParts = createMemo<ChatPart[]>(() => segmentItems().map((item) => item.part()))
    const segmentRollup = createMemo(() => rollupOfParts(segmentParts()), undefined, {equals: isEqual})
    const segmentActive = () => groupProps.node.indices.some(partLive) || segmentRollup().awaitingApproval
    const items = createMemo(
      mapArray(segmentItems, (item): TraceItem => {
        const callId = untrack(() => asToolCall(item.part())?.id)
        const call = createMemo(() => asToolCall(item.part()))
        const result = createMemo(() => (callId === undefined ? undefined : turnParts.resultFor(callId)))
        const live = createMemo(() => {
          const current = call()
          return current !== null && resolveRowMark(current, result()) === 'run'
        })
        return {
          key: item.key,
          get live() {
            return live()
          },
          render: (branch: TraceBranch): JSX.Element =>
            callId === undefined ? (
              <Show when={asThinking(item.part())}>
                {(thinkingPart) => (
                  <TraceRunRow
                    label={PLAN_LABEL}
                    text={firstLine(thinkingPart().content)}
                    live={liveAt(item.index(), thinkingPart())}
                    ring={branch.ring}
                    body={planBody(thinkingPart)}
                  />
                )}
              </Show>
            ) : (
              <Show when={call()}>
                {(callPart) => (
                  <ToolPartRow
                    part={callPart()}
                    result={result()}
                    ctx={ctx}
                    entries={props.entries}
                    render={props.render}
                    renderPending={config.renderPending()}
                    disclosure={disclosure}
                    sessionID={config.sessionID()}
                    ring={branch.ring}
                    chain
                  />
                )}
              </Show>
            ),
        }
      }),
    )
    const reasoned = () => segmentParts().some((part) => asThinking(part) !== null)
    const activeCall = () => activeCallInParts(segmentParts(), turnParts.resultFor)
    const summary = () => summaryLine(segmentRollup()) || REASONING_LABEL
    const compactLine = () => {
      const call = segmentActive() ? activeCall() : null
      return call ? nowTitle(call, ctx.catalog) : summary()
    }
    return (
      <Show when={segmentRollup().toolCalls > 0 || reasoned()}>
        <Trace
          summary={summary()}
          compactLine={compactLine()}
          items={items()}
          folded={folded()}
          headless={outside()}
          joinsBelow={joinsBelow()}
        />
      </Show>
    )
  }
  const groupEntries = createMemo<GroupEntry[]>(() => {
    const chain: GroupEntry = {key: CHAIN_GROUP_KEY, render: ChainGroup}
    const config = props.pageSession
    return [chain, ...(config ? [config.entry] : []), ...(props.groupEntries ?? [])]
  })
  const entryFor = (key: GroupKey) => groupEntries().find((entry) => entry.key === key)
  const PartLeaf = (leafProps: {node: GroupNodePart}): JSX.Element => {
    const leafPart = () => turnParts.partAt(leafProps.node.index)
    const leafCall = createMemo(() => asToolCall(leafPart()))
    return (
      <Switch>
        <Match when={asText(leafPart())}>
          {(part) => (
            <>
              <div class={ANSWER_ROW_CLASS}>
                <div class={message.isLast() ? ANSWER_CONTENT_CLASS : ANSWER_CONTENT_SETTLED_CLASS}>
                  <Markdown content={part().content} streaming={liveAt(leafProps.node.index, part())} />
                </div>
              </div>
              <Show when={leafProps.node.index === actionRowIndex()}>
                <div class={ANSWER_ACTION_ROW_CLASS}>
                  <AssistantActionBar
                    readOnly={config.readOnly()}
                    refreshDisabled={config.refreshDisabled()}
                    keepVisible={message.index() === latestTextTurnIndex()}
                  />
                </div>
              </Show>
            </>
          )}
        </Match>
        <Match when={leafCall()}>
          {(call) => (
            <Key each={[call()]} by="id">
              {(part) => {
                const callId = untrack(part).id
                const result = createMemo(() => turnParts.resultFor(callId))
                return (
                  <ToolPartRow
                    part={part()}
                    result={result()}
                    ctx={ctx}
                    entries={props.entries}
                    render={props.render}
                    renderPending={config.renderPending()}
                    disclosure={disclosure}
                    sessionID={config.sessionID()}
                    chain={false}
                  />
                )
              }}
            </Key>
          )}
        </Match>
      </Switch>
    )
  }
  const NodeView = (nodeProps: {node: GroupNode}): JSX.Element => (
    <Switch>
      <Match when={asGroupNode(nodeProps.node)}>
        {(group) => (
          <Show when={entryFor(group().key)} fallback={<NodeListView nodes={group().children} />}>
            {(entry) => (
              <Dynamic
                component={entry().render}
                node={group()}
                parts={parts}
                resultFor={turnParts.resultFor}
                sessionID={config.sessionID()}
                streaming={nodeLive(group())}
                folded={folded()}
              >
                <NodeListView nodes={group().children} />
              </Dynamic>
            )}
          </Show>
        )}
      </Match>
      <Match when={asPartNode(nodeProps.node)}>{(leaf) => <PartLeaf node={leaf()} />}</Match>
    </Switch>
  )
  const NodeListView = (listProps: {nodes: readonly GroupNode[]}): JSX.Element => (
    <Key each={listProps.nodes} by={groupNodeIdentity}>
      {(node) => <NodeView node={node()} />}
    </Key>
  )
  return (
    <Show when={nodes().length > 0}>
      <Message.Root data-conciv-msg role="article" aria-label={label()} class={ASSISTANT_ROOT_CLASS}>
        <NodeListView nodes={nodes()} />
      </Message.Root>
    </Show>
  )
}

function sentNoteCount(turn: Turn): number {
  return sumBy(
    turn.messages,
    (message) => PromptPresentationSchema.safeParse(message.metadata).data?.comments.length ?? 0,
  )
}

function messagePromptText(message: ChatMessage): string[] {
  const display = PromptPresentationSchema.safeParse(message.metadata)
  if (display.success) return display.data.displayText.trim() ? [display.data.displayText] : []
  const text = message.parts
    .filter(
      (part): part is Extract<ChatPart, {type: 'text'}> =>
        part.type === 'text' && part.content.trim().length > 0 && !partIsModelOnly(part),
    )
    .map((part) => part.content)
    .join('')
    .trim()
  return text ? [text] : []
}

function collectPromptText(turn: Turn): string {
  return turn.messages.flatMap(messagePromptText).join('\n')
}

function UserTurn(): JSX.Element {
  const config = useContext(ThreadConfigContext)
  const message = useMessage()
  const AttachmentCard = (): JSX.Element => <AttachmentByMime cards={config.attachmentCards()} />
  const promptText = createMemo(() => collectPromptText(message.message()))
  const noteCount = createMemo(() => sentNoteCount(message.message()))
  const shown = createMemo(
    () => promptText().length > 0 || shownAttachmentParts(message.message().parts).length > 0 || noteCount() > 0,
  )
  const label = createMemo(() => promptLabel(message.message()))
  const timeLabel = createMemo(() => promptTimeLabel(message.message().messages[0]?.createdAt))
  return (
    <TurnFrame>
      <TurnPrefix />
      <Show when={shown()}>
        <Message.Root role="article" aria-label={label()} class={USER_ROOT_CLASS}>
          <Message.If hasAttachments>
            <div class="flex flex-wrap gap-1 self-end">
              <Message.Attachments components={{Image: AttachmentCard, Document: AttachmentCard}} />
            </div>
          </Message.If>
          <Switch>
            <Match when={promptText()}>
              <div data-conciv-msg class={PROMPT_ROOT_CLASS}>
                <span class={PROMPT_GUTTER_CLASS} aria-hidden="true">
                  ❯
                </span>
                <div class={PROMPT_BODY_CLASS}>
                  <span class={PROMPT_TEXT_CLASS}>
                    <HighlightedText text={promptText()} />
                  </span>
                  <PromptSuffix />
                </div>
                <Show when={timeLabel()}>{(value) => <span class={PROMPT_TIME_CLASS}>{value()}</span>}</Show>
              </div>
            </Match>
            <Match when={noteCount() > 0}>
              <div class={PROMPT_NOTES_ROW_CLASS}>
                <div class={PROMPT_BODY_CLASS}>
                  <PromptSuffix />
                </div>
                <Show when={timeLabel()}>{(value) => <span class={PROMPT_TIME_CLASS}>{value()}</span>}</Show>
              </div>
            </Match>
          </Switch>
        </Message.Root>
      </Show>
    </TurnFrame>
  )
}

type ThreadConfig = {
  sessionID: () => string | undefined
  entries: () => ToolCardEntry[]
  render: () => ToolRender | undefined
  renderPending: () => boolean
  assistant: () => Component | undefined
  turnPrefix: () => ((turn: TurnPrefixSource) => JSX.Element) | undefined
  promptSuffix: () => ((turn: TurnPrefixSource) => JSX.Element) | undefined
  attachmentCards: () => readonly AttachmentCardSlot[]
  pageSession: () => PageSessionConfig | undefined
  grouping: () => Grouping | undefined
  groupEntries: () => readonly GroupEntry[]
  readOnly: () => boolean
  refreshDisabled: () => boolean
}

const ThreadConfigContext = createContext<ThreadConfig>({
  sessionID: () => undefined,
  entries: () => [],
  render: () => undefined,
  renderPending: () => false,
  assistant: () => undefined,
  turnPrefix: () => undefined,
  promptSuffix: () => undefined,
  attachmentCards: () => [],
  pageSession: () => undefined,
  grouping: () => undefined,
  groupEntries: () => [],
  readOnly: () => false,
  refreshDisabled: () => false,
})

function TurnPrefix(): JSX.Element {
  const config = useContext(ThreadConfigContext)
  const message = useMessage()
  return (
    <Show when={config.turnPrefix()}>
      {(prefix) => prefix()({key: message.key, role: message.role, turn: message.message})}
    </Show>
  )
}

function PromptSuffix(): JSX.Element {
  const config = useContext(ThreadConfigContext)
  const message = useMessage()
  return (
    <Show when={config.promptSuffix()}>
      {(suffix) => suffix()({key: message.key, role: message.role, turn: message.message})}
    </Show>
  )
}

function AssistantMessageView(): JSX.Element {
  const config = useContext(ThreadConfigContext)
  return (
    <TurnFrame>
      <TurnPrefix />
      <Show
        when={config.assistant()}
        fallback={
          <AssistantTurn
            entries={config.entries()}
            render={config.render()}
            pageSession={config.pageSession()}
            grouping={config.grouping()}
            groupEntries={config.groupEntries()}
          />
        }
      >
        {(component) => <Dynamic component={component()} />}
      </Show>
    </TurnFrame>
  )
}

const MESSAGES_COMPONENTS = {UserMessage: UserTurn, AssistantMessage: AssistantMessageView}

function warmHighlightBackends(): void {
  warmHighlighter()
  primeHighlightWorkerPool({theme: codeTheme()})
}

function ThreadRoot(props: ThreadRootProps): JSX.Element {
  onMount(warmHighlightBackends)
  return (
    <ThreadPrimitive.Root
      class={`flex flex-col h-full min-h-0 [color:var(--chat-text)] [font-family:var(--chat-font)] ${props.class ?? ''}`}
    >
      {props.children}
    </ThreadPrimitive.Root>
  )
}

const LATEST_STRIP =
  'absolute inset-inline-0 bottom-1.5 flex justify-center pointer-events-none opacity-0 translate-y-1 trans-tf-op motion-reduce:[transition:none] data-[shown]:opacity-100 data-[shown]:translate-y-0'

const LATEST_CHIP = `pointer-events-auto [font-family:var(--chat-mono)] text-chat-xs leading-none uppercase tracking-widest px-2 rounded-[var(--chat-radius-chip)] inline-flex gap-1 min-h-5.5 cursor-pointer [background:var(--chat-rail-bg)] [border:1px_solid_var(--chat-line-soft)] [color:var(--chat-text-2)] trans-cbb motion-reduce:[transition:none] items-center hover:[border-color:var(--chat-line)] hover:[color:var(--chat-text-hi)] ${FOCUS}`

function LatestStrip(): JSX.Element {
  const viewport = useThreadViewport()
  return (
    <div
      class={LATEST_STRIP}
      data-shown={viewport.isAtBottom() ? undefined : ''}
      inert={viewport.isAtBottom() ? true : undefined}
    >
      <ThreadPrimitive.ScrollToBottom class={LATEST_CHIP}>
        <ArrowDown class="size-3" aria-hidden="true" />
        Latest
      </ThreadPrimitive.ScrollToBottom>
    </div>
  )
}

function ThreadViewport(props: ParentProps<{ref?: (element: HTMLElement) => void}>): JSX.Element {
  return (
    <div class="flex flex-1 flex-col min-h-0 relative">
      <ThreadPrimitive.Viewport
        ref={props.ref}
        class="px-5 pb-4 pt-3 flex flex-1 flex-col gap-1.5 min-h-0 relative overflow-y-auto [&>[data-thread-list]]:gap-0"
        role="log"
        tabindex="-1"
        aria-live="off"
        footer={<LatestStrip />}
      >
        {props.children}
      </ThreadPrimitive.Viewport>
    </div>
  )
}

function ThreadWelcome(props: ParentProps): JSX.Element {
  return <ThreadPrimitive.Empty>{props.children}</ThreadPrimitive.Empty>
}

function ThreadMessages(props: ThreadMessagesProps): JSX.Element {
  const internal = useViewportInternal()
  const estimator = internal
    ? createTurnEstimator(internal.element, {
        grouping: () => props.grouping ?? createGrouping(props.pageSession, props.tools ?? []),
        exactAllowed: () => props.turnPrefix === undefined && props.promptSuffix === undefined,
        disabled: () => props.components?.AssistantMessage !== undefined,
      })
    : undefined
  return (
    <ThreadConfigContext.Provider
      value={{
        sessionID: () => props.sessionID,
        entries: () => props.tools ?? [],
        render: () => props.render,
        renderPending: () => props.renderPending ?? false,
        assistant: () => props.components?.AssistantMessage,
        turnPrefix: () => props.turnPrefix,
        promptSuffix: () => props.promptSuffix,
        attachmentCards: () => props.attachmentCards ?? [],
        pageSession: () => props.pageSession,
        grouping: () => props.grouping,
        groupEntries: () => props.groupEntries ?? [],
        readOnly: () => props.readOnly ?? false,
        refreshDisabled: () => props.refreshDisabled ?? false,
      }}
    >
      <TurnEstimateProvider value={estimator}>
        <TruncatedTextGroup>
          <ThreadPrimitive.Messages components={MESSAGES_COMPONENTS} />
        </TruncatedTextGroup>
      </TurnEstimateProvider>
    </ThreadConfigContext.Provider>
  )
}

function ThreadComposer(props: ParentProps): JSX.Element {
  return <div class="flex flex-col min-h-0">{props.children}</div>
}

export const Thread = Object.assign(ThreadRoot, {
  Root: ThreadRoot,
  Viewport: ThreadViewport,
  Welcome: ThreadWelcome,
  Messages: ThreadMessages,
  Composer: ThreadComposer,
})

export type {ToolCardProps}
