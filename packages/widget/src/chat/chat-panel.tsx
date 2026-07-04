import {createMemo, createEffect, createSignal, For, onCleanup, Show, type JSX} from 'solid-js'
import {Dynamic} from 'solid-js/web'
import {Progress, Tabs} from '@conciv/ui-kit-system'
import {useChat, fetchServerSentEvents, createChatClientOptions} from '@tanstack/ai-solid'
import type {MessagePart, ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
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
import {CONCIV_UI_EVENT, UiSpecSchema, type UiSpec} from '@conciv/protocol/ui-types'
import {CONCIV_TOOL_DURATION_EVENT, ToolDurationSchema} from '@conciv/protocol/tool-timing'
import {
  CONCIV_USAGE_EVENT,
  UsageSnapshotSchema,
  tokenUsageToSnapshot,
  type UsageSnapshot,
} from '@conciv/protocol/usage-types'
import type {ToolViewCtx, ToolCardEntry} from '@conciv/protocol/tool-view-types'
import type {ComposerActionDef, ComposerControlDef, PanelDef} from '../shell/widget-shell.js'
import {GrabReference} from '../page/react-grab/grab-reference.js'
import type {Grab, GrabApi} from '@conciv/grab'
import {ExtensionSurface, type ExtensionHostBag, type ExtensionInstance} from '../extension/extension-slots.js'
import {collectViews} from '../extension/extension-views.js'
import {MountedView} from '@conciv/extension/client'
import {EmptyStateSlot} from '../shell/empty-state.js'
import {grabApi} from '../page/grab-api.js'

const GRAB_PREVIEW_MAX_W = 280

const ACT =
  'size-8.5 rounded-pw-pill [border:none] bg-transparent text-pw-text-2 cursor-pointer shrink-0 inline-flex items-center justify-center trans-color-bg hover:text-pw-text-hi hover:bg-pw-fill-strong'
const ERROR = 'flex gap-2 items-center text-pw-danger text-[0.75rem]'
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

function DraftBridge(props: {onReady: (append: (text: string) => void) => void}): JSX.Element {
  const composer = useComposer()
  props.onReady((text) => composer.setText(composer.text() ? `${composer.text()}\n${text}` : text))
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
  const chat = useChat({
    ...createChatClientOptions({
      connection: fetchServerSentEvents(client.chatStreamUrl(), () => ({
        credentials: 'include',
        headers: client.chatHeaders(),
        body: requestMeta(),
      })),
    }),
    onCustomEvent: onConcivUi,
    onChunk,
  })

  const [grabs, setGrabs] = createSignal<Grab[]>([])
  const loadedSessionId = {current: null as string | null}
  const [switching, setSwitching] = createSignal(false)
  const [switchError, setSwitchError] = createSignal(false)
  let inputEl: HTMLTextAreaElement | undefined
  const appendDraft = {current: (_text: string) => {}}

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

  const answerGenUi = (renderId: string, text: string) => {
    setGenUi((prev) => prev.filter((g) => g.renderId !== renderId))
    void chat.sendMessage(text)
  }

  const loadSession = async (id: string | null) => {
    const isSwitch = loadedSessionId.current !== null
    setSwitchError(false)
    if (isSwitch) {
      chat.stop()
      setSwitching(true)
      props.announce?.('Loading session…')
    }
    try {
      const session = await client.session()
      props.onSessionLabel?.(session.name)
      setUsage(session.usage ?? null)
      if (session.harnessSessionId === null) {
        if (isSwitch) chat.setMessages([])
        loadedSessionId.current = id
        void invalidateSessions(props.apiBase)
        return
      }
      const prior = await client.history()
      if (isSwitch || prior.length > 0) chat.setMessages(prior)
      loadedSessionId.current = id
    } catch {
      if (isSwitch) {
        setSwitchError(true)
        props.announce?.('Couldn’t load that session', true)
      }
    } finally {
      setSwitching(false)
    }
  }

  const focusInput = () => requestAnimationFrame(() => inputEl?.focus())

  const views = createMemo(() => collectViews(props.instances))
  const [activeView, setActiveView] = createSignal('chat')
  const [viewLocks, setViewLocks] = createSignal<Record<string, boolean>>({})
  const setLockedFor = (id: string) => (locked: boolean) => setViewLocks((prev) => ({...prev, [id]: locked}))
  const viewLocked = () => activeView() !== 'chat' && Boolean(viewLocks()[activeView()])
  const leaveGuard = () => isThinking() || isStreaming() || viewLocked()
  const currentView = () => views().find((view) => view.id === activeView())

  const switchView = (next: string) => {
    if (next === activeView()) return
    setActiveView(next)
    const view = views().find((candidate) => candidate.id === next)
    props.announce?.(view ? view.label : 'Chat')
    if (next === 'chat') void loadSession(client.sessionId())
  }

  createEffect(() => {
    const id = client.sessionId()
    if (!props.active || !id) return
    props.onActiveSession?.(id)
    if (id === loadedSessionId.current) {
      focusInput()
      return
    }
    setActiveView('chat')
    void loadSession(id).then(focusInput)
  })

  const onSend = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || chat.isLoading() || compacting()) return
    const context = grabs()
      .map((g) => g.text)
      .join('\n')
    setGrabs([])
    void chat.sendMessage(context ? `${context}\n\n${trimmed}` : trimmed)
  }

  const insert = (text: string) => {
    appendDraft.current(text)
    focusInput()
  }
  const stageGrab = (grab: Grab) => {
    setGrabs((prev) => [...prev, grab])
    focusInput()
  }
  const removeGrab = (grab: Grab) => setGrabs((prev) => prev.filter((x) => x !== grab))

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

  const startNewSession = async () => {
    addDivider('new')
    const {sessionId} = await client.resolve()
    loadedSessionId.current = sessionId
    client.setSessionId(sessionId)
  }
  const doNewSession = () => (props.onNewSession ? props.onNewSession() : startNewSession())

  const [pendingCompactId, setPendingCompactId] = createSignal<number | null>(null)
  const compacting = () => pendingCompactId() !== null
  const compact = async () => {
    if (chat.isLoading() || compacting()) return
    const id = addDivider('compact')
    setPendingCompactId(id)
    try {
      const res = await fetch(client.chatStreamUrl(), {
        method: 'POST',
        credentials: 'include',
        headers: {'content-type': 'application/json', ...client.chatHeaders()},
        body: JSON.stringify({
          messages: [{role: 'user', content: '/compact'}],
          forwardedProps: {...requestMeta(), intent: 'compact'},
        }),
      })
      if (!res.ok) throw apiError('/api/chat', res.status)
      await res.body?.pipeTo(new WritableStream())
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
    view: {setLocked: () => {}, leave: () => {}},
  }

  const renderActiveView = (): JSX.Element => {
    const view = currentView()
    if (!view) return null
    return (
      <MountedView
        view={view}
        hostContext={{...hostBag, view: {setLocked: setLockedFor(view.id), leave: () => switchView('chat')}}}
        clientValue={view.instance.clientValue}
      />
    )
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
        <ComposerHandlersProvider value={{onSend}}>
          <ComposerPrimitive.TriggerPopoverRoot>
            <ExtensionSurface name="header" instances={props.instances} bag={hostBag} />
            <ExtensionSurface name="widget" instances={props.instances} bag={hostBag} />
            <div class="flex flex-1 flex-col min-h-0">
              <Show when={views().length > 0}>
                <Tabs.Root value={activeView()} onValueChange={(details) => switchView(details.value)} class="px-2.5">
                  <Tabs.List>
                    <Tabs.Trigger value="chat" disabled={leaveGuard()}>
                      Chat
                    </Tabs.Trigger>
                    <For each={views()}>
                      {(view) => (
                        <Tabs.Trigger value={view.id} disabled={leaveGuard()}>
                          <Show when={view.icon}>{(icon) => <Dynamic component={icon()} class="size-3.5" />}</Show>
                          {view.label}
                        </Tabs.Trigger>
                      )}
                    </For>
                    <Tabs.Indicator />
                  </Tabs.List>
                </Tabs.Root>
              </Show>
              <Show when={!currentView()} fallback={renderActiveView()}>
                <Thread
                  tools={props.tools?.()}
                  components={{ToolFallback: ToolFallbackCard}}
                  turnPrefix={renderTurnPrefix}
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
                      <Show when={chat.error()}>
                        {(error) => (
                          <div class={ERROR} role="alert">
                            <span class="flex-1">{error().message}</span>
                            <button type="button" class={RETRY} onClick={() => void chat.reload()}>
                              Retry
                            </button>
                          </div>
                        )}
                      </Show>
                      <Show when={switchError()}>
                        <div class={ERROR} role="alert">
                          <span class="flex-1">Couldn’t load that session</span>
                          <button type="button" class={RETRY} onClick={() => void loadSession(client.sessionId())}>
                            Retry
                          </button>
                        </div>
                      </Show>
                    </>
                  }
                  overlay={
                    <Show when={switching()}>
                      <div
                        class="bg-pw-panel-60 inset-0 absolute z-[5] anim-switching"
                        role="status"
                        aria-label="Loading session…"
                        tabindex={-1}
                      />
                    </Show>
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
                        <DraftBridge onReady={(append) => (appendDraft.current = append)} />
                      </Composer>
                    </>
                  }
                />
              </Show>
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
