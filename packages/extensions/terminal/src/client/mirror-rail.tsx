import {
  createMemo,
  createSignal,
  createUniqueId,
  For,
  Match,
  onCleanup,
  onMount,
  Show,
  Switch,
  type JSX,
} from 'solid-js'
import type {MessagePart, UIMessage} from '@conciv/protocol/chat-types'
import type {ToolViewCtx} from '@conciv/protocol/tool-view-types'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {ChevronRight} from 'lucide-solid'
import {Button} from '@conciv/ui-kit-system'
import {Markdown, Reasoning, ToolCallCard, ToolFallback} from '@conciv/ui-kit-chat'
import {builtinToolCards} from '@conciv/ui-kit-chat-tools'

const RETRY_BASE_MS = 1000
const RETRY_MAX_MS = 15000

type MirrorStatus = 'connecting' | 'open' | 'error'

function frameData(eventBlock: string): string {
  return eventBlock
    .split('\n')
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6))
    .join('')
}

function emitFrame(data: string, onMessages: (messages: UIMessage[]) => void): void {
  if (!data) return
  try {
    const parsed: {messages: UIMessage[]} = JSON.parse(data)
    onMessages(parsed.messages)
  } catch {}
}

function dispatchFrames(buffered: {value: string}, onMessages: (messages: UIMessage[]) => void): void {
  const events = buffered.value.split('\n\n')
  buffered.value = events.pop() ?? ''
  for (const eventBlock of events) emitFrame(frameData(eventBlock), onMessages)
}

async function pumpMirror(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onMessages: (messages: UIMessage[]) => void,
): Promise<void> {
  const decoder = new TextDecoder()
  const buffered = {value: ''}
  for (;;) {
    const {done, value} = await reader.read()
    if (done) return
    buffered.value += decoder.decode(value, {stream: true})
    dispatchFrames(buffered, onMessages)
  }
}

async function openMirror(
  url: string,
  headers: () => Record<string, string>,
  signal: AbortSignal,
  onMessages: (messages: UIMessage[]) => void,
  onStatus: (status: MirrorStatus) => void,
  onOpen: () => void,
): Promise<void> {
  onStatus('connecting')
  const res = await fetch(url, {credentials: 'include', headers: headers(), signal})
  if (!res.ok) throw new Error(`mirror responded ${res.status}`)
  const reader = res.body?.getReader()
  if (!reader) throw new Error('mirror has no body')
  onStatus('open')
  onOpen()
  await pumpMirror(reader, onMessages)
}

function backoffDelay(attempts: number): number {
  return Math.min(RETRY_BASE_MS * 2 ** (attempts - 1), RETRY_MAX_MS)
}

function connectMirror(
  url: string,
  headers: () => Record<string, string>,
  onMessages: (messages: UIMessage[]) => void,
  onStatus: (status: MirrorStatus) => void,
): () => void {
  const controller = new AbortController()
  const state = {attempts: 0}
  const runOnce = async (): Promise<void> => {
    try {
      await openMirror(url, headers, controller.signal, onMessages, onStatus, () => (state.attempts = 0))
    } catch {
      if (!controller.signal.aborted) onStatus('error')
    }
  }
  const consume = async (): Promise<void> => {
    while (!controller.signal.aborted) {
      await runOnce()
      if (controller.signal.aborted) return
      state.attempts += 1
      await new Promise((resolve) => setTimeout(resolve, backoffDelay(state.attempts)))
    }
  }
  void consume()
  return () => controller.abort()
}

function asToolCall(part: MessagePart): ToolCallPart | null {
  return part.type === 'tool-call' ? part : null
}

function asToolResult(part: MessagePart): ToolResultPart | null {
  return part.type === 'tool-result' ? part : null
}

function resultsById(messages: UIMessage[]): Map<string, ToolResultPart> {
  const map = new Map<string, ToolResultPart>()
  for (const part of messages.flatMap((message) => message.parts)) {
    const result = asToolResult(part)
    if (result?.toolCallId) map.set(result.toolCallId, result)
  }
  return map
}

const PLACEHOLDER = 'text-[length:var(--chat-text-xs)] [color:var(--chat-text-3)] px-3 py-4 leading-[1.5] text-center'

function partText(part: MessagePart): string {
  return 'content' in part && typeof part.content === 'string' ? part.content : ''
}

function statusDotClass(status: MirrorStatus): Record<string, boolean> {
  return {
    'bg-pw-success': status === 'open',
    'bg-pw-danger': status === 'error',
    'bg-pw-text-3 anim-pulse': status === 'connecting',
  }
}

