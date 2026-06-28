import {createContext, createMemo, Index, Match, Show, Switch, useContext, type Component, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import type {MessagePart, ToolCallPart} from '@tanstack/ai-client'
import type {ToolCardProps, ToolUIComponent} from '@mandarax/protocol/tool-view-types'
import {useThread} from '../store/chat-context.js'
import {useToolCtx} from '../store/tool-context.js'
import {Thread as ThreadPrimitive} from '../primitives/thread/thread.js'
import {Message} from '../primitives/message/message.js'
import {useMessage} from '../primitives/message/message-context.js'
import {groupSegments, type Segment} from '../store/grouping.js'
import {Markdown} from './markdown.js'
import {Reasoning} from './reasoning.js'
import {ToolFallback} from './tool-fallback.js'
import {ChainOfThought} from './chain-of-thought.js'
import {AssistantActionBar} from './action-bar.js'

export type ThreadComponents = {
  AssistantMessage?: Component
  Welcome?: Component
  ToolFallback?: ToolUIComponent
}

export type ThreadProps = {
  components?: ThreadComponents
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

function ChainPart(props: {part: MessagePart | undefined; tool: ToolUIComponent}): JSX.Element {
  const message = useMessage()
  return (
    <Switch>
      <Match when={asThinking(props.part)}>{(part) => <Reasoning text={part().content} />}</Match>
      <Match when={asToolCall(props.part)}>
        {(part) => (
          <Dynamic
            component={props.tool}
            part={part()}
            result={message.pairing().byCallId.get(part().id)}
            ctx={useToolCtx()}
          />
        )}
      </Match>
    </Switch>
  )
}

// The assistant turn: full-width, no bubble (D1) with a min-w-0 chain so a wide tool card grows the
// turn's HEIGHT, never its left/right edges. Consecutive thinking + tool parts fold into one chain
// (D9); a reply text breaks it and renders as markdown.
function AssistantTurn(props: {tool: ToolUIComponent}): JSX.Element {
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
                    {(partIndex) => <ChainPart part={parts()[partIndex()]} tool={props.tool} />}
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
type ThreadConfig = {tool: () => ToolUIComponent; assistant: () => Component | undefined}

const ThreadConfigContext = createContext<ThreadConfig>({tool: () => ToolFallback, assistant: () => undefined})

function AssistantMessageView(): JSX.Element {
  const config = useContext(ThreadConfigContext)
  return (
    <Show when={config.assistant()} fallback={<AssistantTurn tool={config.tool()} />}>
      {(component) => <Dynamic component={component()} />}
    </Show>
  )
}

const MESSAGES_COMPONENTS = {UserMessage: UserTurn, AssistantMessage: AssistantMessageView}

export function Thread(props: ThreadProps): JSX.Element {
  return (
    <ThreadConfigContext.Provider
      value={{
        tool: () => props.components?.ToolFallback ?? ToolFallback,
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
          <ThreadPrimitive.ScrollToBottom class="text-[color:var(--chat-accent-link)] text-[0.6875rem] self-center bottom-1 sticky">
            ↓ Latest
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
