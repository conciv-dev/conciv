import {createMemo, createEffect, createSignal, For, onCleanup, Show, type JSX} from 'solid-js'
import {useChat, fetchServerSentEvents, createChatClientOptions} from '@tanstack/ai-solid'
import type {MessagePart, ToolCallPart, ToolCallState, ToolResultPart} from '@tanstack/ai-client'
import {createChatApi} from './chat-api.js'
import {GenUi} from './gen-ui.js'
import {TestCard} from './test-card.js'
import {Markdown} from './markdown.js'
import {ArrowRight, Square} from 'lucide-solid'
import {AIDX_UI_EVENT, UiSpecSchema, type UiSpec} from '@aidx/protocol/ui-types'
import {TestRunResultSchema, type TestRunResult} from '@aidx/protocol/test-types'
import type {PanelDef} from './widget-shell.js'

// Pull the Bash command out of a tool-call part (input.command, or parsed from arguments).
function toolCommand(part: {input?: unknown; arguments?: string}): string {
  const input: unknown = part.input
  if (input && typeof input === 'object' && 'command' in input) {
    const command = input.command
    if (typeof command === 'string') return command
  }
  if (typeof part.arguments === 'string') {
    try {
      const parsed: unknown = JSON.parse(part.arguments)
      if (parsed && typeof parsed === 'object' && 'command' in parsed) {
        const command = parsed.command
        if (typeof command === 'string') return command
      }
    } catch {
      // arguments wasn't JSON
    }
  }
  return ''
}

