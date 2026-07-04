import {createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch, type JSX} from 'solid-js'
import type {MessagePart, UIMessage} from '@conciv/protocol/chat-types'
import type {ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import {Button} from '@conciv/ui-kit-system'
import {inlineValue, SUMMARY_KEYS} from '@conciv/ui-kit-chat-tools'

export function connectMirror(
  url: string,
  headers: Record<string, string>,
  onMessages: (messages: UIMessage[]) => void,
): () => void {
  const controller = new AbortController()
  const consume = async (): Promise<void> => {
    while (!controller.signal.aborted) {
      try {
        const res = await fetch(url, {credentials: 'include', headers, signal: controller.signal})
        const reader = res.body?.getReader()
        if (!reader) return
        const decoder = new TextDecoder()
        const state = {buffer: ''}
        for (;;) {
          const {done, value} = await reader.read()
          if (done) break
          state.buffer += decoder.decode(value, {stream: true})
          const events = state.buffer.split('\n\n')
          state.buffer = events.pop() ?? ''
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
      } catch {}
      if (!controller.signal.aborted) await new Promise((resolve) => setTimeout(resolve, 1000))
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
const ENTRY_TEXT = 'text-[0.75rem] text-pw-text px-2.5 py-1 [word-break:break-word]'
const ENTRY_THINKING = 'text-[0.75rem] text-pw-text-3 italic px-2.5 py-1 [word-break:break-word]'
const TOOL_ROW = 'flex items-center gap-1.5 text-[0.71875rem] text-pw-text-2 px-2.5 py-1 font-pw-mono'

function partText(part: MessagePart): string {
  return 'content' in part && typeof part.content === 'string' ? part.content : ''
}

function MirrorEntry(props: {part: MessagePart; results: Map<string, ToolResultPart>}): JSX.Element {
  const tool = () => asToolCall(props.part)
  const result = () => {
    const id = tool()?.id
    return id ? props.results.get(id) : undefined
  }
  return (
    <Switch>
      <Match when={props.part.type === 'text'}>
        <p class={ENTRY_TEXT}>{partText(props.part)}</p>
      </Match>
      <Match when={props.part.type === 'thinking'}>
        <p class={ENTRY_THINKING}>{partText(props.part)}</p>
      </Match>
      <Match when={tool()}>
        {(part) => (
          <div class={TOOL_ROW}>
            <span
              class="rounded-[50%] shrink-0 size-1.75"
              classList={{
                'bg-pw-success': result()?.state === 'complete',
                'bg-pw-danger': result()?.state === 'error',
                'bg-pw-text-3': !result(),
              }}
              aria-hidden="true"
            />
            <span class="font-semibold shrink-0">{part().name}</span>
            <span class="text-pw-text-3 truncate">{inlineValue(part(), SUMMARY_KEYS)}</span>
          </div>
        )}
      </Match>
    </Switch>
  )
}

export function MirrorRail(props: {apiBase: string; headers: () => Record<string, string>}): JSX.Element {
  const [open, setOpen] = createSignal(false)
  const [messages, setMessages] = createSignal<UIMessage[]>([])
  onMount(() => {
    const stop = connectMirror(`${props.apiBase}/api/ext/terminal/mirror`, props.headers(), setMessages)
    onCleanup(stop)
  })
  const results = createMemo(() => resultsById(messages()))
  return (
    <div class="flex flex-col min-h-0" classList={{'w-70 border-l border-pw-line': open()}}>
      <Button variant="ghost" size="sm" class="m-1" aria-expanded={open()} onClick={() => setOpen((value) => !value)}>
        Activity
      </Button>
      <Show when={open()}>
        <div class={RAIL_HEAD}>
          <span>Activity</span>
          <span class="text-pw-text-3">{messages().length}</span>
        </div>
        <div class="py-1 flex-1 overflow-y-auto" role="log" aria-label="Terminal activity">
          <For each={messages()}>
            {(message) => <For each={message.parts}>{(part) => <MirrorEntry part={part} results={results()} />}</For>}
          </For>
        </div>
      </Show>
    </div>
  )
}
