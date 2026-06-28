import {createContext, createMemo, Index, Match, Show, Switch, useContext, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {ArrowDown, Brain, FilePen, FileText, List, Search, Terminal, Wrench} from 'lucide-solid'
import type {MessagePart, ToolCallPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolCardProps, ToolUIComponent} from '@mandarax/protocol/tool-view-types'
import {useThread} from '../store/chat-context.js'
import {useToolCtx} from '../store/tool-context.js'
import {Thread as ThreadPrimitive} from '../primitives/thread/thread.js'
import {Message} from '../primitives/message/message.js'
import {useMessage} from '../primitives/message/message-context.js'
import {groupSegments, type Segment} from '../store/grouping.js'
import {Markdown} from './markdown.js'
import {Reasoning} from './reasoning.js'
import {ToolFallback} from './tool-fallback.js'
import {PermissionCard} from './tools/permission-card.js'
import {ChainOfThought} from './chain-of-thought.js'
import {AssistantActionBar} from './action-bar.js'
import {FOCUS} from './classes.js'

export type ThreadComponents = {
  AssistantMessage?: Component
  Welcome?: Component
  ToolFallback?: ToolUIComponent
}

export type ThreadProps = {
  components?: ThreadComponents
  // The tool vocabulary (from defineToolkit). Each chain tool-call dispatches to the entry whose
  // names include part.name, falling back to ToolFallback.
  tools?: ToolCardEntry[]
  welcome?: JSX.Element
  composer?: JSX.Element
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

// The rail node icon for a tool step, by tool name (falls back to a generic wrench).
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

// Dispatch a tool-call part to its card: the entry whose names include part.name, else the fallback.
function resolveTool(name: string, entries: ToolCardEntry[], fallback: ToolUIComponent): ToolUIComponent {
  return entries.find((entry) => entry.names.includes(name))?.render ?? fallback
}

function ChainPart(props: {
  part: MessagePart | undefined
  entries: ToolCardEntry[]
  fallback: ToolUIComponent
  last?: boolean
}): JSX.Element {
  const message = useMessage()
  return (
    <Switch>
      <Match when={asThinking(props.part)}>
        {(part) => (
          <ChainOfThought.Step icon={<Brain size={13} />} last={props.last}>
            <Reasoning text={part().content} />
          </ChainOfThought.Step>
        )}
      </Match>
      <Match when={asToolCall(props.part)}>
        {(part) => (
          <ChainOfThought.Step icon={toolStepIcon(part().name)} last={props.last}>
            <Dynamic
              component={resolveTool(part().name, props.entries, props.fallback)}
              part={part()}
              result={message.pairing().byCallId.get(part().id)}
              ctx={useToolCtx()}
            />
            <PermissionCard part={part()} result={message.pairing().byCallId.get(part().id)} ctx={useToolCtx()} />
          </ChainOfThought.Step>
        )}
      </Match>
    </Switch>
  )
}

// The assistant turn: full-width, no bubble (D1) with a min-w-0 chain so a wide tool card grows the
// turn's HEIGHT, never its left/right edges. Consecutive thinking + tool parts fold into one chain
// (D9); a reply text breaks it and renders as markdown.
function AssistantTurn(props: {entries: ToolCardEntry[]; fallback: ToolUIComponent}): JSX.Element {
  const message = useMessage()
  const thread = useThread()
  const parts = () => message.message().parts
  const segments = createMemo(() => groupSegments(parts()))
  const lastTextIndex = createMemo(() =>
    parts()
      .map((part) => part.type)
      .lastIndexOf('text'),
  )
  const streamingAt = (index: number) => thread.isRunning && message.isLast() && index === lastTextIndex()
  const isLastSegment = (index: number) => index === segments().length - 1
  const asChain = (segment: Segment) => (segment.kind === 'chain' ? segment : null)
  const asReply = (segment: Segment) => (segment.kind === 'reply' ? segment : null)
  return (
    <Message.Root class="flex flex-col gap-1.5 min-w-0 w-full [color:var(--chat-text)] self-stretch anim-msg">
      <Index each={segments()}>
        {(segment, segmentIndex) => (
          <Switch>
            <Match when={asChain(segment())}>
              {(chain) => (
                <ChainOfThought streaming={thread.isRunning && message.isLast() && isLastSegment(segmentIndex)}>
                  <Index each={chain().indices}>
                    {(partIndex, partPosition) => (
                      <ChainPart
                        part={parts()[partIndex()]}
                        entries={props.entries}
                        fallback={props.fallback}
                        last={partPosition === chain().indices.length - 1}
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
          </Switch>
        )}
      </Index>
      <Message.Error />
      <AssistantActionBar />
    </Message.Root>
  )
}

// The user turn: a compact bubble pinned to the right (assistant-ui model).
function UserTurn(): JSX.Element {
  return (
    <Message.Root class="px-3 py-1.5 rounded-[var(--chat-radius-md)] max-w-[80%] [background:var(--chat-accent)] [color:var(--chat-on-accent)] [overflow-wrap:anywhere] self-end anim-msg">
      <Message.Parts />
    </Message.Root>
  )
}

// Thread config (the host's component overrides) flows via context so the message components stay at
// module level — defining them inside Thread would recreate them each render (views over context, not props).
type ThreadConfig = {
  entries: () => ToolCardEntry[]
  fallback: () => ToolUIComponent
  assistant: () => Component | undefined
}

const ThreadConfigContext = createContext<ThreadConfig>({
  entries: () => [],
  fallback: () => ToolFallback,
  assistant: () => undefined,
})

function AssistantMessageView(): JSX.Element {
  const config = useContext(ThreadConfigContext)
  return (
    <Show
      when={config.assistant()}
      fallback={<AssistantTurn entries={config.entries()} fallback={config.fallback()} />}
    >
      {(component) => <Dynamic component={component()} />}
    </Show>
  )
}

const MESSAGES_COMPONENTS = {UserMessage: UserTurn, AssistantMessage: AssistantMessageView}

export function Thread(props: ThreadProps): JSX.Element {
  return (
    <ThreadConfigContext.Provider
      value={{
        entries: () => props.tools ?? [],
        fallback: () => props.components?.ToolFallback ?? ToolFallback,
        assistant: () => props.components?.AssistantMessage,
      }}
    >
      <div class="flex flex-col h-full min-h-0 [color:var(--chat-text)] [font-family:var(--chat-font)]">
        <ThreadPrimitive.Viewport class="px-3 py-3 flex flex-1 flex-col gap-3 min-h-0 overflow-y-auto">
          <ThreadPrimitive.Empty>
            <Show when={props.components?.Welcome} fallback={props.welcome}>
              {(welcome) => <Dynamic component={welcome()} />}
            </Show>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={MESSAGES_COMPONENTS} />
          <ThreadPrimitive.ScrollToBottom
            class={`text-[length:var(--chat-text-xs)] px-2 rounded-[var(--chat-radius-pill)] inline-flex gap-1 min-h-6 cursor-pointer [color:var(--chat-accent-link)] items-center self-center bottom-1 sticky hover:[background:var(--chat-fill-strong)] ${FOCUS}`}
          >
            <ArrowDown size={12} aria-hidden="true" />
            Latest
          </ThreadPrimitive.ScrollToBottom>
        </ThreadPrimitive.Viewport>
        <Show when={props.composer}>
          <div class="p-2 shrink-0 [border-top:1px_solid_var(--chat-line)]">{props.composer}</div>
        </Show>
      </div>
    </ThreadConfigContext.Provider>
  )
}

// Re-export the tool component shape so the widget can wire its toolkit through the Thread.
export type {ToolCardProps}
