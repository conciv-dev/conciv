import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  onMount,
  Show,
  Suspense,
  untrack,
  type JSX,
} from 'solid-js'
import {useQuery, type ChatSession} from '@conciv/client'
import {z} from 'zod'
import {compact, uniq} from 'es-toolkit'
import {
  activeToolCall,
  AttachmentByMime,
  ChatProvider,
  ComposerHandlersProvider,
  NowLine,
  readComposerDraft,
  Thread,
  ToolProvider,
  useComposerContext,
  useModelMenu,
  useThread,
  type ComposerDraft,
  type PageSessionConfig,
  type TurnItem,
  type TurnPrefixSource,
} from '@conciv/ui-kit-chat'
import type {DraftItem} from '@conciv/protocol/chat-types'
import {nowTitle} from '@conciv/ui-kit-chat-tools'
import {
  PAGE_ACT_TOOL_NAMES,
  PAGE_TOOL_PREFIX,
  builtinToolMeta,
  pageSessionEntry,
} from '@conciv/builtin-plugins/renderer'
import {builtinToolCards} from '@conciv/ui-kit-chat-tools'
import {concivToolCards} from '@conciv/tools/cards'
import {coreToolCards} from '@conciv/core/cards'
import type {ToolCardEntry, ToolCatalogView} from '@conciv/protocol/tool-view-types'
import type {MarkerRow} from '@conciv/contract'
import type {ChatMessage, SendContent} from '@conciv/protocol/chat-message-types'
import type {Grab} from '@conciv/grab'
import {composerDraftSink, paneAttachments, returnQueueToDraft} from './pane-attachments.js'
import {useAnnounce, useAppData, useConnected, useLiveSessions, useRpc} from '../app/context.js'
import {useHarnesses, useSessionHarness} from '../data/harness-meta.js'
import {usePanelComposerFocus} from '../app/panel-focus.js'
import type {PaneDraftSinks} from '../app/live-sessions.js'
import {usePane} from '../app/pane-context.js'
import {useComposerTriggerSources} from './trigger-sources.js'
import {CompactSpinner, ConversationSkeleton, Divider} from './indicators.js'
import {ComposerActionsPending} from '../shell/pending.js'
import {EmptyState} from '../shell/empty-state.js'
import {ComposerActions} from '../composer/actions.js'
import {promptWithNotes} from '../composer/comment-note.js'
import {ComposerNotes, SentNotes} from '../composer/note-card.js'
import {ConnectedAgents} from '../composer/connected-agents.js'
import {SessionModelPrompt} from '../composer/session-model-prompt.js'
import {useEngineNotices} from '../shell/notice-context.js'
import {makeDraftStorage, type PaneDraftStorage} from './draft-storage.js'
import {DraftUnsavedNotice} from './draft-unsaved-notice.js'
import {makeToolViewCtx} from './tool-view-ctx.js'
import {PendingApprovals} from './pending-approvals.js'
import type {ComposerInputHandle} from './composer-input-adapter.js'
import {PaneComposer} from './pane-composer.js'
import {OlderMessages} from './older-messages.js'
import {usePaneMessaging} from './use-pane-messaging.js'
import {RunErrorRow, sessionDeleted} from './run-error-row.js'
import {DeletedSessionPanel} from './deleted-session-panel.js'
import {PaneAlert} from './pane-alert.js'
import {viewTabPanelAttributes} from './view-tab-ids.js'
import {QueueStrip} from './queue-strip.js'
import {
  createPaneSession,
  SessionComposerBinding,
  SessionComposerPills,
  SessionHeaderSlot,
  SessionLinks,
  SessionStatusSlot,
} from './plugin-session-parts.js'
import {createToolRender} from './tool-registry-render.js'
import {Contribution} from '../runtime/plugin/render'

const PAGE_SESSION: PageSessionConfig = {
  entry: {
    key: pageSessionEntry.key,
    render: (props) => (
      <Contribution plugin="page" fallback={() => props.children}>
        {() => pageSessionEntry.render(props)}
      </Contribution>
    ),
  },
  actNames: PAGE_ACT_TOOL_NAMES,
  toolPrefix: PAGE_TOOL_PREFIX,
}

const ABOVE_COMPOSER =
  'flex flex-row flex-wrap items-center min-h-0 shrink max-h-40 overflow-y-auto pe-5 ps-5 gap-x-2 [background:var(--chat-queue-bg)] [box-shadow:inset_0_1px_0_var(--chat-line-soft)] [color:var(--chat-text-3)] [font-family:var(--chat-mono)] text-chat-xs leading-snug'
