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

export type MirrorStatus = 'connecting' | 'open' | 'error'

export function connectMirror(
  url: string,
  headers: () => Record<string, string>,
  onMessages: (messages: UIMessage[]) => void,
  onStatus: (status: MirrorStatus) => void,
): () => void {
  const controller = new AbortController()
  const state = {attempts: 0}
  const consume = async (): Promise<void> => {
    while (!controller.signal.aborted) {
      try {
        onStatus('connecting')
        const res = await fetch(url, {credentials: 'include', headers: headers(), signal: controller.signal})
        if (!res.ok) throw new Error(`mirror responded ${res.status}`)
        const reader = res.body?.getReader()
        if (!reader) throw new Error('mirror has no body')
        onStatus('open')
        state.attempts = 0
        const decoder = new TextDecoder()
        const buffered = {value: ''}
        for (;;) {
          const {done, value} = await reader.read()
          if (done) break
          buffered.value += decoder.decode(value, {stream: true})
          const events = buffered.value.split('\n\n')
          buffered.value = events.pop() ?? ''
          for (const eventBlock of events) {
            const data = eventBlock
              .split('\n')
              .filter((line) => line.startsWith('data: '))
              .map((line) => line.slice(6))
              .join('')
            if (!data) continue
            try {
              const parsed: {messages: UIMessage[]} = JSON.parse(data)
              onMessages(parsed.messages)
            } catch {}
          }
        }
      } catch {
        if (controller.signal.aborted) return
        onStatus('error')
      }
      if (controller.signal.aborted) return
      state.attempts += 1
      const delay = Math.min(RETRY_BASE_MS * 2 ** (state.attempts - 1), RETRY_MAX_MS)
      await new Promise((resolve) => setTimeout(resolve, delay))
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
  for (const message of messages)
    for (const part of message.parts) {
      const result = asToolResult(part)
      if (result?.toolCallId) map.set(result.toolCallId, result)
    }
  return map
}

const RAIL_HEAD =
  'flex items-center justify-between px-2.5 py-1.5 border-b border-pw-line-soft text-[0.6875rem] font-semibold text-pw-text-2'
const ENTRY = 'px-2.5 py-1 min-w-0 anim-msg'
const ENTRY_TEXT = 'text-[0.75rem] text-pw-text px-2.5 py-1 min-w-0 break-words anim-msg'
const PLACEHOLDER = 'text-[0.6875rem] text-pw-text-3 px-2.5 py-3 leading-[1.5]'

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

function MirrorEntry(props: {part: MessagePart; results: Map<string, ToolResultPart>; ctx: ToolViewCtx}): JSX.Element {
  const tool = () => asToolCall(props.part)
  const result = () => {
    const id = tool()?.id
    return id ? props.results.get(id) : undefined
  }
  return (
    <Switch>
      <Match when={props.part.type === 'text' && partText(props.part)}>
        <div class={ENTRY_TEXT}>
          <Markdown content={partText(props.part)} />
        </div>
      </Match>
      <Match when={props.part.type === 'thinking' && partText(props.part)}>
        <div class={ENTRY}>
          <Reasoning text={partText(props.part)} />
        </div>
      </Match>
      <Match when={tool()}>
        {(part) => (
          <div class={ENTRY}>
            <ToolCallCard
              part={part()}
              result={result()}
              ctx={props.ctx}
              tools={() => builtinToolCards}
              fallback={ToolFallback}
            />
          </div>
        )}
      </Match>
    </Switch>
  )
}

function RailPlaceholder(props: {status: MirrorStatus}): JSX.Element {
  return (
    <p class={PLACEHOLDER}>
      <Switch>
        <Match when={props.status === 'error'}>Can’t reach activity — retrying…</Match>
        <Match when={props.status === 'connecting'}>Connecting…</Match>
        <Match when={props.status === 'open'}>Claude’s tool calls and edits appear here as it works.</Match>
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
    <div class="flex flex-col min-h-0 min-w-0" classList={{'w-70 border-l border-pw-line': open()}}>
      <Button
        variant="ghost"
        size="sm"
        class="m-1 gap-1.5"
        aria-expanded={open()}
        aria-controls={logId}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight
          class="size-3.5 [transition:transform_150ms_var(--pw-ease)] motion-reduce:transition-none"
          classList={{'rotate-90': open()}}
          aria-hidden="true"
        />
        Activity
        <Show when={messages().length > 0}>
          <span class="text-pw-text-3">{messages().length}</span>
        </Show>
      </Button>
      <Show when={open()}>
        <div class={RAIL_HEAD}>
          <span class="flex gap-1.5 items-center">
            <span class="rounded-full size-1.75" classList={statusDotClass(status())} aria-hidden="true" />
            Activity
          </span>
          <span class="text-pw-text-3">{messages().length}</span>
        </div>
        <div
          id={logId}
          class="py-1 flex-1 overflow-y-auto"
          role="log"
          aria-label="Terminal activity"
          aria-live="polite"
        >
          <Show when={messages().length > 0} fallback={<RailPlaceholder status={status()} />}>
            <For each={messages()}>
              {(message) => (
                <For each={message.parts}>
                  {(part) => <MirrorEntry part={part} results={results()} ctx={props.ctx} />}
                </For>
              )}
            </For>
          </Show>
        </div>
      </Show>
    </div>
  )
}
