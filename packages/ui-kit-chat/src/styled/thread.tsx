import {
  createContext,
  createMemo,
  Index,
  indexArray,
  Match,
  onMount,
  Show,
  Switch,
  useContext,
  type Component,
  type JSX,
  type ParentProps,
} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import ArrowDown from 'lucide-solid/icons/arrow-down'
import type {MessagePart, ToolCallPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolCardProps, ToolUIComponent} from '@conciv/protocol/tool-view-types'
import {useChatContext, useThread} from '../store/chat-context.js'
import {useToolCtx} from '../store/tool-context.js'
import {Thread as ThreadPrimitive} from '../primitives/thread/thread.js'
import {Message} from '../primitives/message/message.js'
import {useMessage} from '../primitives/message/message-context.js'
import {
  CHAIN_GROUP_KEY,
  groupParts,
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
  PROMPT_ROOT_CLASS,
  PROMPT_TEXT_CLASS,
  PROMPT_TIME_CLASS,
} from './turn-classes.js'
import {AttachmentByMime, type AttachmentCardSlot} from './attachment-dispatch.js'
import {partIsModelOnly} from '../primitives/message-part/part-visibility.js'
import {Markdown, warmHighlighter} from './markdown.js'
import {ToolFallback} from '../tools/styled/tool-fallback.js'
import {ToolCallCard, ToolTraceRow} from '../tools/styled/tool-call-card.js'
import {Trace, type TraceBranch, type TraceItem} from './trace/trace.js'
import {TraceRunRow} from './trace/trace-row.js'
import {TraceBodyFrame} from './trace/output-block.js'
import {AssistantActionBar} from './action-bar.js'
import {FOCUS} from './classes.js'

export type ThreadComponents = {
  AssistantMessage?: Component
  ToolFallback?: ToolUIComponent
}

export type ThreadRootProps = ParentProps<{class?: string}>

export type ThreadMessagesProps = {
  components?: ThreadComponents
  tools?: ToolCardEntry[]
  turnPrefix?: (turn: Turn) => JSX.Element
  attachmentCards?: readonly AttachmentCardSlot[]
  pageSession?: PageSessionConfig
  grouping?: Grouping
  groupEntries?: readonly GroupEntry[]
}

const PLAN_LABEL = 'plan'
const PLAN_INLINE_LENGTH = 90

const PROMPT_TIME_FORMAT = new Intl.DateTimeFormat(undefined, {hour: '2-digit', minute: '2-digit', hour12: false})

function promptTimeLabel(createdAt: Date | undefined): string | undefined {
  if (!createdAt) return undefined
  const date = createdAt instanceof Date ? createdAt : new Date(createdAt)
  return Number.isNaN(date.getTime()) ? undefined : PROMPT_TIME_FORMAT.format(date)
}

function firstLine(text: string): string {
  return (text.split('\n')[0] ?? '').trim()
}

function asThinking(part: MessagePart | undefined): Extract<MessagePart, {type: 'thinking'}> | null {
  return part?.type === 'thinking' && part.content.trim().length > 0 ? part : null
}
function asToolCall(part: MessagePart | undefined): ToolCallPart | null {
  return part?.type === 'tool-call' ? part : null
}
function asText(part: MessagePart | undefined): Extract<MessagePart, {type: 'text'}> | null {
  return part?.type === 'text' && part.content.trim().length > 0 ? part : null
}

function asGroupNode(node: GroupNode): GroupNodeGroup | null {
  return node.type === 'group' ? node : null
}

function asPartNode(node: GroupNode): GroupNodePart | null {
  return node.type === 'part' ? node : null
}

function rollupOfParts(parts: readonly MessagePart[]): TurnRollup {
  return turnRollup({key: 'segment', role: 'assistant', parts: [...parts], start: 0, end: 0})
}

function planBody(part: () => Extract<MessagePart, {type: 'thinking'}>): (() => JSX.Element) | undefined {
  const text = part().content.trim()
  if (text.split('\n').length < 2 && text.length <= PLAN_INLINE_LENGTH) return undefined
  return () => <TraceBodyFrame>{text}</TraceBodyFrame>
}

