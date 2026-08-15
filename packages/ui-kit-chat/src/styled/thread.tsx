import {
  createContext,
  createMemo,
  Index,
  Match,
  Show,
  Switch,
  useContext,
  type Component,
  type JSX,
  type ParentProps,
} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import ArrowDown from 'lucide-solid/icons/arrow-down'
import Brain from 'lucide-solid/icons/brain'
import FilePen from 'lucide-solid/icons/file-pen'
import FileText from 'lucide-solid/icons/file-text'
import List from 'lucide-solid/icons/list'
import Search from 'lucide-solid/icons/search'
import Terminal from 'lucide-solid/icons/terminal'
import Wrench from 'lucide-solid/icons/wrench'
import type {MessagePart, ToolCallPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolCardProps, ToolUIComponent, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import {useThread} from '../store/chat-context.js'
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
import {createGrouping, type PageSessionConfig} from '../store/page-session.js'
import {useViewportInternal} from '../primitives/thread/viewport-internal.js'
import {TurnEstimateProvider} from '../primitives/thread/turn-estimate.js'
import {createTurnEstimator} from './text-metrics.js'
import {ASSISTANT_ROOT_CLASS, ASSISTANT_ROOT_SETTLED_CLASS, USER_BUBBLE_CLASS} from './turn-classes.js'
import {AttachmentByMime, type AttachmentCardSlot} from './attachment-dispatch.js'
import {Markdown} from './markdown.js'
import {Reasoning} from './reasoning.js'
import {ToolFallback} from '../tools/styled/tool-fallback.js'
import {ToolCallCard} from '../tools/styled/tool-call-card.js'
import {ChainOfThought} from './chain-of-thought.js'
import {AssistantActionBar} from './action-bar.js'
import {FOCUS} from './classes.js'

const CHAIN_OF_THOUGHT_GROW = true

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

function asThinking(part: MessagePart | undefined): Extract<MessagePart, {type: 'thinking'}> | null {
  return part?.type === 'thinking' && part.content.trim().length > 0 ? part : null
}
function asToolCall(part: MessagePart | undefined): ToolCallPart | null {
  return part?.type === 'tool-call' ? part : null
}
function asText(part: MessagePart | undefined): Extract<MessagePart, {type: 'text'}> | null {
  return part?.type === 'text' && part.content.trim().length > 0 ? part : null
}
function isAwaitingApproval(part: MessagePart | undefined, ctx: ToolViewCtx): boolean {
  const call = asToolCall(part)
  return (
    call !== null && call.state === 'approval-requested' && call.approval !== undefined && Boolean(ctx.respondApproval)
  )
}

function toolStepIcon(name: string): JSX.Element {
  const lower = name.toLowerCase()
  const size = 13
  if (/search|grep|find|lookup/.test(lower)) return <Search size={size} />
  if (/write|edit|patch|create|append/.test(lower)) return <FilePen size={size} />
  if (/read|cat|open|view|fetch|file/.test(lower)) return <FileText size={size} />
  if (/bash|shell|exec|run|terminal|command/.test(lower)) return <Terminal size={size} />
  if (/list|glob|dir|tree/.test(lower)) return <List size={size} />
  return <Wrench size={size} />
}

function ChainPart(props: {
  part: MessagePart | undefined
  entries: ToolCardEntry[]
  fallback: ToolUIComponent
  last?: boolean
  streaming?: boolean
}): JSX.Element {
  const message = useMessage()

  const ctx = useToolCtx()
  return (
    <Switch>
      <Match when={asThinking(props.part)}>
        {(part) => (
          <ChainOfThought.Step icon={<Brain size={13} />} last={props.last}>
            <Reasoning text={part().content} streaming={props.streaming} grow={CHAIN_OF_THOUGHT_GROW} />
          </ChainOfThought.Step>
        )}
      </Match>
      <Match when={asToolCall(props.part)}>
        {(part) => (
          <ChainOfThought.Step icon={toolStepIcon(part().name)} last={props.last}>
            <ToolCallCard
              part={part()}
              result={message.pairing().byCallId.get(part().id)}
              ctx={ctx}
              durationMs={ctx.durationFor?.(part().id)}
              tools={() => props.entries}
              fallback={props.fallback}
            />
          </ChainOfThought.Step>
        )}
      </Match>
    </Switch>
  )
}

function asGroupNode(node: GroupNode): GroupNodeGroup | null {
  return node.type === 'group' ? node : null
}

function asPartNode(node: GroupNode): GroupNodePart | null {
  return node.type === 'part' ? node : null
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
  const chainAutoOpen = (indices: readonly number[]) => {
    const last = indices.at(-1)
    const reasoningStreaming = last !== undefined && livePart(last) && asThinking(parts()[last]) !== null
    return reasoningStreaming || indices.some((index) => isAwaitingApproval(parts()[index], ctx))
  }
  const ChainGroup = (groupProps: GroupRenderProps): JSX.Element => (
    <ChainOfThought
      streaming={groupProps.streaming}
      autoOpen={chainAutoOpen(groupProps.node.indices)}
      grow={CHAIN_OF_THOUGHT_GROW}
    >
      <Index each={groupProps.node.indices}>
        {(partIndex, position) => (
          <ChainPart
            part={groupProps.parts()[partIndex()]}
            entries={props.entries}
            fallback={props.fallback}
            last={position === groupProps.node.indices.length - 1}
            streaming={livePart(partIndex())}
          />
        )}
      </Index>
    </ChainOfThought>
  )
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
        {(part) => <Markdown content={part().content} streaming={streamingAt(leafProps.node.index)} />}
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
    <Message.Root data-pw-msg class={message.isLast() ? ASSISTANT_ROOT_CLASS : ASSISTANT_ROOT_SETTLED_CLASS}>
      <NodeListView nodes={nodes()} streaming={thread.isRunning && message.isLast()} />
      <Message.Error />
      <AssistantActionBar />
    </Message.Root>
  )
}

