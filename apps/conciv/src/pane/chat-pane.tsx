import {
  createEffect,
  createMemo,
  createResource,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  Suspense,
  untrack,
  type JSX,
} from 'solid-js'
import {useQuery} from '@tanstack/solid-query'
import {
  activeToolCall,
  AttachmentByMime,
  ChatProvider,
  ComposerHandlersProvider,
  NowLine,
  Thread,
  ToolProvider,
  useComposerContext,
  type PageSessionConfig,
  type Turn,
} from '@conciv/ui-kit-chat'
import {nowTitle} from '@conciv/ui-kit-chat-tools'
import {pageSessionEntry} from '@conciv/extension-page/client'
import {PAGE_ACT_TOOL_NAMES, PAGE_TOOL_PREFIX} from '@conciv/extension-page/defs'
import {builtinToolCards} from '@conciv/ui-kit-chat-tools'
import {concivToolCards} from '@conciv/tools/cards'
import {coreToolCards} from '@conciv/core/cards'
import type {ToolCardEntry, ToolCatalogView} from '@conciv/protocol/tool-view-types'
import type {MarkerRow} from '@conciv/contract'
import {collectToolRenderers} from '@conciv/extension'
import {HostApiProvider} from '@conciv/extension/host'
import type {Grab} from '@conciv/grab'
import {paneAttachments} from './pane-attachments.js'
import {useAnnounce, useAppData, useConnected, useInstances, useRpc} from '../app/context.js'
import {usePanelComposerFocus} from '../app/panel-focus.js'
import {usePane} from '../app/pane-context.js'
import {foldToolDurations} from './tool-durations.js'
import {ToolFallbackCard} from './tool-fallback-card.js'
import {useComposerTriggerSources} from './trigger-sources.js'
import {CompactSpinner, ConversationSkeleton, Divider} from './indicators.js'
import {ComposerActionsPending} from '../shell/pending.js'
import {EmptyStateSlot} from '../shell/empty-state.js'
import {ExtensionSurface} from '../extension/extension-slots.js'
import {makePaneGrabApi} from '../extension/pane-grab.js'
import {ComposerActions} from '../composer/actions.js'
import {useEngineNotices} from '../shell/notice-context.js'
import {makeDraftStorage} from './draft-storage.js'
import {useSessionCaptures} from './session-captures.js'
import {makeToolViewCtx} from './tool-view-ctx.js'
import type {ComposerInputHandle} from './composer-input-adapter.js'
import {PaneComposer} from './pane-composer.js'
import {usePaneMessaging} from './use-pane-messaging.js'
import {trackSessionActivity} from './session-activity.js'

const PAGE_SESSION: PageSessionConfig = {
  entry: pageSessionEntry,
  actNames: PAGE_ACT_TOOL_NAMES,
  toolPrefix: PAGE_TOOL_PREFIX,
}

const ABOVE_COMPOSER =
  'flex flex-row flex-wrap items-center min-h-0 shrink max-h-40 overflow-y-auto empty:hidden pt-[9px] pe-5 pb-[10px] ps-5 [background:var(--chat-queue-bg)] [border-block-start:1px_solid_var(--chat-line-soft)] [color:var(--chat-text-3)] [font-family:var(--chat-mono)] text-[11px] leading-[1.4] [&>*+*]:before:content-["·"] [&>*+*]:before:px-[5px] [&>*+*]:before:[color:var(--chat-separator)]'
const NOW_PIN = 'shrink-0 pt-[9px] pe-5 pb-[10px] ps-5 anim-msg'
const THINKING_TITLE = 'Thinking…'
const RESPONDING_TITLE = 'Responding…'
const ERROR = 'flex gap-2 items-center text-chat-danger text-[0.75rem] anim-msg'
const RETRY =
  'py-1.5 px-2.5 min-h-8 rounded-chat-surface-sm border border-chat-danger-line bg-transparent text-chat-danger cursor-pointer font-semibold text-[0.75rem] leading-none font-chat shrink-0 trans-bg hover:bg-chat-danger-14'

function resetSlideOnSelf(reset: () => void) {
  return (event: AnimationEvent) => {
    if (event.target === event.currentTarget) reset()
  }
}

type ComposerApi = {
  addAttachment: (file: File) => Promise<string | null>
}