function AssistantTurn(props: {
  entries: ToolCardEntry[]
  fallback: ToolUIComponent
  pageSession?: PageSessionConfig
  grouping?: Grouping
  groupEntries?: readonly GroupEntry[]
}): JSX.Element {
  const message = useMessage()
  const thread = useThread()
  const ctx = useToolCtx()
  const parts = () => message.message().parts
  const grouping = createMemo(() => props.grouping ?? createGrouping(props.pageSession, props.entries))
  const nodes = createMemo(() => groupParts(parts(), grouping().grouper, grouping().context))
  const lastTextIndex = createMemo(() =>
    parts()
      .map((part) => part.type)
      .lastIndexOf('text'),
  )
  const streamingAt = (index: number) => thread.isRunning && message.isLast() && index === lastTextIndex()
  const lastPartIndex = createMemo(() => parts().length - 1)
  const livePart = (index: number) => thread.isRunning && message.isLast() && index === lastPartIndex()
  const ChainGroup = (groupProps: GroupRenderProps): JSX.Element => {
    const segmentParts = createMemo<MessagePart[]>(() =>
      groupProps.node.indices.flatMap((partIndex) => {
        const part = groupProps.parts()[partIndex]
        return part ? [part] : []
      }),
    )
    const segmentRollup = createMemo(() => rollupOfParts(segmentParts()))
    const segmentActive = () =>
      groupProps.node.indices.some((partIndex) => livePart(partIndex)) || segmentRollup().awaitingApproval
    const items = indexArray(
      () => groupProps.node.indices,
      (partIndex, position): TraceItem => ({
        key: `p${position}`,
        get live() {
          return livePart(partIndex())
        },
        render: (branch: TraceBranch): JSX.Element => (
          <Switch>
            <Match when={asThinking(groupProps.parts()[partIndex()])}>
              {(thinkingPart) => (
                <TraceRunRow
                  label={PLAN_LABEL}
                  text={firstLine(thinkingPart().content)}
                  last={branch.last}
                  live={livePart(partIndex())}
                  ring={branch.ring}
                  body={planBody(thinkingPart)}
                />
              )}
            </Match>
            <Match when={asToolCall(groupProps.parts()[partIndex()])}>
              {(callPart) => (
                <ToolTraceRow
                  part={callPart()}
                  result={message.pairing().byCallId.get(callPart().id)}
                  ctx={ctx}
                  durationMs={ctx.durationFor?.(callPart().id)}
                  tools={() => props.entries}
                  fallback={props.fallback}
                  last={branch.last}
                  ring={branch.ring}
                />
              )}
            </Match>
          </Switch>
        ),
      }),
    )
    const line = () => summaryLine(segmentRollup())
    return (
      <Show when={segmentRollup().toolCalls > 0}>
        <Trace summary={line()} compactLine={line()} items={items()} streaming={segmentActive()} />
      </Show>
    )
  }
  const groupEntries = createMemo<GroupEntry[]>(() => {
    const chain: GroupEntry = {key: CHAIN_GROUP_KEY, render: ChainGroup}
    const config = props.pageSession
    return [chain, ...(config ? [config.entry] : []), ...(props.groupEntries ?? [])]
  })
  const entryFor = (key: GroupKey) => groupEntries().find((entry) => entry.key === key)
  const renderableNode = (node: GroupNode): boolean => {
    if (node.type === 'part') return true
    if (entryFor(node.key) !== undefined) return true
    return node.children.some(renderableNode)
  }
  const PartLeaf = (leafProps: {node: GroupNodePart}): JSX.Element => (
    <Switch>
      <Match when={asText(parts()[leafProps.node.index])}>
        {(part) => (
          <div class={ANSWER_ROW_CLASS}>
            <div class={message.isLast() ? ANSWER_CONTENT_CLASS : ANSWER_CONTENT_SETTLED_CLASS}>
              <Markdown content={part().content} streaming={streamingAt(leafProps.node.index)} />
            </div>
          </div>
        )}
      </Match>
      <Match when={asToolCall(parts()[leafProps.node.index])}>
        {(part) => (
          <ToolCallCard
            part={part()}
            result={message.pairing().byCallId.get(part().id)}
            ctx={ctx}
            durationMs={ctx.durationFor?.(part().id)}
            tools={() => props.entries}
            fallback={props.fallback}
          />
        )}
      </Match>
    </Switch>
  )
  const NodeView = (nodeProps: {node: GroupNode; streaming: boolean}): JSX.Element => (
    <Switch>
      <Match when={asGroupNode(nodeProps.node)}>
        {(group) => (
          <Show
            when={entryFor(group().key)}
            fallback={<NodeListView nodes={group().children} streaming={nodeProps.streaming} />}
          >
            {(entry) => (
              <Dynamic
                component={entry().render}
                node={group()}
                parts={parts}
                resultFor={(toolCallId: string) => message.pairing().byCallId.get(toolCallId)}
                streaming={nodeProps.streaming}
              >
                <NodeListView nodes={group().children} streaming={nodeProps.streaming} />
              </Dynamic>
            )}
          </Show>
        )}
      </Match>
      <Match when={asPartNode(nodeProps.node)}>{(leaf) => <PartLeaf node={leaf()} />}</Match>
    </Switch>
  )
  const NodeListView = (listProps: {nodes: readonly GroupNode[]; streaming: boolean}): JSX.Element => {
    const lastRenderableIndex = createMemo(() => listProps.nodes.map(renderableNode).lastIndexOf(true))
    return (
      <Index each={listProps.nodes}>
        {(node, index) => <NodeView node={node()} streaming={listProps.streaming && index === lastRenderableIndex()} />}
      </Index>
    )
  }
  return (
    <Message.Root data-pw-msg class={ASSISTANT_ROOT_CLASS}>
      <NodeListView nodes={nodes()} streaming={thread.isRunning && message.isLast()} />
      <Message.Error />
      <div class={ANSWER_ACTION_ROW_CLASS}>
        <AssistantActionBar />
      </div>
    </Message.Root>
  )
}