const STATUS_TEXTS =
  'flex flex-row flex-wrap items-center min-w-0 py-2 empty:hidden [&>*+*]:before:content-["·"] [&>*+*]:before:px-1 [&>*+*]:before:[color:var(--chat-separator)]'
const PILL_GROUP = 'flex flex-row flex-wrap items-center gap-1.5 min-w-0 py-2 empty:hidden'
const NOW_ROW = 'shrink-0 self-stretch min-w-0'
const THINKING_TITLE = 'Thinking…'
const RESPONDING_TITLE = 'Responding…'
const HARNESS_LABEL =
  'self-start ps-[var(--chat-trace-gutter)] text-chat-micro leading-loose [font-family:var(--chat-mono)] text-chat-faint'
const LOAD_FAILED = 'Couldn’t load this conversation'

function resetSlideOnSelf(reset: () => void) {
  return (event: AnimationEvent) => {
    if (event.target === event.currentTarget) reset()
  }
}

type ComposerApi = {
  addAttachment: (file: File) => Promise<string | null>
  addItem: (item: DraftItem) => void
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
    props.onReady({addAttachment: context.addAttachment, addItem: context.addItem})
    for (const file of pane.attachments.drain()) void context.addAttachment(file)
  })
  onCleanup(() => pane.grabStaging.disconnect())
  createEffect(() => pane.grabStaging.reconcile(context.attachments()))
  return <></>
}

function DraftRestore(props: {
  storage: PaneDraftStorage
  draftKey: string
  input: () => ComposerInputHandle | undefined
  onRestore: (restoring: Promise<void>) => void
}): JSX.Element {
  const context = useComposerContext()
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  onMount(() => {
    const input = props.input
    const draftKey = props.draftKey
    const restoring = props.storage.restore((restored, mode) => {
      const draft = readComposerDraft(restored.snapshot, draftKey)
      if (!draft) return
      if (mode === 'replace') context.clearDraft()
      const untouched = mode !== 'merge' && context.snapshotDraft().draft === ''
      context.restoreDraft({...draft, attachments: [...restored.attachments, ...draft.attachments]})
      if (untouched) input()?.select(restored.selection)
    }, controller.signal)
    props.onRestore(restoring)
    restoring.catch((error: unknown) => {
      console.error('[conciv] could not restore the draft', error)
    })
  })
  return <></>
}

function compactingIndicator(compacting: boolean): JSX.Element | undefined {
  return compacting ? <CompactSpinner /> : undefined
}

const StoppedMetadataSchema = z.object({tanstack: z.object({stopReason: z.literal('aborted')})})

function isStoppedTurn(message: ChatMessage | undefined): boolean {
  return message?.role === 'assistant' && StoppedMetadataSchema.safeParse(message.metadata).success
}

function sameEntries<T>(previous: readonly T[], next: readonly T[]): boolean {
  return previous.length === next.length && next.every((entry, index) => entry === previous[index])
}

function turnHarnessNames(
  chat: ChatSession,
  current: () => string | undefined,
  turns: () => readonly TurnItem[],
): (turn: TurnPrefixSource) => string | undefined {
  const harnesses = useHarnesses()
  const mixed = createMemo(() => {
    const harnessId = current()
    const replies = turns().filter((turn) => turn.role === 'assistant')
    return uniq(compact([harnessId, ...replies.map((turn) => chat.readHarness(turn.key) ?? harnessId)])).length > 1
  })
  return (turn) => {
    if (!mixed() || turn.role !== 'assistant') return undefined
    const harnessId = chat.readHarness(turn.key) ?? current()
    return harnessId === undefined ? undefined : harnesses.resolveName(harnessId)
  }
}

function markersAfter(chat: ChatSession, rows: () => MarkerRow[]): (messageId: string | undefined) => MarkerRow[] {
  return (messageId) => {
    if (messageId === undefined && chat.hasOlderMessages()) return []
    const anchor = messageId ?? null
    return rows().filter((row) => row.afterMessageId === anchor)
  }
}

type OpenedChat = {chat: ChatSession; reopened: boolean}