function userText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === 'text')
    .map(partText)
    .join('\n')
    .trim()
}

function hasAssistantContent(message: UIMessage): boolean {
  return message.parts.some(
    (part) => (part.type === 'text' && partText(part).trim()) || part.type === 'thinking' || part.type === 'tool-call',
  )
}

function AssistantPart(props: {
  part: MessagePart
  results: Map<string, ToolResultPart>
  ctx: ToolViewCtx
}): JSX.Element {
  const tool = () => asToolCall(props.part)
  const result = () => {
    const id = tool()?.id
    return id ? props.results.get(id) : undefined
  }
  return (
    <Switch>
      <Match when={props.part.type === 'text' && partText(props.part).trim()}>
        <Markdown content={partText(props.part)} />
      </Match>
      <Match when={props.part.type === 'thinking' && partText(props.part).trim()}>
        <Reasoning text={partText(props.part)} />
      </Match>
      <Match when={tool()}>
        {(part) => (
          <ToolCallCard
            part={part()}
            result={result()}
            ctx={props.ctx}
            tools={() => builtinToolCards}
            fallback={ToolFallback}
          />
        )}
      </Match>
    </Switch>
  )
}

function MirrorMessage(props: {
  message: UIMessage
  results: Map<string, ToolResultPart>
  ctx: ToolViewCtx
}): JSX.Element {
  return (
    <Show
      when={props.message.role === 'user'}
      fallback={
        <Show when={hasAssistantContent(props.message)}>
          <div class="flex flex-col gap-2 min-w-0 [color:var(--chat-text)] self-stretch anim-msg">
            <For each={props.message.parts}>
              {(part) => <AssistantPart part={part} results={props.results} ctx={props.ctx} />}
            </For>
          </div>
        </Show>
      }
    >
      <Show when={userText(props.message)}>
        {(text) => (
          <div class="text-[length:var(--chat-text-sm)] leading-[1.45] px-3 py-1.5 rounded-[var(--chat-radius-md)] max-w-[85%] [background:var(--chat-accent)] [color:var(--chat-on-accent)] [overflow-wrap:anywhere] self-end anim-msg">
            {text()}
          </div>
        )}
      </Show>
    </Show>
  )
}

function RailPlaceholder(props: {status: MirrorStatus}): JSX.Element {
  return (
    <p class={PLACEHOLDER}>
      <Switch>
        <Match when={props.status === 'error'}>Can’t reach activity — retrying…</Match>
        <Match when={props.status === 'connecting'}>Connecting…</Match>
        <Match when={props.status === 'open'}>
          Claude’s replies, reasoning and tool calls appear here as it works.
        </Match>
      </Switch>
    </p>
  )
}

export function MirrorRail(props: {
  apiBase: string
  headers: () => Record<string, string>
  ctx: ToolViewCtx
}): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const [messages, setMessages] = createSignal<UIMessage[]>([])
  const [status, setStatus] = createSignal<MirrorStatus>('connecting')
  onMount(() => {
    const stop = connectMirror(`${props.apiBase}/api/ext/terminal/mirror`, props.headers, setMessages, setStatus)
    onCleanup(stop)
  })
  const results = createMemo(() => resultsById(messages()))
  const logId = createUniqueId()
  return (
    <div
      class="flex flex-col min-h-0 min-w-0"
      classList={{'w-[min(22rem,42vw)] [border-left:1px_solid_var(--chat-line)]': open()}}
    >
      <Button
        variant="ghost"
        size="sm"
        class="m-1 gap-1.5 self-start"
        aria-expanded={open()}
        aria-controls={logId}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight
          class="size-3.5 [transition:transform_150ms_var(--pw-ease)] motion-reduce:transition-none"
          classList={{'rotate-90': open()}}
          aria-hidden="true"
        />
        <span class="rounded-full size-1.75" classList={statusDotClass(status())} aria-hidden="true" />
        Activity
        <Show when={messages().length > 0}>
          <span class="text-pw-text-3 tabular-nums">{messages().length}</span>
        </Show>
      </Button>
      <Show when={open()}>
        <div
          id={logId}
          class="px-3 py-3 flex flex-1 flex-col gap-3 min-h-0 [color:var(--chat-text)] [font-family:var(--chat-font)] overflow-y-auto"
          role="log"
          aria-label="Terminal activity"
          aria-live="polite"
        >
          <Show when={messages().length > 0} fallback={<RailPlaceholder status={status()} />}>
            <For each={messages()}>
              {(message) => <MirrorMessage message={message} results={results()} ctx={props.ctx} />}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  )
}