function promptTextOf(turn: Turn): string {
  return turn.parts
    .filter(
      (part): part is Extract<MessagePart, {type: 'text'}> =>
        part.type === 'text' && part.content.trim().length > 0 && !partIsModelOnly(part),
    )
    .map((part) => part.content)
    .join('\n')
}

function UserTurn(): JSX.Element {
  const config = useContext(ThreadConfigContext)
  const message = useMessage()
  const chat = useChatContext()
  const DocumentCard = (): JSX.Element => <AttachmentByMime cards={config.attachmentCards()} />
  const promptText = createMemo(() => promptTextOf(message.message()))
  const timeLabel = createMemo(() => promptTimeLabel(chat.messages()[message.message().start]?.createdAt))
  return (
    <>
      <TurnPrefix />
      <Message.If hasAttachments>
        <div class="flex flex-wrap gap-1 self-end">
          <Message.Attachments components={{Document: DocumentCard}} />
        </div>
      </Message.If>
      <Message.If hasText>
        <Message.Root data-pw-msg class={PROMPT_ROOT_CLASS}>
          <span class={PROMPT_GUTTER_CLASS} aria-hidden="true">
            ❯
          </span>
          <span class={PROMPT_TEXT_CLASS}>{promptText()}</span>
          <Show when={timeLabel()}>{(value) => <span class={PROMPT_TIME_CLASS}>{value()}</span>}</Show>
        </Message.Root>
      </Message.If>
    </>
  )
}

type ThreadConfig = {
  entries: () => ToolCardEntry[]
  fallback: () => ToolUIComponent
  assistant: () => Component | undefined
  turnPrefix: () => ((turn: Turn) => JSX.Element) | undefined
  attachmentCards: () => readonly AttachmentCardSlot[]
  pageSession: () => PageSessionConfig | undefined
  grouping: () => Grouping | undefined
  groupEntries: () => readonly GroupEntry[]
}

