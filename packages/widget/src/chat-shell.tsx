import {type FormEvent, type JSX, type KeyboardEvent, useMemo, useRef, useState} from 'react'
import {useChat, fetchServerSentEvents, createChatClientOptions} from '@tanstack/ai-react'
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
  // tool-call id of a `test run` → its parsed result (null while the run is still active)
  runResult: Map<string, TestRunResult | null>
  // tool-call / tool-result ids belonging to ANY `tools test …` call — hidden from the thread
  // (the run renders as a card; list/status/stop are internal plumbing noise).
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

// Decide, for one assistant message's parts, which test-runner tool-calls become cards and which
// raw tool blocks to hide. Results live in history as the run's tool-call/result.
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

// The aidx chat agent — an assistant-modal (bottom-right FAB → corner popover) rendered
// in the widget Shadow DOM. Streaming is fully TanStack-native: useChat consumes the dev
// server's AG-UI SSE via fetchServerSentEvents. On first open it hydrates the thread from
// the resumed session's transcript (the agent's session, or the chat's own).
//
// Rendering follows the TanStack AI part model: `text` / `thinking` parts, plus the tool
// lifecycle — `tool-call` parts carry a `state` and a sibling `tool-result` part carries the
// output. We render each state distinctly so the user sees the agent think, call tools, and
// (for risky ops) ask for approval. Visual tokens live in styles.css (.pw-chat-*).

const STARTERS = ['Explain this page', 'Change the primary color', "Why doesn't this layout fit?"]

// Human label + glyph for each tool-call lifecycle state. A running state shows the animated
// spinner glyph; terminal states show a static mark. `active` = the turn is still generating
// — once it ends, a tool-call that never received a result chunk would otherwise spin
// forever, so we render it as done.
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
  return <span className={`pw-chat-tool-glyph pw-chat-glyph-${props.kind}`} aria-hidden="true" />
}

function ToolCall(props: {part: ToolCallPart; active: boolean}): JSX.Element {
  const status = toolCallStatus(props.part.state, props.active)
  const args = prettyArgs(props.part)
  return (
    <div className={`pw-chat-tool pw-chat-tool-${props.part.state}`}>
      <div className="pw-chat-tool-head">
        <ToolGlyph kind={status.glyph} />
        <span className="pw-chat-tool-name">{props.part.name}</span>
        <span className="pw-chat-tool-state">{status.label}</span>
      </div>
      {args ? (
        <details className="pw-chat-tool-args">
          <summary>arguments</summary>
          <pre>{args}</pre>
        </details>
      ) : null}
    </div>
  )
}

function ToolResult(props: {part: ToolResultPart}): JSX.Element {
  if (props.part.state === 'error') {
    return (
      <div className="pw-chat-tool-error">
        <span className="pw-chat-tool-glyph pw-chat-glyph-error" aria-hidden="true" />
        {props.part.error ?? asText(props.part.content)}
      </div>
    )
  }
  return (
    <details className="pw-chat-tool-result">
      <summary>result</summary>
      <pre>{asText(props.part.content)}</pre>
    </details>
  )
}

function thinkingClass(live: boolean): string {
  if (live) return 'pw-chat-thinking pw-chat-thinking-live'
  return 'pw-chat-thinking'
}