function UserTurn(): JSX.Element {
  const config = useContext(ThreadConfigContext)
  const DocumentCard = (): JSX.Element => <AttachmentByMime cards={config.attachmentCards()} />
  return (
    <>
      <TurnPrefix />
      <Message.If hasAttachments>
        <div class="flex flex-wrap gap-1 self-end">
          <Message.Attachments components={{Document: DocumentCard}} />
        </div>
      </Message.If>
      <Message.If hasText>
        <Message.Root data-pw-msg class={USER_BUBBLE_CLASS}>
          <Message.Parts />
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
  return (
    <div
      class={`flex flex-col h-full min-h-0 [color:var(--chat-text)] [font-family:var(--chat-font)] ${props.class ?? ''}`}
    >
      {props.children}
    </div>
  )
}

function ThreadViewport(props: ParentProps<{ref?: (element: HTMLElement) => void}>): JSX.Element {
  return (
    <ThreadPrimitive.Viewport
      ref={props.ref}
      class="px-3 py-3 flex flex-1 flex-col gap-3 min-h-0 relative overflow-y-auto"
      role="log"
      aria-live="off"
    >
      {props.children}
      <div class="h-0 pointer-events-none self-center bottom-2 sticky z-10 overflow-visible">
        <ThreadPrimitive.ScrollToBottom
          class={`text-[length:var(--chat-text-xs)] px-2 rounded-[var(--chat-radius-pill)] inline-flex gap-1 min-h-6 cursor-pointer pointer-events-auto [background:var(--chat-glass)] [border:1px_solid_var(--chat-line)] [box-shadow:var(--chat-shadow-sm)] [color:var(--chat-accent-link)] [transition:opacity_120ms_var(--chat-ease),color_120ms_var(--chat-ease),border-color_120ms_var(--chat-ease)] items-center bottom-0 left-1/2 absolute data-[at-bottom]:opacity-0 data-[at-bottom]:invisible -translate-x-1/2 data-[at-bottom]:[transition:opacity_120ms_var(--chat-ease),color_120ms_var(--chat-ease),border-color_120ms_var(--chat-ease),visibility_0s_linear_120ms] hover:[border-color:var(--chat-accent)] hover:[color:var(--chat-accent-hi)] ${FOCUS}`}
        >
          <ArrowDown size={12} aria-hidden="true" />
          Latest
        </ThreadPrimitive.ScrollToBottom>
      </div>
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
  return <div class="p-2 flex flex-col min-h-0 [border-top:1px_solid_var(--chat-line)]">{props.children}</div>
}

export const Thread = Object.assign(ThreadRoot, {
  Root: ThreadRoot,
  Viewport: ThreadViewport,
  Welcome: ThreadWelcome,
  Messages: ThreadMessages,
  Composer: ThreadComposer,
})

export type {ToolCardProps}
