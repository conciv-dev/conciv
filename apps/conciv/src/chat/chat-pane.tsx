import {createEffect, createMemo, createSignal, For, Show, type JSX} from 'solid-js'
import {useBlocker, useRouter} from '@tanstack/solid-router'
import {useMutation, useQuery} from '@tanstack/solid-query'
import {useChatSession} from '@conciv/client'
import {
  AttachmentByMime,
  ChatProvider,
  Composer,
  ComposerHandlersProvider,
  ComposerPrimitive,
  NowLine,
  Thread,
  ToolProvider,
  pairResults,
  type Turn,
} from '@conciv/ui-kit-chat'
import {builtinToolCards, nowTitle} from '@conciv/ui-kit-chat-tools'
import type {MessagePart, MultimodalContent, ToolCallPart, ToolResultPart, UIMessage} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import type {UiAnswerValue} from '@conciv/protocol/ui-types'
import type {MarkerRow} from '@conciv/contract'
import {collectToolRenderers} from '@conciv/extension'
import {paneAttachments} from './pane-attachments.js'
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
import {ComposerStateBridge, type ComposerStateApi} from './composer-state.js'
import {checkSend} from './send-checks.js'
import {usePaneDraft} from './use-pane-draft.js'
import {makeSendGuard, type SendGuard} from './send-guard.js'
import {TerminalConflictDialog} from './terminal-conflict-dialog.js'
import {NoticeStrip, useNotify} from '../shell/notices.js'
import {ComposerActions} from '../composer/actions.js'
import {SessionModelSelector} from '../composer/model-selector.js'

const GRAB_PREVIEW_MAX_W = 280

const ERROR = 'flex gap-2 items-center text-pw-danger text-[0.75rem] anim-msg'
const RECONNECT = 'flex gap-2 items-center text-pw-text-2 text-[0.75rem] anim-msg'
const RETRY =
  'py-1.5 px-2.5 min-h-8 rounded-[0.4375rem] border border-pw-danger-line bg-transparent text-pw-danger cursor-pointer font-semibold text-[0.75rem] leading-none font-pw shrink-0 trans-bg hover:bg-pw-danger-14'
const DOT = 'w-1.5 h-1.5 rounded-[50%] bg-pw-text-2'

function resetSlideOnSelf(reset: () => void) {
  return (event: AnimationEvent) => {
    if (event.target === event.currentTarget) reset()
  }
}

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

function busySlot(compacting: boolean): JSX.Element | undefined {
  if (!compacting) return undefined
  return <CompactSpinner />
}

function streamingTitle(messages: ReadonlyArray<UIMessage>, titles: Record<string, string>): string | null {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return null
  return activeCallTitle(last.parts, titles)
}

