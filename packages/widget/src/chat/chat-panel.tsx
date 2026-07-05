import {
  createMemo,
  createEffect,
  createRoot,
  createSignal,
  For,
  getOwner,
  onCleanup,
  onMount,
  runWithOwner,
  Show,
  type JSX,
} from 'solid-js'
import {Progress} from '@conciv/ui-kit-system'
import {useChat, createChatClientOptions} from '@tanstack/ai-solid'
import type {MessagePart, ToolCallPart, ToolResultPart, UIMessage} from '@tanstack/ai-client'
import {attachConnection} from '../client/attach-connection.js'
import {
  ChatProvider,
  ToolProvider,
  ComposerHandlersProvider,
  ComposerPrimitive,
  Thread,
  Composer,
  NowLine,
  pairResults,
  useComposer,
  type Turn,
} from '@conciv/ui-kit-chat'
import {TriggerMenus} from './trigger-menus.js'
import {nowTitle} from '@conciv/ui-kit-chat-tools'
import {apiError, type SessionClient} from '@conciv/api-client'
import {invalidateSessions} from '../client/session-store-client.js'
import {createDebouncer} from '@tanstack/solid-pacer'
import {GenUi} from './gen-ui.js'
import {ToolFallbackCard} from './tool-fallback-card.js'
import type {PendingApproval} from '../shell/approval-modal.js'
import {SquarePen, FoldVertical} from 'lucide-solid'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {
  CONCIV_UI_EVENT,
  CONCIV_SNAPSHOT_EVENT,
  SnapshotSchema,
  UiSpecSchema,
  type UiSpec,
} from '@conciv/protocol/ui-types'
import {CONCIV_TOOL_DURATION_EVENT, ToolDurationSchema} from '@conciv/protocol/tool-timing'
import {
  CONCIV_USAGE_EVENT,
  UsageSnapshotSchema,
  tokenUsageToSnapshot,
  type UsageSnapshot,
} from '@conciv/protocol/usage-types'
import type {ToolViewCtx, ToolCardEntry} from '@conciv/protocol/tool-view-types'
import type {ComposerActionDef, ComposerControlDef, PanelDef} from '../shell/shell-contract.js'
import {GrabReference} from '../page/react-grab/grab-reference.js'
import type {Grab, GrabApi} from '@conciv/grab'
import {ExtensionSurface, type ExtensionHostBag, type ExtensionInstance} from '../extension/extension-slots.js'
import {EmptyStateSlot} from '../shell/empty-state.js'
import {grabApi} from '../page/grab-api.js'
import {readPaneSnapshot, writePaneSnapshot, clearPaneSnapshot, type PaneSnapshot} from '../lib/ui-snapshot.js'

const GRAB_PREVIEW_MAX_W = 280

const ACT =
  'size-8.5 rounded-pw-pill [border:none] bg-transparent text-pw-text-2 cursor-pointer shrink-0 inline-flex items-center justify-center trans-color-bg hover:text-pw-text-hi hover:bg-pw-fill-strong'
const ERROR = 'flex gap-2 items-center text-pw-danger text-[0.75rem]'
const RECONNECT = 'flex gap-2 items-center text-pw-text-2 text-[0.75rem] anim-msg'
const RETRY =
  'py-1.5 px-2.5 min-h-8 rounded-[0.4375rem] border border-pw-danger-line bg-transparent text-pw-danger cursor-pointer font-semibold text-[0.75rem] leading-none font-pw shrink-0 trans-bg hover:bg-pw-danger-14'
const DIVIDER =
  "self-stretch flex items-center gap-2.5 my-1.5 mx-0.5 anim-msg before:content-[''] before:flex-1 before:h-px before:bg-pw-line-soft after:content-[''] after:flex-1 after:h-px after:bg-pw-line-soft"
const DIVIDER_LABEL =
  'inline-flex items-center gap-1.25 text-[0.6875rem] font-medium tracking-[0.06em] [text-transform:uppercase]'