const ThreadConfigContext = createContext<ThreadConfig>({
  entries: () => [],
  fallback: () => ToolFallback,
  assistant: () => undefined,
  turnPrefix: () => undefined,
  attachmentCards: () => [],
  pageSession: () => undefined,
  grouping: () => undefined,
  groupEntries: () => [],
})

function TurnPrefix(): JSX.Element {
  const config = useContext(ThreadConfigContext)
  const message = useMessage()
  return <Show when={config.turnPrefix()}>{(prefix) => prefix()(message.message())}</Show>
}

function AssistantMessageView(): JSX.Element {
  const config = useContext(ThreadConfigContext)
  return (
    <>
      <TurnPrefix />
      <Show
        when={config.assistant()}
        fallback={
          <AssistantTurn
            entries={config.entries()}
            fallback={config.fallback()}
            pageSession={config.pageSession()}
            grouping={config.grouping()}
            groupEntries={config.groupEntries()}
          />
        }
      >
        {(component) => <Dynamic component={component()} />}
      </Show>
    </>
  )
}

const MESSAGES_COMPONENTS = {UserMessage: UserTurn, AssistantMessage: AssistantMessageView}

function ThreadRoot(props: ThreadRootProps): JSX.Element {
  onMount(() => warmHighlighter())
  return (
    <div
      class={`flex flex-col h-full min-h-0 [color:var(--chat-text)] [font-family:var(--chat-font)] ${props.class ?? ''}`}
    >
      {props.children}
    </div>
  )
}

const LATEST_STRIP =
  'grid shrink-0 [grid-template-rows:0fr] data-[shown]:[grid-template-rows:1fr] [background:var(--chat-panel)] [transition:grid-template-rows_160ms_var(--chat-ease)] motion-reduce:[transition:none]'

const LATEST_CHIP = `[font-family:var(--chat-mono)] text-[10.5px] uppercase tracking-[0.08em] px-2 rounded-[var(--chat-radius-chip)] inline-flex gap-1 min-h-5.5 cursor-pointer [background:var(--chat-rail-bg)] [border:1px_solid_var(--chat-line-soft)] [color:var(--chat-text-2)] [transition:color_120ms_var(--chat-ease),border-color_120ms_var(--chat-ease)] items-center hover:[border-color:var(--chat-line)] hover:[color:var(--chat-text-hi)] ${FOCUS}`

function LatestStrip(): JSX.Element {
  const viewport = useThreadViewport()
  return (
    <div class={LATEST_STRIP} data-shown={viewport.isAtBottom() ? undefined : ''}>
      <div class="flex justify-center overflow-hidden pt-[6px]">
        <ThreadPrimitive.ScrollToBottom class={`${LATEST_CHIP} mb-[6px]`}>
          <ArrowDown size={11} aria-hidden="true" />
          Latest
        </ThreadPrimitive.ScrollToBottom>
      </div>
    </div>
  )
}

function ThreadViewport(props: ParentProps<{ref?: (element: HTMLElement) => void}>): JSX.Element {
  return (
    <ThreadPrimitive.Viewport
      ref={props.ref}
      class="px-5 pt-[13px] pb-4 flex flex-1 flex-col min-h-0 relative overflow-y-auto"
      role="log"
      aria-live="off"
      footer={<LatestStrip />}
    >
      {props.children}
    </ThreadPrimitive.Viewport>
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
        exactAllowed: () => props.turnPrefix === undefined,
        disabled: () => props.components?.AssistantMessage !== undefined,
      })
    : undefined
  return (
    <ThreadConfigContext.Provider
      value={{
        entries: () => props.tools ?? [],
        fallback: () => props.components?.ToolFallback ?? ToolFallback,
        assistant: () => props.components?.AssistantMessage,
        turnPrefix: () => props.turnPrefix,
        attachmentCards: () => props.attachmentCards ?? [],
        pageSession: () => props.pageSession,
        grouping: () => props.grouping,
        groupEntries: () => props.groupEntries ?? [],
      }}
    >
      <TurnEstimateProvider value={estimator}>
        <ThreadPrimitive.Messages components={MESSAGES_COMPONENTS} />
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