export function ChatPane(props: {sessionId: string}): JSX.Element {
  const rpc = useRpc()
  const appData = useAppData()
  const announce = useAnnounce()
  const instances = useInstances()
  const pane = usePane()
  const router = useRouter()
  const notify = useNotify()
  const [forceSend, setForceSend] = createSignal(false)
  const guardHolder: {guard: SendGuard | null} = {guard: null}
  const chat = useChatSession({
    rpc,
    sessionId: props.sessionId,
    connection: {force: () => forceSend()},
    onError: (error) => guardHolder.guard?.rejected(error),
  })

  const isThinking = () => chat.status() === 'submitted'
  const isStreaming = () => chat.status() === 'streaming'
  const working = () => isThinking() || isStreaming()
  const disconnected = () => chat.connectionStatus() !== 'connected'

  let inputEl: HTMLTextAreaElement | undefined
  let viewportEl: HTMLElement | undefined
  const composerApi = {current: null as ComposerStateApi | null}

  const markers = useQuery(() => appData.utils.markers.list.queryOptions({input: {sessionId: props.sessionId}}))
  const meta = useQuery(() => appData.utils.meta.models.queryOptions())
  const delivery = {done: false}
  createEffect(() => {
    if (isStreaming()) delivery.done = true
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
  const nowTitleText = (): string | null => (isStreaming() ? streamingTitle(chat.messages(), streamTitles()) : null)

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
    onError: () => notify('Compaction failed. The session may be busy. Try again in a moment.'),
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
  const attach = (file: File) => {
    const api = composerApi.current
    if (!api) {
      pane.attachments.enqueue(file)
      return
    }
    void api.addAttachment(file)
    focusInput()
  }
  const attachments = createMemo(() =>
    paneAttachments(
      instances.map((instance) => instance.extension),
      meta.data?.harness.imageInput,
    ),
  )
  const PaneAttachment = (slotProps: {removable?: boolean}): JSX.Element => (
    <AttachmentByMime cards={attachments().cards} removable={slotProps.removable} />
  )
  const stageGrab = (grab: Parameters<typeof pane.grabStore.stage>[0]) => {
    pane.grabStore.stage(grab)
    focusInput()
  }
  const paneGrab = makePaneGrabApi(pane.grabStore)

  const dividersAt = (count: number): MarkerRow[] => (markers.data ?? []).filter((row) => row.afterTurn === count)
  const dividersInRange = (start: number, end: number): MarkerRow[] =>
    (markers.data ?? []).filter((row) => row.afterTurn >= start && row.afterTurn <= end)

  const draft = usePaneDraft({
    rpc,
    utils: appData.utils,
    sessionId: () => props.sessionId,
    composer: () => composerApi.current,
    grabTexts: () => pane.grabStore.grabs().map((grab) => grab.text),
    stageTexts: pane.grabStore.stageTexts,
    input: () => inputEl,
    viewport: () => viewportEl,
  })

  const dispatch = async (content: string | MultimodalContent, force: boolean) => {
    setForceSend(force)
    delivery.done = false
    const sending = chat.sendMessage(content).finally(() => setForceSend(false))
    await draft.noteSent()
    await sending
    draft.settleSent()
  }

  const guard = makeSendGuard({
    attached: pane.attached,
    delivered: () => delivery.done,
    snapshot: () => composerApi.current?.snapshotDraft() ?? null,
    restore: (saved) => composerApi.current?.restoreDraft(saved),
    clearDraft: () => composerApi.current?.clearDraft(),
    grabs: pane.grabStore.grabs,
    stageGrabs: pane.grabStore.stageAll,
    clearGrabs: pane.grabStore.clear,
    focusComposer: focusInput,
    detach: () => rpc.sessions.attachDetach({sessionId: props.sessionId}).then(appData.invalidateSessions),
    dispatch,
    onFailed: () => notify('Couldn’t send that message. It is back in the composer.', {tone: 'danger'}),
  })
  guardHolder.guard = guard

  const beforeSend = (content: string | MultimodalContent): boolean => {
    const verdict = checkSend(content, {busy: compacting(), connected: chat.connectionStatus() === 'connected'})
    if (verdict.ok) return guard.beforeSend(content)
    if (verdict.message !== null) notify(verdict.message, {tone: verdict.tone})
    return false
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
      attach={attach}
      newSession={() => void newSession()}
    >
      <TerminalConflictDialog
        conflict={guard.conflict()}
        onCancel={guard.cancel}
        onTakeOver={guard.takeOver}
        onSendAnyway={guard.sendAnyway}
      />
      <ChatProvider chat={chat}>
        <ToolProvider value={toolCtx}>
          <ComposerHandlersProvider
            value={{
              beforeSend,
              onSend: guard.onSend,
              onCancel: () => {
                chat.stop()
                void rpc.sessions.stop({sessionId: props.sessionId}).catch(() => {})
              },
              onSteer: () => rpc.sessions.stop({sessionId: props.sessionId}),
              onSteerError: () => notify('Steering failed. The message is still queued. Try again.'),
            }}
          >
            <ComposerPrimitive.TriggerPopoverRoot>
              <ExtensionSurface name="header" instances={instances} />
              <ExtensionSurface name="widget" instances={instances} />
              <div
                onAnimationEnd={resetSlideOnSelf(pane.resetSlide)}
                class={`flex flex-1 flex-col min-h-0 ${pane.slideClass()}`}
              >
                <Thread
                  tools={tools()}
                  attachmentCards={attachments().cards}
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
                      <NoticeStrip />
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
                        attachmentAdapter={attachments().adapter}
                        AttachmentComponent={PaneAttachment}
                        inputRef={(el) => {
                          inputEl = el
                        }}
                        busy={busySlot(compacting())}
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
                            draft.restore()
                            for (const file of pane.attachments.drain()) void api.addAttachment(file)
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