function ComposerWiring(props: {onReady: (api: ComposerApi) => void}): JSX.Element {
  const pane = usePane()
  const context = useComposerContext()
  onMount(() => {
    pane.grabStaging.connect({
      attachments: context.attachments,
      addAttachment: context.addAttachment,
      replaceAttachment: context.replaceAttachment,
      removeAttachment: context.removeAttachment,
      hasAttachment: context.hasAttachment,
    })
    props.onReady({addAttachment: context.addAttachment})
    for (const file of pane.attachments.drain()) void context.addAttachment(file)
  })
  onCleanup(() => pane.grabStaging.disconnect())
  createEffect(() => pane.grabStaging.reconcile(context.attachments()))
  return <></>
}

export function ChatPane(props: {sessionId: string}): JSX.Element {
  const rpc = useRpc()
  const appData = useAppData()
  const announce = useAnnounce()
  const connected = useConnected()
  const {reachability, notices} = useEngineNotices()
  const instances = useInstances()
  const pane = usePane()
  const sessionId = untrack(() => props.sessionId)
  const chat = pane.chat()

  const isThinking = () => chat.status() === 'submitted'
  const isStreaming = () => chat.status() === 'streaming'
  const working = () => isThinking() || isStreaming()
  const narrating = () => working() || chat.sessionRunning()
  const disconnected = () => chat.connectionStatus() !== 'connected'
  const hydrated = createMemo<boolean>((prev) => prev || !disconnected(), false)

  const panelFocus = usePanelComposerFocus()
  const [inputHandle, setInputHandle] = createSignal<ComposerInputHandle>()
  createEffect(() => {
    const handle = inputHandle()
    if (!handle) return
    panelFocus?.register(handle)
    onCleanup(() => panelFocus?.release(handle))
  })
  const composerApi = {current: null as ComposerApi | null}

  const markers = useQuery(() => appData.utils.markers.list.queryOptions({input: {sessionId}}))
  const meta = useQuery(() => appData.utils.meta.models.queryOptions())
  const registryCatalog = useQuery(() => ({...appData.utils.registry.catalog.queryOptions(), enabled: connected()}))
  const catalog: ToolCatalogView = {
    loaded: () => registryCatalog.data !== undefined,
    meta: (name) => registryCatalog.data?.find((signature) => signature.name === name),
  }
  const activeCall = createMemo(() => activeToolCall(chat.messages()))
  const narrationTitle = () => {
    const call = activeCall()
    if (call) return nowTitle(call, catalog)
    return isThinking() ? THINKING_TITLE : RESPONDING_TITLE
  }

  const captures = useSessionCaptures(sessionId)
  const [draftStorage] = createResource(() => makeDraftStorage(rpc, sessionId))

  const startedAt = new Map<string, number>()
  const durations = createMemo<Record<string, number>>(
    (prev) => foldToolDurations(chat.messages(), startedAt, Date.now, prev),
    {},
  )

  const messaging = usePaneMessaging({
    rpc,
    sessionId,
    chat,
    appData,
    reachability,
    notices,
    refetchMarkers: () => markers.refetch(),
  })

  const toolCtx = makeToolViewCtx({
    rpc,
    harnessId: () => (meta.isPending ? '' : (meta.data?.harness.id ?? '')),
    catalog,
    sendMessage: (text) => void chat.sendMessage(text),
    addResult: (toolCallId, value) => messaging.uiReply.mutate({toolCallId, value}),
    durationFor: (toolCallId) => durations()[toolCallId],
    captureFor: captures.lookup,
  })

  const tools = (): ToolCardEntry[] => [
    ...collectToolRenderers(instances.map((instance) => instance.extension)),
    ...concivToolCards,
    ...coreToolCards,
    ...builtinToolCards,
  ]

  trackSessionActivity({
    working,
    invalidateSessions: appData.invalidateSessions,
    onSettle: () => {
      appData.invalidateSessions()
      void markers.refetch()
      captures.refresh()
      if (!chat.error()) announce('conciv replied.')
    },
  })

  const compacting = messaging.compacting

  const triggerSources = useComposerTriggerSources(sessionId)
  const focusInput = () => requestAnimationFrame(() => inputHandle()?.focus())
  const insert = (text: string) => {
    inputHandle()?.append(text)
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
  const imageInput = () => (meta.isPending ? undefined : meta.data?.harness.imageInput)
  const attachments = createMemo(() =>
    paneAttachments(
      instances.map((instance) => instance.extension),
      imageInput(),
    ),
  )
  const PaneAttachment = (slotProps: {removable?: boolean}): JSX.Element => (
    <AttachmentByMime cards={attachments().cards} removable={slotProps.removable} />
  )
  const stageGrab = (grab: Grab) => {
    pane.grabStaging.stage(grab)
    focusInput()
  }
  const paneGrab = makePaneGrabApi(pane.grabStaging, pane.grabProvider)

  const hasHistory = () => chat.messages().length > 0
  const composerPlaceholder = () => (hasHistory() ? 'Add an instruction…' : 'Ask a question…')

  const dividersAt = (count: number): MarkerRow[] => (markers.data ?? []).filter((row) => row.afterTurn === count)
  const dividersInRange = (start: number, end: number): MarkerRow[] =>
    (markers.data ?? []).filter((row) => row.afterTurn >= start && row.afterTurn <= end)

  const renderDivider = (row: MarkerRow): JSX.Element => <Divider kind={row.kind} />
  const renderTurnPrefix = (turn: Turn): JSX.Element => (
    <For each={dividersInRange(turn.start, turn.end)}>{renderDivider}</For>
  )

  return (
    <HostApiProvider
      sessionId={() => sessionId}
      grab={paneGrab}
      insert={insert}
      attach={attach}
      newSession={() => pane.newSession()}
    >
      <ChatProvider chat={chat}>
        <ToolProvider value={toolCtx}>
          <ComposerHandlersProvider
            value={{
              onSend: messaging.onSend,
              onSendError: messaging.onSendError,
              onCancel: () => chat.interruptAndFlush(),
            }}
          >
            <div class="contents">
              <ExtensionSurface name="header" instances={instances} />
              <ExtensionSurface name="widget" instances={instances} />
              <div
                onAnimationEnd={resetSlideOnSelf(pane.resetSlide)}
                class={`flex flex-1 flex-col min-h-0 ${pane.slideClass()}`}
              >
                <Thread>
                  <Thread.Viewport>
                    <Suspense fallback={<ConversationSkeleton />}>
                      <Show when={hydrated()} fallback={<ConversationSkeleton />}>
                        <Thread.Welcome>
                          <Show when={!disconnected()} fallback={<ConversationSkeleton />}>
                            <EmptyStateSlot
                              onStarter={(starter) => void chat.sendMessage(starter)}
                              instances={instances}
                            />
                          </Show>
                        </Thread.Welcome>
                        <Thread.Messages
                          tools={tools()}
                          attachmentCards={attachments().cards}
                          components={{ToolFallback: ToolFallbackCard}}
                          turnPrefix={renderTurnPrefix}
                          pageSession={PAGE_SESSION}
                        />
                        <For each={dividersAt(chat.messages().length)}>{renderDivider}</For>
                        <Show when={compacting()}>
                          <Divider kind="compact" pending />
                        </Show>
                        <Show when={messaging.visibleError()}>
                          {(error) => (
                            <div class={ERROR} role="alert">
                              <span class="flex-1">{error().message}</span>
                              <button type="button" class={RETRY} onClick={() => void chat.reload()}>
                                Retry
                              </button>
                            </div>
                          )}
                        </Show>
                      </Show>
                    </Suspense>
                  </Thread.Viewport>
                  <Thread.Composer>
                    <Show when={narrating()}>
                      <div class={NOW_PIN}>
                        <NowLine title={narrationTitle()} />
                      </div>
                    </Show>
                    <div class={ABOVE_COMPOSER}>
                      <ExtensionSurface name="status" instances={instances} />
                      <ExtensionSurface name="footer" instances={instances} />
                    </div>
                    <Suspense>
                      <Show when={draftStorage()}>
                        {(storage) => (
                          <PaneComposer
                            draftStorage={storage().storage}
                            draftKey={sessionId}
                            placeholder={composerPlaceholder()}
                            inputLabel="Message the conciv agent"
                            attachmentAdapter={attachments().adapter}
                            AttachmentComponent={PaneAttachment}
                            onInputReady={setInputHandle}
                            onSelectionChange={storage().noteSelection}
                            initialSelection={storage().restoredSelection}
                            busy={compacting() ? <CompactSpinner /> : undefined}
                            triggers={triggerSources}
                          >
                            <Suspense fallback={<ComposerActionsPending />}>
                              <ComposerActions
                                sessionId={sessionId}
                                compacting={compacting()}
                                onCompact={() => messaging.compact.mutate()}
                                onNewSession={() => pane.newSession()}
                                onStageGrab={stageGrab}
                              />
                              <ExtensionSurface name="composer" instances={instances} />
                              <ComposerWiring
                                onReady={(api) => {
                                  composerApi.current = api
                                }}
                              />
                            </Suspense>
                          </PaneComposer>
                        )}
                      </Show>
                    </Suspense>
                  </Thread.Composer>
                </Thread>
              </div>
            </div>
          </ComposerHandlersProvider>
        </ToolProvider>
      </ChatProvider>
    </HostApiProvider>
  )
}
