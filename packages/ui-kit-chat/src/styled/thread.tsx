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
import {groupSegments, type Segment, type Turn} from '../store/grouping.js'
import {
  pageSessionCallParts,
  pageSessionGroupingOptions,
  pageSessionHasSteps,
  pageSessionThinkingParts,
  type PageSessionConfig,
} from '../store/page-session.js'
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

function AssistantTurn(props: {
  entries: ToolCardEntry[]
  fallback: ToolUIComponent
  pageSession?: PageSessionConfig
}): JSX.Element {
  const message = useMessage()
  const thread = useThread()
  const ctx = useToolCtx()
  const parts = () => message.message().parts
  const groupingOptions = createMemo(() => pageSessionGroupingOptions(props.pageSession))
  const segments = createMemo(() => groupSegments(parts(), groupingOptions()))
  const lastTextIndex = createMemo(() =>
    parts()
      .map((part) => part.type)
      .lastIndexOf('text'),
  )
  const streamingAt = (index: number) => thread.isRunning && message.isLast() && index === lastTextIndex()
  const lastPartIndex = createMemo(() => parts().length - 1)
  const livePart = (index: number) => thread.isRunning && message.isLast() && index === lastPartIndex()
  const chainAutoOpen = (indices: number[]) => {
    const last = indices.at(-1)
    const reasoningStreaming = last !== undefined && livePart(last) && asThinking(parts()[last]) !== null
    return reasoningStreaming || indices.some((index) => isAwaitingApproval(parts()[index], ctx))
  }
  const hasChainStep = (indices: number[]) =>
    indices.some((index) => {
      const part = parts()[index]
      return part?.type === 'thinking' || part?.type === 'tool-call'
    })
  const asChain = (segment: Segment) => {
    if (segment.kind !== 'chain') return null
    if (props.pageSession && !hasChainStep(segment.indices)) return null
    return segment
  }
  const asPageSession = (segment: Segment) => {
    const config = props.pageSession
    if (!config || segment.kind !== 'page-session') return null
    return pageSessionHasSteps(parts(), segment.indices, config.actNames) ? segment : null
  }
  const asReply = (segment: Segment) => (segment.kind === 'reply' ? segment : null)
  const renderableSegment = (segment: Segment): boolean =>
    asChain(segment) !== null || asReply(segment) !== null || asPageSession(segment) !== null
  const lastRenderableIndex = createMemo(() => {
    let last = -1
    for (const [index, segment] of segments().entries()) if (renderableSegment(segment)) last = index
    return last
  })
  const liveSegment = (index: number) => thread.isRunning && message.isLast() && index === lastRenderableIndex()
  return (
    <Message.Root
      data-pw-msg
      class={`flex flex-col gap-1.5 min-w-0 w-full [color:var(--chat-text)] self-stretch relative anim-msg ${message.isLast() ? '' : 'pb-11'}`}
    >
      <Index each={segments()}>
        {(segment, segmentIndex) => (
          <Switch>
            <Match when={asChain(segment())}>
              {(chain) => (
                <ChainOfThought
                  streaming={liveSegment(segmentIndex)}
                  autoOpen={chainAutoOpen(chain().indices)}
                  grow={CHAIN_OF_THOUGHT_GROW}
                >
                  <Index each={chain().indices}>
                    {(partIndex, partPosition) => (
                      <ChainPart
                        part={parts()[partIndex()]}
                        entries={props.entries}
                        fallback={props.fallback}
                        last={partPosition === chain().indices.length - 1}
                        streaming={livePart(partIndex())}
                      />
                    )}
                  </Index>
                </ChainOfThought>
              )}
            </Match>
            <Match when={asReply(segment())}>
              {(reply) => (
                <Show when={asText(parts()[reply().index])}>
                  {(part) => <Markdown content={part().content} streaming={streamingAt(reply().index)} />}
                </Show>
              )}
            </Match>
            <Match when={asPageSession(segment())}>
              {(session) => (
                <Show when={props.pageSession}>
                  {(config) => (
                    <Dynamic
                      component={config().render}
                      parts={pageSessionCallParts(parts(), session().indices)}
                      thinking={pageSessionThinkingParts(parts(), session().indices)}
                      resultFor={(toolCallId: string) => message.pairing().byCallId.get(toolCallId)}
                      streaming={liveSegment(segmentIndex)}
                    />
                  )}
                </Show>
              )}
            </Match>
          </Switch>
        )}
      </Index>
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
      <Message.Root
        data-pw-msg
        class="px-3 py-1.5 rounded-[var(--chat-radius-md)] max-w-[80%] [background:var(--chat-accent)] [color:var(--chat-on-accent)] [overflow-wrap:anywhere] self-end anim-msg"
      >
        <Message.Parts />
      </Message.Root>
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
}

const ThreadConfigContext = createContext<ThreadConfig>({
  entries: () => [],
  fallback: () => ToolFallback,
  assistant: () => undefined,
  turnPrefix: () => undefined,
  attachmentCards: () => [],
  pageSession: () => undefined,
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
          <AssistantTurn entries={config.entries()} fallback={config.fallback()} pageSession={config.pageSession()} />
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
  return (
    <ThreadConfigContext.Provider
      value={{
        entries: () => props.tools ?? [],
        fallback: () => props.components?.ToolFallback ?? ToolFallback,
        assistant: () => props.components?.AssistantMessage,
        turnPrefix: () => props.turnPrefix,
        attachmentCards: () => props.attachmentCards ?? [],
        pageSession: () => props.pageSession,
      }}
    >
      <ThreadPrimitive.Messages components={MESSAGES_COMPONENTS} />
    </ThreadConfigContext.Provider>
  )
}

function ThreadComposer(props: ParentProps): JSX.Element {
  return <div class="p-2 shrink-0 [border-top:1px_solid_var(--chat-line)]">{props.children}</div>
}

export const Thread = Object.assign(ThreadRoot, {
  Root: ThreadRoot,
  Viewport: ThreadViewport,
  Welcome: ThreadWelcome,
  Messages: ThreadMessages,
  Composer: ThreadComposer,
})

export type {ToolCardProps}