export function ChatPane(props: {sessionId: string; viewTab?: string}): JSX.Element {
  const pane = usePane()
  const appData = useAppData()
  const session = useQuery(() => appData.utils.sessions.get.queryOptions({input: {sessionId: props.sessionId}}))
  const deleted = () => session.isSuccess && session.data.hidden
  const opened = createMemo<OpenedChat | undefined>(
    (previous) => ({chat: pane.chat(), reopened: previous !== undefined}),
    undefined,
    {equals: (previous, next) => previous?.chat === next?.chat},
  )
  return (
    <Show when={!deleted()} fallback={<DeletedSessionPanel sessionId={props.sessionId} />}>
      <Show when={opened()} keyed>
        {(current) => <OpenedChatPane opened={current} sessionId={props.sessionId} viewTab={props.viewTab} />}
      </Show>
    </Show>
  )
}

function OpenedChatPane(props: {opened: OpenedChat; sessionId: string; viewTab?: string}): JSX.Element {
  const rpc = useRpc()
  const appData = useAppData()
  const announce = useAnnounce()
  const {reachability, notices} = useEngineNotices()
  const pane = usePane()
  const liveSessions = useLiveSessions()
  const sessionId = untrack(() => props.sessionId)
  const harness = useSessionHarness(() => sessionId)
  const chat = pane.chat()
  let paneBody: HTMLDivElement | undefined

  const isThinking = () => chat.status() === 'submitted'
  const isStreaming = () => chat.status() === 'streaming'
  const working = () => isThinking() || isStreaming()
  const narrating = () => working() || chat.sessionRunning()

  const panelFocus = usePanelComposerFocus()
  const [inputHandle, setInputHandle] = createSignal<ComposerInputHandle>()
  createEffect(() => {
    const handle = inputHandle()
    if (!handle) return
    panelFocus?.register(handle)
    onCleanup(() => panelFocus?.release(handle))
  })
  const composerApi = {current: null as ComposerApi | null}
  const pluginSession = createPaneSession(sessionId)
  const restored = Promise.withResolvers<unknown>()
  restored.promise.catch(() => undefined)

  const markers = useQuery(() => appData.utils.markers.list.queryOptions({input: {sessionId}}))
  const catalog = useToolCatalog()
  const draftStorage = makeDraftStorage(appData, liveSessions.keepDraft, sessionId)

  const messaging = usePaneMessaging({
    rpc,
    sessionId,
    chat,
    appData,
    reachability,
    notices,
    refetchMarkers: () => markers.refetch(),
  })
  const sendFromButton = (text: string): void => {
    void messaging.onSend(text).catch(messaging.onSendError)
  }

  const toolCtx = makeToolViewCtx({
    catalog,
    decide: chat.decide,
    onError: () => notices.notify('That permission request is no longer waiting for an answer.', {tone: 'warn'}),
    addResult: messaging.onAnswer,
  })

  const toolRender = createToolRender()
  const tools = (): ToolCardEntry[] => [...concivToolCards, ...coreToolCards, ...builtinToolCards]

  const compacting = messaging.compacting

  const focusInput = () => requestAnimationFrame(() => inputHandle()?.focus())
  const modelMenu = useModelMenu(focusInput)
  const commandSources = useComposerTriggerSources({
    sessionId,
    openModelMenu: () => modelMenu.popover().setOpen(true),
  })
  const addItem = (item: DraftItem) => composerApi.current?.addItem(item)
  const sendOrRunCommand = async (content: string | SendContent, draft: ComposerDraft): Promise<void> => {
    if (typeof content === 'string' && commandSources.runTyped(content)) {
      draft.items.forEach(addItem)
      return
    }
    await messaging.onSend(promptWithNotes(content, draft))
  }
  const insert = (text: string) => {
    inputHandle()?.append(text)
    focusInput()
  }
  const insertFirst = (text: string) => {
    inputHandle()?.select({start: 0, end: 0})
    inputHandle()?.insert(`${text}\n`)
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
  const imageInput = () => harness()?.imageInput
  const attachments = createMemo(() => paneAttachments(imageInput(), appData.drafts))
  const PaneAttachment = (slotProps: {onRemove?: (id: string) => void}): JSX.Element => (
    <AttachmentByMime cards={attachments().chips} onRemove={slotProps.onRemove} />
  )
  const stageGrab = (grab: Grab) => {
    pane.grabStaging.stage(grab)
    focusInput()
  }

  const renderDivider = (row: MarkerRow): JSX.Element => <Divider kind={row.kind} />
  const markerRowsAfter = markersAfter(chat, () => (markers.isPending ? [] : (markers.data ?? [])))

  const PaneBody = (): JSX.Element => {
    const thread = useThread()
    const lastTurn = () => thread.turns.at(-1)?.turn()
    const asks = createMemo(() => chat.pendingApprovals(), [], {equals: sameEntries})
    createEffect<number>((previous) => {
      const waiting = asks().length
      if (waiting > previous) announce('conciv is asking for permission.')
      return waiting
    }, 0)
    const NarrationRow = (): JSX.Element => {
      const title = createMemo(() => {
        const call = activeToolCall(lastTurn())
        if (call) return nowTitle(call, catalog)
        return isThinking() ? THINKING_TITLE : RESPONDING_TITLE
      })
      return (
        <div class={NOW_ROW}>
          <NowLine title={title()} />
        </div>
      )
    }
    const composerPlaceholder = () => (thread.isEmpty ? 'Ask a question…' : 'Add an instruction…')
    const lastMessage = () => lastTurn()?.messages.at(-1)
    const lastMessageId = createMemo(() => lastMessage()?.id)
    const lastTurnStopped = () => !narrating() && (chat.stopped() || isStoppedTurn(lastMessage()))
    const turnHarnessName = turnHarnessNames(
      chat,
      () => harness()?.id,
      () => thread.turns,
    )
    const renderTurnPrefix = (source: TurnPrefixSource): JSX.Element => {
      const anchors = createMemo(
        () => {
          const turn = source.turn()
          return [turn.before, ...turn.messages.slice(0, -1)]
        },
        [],
        {equals: sameEntries},
      )
      return (
        <>
          <Show when={isStoppedTurn(anchors()[0])}>
            <Divider kind="stopped" />
          </Show>
          <For each={anchors().flatMap((message) => markerRowsAfter(message?.id))}>{renderDivider}</For>
          <Show when={turnHarnessName(source)}>{(name) => <span class={HARNESS_LABEL}>{name()}</span>}</Show>
        </>
      )
    }
    const renderPromptSuffix = (source: TurnPrefixSource): JSX.Element => (
      <SentNotes messages={() => source.turn().messages} session={pluginSession.view} />
    )
    return (
      <div class="contents">
        <SessionHeaderSlot pane={pluginSession} />
        <div
          ref={(element) => (paneBody = element)}
          {...viewTabPanelAttributes(props.viewTab)}
          onAnimationEnd={resetSlideOnSelf(pane.resetSlide)}
          class={`chat-density flex flex-1 flex-col min-h-0 ${pane.slideClass()}`}
        >
          <SessionLinks pane={pluginSession}>
            <Thread>
              <Thread.Viewport>
                <Suspense fallback={<ConversationSkeleton />}>
                  <Show
                    when={!chat.isHydrating()}
                    fallback={<ConversationLoading reopened={props.opened.reopened} sessionId={sessionId} />}
                  >
                    <OlderMessages sessionId={sessionId} chat={chat} />
                    <Show when={!chat.loadFailed()}>
                      <Thread.Welcome>
                        <EmptyState onStarter={sendFromButton} />
                      </Thread.Welcome>
                    </Show>
                    <Thread.Messages
                      sessionID={sessionId}
                      tools={tools()}
                      attachmentCards={attachments().cards}
                      render={toolRender.render}
                      renderPending={toolRender.pending()}
                      turnPrefix={renderTurnPrefix}
                      promptSuffix={renderPromptSuffix}
                      pageSession={PAGE_SESSION}
                      refreshDisabled={!messaging.resendAllowed()}
                    />
                    <Show when={lastTurnStopped()}>
                      <Divider kind="stopped" />
                    </Show>
                    <Show when={!chat.loadFailed()}>
                      <For each={markerRowsAfter(lastMessageId())}>{renderDivider}</For>
                    </Show>
                    <Show when={compacting()}>
                      <Divider kind="compact" pending />
                    </Show>
                    <Show when={asks().length > 0}>
                      <PendingApprovals asks={asks()} ctx={toolCtx} />
                    </Show>
                    <Show when={narrating()}>
                      <NarrationRow />
                    </Show>
                    <Show when={messaging.visibleError()}>
                      {(error) => (
                        <Show
                          when={!chat.loadFailed() || sessionDeleted(error())}
                          fallback={<LoadFailedAlert busy={false} sessionId={sessionId} />}
                        >
                          <RunErrorRow
                            error={error()}
                            compacting={compacting()}
                            onRetry={
                              messaging.retryable() && messaging.resendAllowed() ? () => void chat.reload() : undefined
                            }
                            onCompact={() => messaging.compact.mutate()}
                          />
                        </Show>
                      )}
                    </Show>
                  </Show>
                </Suspense>
              </Thread.Viewport>
              <Thread.Composer>
                <div class={ABOVE_COMPOSER}>
                  <div class={STATUS_TEXTS}>
                    <SessionStatusSlot pane={pluginSession} />
                  </div>
                  <div class={PILL_GROUP}>
                    <Suspense>
                      <ConnectedAgents onDisconnected={focusInput} />
                    </Suspense>
                    <SessionComposerPills pane={pluginSession} />
                  </div>
                </div>
                <QueueStrip queue={chat.queue()} />
                <DraftUnsavedNotice sessionId={sessionId} retry={draftStorage.retry} keptHere={draftStorage.keptHere} />
                <Suspense>
                  <PaneComposer
                    draftStorage={draftStorage.storage}
                    draftWriter={draftStorage.writer}
                    draftKey={sessionId}
                    placeholder={composerPlaceholder()}
                    inputLabel="Message the conciv agent"
                    attachmentAdapter={attachments().adapter}
                    AttachmentComponent={PaneAttachment}
                    notes={<ComposerNotes session={pluginSession.view} onRemoved={focusInput} />}
                    onInputReady={setInputHandle}
                    onSelectionChange={draftStorage.noteSelection}
                    busy={compactingIndicator(compacting())}
                    triggers={commandSources.triggers}
                    menuBoundary={() => paneBody}
                    prompt={<SessionModelPrompt sessionId={sessionId} menu={modelMenu} running={narrating()} />}
                  >
                    <SessionComposerBinding
                      pane={pluginSession}
                      input={inputHandle}
                      focus={focusInput}
                      restored={restored.promise}
                    />
                    <DraftRestore
                      storage={draftStorage}
                      draftKey={sessionId}
                      input={inputHandle}
                      onRestore={restored.resolve}
                    />
                    <DraftReturnReceiver
                      sessionId={sessionId}
                      sinks={{
                        queue: composerDraftSink({insert, addFile: attach, addItem}),
                        steered: composerDraftSink({insert: insertFirst, addFile: attach, addItem}),
                      }}
                    />
                    <Suspense fallback={<ComposerActionsPending />}>
                      <ComposerActions
                        sessionId={sessionId}
                        compacting={compacting()}
                        onCompact={() => messaging.compact.mutate()}
                        onNewSession={() => pane.newSession()}
                        onStageGrab={stageGrab}
                      />
                      <ComposerWiring
                        onReady={(api) => {
                          composerApi.current = api
                        }}
                      />
                    </Suspense>
                  </PaneComposer>
                </Suspense>
              </Thread.Composer>
            </Thread>
          </SessionLinks>
        </div>
      </div>
    )
  }

  return (
    <ChatProvider chat={chat}>
      <ToolProvider value={toolCtx}>
        <ComposerHandlersProvider
          value={{
            onSend: sendOrRunCommand,
            onSendError: messaging.onSendError,
            onSteer: messaging.onSteer,
            onSteerError: messaging.onSteerError,
            onCancel: () => {
              returnQueueToDraft(chat, composerDraftSink({insert, addFile: attach, addItem}))
              void chat.stop()
            },
          }}
        >
          <PaneBody />
        </ComposerHandlersProvider>
      </ToolProvider>
    </ChatProvider>
  )
}

function ConversationLoading(props: {reopened: boolean; sessionId: string}): JSX.Element {
  return (
    <Show when={props.reopened} fallback={<ConversationSkeleton />}>
      <LoadFailedAlert busy sessionId={props.sessionId} />
    </Show>
  )
}

function useToolCatalog(): ToolCatalogView {
  const appData = useAppData()
  const connected = useConnected()
  const registryCatalog = useQuery(() => ({...appData.utils.registry.catalog.queryOptions(), enabled: connected()}))
  return {
    loaded: () => registryCatalog.data !== undefined,
    meta: (name) => registryCatalog.data?.find((signature) => signature.name === name) ?? builtinToolMeta(name),
  }
}

function DraftReturnReceiver(props: {sessionId: string; sinks: PaneDraftSinks}): JSX.Element {
  const liveSessions = useLiveSessions()
  onMount(() => liveSessions.receiveDraftReturns(props.sessionId, props.sinks))
  return <></>
}

function LoadFailedAlert(props: {busy: boolean; sessionId: string}): JSX.Element {
  const liveSessions = useLiveSessions()
  return <PaneAlert message={LOAD_FAILED} busy={props.busy} onRetry={() => liveSessions.reopen(props.sessionId)} />
}