function TextPartView(props: {content: string; showCaret: boolean}): JSX.Element {
  return (
    <div className="pw-chat-text">
      <Markdown text={props.content} />
      {props.showCaret ? <span className="pw-chat-caret" aria-hidden="true" /> : null}
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
  const {part, parts, index, tests} = props
  const lastTextIndex = parts.map((p) => p.type).lastIndexOf('text')
  const isRunCard = part.type === 'tool-call' && part.id !== undefined && tests.runResult.has(part.id)

  if (part.type === 'tool-call' && part.id !== undefined && tests.runResult.has(part.id)) {
    return <TestCard apiBase={props.apiBase} onFix={props.onFix} result={tests.runResult.get(part.id) ?? null} />
  }
  if (part.type === 'text') {
    return <TextPartView content={part.content} showCaret={props.streaming && index === lastTextIndex} />
  }
  if (part.type === 'thinking' && part.content.trim().length > 0) {
    const live = props.streaming && index === parts.length - 1
    return (
      <details className={thinkingClass(live)}>
        <summary>Thinking</summary>
        <span>{part.content}</span>
      </details>
    )
  }
  if (part.type === 'tool-call' && !isRunCard && !tests.hiddenCallIds.has(part.id)) {
    return <ToolCall part={part} active={props.streaming} />
  }
  if (part.type === 'tool-result' && !tests.hiddenResultIds.has(part.toolCallId)) {
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
  // Which tool-calls are test-runner runs (→ card) and which test tool blocks to hide.
  const tests = useMemo(() => analyzeTests(props.parts), [props.parts])
  return (
    <>
      {props.parts.map((part, index) => (
        <PartView
          key={index}
          part={part}
          index={index}
          parts={props.parts}
          streaming={props.streaming}
          apiBase={props.apiBase}
          tests={tests}
          onFix={props.onFix}
        />
      ))}
    </>
  )
}

// A geometrically-centered chevron — the ⌄ glyph's font metrics sit it high in the box,
// which flex-centering can't correct. Sized in em so it tracks each button's font-size.
function ChevronDown(): JSX.Element {
  return (
    <svg className="pw-chevron" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 9l7 7 7-7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function SendArrow(): JSX.Element {
  return (
    <svg className="pw-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M5 12h14M13 5l7 7-7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

// A rounded stop square — matches the SVG icon language (the send arrow), replacing the raw
// ■ glyph whose font metrics sat it off-center.
function StopIcon(): JSX.Element {
  return (
    <svg className="pw-icon" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
    </svg>
  )
}

// Focusable controls inside the open dialog, in DOM order — used to wrap Tab so keyboard
// focus can't escape the chat panel while it's open.
function focusablesIn(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>('button, textarea, input, select, a[href], [tabindex]:not([tabindex="-1"])'),
  ).filter((el) => !el.hasAttribute('disabled'))
}

function ThinkingBubble(): JSX.Element {
  return (
    <div className="pw-chat-msg pw-chat-msg-assistant pw-chat-typing">
      <span className="pw-chat-dot" />
      <span className="pw-chat-dot" />
      <span className="pw-chat-dot" />
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
  const api = useMemo(() => createChatApi({apiBase: props.apiBase}), [props.apiBase])
  const [genUi, setGenUi] = useState<UiSpec[]>([])
  // The agent's `aidx ui …` calls arrive as AG-UI CUSTOM events (`aidx-ui`). Render
  // each as a live component in the thread; the user's answer is sent as their next message.
  const onAidxUi = (eventType: string, data: unknown) => {
    if (eventType !== AIDX_UI_EVENT) return
    const parsed = UiSpecSchema.safeParse(data)
    if (!parsed.success) return
    const spec = parsed.data
    setGenUi((prev) => {
      const existing = prev.find((g) => g.renderId === spec.renderId)
      // The vitest card is persistent and self-updating; a duplicate inject for an existing
      // card must NOT replace it (it keys by renderId — swapping resets its EventSource and
      // accumulated tree). Keep the array untouched in that case; other kinds replace.
      if (existing && spec.kind === 'vitest') return prev
      return [...prev.filter((g) => g.renderId !== spec.renderId), spec]
    })
  }
  const chat = useChat({
    ...createChatClientOptions({connection: fetchServerSentEvents(api.chatUrl)}),
    onCustomEvent: onAidxUi,
  })
  const [open, setOpen] = useState(false)
  const [closing, setClosing] = useState(false)
  const [input, setInput] = useState('')
  const hydrateState = useRef({done: false})
  const stickToBottom = useRef(true)
  const fabEl = useRef<HTMLButtonElement>(null)
  const panelEl = useRef<HTMLElement>(null)
  const inputEl = useRef<HTMLTextAreaElement>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const messages = chat.messages
  const isThinking = chat.status === 'submitted'
  const isStreaming = chat.status === 'streaming'
  const lastIndex = messages.length - 1
  const isActiveAssistant = (index: number, role: string) => isStreaming && role === 'assistant' && index === lastIndex
  // Halo the FAB while the agent is working in the background (panel closed), so the user
  // notices a reply is coming without the panel open. Derived — no stored "unseen" flag.
  const fabPulsing = !open && (isThinking || isStreaming)

  // Send a generated component's answer as the next chat turn, and drop the component.
  const answerGenUi = (renderId: string, text: string) => {
    setGenUi((prev) => prev.filter((g) => g.renderId !== renderId))
    void chat.sendMessage(text)
  }

  // Answer the risky-Bash gate's confirm: a blocking allow/deny that unblocks the agent's
  // tool call (no new chat turn), then drop the card.
  const decideGate = (renderId: string, approved: boolean) => {
    setGenUi((prev) => prev.filter((g) => g.renderId !== renderId))
    void api.permissionDecision(renderId, approved)
  }

  // Auto-scroll to the bottom as the agent streams — but only while the user is already at
  // the bottom. A MutationObserver catches every token append; scrolling up "detaches" until
  // the user returns to the bottom. Ref callback attaches on mount, cleans up on unmount —
  // genuine external sync (DOM observation), a legitimate non-render side effect.
  const logRef = (el: HTMLDivElement | null) => {
    if (!el) return
    const atBottom = () => el.scrollHeight - el.scrollTop - el.clientHeight < 40
    el.addEventListener('scroll', () => {
      stickToBottom.current = atBottom()
    })
    const observer = new MutationObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(el, {childList: true, subtree: true, characterData: true})
  }

  const hydrate = async () => {
    if (hydrateState.current.done) return
    hydrateState.current.done = true
    try {
      const session = await api.session()
      if (!session.sessionId) return
      const prior = await api.history(session.sessionId)
      // The vitest results card is rendered from the run's tool-call/result in the restored
      // transcript (see MessageParts), so it comes back automatically on reload.
      if (prior.length > 0) chat.setMessages(prior)
    } catch {
      // No transcript / not resumable → start from the greeting.
    }
  }

  // Open/close with an exit animation: closing keeps the panel mounted with .pw-chat-closing
  // for the animation duration, then unmounts (the timer no-ops if the user reopened).
  const openPanel = () => {
    setClosing(false)
    if (open) return
    setOpen(true)
    void hydrate()
    // Focus the composer once it's laid out (next frame beats the FAB's own click-focus).
    requestAnimationFrame(() => inputEl.current?.focus())
  }
  const closePanel = () => {
    if (!open || closing) return
    setClosing(true)
    // Return focus to the FAB so keyboard/SR users land back on the trigger, not <body>.
    fabEl.current?.focus()
    closeTimer.current = setTimeout(() => {
      setOpen(false)
      setClosing(false)
    }, 170)
  }
  const toggle = () => {
    if (open && !closing) {
      closePanel()
      return
    }
    openPanel()
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const text = input.trim()
    if (!text || chat.isLoading) return
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

  // Trap Tab within the open dialog and close on Escape from anywhere in the panel (the
  // composer's own handler only covers focus while it's in the textarea).
  const onPanelKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closePanel()
      return
    }
    if (e.key !== 'Tab' || !panelEl.current) return
    const items = focusablesIn(panelEl.current)
    if (items.length === 0) return
    const first = items[0]
    const last = items[items.length - 1]
    const root = panelEl.current.getRootNode()
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

  const showPanel = open || closing

  return (
    <>
      {showPanel ? (
        <section
          ref={panelEl}
          className={panelClass(closing)}
          role="dialog"
          aria-modal="true"
          aria-label="aidx chat agent"
          id="pw-chat-panel"
          onKeyDown={onPanelKeyDown}
        >
          <header className="pw-chat-head">
            <span className="pw-chat-title">aidx</span>
            <button className="pw-chat-close" aria-label="Close chat" onClick={closePanel}>
              <ChevronDown />
            </button>
          </header>
          <div className="pw-chat-log" role="log" aria-live="polite" ref={logRef}>
            {messages.length > 0 ? (
              messages.map((m, index) => (
                <div key={m.id ?? index} className={`pw-chat-msg pw-chat-msg-${m.role}`}>
                  <MessageParts
                    parts={m.parts}
                    streaming={isActiveAssistant(index, m.role)}
                    apiBase={props.apiBase}
                    onFix={(text) => void chat.sendMessage(text)}
                  />
                </div>
              ))
            ) : (
              <div className="pw-chat-empty">
                <p className="pw-chat-greeting">How can I help you today?</p>
                <div className="pw-chat-chips">
                  {STARTERS.map((s) => (
                    <button key={s} className="pw-chat-chip" onClick={() => void chat.sendMessage(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {genUi.map((spec) => (
              <GenUi
                key={spec.renderId}
                spec={spec}
                onAnswer={(text) => answerGenUi(spec.renderId, text)}
                onDecide={(approved) => decideGate(spec.renderId, approved)}
              />
            ))}
            {isThinking ? <ThinkingBubble /> : null}
            {chat.error ? (
              <div className="pw-chat-error" role="alert">
                <span className="pw-chat-error-msg">{chat.error.message}</span>
                <button className="pw-chat-retry" onClick={() => void chat.reload()}>
                  Retry
                </button>
              </div>
            ) : null}
          </div>
          <form className="pw-chat-composer" onSubmit={submit}>
            <textarea
              className="pw-chat-input"
              rows={1}
              placeholder="Ask a question…"
              aria-label="Message the aidx agent"
              value={input}
              onChange={(e) => setInput(e.currentTarget.value)}
              onKeyDown={onKeyDown}
              ref={inputEl}
            />
            {chat.isLoading ? (
              <button type="button" className="pw-chat-send pw-chat-stop" aria-label="Stop" onClick={() => chat.stop()}>
                <StopIcon />
              </button>
            ) : (
              <button type="submit" className="pw-chat-send" aria-label="Send" disabled={!input.trim()}>
                <SendArrow />
              </button>
            )}
          </form>
        </section>
      ) : null}
      <button
        ref={fabEl}
        className={fabClass(fabPulsing)}
        aria-label="Open aidx chat"
        aria-expanded={open}
        aria-controls="pw-chat-panel"
        onClick={toggle}
      >
        {open ? (
          <span className="pw-fab-icon">
            <ChevronDown />
          </span>
        ) : (
          <span className="pw-fab-icon" aria-hidden="true">
            ✦
          </span>
        )}
      </button>
    </>
  )
}