function parseRunResult(raw: string): TestRunResult | null {
  try {
    const result = TestRunResultSchema.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

type TestAnalysis = {
  runResult: Map<string, TestRunResult | null>
  hiddenCallIds: Set<string>
  hiddenResultIds: Set<string>
}

// The agent drives the runner via `aidx tools test …` (legacy alias: `tools vitest …`).
function isTestCommand(command: string): boolean {
  return command.includes('tools test') || command.includes('tools vitest')
}
function isRunCommand(command: string): boolean {
  return command.includes('tools test run') || command.includes('tools vitest run')
}

function resultContent(part: MessagePart): string {
  if (part.type !== 'tool-result') return ''
  return typeof part.content === 'string' ? part.content : ''
}

// For one message's parts: which test-runner tool-calls become cards, which raw blocks to hide.
function analyzeTests(parts: ReadonlyArray<MessagePart>): TestAnalysis {
  const resultByCallId = new Map<string, string>()
  for (const p of parts) {
    if (p.type === 'tool-result' && p.toolCallId) resultByCallId.set(p.toolCallId, resultContent(p))
  }
  const runResult = new Map<string, TestRunResult | null>()
  const hiddenCallIds = new Set<string>()
  const hiddenResultIds = new Set<string>()
  for (const p of parts) {
    if (p.type !== 'tool-call' || !p.id) continue
    const command = toolCommand(p)
    if (!isTestCommand(command)) continue
    hiddenCallIds.add(p.id)
    hiddenResultIds.add(p.id)
    if (isRunCommand(command)) {
      const raw = resultByCallId.get(p.id)
      runResult.set(p.id, raw ? parseRunResult(raw) : null)
    }
  }
  return {runResult, hiddenCallIds, hiddenResultIds}
}

const STARTERS = ['Explain this page', 'Change the primary color', "Why doesn't this layout fit?"]

// Human label + glyph for a tool-call lifecycle state; `active` = the turn is still generating.
function toolCallStatus(state: ToolCallState, active: boolean): {glyph: string; label: string} {
  if (state === 'complete') return {glyph: 'done', label: 'Done'}
  if (state === 'approval-requested') return {glyph: 'ask', label: 'Needs approval'}
  if (!active) return {glyph: 'done', label: 'Done'}
  if (state === 'awaiting-input') return {glyph: 'spin', label: 'Calling'}
  if (state === 'input-streaming') return {glyph: 'spin', label: 'Preparing'}
  return {glyph: 'spin', label: 'Running'}
}

function prettyArgs(part: ToolCallPart): string {
  if (part.input !== undefined) return JSON.stringify(part.input, null, 2)
  if (!part.arguments) return ''
  try {
    return JSON.stringify(JSON.parse(part.arguments), null, 2)
  } catch {
    return part.arguments
  }
}

function asText(content: ToolResultPart['content']): string {
  if (typeof content === 'string') return content
  return JSON.stringify(content, null, 2)
}

function ToolGlyph(props: {kind: string}): JSX.Element {
  return <span class={`pw-chat-tool-glyph pw-chat-glyph-${props.kind}`} aria-hidden="true" />
}

function ToolCall(props: {part: ToolCallPart; active: boolean}): JSX.Element {
  const status = () => toolCallStatus(props.part.state, props.active)
  const args = () => prettyArgs(props.part)
  return (
    <div class={`pw-chat-tool pw-chat-tool-${props.part.state}`}>
      <div class="pw-chat-tool-head">
        <ToolGlyph kind={status().glyph} />
        <span class="pw-chat-tool-name">{props.part.name}</span>
        <span class="pw-chat-tool-state">{status().label}</span>
      </div>
      <Show when={args()}>
        <details class="pw-chat-tool-args">
          <summary>arguments</summary>
          <pre>{args()}</pre>
        </details>
      </Show>
    </div>
  )
}

function ToolResult(props: {part: ToolResultPart}): JSX.Element {
  return (
    <Show
      when={props.part.state === 'error'}
      fallback={
        <details class="pw-chat-tool-result">
          <summary>result</summary>
          <pre>{asText(props.part.content)}</pre>
        </details>
      }
    >
      <div class="pw-chat-tool-error">
        <span class="pw-chat-tool-glyph pw-chat-glyph-error" aria-hidden="true" />
        {props.part.error ?? asText(props.part.content)}
      </div>
    </Show>
  )
}

function thinkingClass(live: boolean): string {
  if (live) return 'pw-chat-thinking pw-chat-thinking-live'
  return 'pw-chat-thinking'
}

function TextPartView(props: {content: string; showCaret: boolean}): JSX.Element {
  return (
    <div class="pw-chat-text">
      <Markdown text={props.content} />
      <Show when={props.showCaret}>
        <span class="pw-chat-caret" aria-hidden="true" />
      </Show>
    </div>
  )
}

function PartView(props: {
  part: MessagePart
  index: number
  parts: ReadonlyArray<MessagePart>
  streaming: boolean
  apiBase: string
  tests: TestAnalysis
  onFix: (text: string) => void
}): JSX.Element | null {
  const part = props.part
  const lastTextIndex = props.parts.map((p) => p.type).lastIndexOf('text')
  const isRunCard = part.type === 'tool-call' && part.id !== undefined && props.tests.runResult.has(part.id)

  if (isRunCard) {
    return <TestCard apiBase={props.apiBase} onFix={props.onFix} result={props.tests.runResult.get(part.id) ?? null} />
  }
  if (part.type === 'text') {
    return <TextPartView content={part.content} showCaret={props.streaming && props.index === lastTextIndex} />
  }
  if (part.type === 'thinking' && part.content.trim().length > 0) {
    return (
      <details class={thinkingClass(props.streaming && props.index === props.parts.length - 1)}>
        <summary>Thinking</summary>
        <span>{part.content}</span>
      </details>
    )
  }
  if (part.type === 'tool-call' && !isRunCard && !props.tests.hiddenCallIds.has(part.id)) {
    return <ToolCall part={part} active={props.streaming} />
  }
  if (part.type === 'tool-result' && !props.tests.hiddenResultIds.has(part.toolCallId)) {
    return <ToolResult part={part} />
  }
  return null
}

function MessageParts(props: {
  parts: ReadonlyArray<MessagePart>
  streaming: boolean
  apiBase: string
  onFix: (text: string) => void
}): JSX.Element {
  const tests = createMemo(() => analyzeTests(props.parts))
  return (
    <For each={props.parts}>
      {(part, index) => (
        <PartView
          part={part}
          index={index()}
          parts={props.parts}
          streaming={props.streaming}
          apiBase={props.apiBase}
          tests={tests()}
          onFix={props.onFix}
        />
      )}
    </For>
  )
}

function ThinkingBubble(): JSX.Element {
  return (
    <div class="pw-chat-msg pw-chat-msg-assistant pw-chat-typing" aria-hidden="true">
      <span class="pw-chat-dot" aria-hidden="true" />
      <span class="pw-chat-dot" aria-hidden="true" />
      <span class="pw-chat-dot" aria-hidden="true" />
    </div>
  )
}

// One agent session: owns its useChat + generative-UI state and renders the thread log
// plus the composer. Layout-agnostic — the modal panel, a quick-terminal pane, and a PiP
// body all render this same component. Chrome (header, open/close, FAB) lives in the shell.
export function ChatPanel(props: {
  apiBase: string
  // The containing surface is visible/focused — focus the composer and hydrate on first show.
  active?: boolean
  // Reports whether the agent is thinking/streaming, so the shell can pulse the trigger.
  onWorkingChange?: (working: boolean) => void
}): JSX.Element {
  const api = createChatApi({apiBase: props.apiBase})
  const [genUi, setGenUi] = createSignal<UiSpec[]>([])
  // The agent's `aidx ui …` calls arrive as AG-UI CUSTOM events; render each in the thread.
  const onAidxUi = (eventType: string, data: unknown) => {
    if (eventType !== AIDX_UI_EVENT) return
    const parsed = UiSpecSchema.safeParse(data)
    if (!parsed.success) return
    const spec = parsed.data
    setGenUi((prev) => {
      const existing = prev.find((g) => g.renderId === spec.renderId)
      // The vitest card is persistent and self-updating; don't replace it on a duplicate inject.
      if (existing && spec.kind === 'vitest') return prev
      return [...prev.filter((g) => g.renderId !== spec.renderId), spec]
    })
  }
  const chat = useChat({
    ...createChatClientOptions({connection: fetchServerSentEvents(api.chatUrl)}),
    onCustomEvent: onAidxUi,
  })
  const [input, setInput] = createSignal('')
  const hydrateState = {done: false}
  const stickToBottom = {current: true}
  let inputEl: HTMLTextAreaElement | undefined

  const isThinking = () => chat.status() === 'submitted'
  const isStreaming = () => chat.status() === 'streaming'
  const lastIndex = () => chat.messages().length - 1
  const isActiveAssistant = (index: number, role: string) => isStreaming() && role === 'assistant' && index === lastIndex()

  // Surface the working state for the shell's trigger pulse.
  createEffect(() => props.onWorkingChange?.(isThinking() || isStreaming()))

  // Screen-reader announcements. The log itself is aria-live="off" (streaming would otherwise
  // flood it token-by-token); instead we announce status transitions once into a polite region —
  // concise, not the message body (echoing a long reply into a live region can't be paused or
  // navigated; the reply text stays readable in the role="log" via browse mode).
  const [liveMsg, setLiveMsg] = createSignal('')
  let prevStatus = ''
  createEffect(() => {
    const s = chat.status()
    if (s === 'submitted') setLiveMsg('aidx is thinking…')
    else if (prevStatus === 'streaming' && s !== 'streaming') setLiveMsg('aidx replied.')
    prevStatus = s
  })

  const answerGenUi = (renderId: string, text: string) => {
    setGenUi((prev) => prev.filter((g) => g.renderId !== renderId))
    void chat.sendMessage(text)
  }

  // Answer the risky-Bash gate (blocking allow/deny, no new turn), then drop the card.
  const decideGate = (renderId: string, approved: boolean) => {
    setGenUi((prev) => prev.filter((g) => g.renderId !== renderId))
    void api.permissionDecision(renderId, approved)
  }

  // Auto-scroll to bottom as the agent streams, but only while the user is already at the bottom.
  const logRef = (el: HTMLDivElement) => {
    const atBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight < 40
    el.addEventListener('scroll', () => {
      stickToBottom.current = atBottom()
    })
    // Coalesce the streaming mutation flood into one scroll write per frame — reading scrollHeight
    // and writing scrollTop on every token would force a layout per delta.
    let scheduled = false
    const observer = new MutationObserver(() => {
      if (!stickToBottom.current || scheduled) return
      scheduled = true
      requestAnimationFrame(() => {
        scheduled = false
        el.scrollTop = el.scrollHeight
      })
    })
    observer.observe(el, {childList: true, subtree: true, characterData: true})
    onCleanup(() => observer.disconnect())
  }

  const hydrate = async () => {
    if (hydrateState.done) return
    hydrateState.done = true
    try {
      const session = await api.session()
      if (!session.sessionId) return
      const prior = await api.history(session.sessionId)
      if (prior.length > 0) chat.setMessages(prior)
    } catch {
      // No transcript / not resumable → start from the greeting.
    }
  }

  // Hydrate + focus the composer the first time the surface becomes active.
  createEffect(() => {
    if (!props.active) return
    void hydrate()
    requestAnimationFrame(() => inputEl?.focus())
  })

  // Grow the composer with its content up to the CSS max-height (120px), then it scrolls.
  const autoGrow = (el: HTMLTextAreaElement) => {
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }

  const submit = (e: Event) => {
    e.preventDefault()
    const text = input().trim()
    if (!text || chat.isLoading()) return
    setInput('')
    if (inputEl) inputEl.style.height = 'auto'
    void chat.sendMessage(text)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(e)
    }
  }

  return (
    <>
      <div class="pw-chat-log" role="log" aria-live="off" ref={logRef}>
        <Show
          when={chat.messages().length > 0}
          fallback={
            <div class="pw-chat-empty">
              <p class="pw-chat-greeting">How can I help you today?</p>
              <div class="pw-chat-chips">
                <For each={STARTERS}>
                  {(s) => (
                    <button type="button" class="pw-chat-chip" onClick={() => void chat.sendMessage(s)}>
                      {s}
                    </button>
                  )}
                </For>
              </div>
            </div>
          }
        >
          <For each={chat.messages()}>
            {(m, index) => (
              <div class={`pw-chat-msg pw-chat-msg-${m.role}`}>
                <MessageParts
                  parts={m.parts}
                  streaming={isActiveAssistant(index(), m.role)}
                  apiBase={props.apiBase}
                  onFix={(text) => void chat.sendMessage(text)}
                />
              </div>
            )}
          </For>
        </Show>
        <For each={genUi()}>
          {(spec) => (
            <GenUi
              spec={spec}
              onAnswer={(text) => answerGenUi(spec.renderId, text)}
              onDecide={(approved) => decideGate(spec.renderId, approved)}
            />
          )}
        </For>
        <Show when={isThinking()}>
          <ThinkingBubble />
        </Show>
        <Show when={chat.error()}>
          {(error) => (
            <div class="pw-chat-error" role="alert">
              <span class="pw-chat-error-msg">{error().message}</span>
              <button type="button" class="pw-chat-retry" onClick={() => void chat.reload()}>
                Retry
              </button>
            </div>
          )}
        </Show>
      </div>
      <form class="pw-chat-composer" onSubmit={submit}>
        <textarea
          class="pw-chat-input"
          rows={1}
          placeholder="Ask a question…"
          aria-label="Message the aidx agent"
          value={input()}
          onInput={(e) => {
            setInput(e.currentTarget.value)
            autoGrow(e.currentTarget)
          }}
          onKeyDown={onKeyDown}
          ref={(el) => {
            inputEl = el
          }}
        />
        <Show
          when={chat.isLoading()}
          fallback={
            <button type="submit" class="pw-chat-send" aria-label="Send" disabled={!input().trim()}>
              <ArrowRight class="pw-icon" aria-hidden="true" />
            </button>
          }
        >
          <button type="button" class="pw-chat-send pw-chat-stop" aria-label="Stop" onClick={() => chat.stop()}>
            <Square class="pw-icon" fill="currentColor" aria-hidden="true" />
          </button>
        </Show>
      </form>
      <div class="pw-sr-only" role="status" aria-live="polite">
        {liveMsg()}
      </div>
    </>
  )
}

// The chat as a registerable shell panel. The modal hosts one; quick-terminal panes each create
// their own (a fresh agent session per pane).
export function chatPanelDef(apiBase: string): PanelDef {
  return {
    id: 'chat',
    title: 'aidx',
    create: (ctx) => <ChatPanel apiBase={apiBase} active={ctx.active()} onWorkingChange={ctx.onWorkingChange} />,
  }
}
