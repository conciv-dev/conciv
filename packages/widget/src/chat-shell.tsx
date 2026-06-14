import {createMemo, createSignal, For, onCleanup, Show, type JSX} from 'solid-js'
import {useChat, fetchServerSentEvents, createChatClientOptions} from '@tanstack/ai-solid'
import type {MessagePart, ToolCallPart, ToolCallState, ToolResultPart} from '@tanstack/ai-client'
import {createChatApi} from './chat-api.js'
import {GenUi} from './gen-ui.js'
import {TestCard} from './test-card.js'
import {Markdown} from './markdown.js'
import {AIDX_UI_EVENT, UiSpecSchema, type UiSpec} from '@aidx/protocol/ui-types'
import {TestRunResultSchema, type TestRunResult} from '@aidx/protocol/test-types'

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

function ChevronDown(): JSX.Element {
  return (
    <svg class="pw-chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 9l7 7 7-7"
        fill="none"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  )
}

function SendArrow(): JSX.Element {
  return (
    <svg class="pw-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 12h14M13 5l7 7-7 7"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  )
}

function StopIcon(): JSX.Element {
  return (
    <svg class="pw-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  )
}

// Focusable controls inside the open dialog, in DOM order — used to wrap Tab focus.
function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('button, textarea, input, select, a[href], [tabindex]:not([tabindex="-1"])'),
  ).filter((el) => !el.hasAttribute('disabled'))
}

function ThinkingBubble(): JSX.Element {
  return (
    <div class="pw-chat-msg pw-chat-msg-assistant pw-chat-typing">
      <span class="pw-chat-dot" />
      <span class="pw-chat-dot" />
      <span class="pw-chat-dot" />
    </div>
  )
}

function panelClass(closing: boolean): string {
  if (closing) return 'pw-chat-panel pw-chat-closing'
  return 'pw-chat-panel'
}

function fabClass(pulsing: boolean): string {
  if (pulsing) return 'pw-chat-fab pw-chat-fab-attn'
  return 'pw-chat-fab'
}

export function ChatFeature(props: {apiBase: string}): JSX.Element {
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
  const [open, setOpen] = createSignal(false)
  const [closing, setClosing] = createSignal(false)
  const [input, setInput] = createSignal('')
  const hydrateState = {done: false}
  const stickToBottom = {current: true}
  let fabEl: HTMLButtonElement | undefined
  let panelEl: HTMLElement | undefined
  let inputEl: HTMLTextAreaElement | undefined

  const isThinking = () => chat.status() === 'submitted'
  const isStreaming = () => chat.status() === 'streaming'
  const lastIndex = () => chat.messages().length - 1
  const isActiveAssistant = (index: number, role: string) => isStreaming() && role === 'assistant' && index === lastIndex()
  // Halo the FAB while the agent works with the panel closed — derived, no stored flag.
  const fabPulsing = () => !open() && (isThinking() || isStreaming())

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
    const observer = new MutationObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight
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

  const openPanel = () => {
    setClosing(false)
    if (open()) return
    setOpen(true)
    void hydrate()
    requestAnimationFrame(() => inputEl?.focus())
  }
  const closePanel = () => {
    if (!open() || closing()) return
    setClosing(true)
    fabEl?.focus()
    setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, 170)
  }
  const toggle = () => {
    if (open() && !closing()) {
      closePanel()
      return
    }
    openPanel()
  }

  const submit = (e: Event) => {
    e.preventDefault()
    const text = input().trim()
    if (!text || chat.isLoading()) return
    setInput('')
    void chat.sendMessage(text)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closePanel()
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit(e)
    }
  }

  // Trap Tab within the open dialog and close on Escape from anywhere in the panel.
  const onPanelKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closePanel()
      return
    }
    if (e.key !== 'Tab' || !panelEl) return
    const items = focusablesIn(panelEl)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const root = panelEl.getRootNode()
    const active = root instanceof ShadowRoot ? root.activeElement : null
    if (e.shiftKey && active === first) {
      e.preventDefault()
      last?.focus()
      return
    }
    if (!e.shiftKey && active === last) {
      e.preventDefault()
      first?.focus()
    }
  }

  const showPanel = () => open() || closing()

  return (
    <>
      <Show when={showPanel()}>
        <section
          ref={(el) => {
            panelEl = el
          }}
          class={panelClass(closing())}
          role="dialog"
          aria-modal="true"
          aria-label="aidx chat agent"
          id="pw-chat-panel"
          onKeyDown={onPanelKeyDown}
        >
          <header class="pw-chat-head">
            <span class="pw-chat-title">aidx</span>
            <button class="pw-chat-close" aria-label="Close chat" onClick={closePanel}>
              <ChevronDown />
            </button>
          </header>
          <div class="pw-chat-log" role="log" aria-live="polite" ref={logRef}>
            <Show
              when={chat.messages().length > 0}
              fallback={
                <div class="pw-chat-empty">
                  <p class="pw-chat-greeting">How can I help you today?</p>
                  <div class="pw-chat-chips">
                    <For each={STARTERS}>
                      {(s) => (
                        <button class="pw-chat-chip" onClick={() => void chat.sendMessage(s)}>
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
                  <button class="pw-chat-retry" onClick={() => void chat.reload()}>
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
              onInput={(e) => setInput(e.currentTarget.value)}
              onKeyDown={onKeyDown}
              ref={(el) => {
                inputEl = el
              }}
            />
            <Show
              when={chat.isLoading()}
              fallback={
                <button type="submit" class="pw-chat-send" aria-label="Send" disabled={!input().trim()}>
                  <SendArrow />
                </button>
              }
            >
              <button type="button" class="pw-chat-send pw-chat-stop" aria-label="Stop" onClick={() => chat.stop()}>
                <StopIcon />
              </button>
            </Show>
          </form>
        </section>
      </Show>
      <button
        ref={(el) => {
          fabEl = el
        }}
        class={fabClass(fabPulsing())}
        aria-label="Open aidx chat"
        aria-expanded={open()}
        aria-controls="pw-chat-panel"
        onClick={toggle}
      >
        <Show
          when={open()}
          fallback={
            <span class="pw-fab-icon" aria-hidden="true">
              ✦
            </span>
          }
        >
          <span class="pw-fab-icon">
            <ChevronDown />
          </span>
        </Show>
      </button>
    </>
  )
}