const DOT = 'w-1.5 h-1.5 rounded-[50%] bg-pw-text-2'

function callSettled(part: ToolCallPart, result: ToolResultPart | undefined): boolean {
  return result?.state === 'complete' || result?.state === 'error' || part.output !== undefined
}

function activeCallTitle(parts: ReadonlyArray<MessagePart>, titleByName: Record<string, string>): string | null {
  const {byCallId} = pairResults(parts)
  let title: string | null = null
  for (const part of parts) {
    if (part.type !== 'tool-call' || !part.id) continue
    title = callSettled(part, byCallId.get(part.id)) ? title : nowTitle(part, titleByName)
  }
  return title
}

function asToolCallPart(part: MessagePart | undefined): ToolCallPart | null {
  return part?.type === 'tool-call' ? part : null
}

function Divider(props: {kind: 'new' | 'compact'; pending?: boolean}): JSX.Element {
  const Icon = props.kind === 'new' ? SquarePen : FoldVertical
  const label = () => (props.kind === 'new' ? 'New session' : props.pending ? 'Compacting…' : 'Context compacted')
  return (
    <div
      class={DIVIDER}
      classList={{'text-pw-accent-link': props.pending, 'text-pw-text-3': !props.pending}}
      role="separator"
      aria-label={label()}
    >
      <span class={DIVIDER_LABEL}>
        <Icon class={`size-3 ${props.pending ? '[transform-origin:center] anim-compact' : ''}`} aria-hidden="true" />
        {label()}
      </span>
    </div>
  )
}

function CompactSpinner(): JSX.Element {
  return (
    <div
      class="inline-flex shrink-0 size-8.5 items-center justify-center"
      role="status"
      aria-label="Compacting context…"
    >
      <Progress.Root value={25} class="block [--size:1.375rem] [--thickness:0.15625rem]" aria-hidden="true">
        <Progress.Circle class="[transform-origin:center] anim-compact">
          <Progress.CircleTrack class="stroke-pw-line-2" />
          <Progress.CircleRange class="[stroke-linecap:round] stroke-pw-accent" />
        </Progress.Circle>
      </Progress.Root>
    </div>
  )
}

function ThinkingBubble(): JSX.Element {
  return (
    <div class="p-2.75 rounded-pw-md bg-pw-fill inline-flex gap-1 items-center self-start anim-msg" aria-hidden="true">
      <span class={`${DOT} anim-dot1`} />
      <span class={`${DOT} anim-dot2`} />
      <span class={`${DOT} anim-dot3`} />
    </div>
  )
}

type ComposerStateApi = {
  append: (text: string) => void
  text: () => string
  setText: (value: string) => void
}

function ComposerStateBridge(props: {onReady: (api: ComposerStateApi) => void}): JSX.Element {
  const composer = useComposer()
  const api: ComposerStateApi = {
    append: (text) => composer.setText(composer.text() ? `${composer.text()}\n${text}` : text),
    text: composer.text,
    setText: composer.setText,
  }
  onMount(() => props.onReady(api))
  return <></>
}

