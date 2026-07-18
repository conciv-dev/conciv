import {
  children,
  createContext,
  createMemo,
  Index,
  Match,
  Show,
  Switch,
  useContext,
  type Component,
  type JSX,
} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {ArrowDown, Brain, FilePen, FileText, List, Search, Terminal, Wrench} from 'lucide-solid'
import type {MessagePart, ToolCallPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolCardProps, ToolUIComponent} from '@conciv/protocol/tool-view-types'
import {useThread} from '../store/chat-context.js'
import {useToolCtx} from '../store/tool-context.js'
import {Thread as ThreadPrimitive} from '../primitives/thread/thread.js'
import {Message} from '../primitives/message/message.js'
import {useMessage} from '../primitives/message/message-context.js'
import {groupSegments, type Segment, type Turn} from '../store/grouping.js'
import {AttachmentByMime, type AttachmentCardSlot} from './attachment-dispatch.js'
import {Markdown} from './markdown.js'
import {Reasoning} from './reasoning.js'
import {ToolFallback} from './tool-fallback.js'
import {ToolCallCard} from './tools/tool-call-card.js'
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

  tools?: ToolCardEntry[]
  welcome?: JSX.Element
  composer?: JSX.Element

  turnPrefix?: (turn: Turn) => JSX.Element

  viewportFooter?: JSX.Element

  viewportRef?: (element: HTMLElement) => void

  overlay?: JSX.Element

  attachmentCards?: readonly AttachmentCardSlot[]

  class?: string
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
}): JSX.Element {
  const message = useMessage()

  const ctx = useToolCtx()
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
  const awaitsApproval = (indices: number[]) =>
    indices.some((index) => {
      const part = parts()[index]
      return part?.type === 'tool-call' && part.state === 'approval-requested'
    })
  const asChain = (segment: Segment) => (segment.kind === 'chain' ? segment : null)
  const asReply = (segment: Segment) => (segment.kind === 'reply' ? segment : null)
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
                  streaming={thread.isRunning && message.isLast() && isLastSegment(segmentIndex)}
                  pinnedOpen={awaitsApproval(chain().indices)}
                >
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
}

const ThreadConfigContext = createContext<ThreadConfig>({
  entries: () => [],
  fallback: () => ToolFallback,
  assistant: () => undefined,
  turnPrefix: () => undefined,
  attachmentCards: () => [],
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
        fallback={<AssistantTurn entries={config.entries()} fallback={config.fallback()} />}
      >
        {(component) => <Dynamic component={component()} />}
      </Show>
    </>
  )
}

const MESSAGES_COMPONENTS = {UserMessage: UserTurn, AssistantMessage: AssistantMessageView}

export function Thread(props: ThreadProps): JSX.Element {
  const composerSlot = children(() => props.composer)
  return (
    <ThreadConfigContext.Provider
      value={{
        entries: () => props.tools ?? [],
        fallback: () => props.components?.ToolFallback ?? ToolFallback,
        assistant: () => props.components?.AssistantMessage,
        turnPrefix: () => props.turnPrefix,
        attachmentCards: () => props.attachmentCards ?? [],
      }}
    >
      <div
        class={`flex flex-col h-full min-h-0 [color:var(--chat-text)] [font-family:var(--chat-font)] ${props.class ?? ''}`}
      >
        <ThreadPrimitive.Viewport
          ref={props.viewportRef}
          class="px-3 py-3 flex flex-1 flex-col gap-3 min-h-0 relative overflow-y-auto"
          role="log"
          aria-live="off"
        >
          <ThreadPrimitive.Empty>
            <Show when={props.components?.Welcome} fallback={props.welcome}>
              {(welcome) => <Dynamic component={welcome()} />}
            </Show>
          </ThreadPrimitive.Empty>
          <ThreadPrimitive.Messages components={MESSAGES_COMPONENTS} />
          <Show when={props.viewportFooter}>{props.viewportFooter}</Show>
          {props.overlay}
          <div class="h-0 pointer-events-none self-center bottom-2 sticky z-10 overflow-visible">
            <ThreadPrimitive.ScrollToBottom
              class={`text-[length:var(--chat-text-xs)] px-2 rounded-[var(--chat-radius-pill)] inline-flex gap-1 min-h-6 cursor-pointer pointer-events-auto [background:var(--chat-fill)] [border:1px_solid_var(--chat-line)] [color:var(--chat-accent-link)] [transition:opacity_120ms_var(--chat-ease)] items-center bottom-0 left-1/2 absolute data-[at-bottom]:opacity-0 data-[at-bottom]:invisible -translate-x-1/2 data-[at-bottom]:[transition:opacity_120ms_var(--chat-ease),visibility_0s_linear_120ms] hover:[background:var(--chat-fill-strong)] ${FOCUS}`}
            >
              <ArrowDown size={12} aria-hidden="true" />
              Latest
            </ThreadPrimitive.ScrollToBottom>
          </div>
        </ThreadPrimitive.Viewport>
        <Show when={composerSlot()}>
          <div class="p-2 shrink-0 [border-top:1px_solid_var(--chat-line)]">{composerSlot()}</div>
        </Show>
      </div>
    </ThreadConfigContext.Provider>
  )
}

export type {ToolCardProps}
