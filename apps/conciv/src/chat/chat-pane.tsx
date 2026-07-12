import {createEffect, createMemo, createSignal, For, onCleanup, onMount, Show, type JSX} from 'solid-js'
import {useBlocker, useRouter} from '@tanstack/solid-router'
import {useMutation, useQuery} from '@tanstack/solid-query'
import {useChatSession} from '@conciv/client'
import {
  ChatProvider,
  Composer,
  ComposerHandlersProvider,
  ComposerPrimitive,
  NowLine,
  Thread,
  ToolProvider,
  guardChat,
  pairResults,
  useComposer,
  type Turn,
} from '@conciv/ui-kit-chat'
import {builtinToolCards, nowTitle} from '@conciv/ui-kit-chat-tools'
import {createDebouncer} from '@tanstack/solid-pacer'
import type {MessagePart, ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import type {UiAnswerValue} from '@conciv/protocol/ui-types'
import type {MarkerRow} from '@conciv/contract'
import {collectToolRenderers} from '@conciv/extension'
import {useAnnounce, useAppData, useInstances, useRpc} from '../app/context.js'
import {usePane} from '../app/pane-context.js'
import {makeConcivUiCard} from './conciv-ui-card.js'
import {foldToolDurations} from './tool-durations.js'
import {ToolFallbackCard} from './tool-fallback-card.js'
import {TriggerMenus} from './trigger-menus.js'
import {GrabReference} from './grab-reference.js'
import {CompactSpinner, Divider, ThinkingBubble} from './indicators.js'
import {EmptyStateSlot} from '../shell/empty-state.js'
import {ExtensionSurface} from '../extension/extension-slots.js'
import {HostApiProvider} from '@conciv/extension'
import {makePaneGrabApi} from '../extension/pane-grab.js'
import {ComposerActions} from '../composer/actions.js'
import {SessionModelSelector} from '../composer/model-selector.js'
import {clearPaneSnapshot, readPaneSnapshot, writePaneSnapshot} from '../lib/ui-snapshot.js'

const GRAB_PREVIEW_MAX_W = 280

const ERROR = 'flex gap-2 items-center text-pw-danger text-[0.75rem] anim-msg'
const RECONNECT = 'flex gap-2 items-center text-pw-text-2 text-[0.75rem] anim-msg'
const RETRY =
  'py-1.5 px-2.5 min-h-8 rounded-[0.4375rem] border border-pw-danger-line bg-transparent text-pw-danger cursor-pointer font-semibold text-[0.75rem] leading-none font-pw shrink-0 trans-bg hover:bg-pw-danger-14'
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

export function ChatPane(props: {sessionId: string}): JSX.Element {
  const rpc = useRpc()
  const appData = useAppData()
  const announce = useAnnounce()
  const instances = useInstances()
  const pane = usePane()
  const router = useRouter()
  const raw = useChatSession({rpc, sessionId: props.sessionId})
  const chat = guardChat(raw)

  const isThinking = () => chat.status() === 'submitted'
  const isStreaming = () => chat.status() === 'streaming'
  const working = () => isThinking() || isStreaming()
  const disconnected = () => raw.connectionStatus() !== 'connected'

  let inputEl: HTMLTextAreaElement | undefined
  let viewportEl: HTMLElement | undefined
  const composerApi = {current: null as ComposerStateApi | null}

  const markers = useQuery(() => appData.utils.markers.list.queryOptions({input: {sessionId: props.sessionId}}))
  const meta = useQuery(() => appData.utils.meta.models.queryOptions())

  const [notice, setNotice] = createSignal('')
  let noticeTimer: ReturnType<typeof setTimeout> | undefined
  const notify = (message: string) => {
    setNotice(message)
    announce(message)
    if (noticeTimer) clearTimeout(noticeTimer)
    noticeTimer = setTimeout(() => setNotice(''), 5000)
  }
  onCleanup(() => {
    if (noticeTimer) clearTimeout(noticeTimer)
  })

  const startedAt = new Map<string, number>()
  const durations = createMemo<Record<string, number>>(
    (prev) => foldToolDurations(chat.messages(), startedAt, Date.now, prev),
    {},
  )

  const toolCtx: ToolViewCtx = {
    apiBase: '',
    harnessId: meta.data?.harness.id ?? '',
    sendMessage: (text) => void chat.sendMessage(text),
    respondApproval: (approvalId, approved) => {
      void rpc.chat.permissionDecision({approvalId, approved}).catch(() => {})
    },
    durationFor: (toolCallId) => durations()[toolCallId],
  }

  const uiReply = useMutation(() => ({
    mutationFn: (input: {toolCallId: string; value: UiAnswerValue}) =>
      rpc.chat.uiReply({sessionId: props.sessionId, toolCallId: input.toolCallId, value: input.value}),
    onError: () => notify('That question is no longer waiting for an answer.'),
  }))
  const concivUiEntry: ToolCardEntry = {
    names: ['conciv_ui'],
    render: makeConcivUiCard({reply: (toolCallId, value) => uiReply.mutate({toolCallId, value})}),
  }
  const tools = (): ToolCardEntry[] => [
    concivUiEntry,
    ...collectToolRenderers(instances.map((instance) => instance.extension)),
    ...builtinToolCards,
  ]

  const streamTitles = (): Record<string, string> =>
    Object.fromEntries(
      tools().flatMap((entry) => (entry.streamTitle ? entry.names.map((name) => [name, entry.streamTitle ?? '']) : [])),
    )
  const nowTitleText = (): string | null => {
    if (!isStreaming()) return null
    const messages = chat.messages()
    const last = messages[messages.length - 1]
    if (!last || last.role !== 'assistant') return null
    return activeCallTitle(last.parts, streamTitles())
  }

  let wasWorking = false
  createEffect(() => {
    const now = working()
    if (now !== wasWorking) {
      wasWorking = now
      appData.invalidateSessions()
      if (!now) void markers.refetch()
    }
  })

  let prevStatus = ''
  createEffect(() => {
    const status = chat.status()
    if (status === 'submitted') announce('conciv is thinking…')
    else if (prevStatus === 'streaming' && status !== 'streaming') announce('conciv replied.')
    prevStatus = status
  })
  createEffect(() => {
    if (disconnected()) announce('Reconnecting to conciv…')
  })

  const visibleError = () => {
    const error = chat.error()
    return error && error.message !== 'stopped' ? error : undefined
  }

  const compact = useMutation(() => ({
    mutationFn: () => rpc.sessions.compact({sessionId: props.sessionId}),
    onError: () => notify('Compaction failed — the session may be busy. Try again in a moment.'),
    onSettled: () => {
      appData.invalidateSessions()
      void markers.refetch()
    },
  }))
  const compacting = () => compact.isPending

  const newSession = async () => {
    const {sessionId} = await rpc.sessions.create(undefined)
    appData.invalidateSessions()
    void router.navigate({to: '/panel/$sessionId', params: {sessionId}})
    announce('Started a new session')
  }

  const focusInput = () => requestAnimationFrame(() => inputEl?.focus())
  const insert = (text: string) => {
    composerApi.current?.append(text)
    focusInput()
  }
  const stageGrab = (grab: Parameters<typeof pane.grabStore.stage>[0]) => {
    pane.grabStore.stage(grab)
    focusInput()
  }
  const paneGrab = makePaneGrabApi(pane.grabStore)

  const dividersAt = (count: number): MarkerRow[] => (markers.data ?? []).filter((row) => row.afterTurn === count)
  const dividersInRange = (start: number, end: number): MarkerRow[] =>
    (markers.data ?? []).filter((row) => row.afterTurn >= start && row.afterTurn <= end)

  const isInputFocused = (): boolean => {
    if (!inputEl) return false
    const root = inputEl.getRootNode()
    if (root instanceof ShadowRoot) return root.activeElement === inputEl
    return document.activeElement === inputEl
  }

  const writeDraft = () => {
    const text = composerApi.current?.text() ?? ''
    void rpc.drafts
      .set({
        sessionId: props.sessionId,
        text,
        selectionStart: inputEl?.selectionStart ?? text.length,
        selectionEnd: inputEl?.selectionEnd ?? text.length,
        grabs: pane.grabStore.grabs().map((grab) => grab.text),
      })
      .catch(() => {})
  }
  const persistDraft = createDebouncer(writeDraft, {wait: 400})
  const persistSnapshot = createDebouncer(
    () =>
      writePaneSnapshot(props.sessionId, {
        selectionStart: inputEl?.selectionStart ?? 0,
        selectionEnd: inputEl?.selectionEnd ?? 0,
        focused: isInputFocused(),
        scrollTop: viewportEl?.scrollTop ?? null,
      }),
    {wait: 150},
  )

  const draftQuery = useQuery(() => appData.utils.drafts.get.queryOptions({input: {sessionId: props.sessionId}}))
  const restored = {done: false}
  const maybeRestore = () => {
    const api = composerApi.current
    if (!api || restored.done || !draftQuery.isSuccess) return
    restored.done = true
    const row = draftQuery.data
    if (row) {
      api.setText(row.text)
      if (row.grabs.length > 0) pane.grabStore.stageTexts(row.grabs)
    }
    const snapshot = readPaneSnapshot(props.sessionId)
    requestAnimationFrame(() => {
      if (snapshot?.scrollTop != null && viewportEl) viewportEl.scrollTop = snapshot.scrollTop
      if (!inputEl) return
      if (row) inputEl.setSelectionRange(row.selectionStart, row.selectionEnd)
      if (snapshot?.focused ?? true) inputEl.focus()
    })
  }
  createEffect(() => {
    if (!draftQuery.isSuccess) return
    maybeRestore()
  })
  createEffect(() => {
    const row = draftQuery.data
    if (!row || !restored.done || isInputFocused()) return
    const api = composerApi.current
    if (api && api.text() !== row.text) api.setText(row.text)
  })

  onMount(() => {
    const schedule = () => {
      persistDraft.maybeExecute()
      persistSnapshot.maybeExecute()
    }
    const inputEvents: string[] = ['input', 'select', 'keyup', 'click', 'focus', 'blur']
    const target = inputEl
    const viewport = viewportEl
    if (target) for (const event of inputEvents) target.addEventListener(event, schedule)
    if (viewport) viewport.addEventListener('scroll', () => persistSnapshot.maybeExecute())
    const onPageHide = () => persistSnapshot.flush()
    window.addEventListener('pagehide', onPageHide)
    onCleanup(() => {
      if (target) for (const event of inputEvents) target.removeEventListener(event, schedule)
      window.removeEventListener('pagehide', onPageHide)
    })
  })

  const send = async (text: string) => {
    await rpc.drafts
      .set({
        sessionId: props.sessionId,
        text,
        selectionStart: 0,
        selectionEnd: 0,
        grabs: pane.grabStore.grabs().map((grab) => grab.text),
      })
      .catch(() => {})
    persistDraft.cancel()
    pane.grabStore.clear()
    await chat.sendMessage(text)
    clearPaneSnapshot(props.sessionId)
    void draftQuery.refetch()
  }
  const onSend = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || chat.isLoading() || compacting()) return
    if (raw.connectionStatus() !== 'connected') return
    void send(trimmed)
  }

  useBlocker({
    shouldBlockFn: ({current, next}) =>
      working() && next.pathname.startsWith('/panel') && next.pathname !== current.pathname,
  })

  const renderDivider = (row: MarkerRow): JSX.Element => <Divider kind={row.kind} />
  const renderTurnPrefix = (turn: Turn): JSX.Element => (
    <For each={dividersInRange(turn.start, turn.end)}>{renderDivider}</For>
  )

  return (
    <HostApiProvider
      sessionId={() => props.sessionId}
      grab={paneGrab}
      insert={insert}
      newSession={() => void newSession()}
    >
      <ChatProvider chat={chat}>
        <ToolProvider value={toolCtx}>
          <ComposerHandlersProvider
            value={{
              onSend,
              onCancel: () => {
                chat.stop()
                void rpc.sessions.stop({sessionId: props.sessionId}).catch(() => {})
              },
            }}
          >
            <ComposerPrimitive.TriggerPopoverRoot>
              <ExtensionSurface name="header" instances={instances} />
              <ExtensionSurface name="widget" instances={instances} />
              <div
                data-pw-hydrating={pane.hydrating() ? '' : undefined}
                onAnimationEnd={(event) => {
                  if (event.target === event.currentTarget) pane.resetSlide()
                }}
                class={`flex flex-1 flex-col min-h-0 ${pane.slideClass()}`}
              >
                <Thread
                  tools={tools()}
                  components={{ToolFallback: ToolFallbackCard}}
                  turnPrefix={renderTurnPrefix}
                  viewportRef={(el) => {
                    viewportEl = el
                  }}
                  viewportFooter={
                    <>
                      <For each={dividersAt(chat.messages().length)}>{renderDivider}</For>
                      <Show when={compacting()}>
                        <Divider kind="compact" pending />
                      </Show>
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
                    <EmptyStateSlot onStarter={(starter) => void chat.sendMessage(starter)} instances={instances} />
                  }
                  composer={
                    <>
                      <ExtensionSurface name="status" instances={instances} />
                      <ExtensionSurface name="footer" instances={instances} />
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
                      <For each={pane.grabStore.grabs()}>
                        {(grab) => (
                          <GrabReference
                            grab={grab}
                            maxWidth={GRAB_PREVIEW_MAX_W}
                            onRemove={() => pane.grabStore.remove(grab)}
                          />
                        )}
                      </For>
                      <Composer
                        placeholder="Ask a question…"
                        inputLabel="Message the conciv agent"
                        inputRef={(el) => {
                          inputEl = el
                        }}
                        busy={compacting() ? <CompactSpinner /> : undefined}
                        popover={<TriggerMenus sessionId={props.sessionId} />}
                      >
                        <ComposerActions
                          sessionId={props.sessionId}
                          compacting={compacting()}
                          onCompact={() => compact.mutate()}
                          onNewSession={() => void newSession()}
                          onStageGrab={stageGrab}
                          notify={notify}
                        />
                        <ExtensionSurface name="composer" instances={instances} />
                        <SessionModelSelector sessionId={props.sessionId} />
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
            </ComposerPrimitive.TriggerPopoverRoot>
          </ComposerHandlersProvider>
        </ToolProvider>
      </ChatProvider>
    </HostApiProvider>
  )
}