export function ChatPanel(props: {
  apiBase: string
  harnessId: string
  client: SessionClient
  active?: boolean
  onActiveSession?: (id: string) => void
  announce?: (msg: string, assertive?: boolean) => void
  onWorkingChange?: (working: boolean) => void

  tools?: () => ToolCardEntry[]
  composerActions?: () => ComposerActionDef[]
  composerControls?: () => ComposerControlDef[]
  onUsageChange?: (usage: UsageSnapshot | null) => void
  onApprovalsChange?: (approvals: PendingApproval[]) => void
  onSessionLabel?: (name: string | null) => void
  onNewSession?: () => void | Promise<void>
  instances: ExtensionInstance[]
}): JSX.Element {
  const client = props.client
  const [genUi, setGenUi] = createSignal<UiSpec[]>([])
  const [usage, setUsage] = createSignal<UsageSnapshot | null>(null)
  const [durations, setDurations] = createSignal<Record<string, number>>({})

  const onConcivUi = (eventType: string, data: unknown) => {
    if (eventType === CONCIV_USAGE_EVENT) {
      const parsed = UsageSnapshotSchema.safeParse(data)
      if (parsed.success) setUsage((prev) => ({...prev, ...parsed.data}))
      return
    }
    if (eventType === CONCIV_TOOL_DURATION_EVENT) {
      const parsed = ToolDurationSchema.safeParse(data)
      if (parsed.success) setDurations((prev) => ({...prev, [parsed.data.toolCallId]: parsed.data.durationMs}))
      return
    }
    if (eventType !== CONCIV_UI_EVENT) return
    const parsed = UiSpecSchema.safeParse(data)
    if (!parsed.success) return
    const spec = parsed.data
    setGenUi((prev) => {
      const existing = prev.find((g) => g.renderId === spec.renderId)
      if (existing && spec.kind === 'vitest') return prev
      return [...prev.filter((g) => g.renderId !== spec.renderId), spec]
    })
  }

  const onChunk = (chunk: StreamChunk) => {
    if (chunk.type === EventType.RUN_FINISHED && chunk.usage) setUsage(tokenUsageToSnapshot(chunk.usage))
  }

  const [requestMeta, setRequestMeta] = createSignal<Record<string, unknown>>({})
  const mergeRequestMeta = (patch: Record<string, unknown>) => setRequestMeta((prev) => ({...prev, ...patch}))
  const owner = getOwner()
  const [disconnected, setDisconnected] = createSignal(false)
  const connection = attachConnection(client, {
    requestMeta: () => requestMeta(),
    onConnectionChange: (connected) => setDisconnected(!connected),
  })
  const chatRef = {current: null as ReturnType<typeof useChat> | null}
  const onSnapshot = (data: unknown) => {
    const parsed = SnapshotSchema.safeParse(data)
    if (!parsed.success) return
    const api = chatRef.current
    if (!api) return
    api.setMessages(parsed.data.messages as UIMessage[])
    if (!parsed.data.generating && (api.isLoading() || api.sessionGenerating())) api.stop()
  }
  const chat = useChat({
    ...createChatClientOptions({connection}),
    get live() {
      return props.active !== false
    },
    onCustomEvent: (eventType, data) => {
      if (eventType === CONCIV_SNAPSHOT_EVENT) return onSnapshot(data)
      onConcivUi(eventType, data)
    },
    onChunk,
  })
  chatRef.current = chat

  const lastSession = {id: null as string | null}
  createEffect(() => {
    const id = client.sessionId()
    if (!id) return
    if (lastSession.id === null || lastSession.id === id) {
      lastSession.id = id
      return
    }
    lastSession.id = id
    connection.bump()
  })

  const [grabs, setGrabs] = createSignal<(Grab | {text: string})[]>([])
  let inputEl: HTMLTextAreaElement | undefined
  let viewportEl: HTMLElement | undefined
  const composerApi = {current: null as ComposerStateApi | null}

  const isThinking = () => chat.status() === 'submitted'
  const isStreaming = () => chat.status() === 'streaming'

  const [answered, setAnswered] = createSignal<readonly string[]>([])

  const toolCtx: ToolViewCtx = {
    apiBase: props.apiBase,
    harnessId: props.harnessId,
    sendMessage: (text) => void chat.sendMessage(text),
    respondApproval: (approvalId, approved) => {
      setAnswered((prev) => (prev.includes(approvalId) ? prev : [...prev, approvalId]))
      void client.permissionDecision({approvalId, approved}).catch(() => {})
    },
    durationFor: (toolCallId) => durations()[toolCallId],
  }

  const pendingApprovals = createMemo<PendingApproval[]>(() =>
    chat
      .messages()
      .flatMap((m) => m.parts)
      .map(asToolCallPart)
      .filter((p): p is ToolCallPart => !!p && p.state === 'approval-requested' && !!p.approval)
      .filter((p) => p.approval !== undefined && !answered().includes(p.approval.id))
      .map((p) => ({id: p.approval?.id ?? '', part: p, ctx: toolCtx, label: nowTitle(p)})),
  )
  createEffect(() => props.onApprovalsChange?.(pendingApprovals()))
  onCleanup(() => props.onApprovalsChange?.([]))

  const streamTitles = (): Record<string, string> =>
    Object.fromEntries(
      (props.tools?.() ?? []).flatMap((entry) =>
        entry.streamTitle ? entry.names.map((name) => [name, entry.streamTitle ?? '']) : [],
      ),
    )
  const nowTitleText = (): string | null => {
    if (!isStreaming()) return null
    const messages = chat.messages()
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant') return null
    return activeCallTitle(last.parts, streamTitles())
  }

  createEffect(() => props.onWorkingChange?.(isThinking() || isStreaming()))
  createEffect(() => props.onUsageChange?.(usage()))

  const invalidate = createDebouncer(() => void invalidateSessions(props.apiBase), {wait: 400})
  let wasWorking = false
  createEffect(() => {
    const working = isThinking() || isStreaming()
    if (wasWorking && !working) {
      void client.session().then((s) => props.onSessionLabel?.(s.name))
      invalidate.maybeExecute()
    }
    wasWorking = working
  })

  const [liveMsg, setLiveMsg] = createSignal('')
  let prevStatus = ''
  createEffect(() => {
    const status = chat.status()
    if (status === 'submitted') setLiveMsg('conciv is thinking…')
    else if (prevStatus === 'streaming' && status !== 'streaming') setLiveMsg('conciv replied.')
    prevStatus = status
  })

  createEffect(() => {
    if (disconnected()) props.announce?.('Reconnecting to conciv…')
  })

  const visibleError = () => {
    const err = chat.error()
    return err && err.message !== 'stopped' ? err : undefined
  }

  const answerGenUi = (renderId: string, text: string) => {
    setGenUi((prev) => prev.filter((g) => g.renderId !== renderId))
    void chat.sendMessage(text)
  }

  const focusInput = () => requestAnimationFrame(() => inputEl?.focus())

  createEffect(() => {
    const id = client.sessionId()
    if (!props.active || !id) return
    props.onActiveSession?.(id)
    focusInput()
    void client
      .session()
      .then((session) => {
        props.onSessionLabel?.(session.name)
        setUsage((prev) => session.usage ?? prev)
      })
      .catch(() => {})
  })

  const onSend = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || chat.isLoading() || compacting()) return
    const context = grabs()
      .map((g) => g.text)
      .join('\n')
    setGrabs([])
    void chat.sendMessage(context ? `${context}\n\n${trimmed}` : trimmed)
    clearPaneSnapshot(paneSessionId())
  }

  const insert = (text: string) => {
    composerApi.current?.append(text)
    focusInput()
  }
  const stageGrab = (grab: Grab) => {
    setGrabs((prev) => [...prev, grab])
    focusInput()
  }
  const removeGrab = (grab: Grab | {text: string}) => setGrabs((prev) => prev.filter((x) => x !== grab))

  const dividerSeq = {n: 0}
  const [dividers, setDividers] = createSignal<{id: number; afterCount: number; kind: 'new' | 'compact'}[]>([])
  const addDivider = (kind: 'new' | 'compact'): number => {
    const id = (dividerSeq.n += 1)
    setDividers((prev) => [...prev, {id, afterCount: chat.messages().length, kind}])
    return id
  }
  const removeDivider = (id: number) => setDividers((prev) => prev.filter((d) => d.id !== id))
  const dividersAt = (count: number) => dividers().filter((d) => d.afterCount === count)
  const dividersInRange = (start: number, end: number) =>
    dividers().filter((d) => d.afterCount >= start && d.afterCount <= end)
  const resetUsage = () => setUsage(null)

  const paneSessionId = () => client.sessionId() ?? ''
  const isInputFocused = (): boolean => {
    if (!inputEl) return false
    const root = inputEl.getRootNode()
    if (root instanceof ShadowRoot) return root.activeElement === inputEl
    return document.activeElement === inputEl
  }
  const snapshotPane = (): PaneSnapshot => {
    const draft = composerApi.current?.text() ?? ''
    return {
      draft,
      selectionStart: inputEl?.selectionStart ?? draft.length,
      selectionEnd: inputEl?.selectionEnd ?? draft.length,
      focused: isInputFocused(),
      grabTexts: grabs().map((grab) => grab.text),
      dividers: dividers(),
      scrollTop: viewportEl?.scrollTop ?? null,
    }
  }
  const writeSnapshot = () => {
    const id = client.sessionId()
    if (!id) return
    writePaneSnapshot(id, snapshotPane())
  }
  const persist = createDebouncer(writeSnapshot, {wait: 150})

  const restored = new Set<string>()
  const restorePane = (api: ComposerStateApi, sessionId: string) => {
    const snapshot = readPaneSnapshot(sessionId)
    if (!snapshot) {
      api.setText('')
      setGrabs([])
      return
    }
    api.setText(snapshot.draft)
    setGrabs(snapshot.grabTexts.map((text) => ({text})))
    setDividers(snapshot.dividers)
    dividerSeq.n = Math.max(0, ...snapshot.dividers.map((divider) => divider.id))
    requestAnimationFrame(() => {
      if (snapshot.scrollTop !== null && viewportEl) viewportEl.scrollTop = snapshot.scrollTop
      if (!inputEl) return
      inputEl.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd)
      if (snapshot.focused) inputEl.focus()
    })
  }
  const maybeRestore = () => {
    const api = composerApi.current
    const sessionId = client.sessionId()
    if (!api || !sessionId) return
    if (restored.has(sessionId)) return
    restored.add(sessionId)
    restorePane(api, sessionId)
  }
  createEffect(() => {
    grabs()
    dividers()
    persist.maybeExecute()
  })
  createEffect(() => {
    client.sessionId()
    maybeRestore()
  })
  onMount(() => {
    const schedule = () => persist.maybeExecute()
    const inputEvents: string[] = ['input', 'select', 'keyup', 'click', 'focus', 'blur']
    const target = inputEl
    const viewport = viewportEl
    if (target) for (const event of inputEvents) target.addEventListener(event, schedule)
    if (viewport) viewport.addEventListener('scroll', schedule)
    const onPageHide = () => writeSnapshot()
    window.addEventListener('pagehide', onPageHide)
    onCleanup(() => {
      if (target) for (const event of inputEvents) target.removeEventListener(event, schedule)
      if (viewport) viewport.removeEventListener('scroll', schedule)
      window.removeEventListener('pagehide', onPageHide)
    })
  })

  const startNewSession = async () => {
    addDivider('new')
    const {sessionId} = await client.resolve()
    persist.flush()
    client.setSessionId(sessionId)
  }
  const doNewSession = () => (props.onNewSession ? props.onNewSession() : startNewSession())

  const [pendingCompactId, setPendingCompactId] = createSignal<number | null>(null)
  const compacting = () => pendingCompactId() !== null
  const waitForIdle = () =>
    new Promise<void>((resolve) =>
      runWithOwner(owner, () =>
        createRoot((dispose) =>
          createEffect(() => {
            if (chat.sessionGenerating() || chat.isLoading()) return
            dispose()
            resolve()
          }),
        ),
      ),
    )
  const waitForGenerating = () =>
    new Promise<void>((resolve) => {
      const teardown = {dispose: () => {}}
      const finish = () => {
        clearTimeout(timer)
        teardown.dispose()
        resolve()
      }
      const timer = setTimeout(finish, 3000)
      runWithOwner(owner, () =>
        createRoot((dispose) => {
          teardown.dispose = dispose
          createEffect(() => {
            if (chat.sessionGenerating()) finish()
          })
        }),
      )
    })
  const compact = async () => {
    if (chat.isLoading() || compacting()) return
    const id = addDivider('compact')
    setPendingCompactId(id)
    try {
      const response = await fetch(client.chatStreamUrl(), {
        method: 'POST',
        credentials: 'include',
        headers: {'content-type': 'application/json', ...client.chatHeaders()},
        body: JSON.stringify({
          messages: [{role: 'user', content: '/compact'}],
          forwardedProps: {...requestMeta(), intent: 'compact'},
        }),
      })
      if (!response.ok) throw apiError('/api/chat', response.status)
      await waitForGenerating()
      await waitForIdle()
      const session = await client.session()
      if (session.usage) setUsage(session.usage)
    } catch {
      removeDivider(id)
      setLiveMsg('Compaction failed — the session may be busy. Try again in a moment.')
    } finally {
      setPendingCompactId(null)
    }
  }

  const [notice, setNotice] = createSignal('')
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  const notify = (message: string) => {
    setNotice(message)
    setLiveMsg(message)
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => setNotice(''), 5000)
  }

  const [busyAction, setBusyAction] = createSignal<string | null>(null)
  const runAction = (action: ComposerActionDef) => {
    void Promise.resolve(
      action.onClick({
        insert,
        stageGrab,
        setBusy: (busy) => setBusyAction(busy ? action.id : null),
        apiBase: props.apiBase,
        client,
        addDivider,
        newSession: doNewSession,
        resetUsage,
        compact,
        notify,
        requestMeta,
      }),
    )
  }

  const grab: GrabApi = {...grabApi, stage: stageGrab}
  const hostBag: ExtensionHostBag = {
    ...toolCtx,
    insert,
    notify,
    setBusy: (busy) => setBusyAction(busy ? `extension:${props.harnessId}` : null),
    newSession: () => void doNewSession(),
    addDivider: (kind) => void addDivider(kind),
    compact: () => void compact(),
    resetUsage,
    client,
    requestMeta,
    grab,
  }

  const renderDivider = (divider: {id: number; kind: 'new' | 'compact'}): JSX.Element => (
    <Divider kind={divider.kind} pending={divider.id === pendingCompactId()} />
  )

  const renderTurnPrefix = (turn: Turn): JSX.Element => (
    <For each={dividersInRange(turn.start, turn.end)}>{renderDivider}</For>
  )

  return (
    <ChatProvider chat={chat}>
      <ToolProvider value={toolCtx}>
        <ComposerHandlersProvider
          value={{
            onSend,
            onCancel: () => {
              chat.stop()
              void client.stop().catch(() => {})
            },
          }}
        >
          <ComposerPrimitive.TriggerPopoverRoot>
            <ExtensionSurface name="header" instances={props.instances} bag={hostBag} />
            <ExtensionSurface name="widget" instances={props.instances} bag={hostBag} />
            <div class="flex flex-1 flex-col min-h-0">
              <Thread
                tools={props.tools?.()}
                components={{ToolFallback: ToolFallbackCard}}
                turnPrefix={renderTurnPrefix}
                viewportRef={(el) => {
                  viewportEl = el
                }}
                viewportFooter={
                  <>
                    <For each={dividersAt(chat.messages().length)}>{renderDivider}</For>
                    <For each={genUi()}>
                      {(spec) => <GenUi spec={spec} onAnswer={(text) => answerGenUi(spec.renderId, text)} />}
                    </For>
                    <Show when={isThinking()}>
                      <ThinkingBubble />
                    </Show>
                    <Show when={nowTitleText()}>
                      {(title) => <NowLine title={title()} onStop={() => chat.stop()} />}
                    </Show>
                    <Show when={visibleError()}>
                      {(error) => (
                        <div class={ERROR} role="alert">
                          <span class="flex-1">{error().message}</span>
                          <button type="button" class={RETRY} onClick={() => void chat.reload()}>
                            Retry
                          </button>
                        </div>
                      )}
                    </Show>
                  </>
                }
                welcome={
                  <EmptyStateSlot
                    onStarter={(starter) => void chat.sendMessage(starter)}
                    instances={props.instances}
                    bag={hostBag}
                  />
                }
                composer={
                  <>
                    <ExtensionSurface name="status" instances={props.instances} bag={hostBag} />
                    <ExtensionSurface name="footer" instances={props.instances} bag={hostBag} />
                    <Show when={disconnected()}>
                      <div class={RECONNECT} aria-hidden="true">
                        <span class={`${DOT} anim-dot1`} />
                        <span class="flex-1">Reconnecting…</span>
                      </div>
                    </Show>
                    <Show when={notice()}>
                      <div class="text-[0.75rem] text-pw-text-2 leading-[1.4] font-medium font-pw px-2.5 py-2 border border-pw-line rounded-pw-md bg-pw-fill [word-break:break-word]">
                        {notice()}
                      </div>
                    </Show>
                    <For each={grabs()}>
                      {(g) => <GrabReference grab={g} maxWidth={GRAB_PREVIEW_MAX_W} onRemove={() => removeGrab(g)} />}
                    </For>
                    <Composer
                      placeholder="Ask a question…"
                      inputLabel="Message the conciv agent"
                      inputRef={(el) => {
                        inputEl = el
                      }}
                      busy={compacting() ? <CompactSpinner /> : undefined}
                      popover={
                        <TriggerMenus
                          client={client}
                          active={() => props.active ?? true}
                          turnCount={() => chat.messages().length}
                        />
                      }
                    >
                      <For each={props.composerActions?.() ?? []}>
                        {(action) => {
                          const Icon = action.icon
                          return (
                            <button
                              type="button"
                              class={ACT}
                              aria-label={action.label}
                              title={action.label}
                              classList={{
                                'opacity-60': busyAction() === action.id,
                                'cursor-progress': busyAction() === action.id,
                              }}
                              onClick={() => runAction(action)}
                            >
                              <Icon class="size-5 block" />
                            </button>
                          )
                        }}
                      </For>
                      <ExtensionSurface name="composer" instances={props.instances} bag={hostBag} />
                      <For each={props.composerControls?.() ?? []}>
                        {(control) => control.create({apiBase: props.apiBase, setRequestMeta: mergeRequestMeta})}
                      </For>
                      <ComposerStateBridge
                        onReady={(api) => {
                          composerApi.current = api
                          maybeRestore()
                        }}
                      />
                    </Composer>
                  </>
                }
              />
            </div>
            <div class="sr-only" role="status" aria-live="polite">
              {liveMsg()}
            </div>
          </ComposerPrimitive.TriggerPopoverRoot>
        </ComposerHandlersProvider>
      </ToolProvider>
    </ChatProvider>
  )
}

export function chatPanelDef(
  apiBase: string,
  harnessId: string,
  tools: () => ToolCardEntry[],
  instances: ExtensionInstance[],
  onActiveSession: (id: string) => void,
): PanelDef {
  return {
    id: 'chat',
    title: 'conciv',
    apiBase,
    create: (ctx) => (
      <ChatPanel
        apiBase={apiBase}
        harnessId={harnessId}
        client={ctx.client}
        active={ctx.active()}
        onActiveSession={onActiveSession}
        announce={ctx.announce}
        onWorkingChange={ctx.onWorkingChange}
        onUsageChange={ctx.onUsageChange}
        onApprovalsChange={ctx.onApprovalsChange}
        onSessionLabel={ctx.onSessionLabel}
        onNewSession={ctx.onNewSession}
        tools={tools}
        instances={instances}
        composerActions={ctx.composerActions}
        composerControls={ctx.composerControls}
      />
    ),
  }
}
