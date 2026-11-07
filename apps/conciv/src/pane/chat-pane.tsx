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
import {useQuery} from '@tanstack/solid-query'
import {Button} from '@conciv/ui-kit-system'
import {z} from 'zod'
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
  useThread,
  type PageSessionConfig,
  type TurnItem,
  type TurnPrefixSource,
} from '@conciv/ui-kit-chat'
import {nowTitle} from '@conciv/ui-kit-chat-tools'
import {pageSessionEntry} from '@conciv/extension-page/client'
import {PAGE_ACT_TOOL_NAMES, PAGE_TOOL_PREFIX} from '@conciv/extension-page/defs'
import {builtinToolCards} from '@conciv/ui-kit-chat-tools'
import {concivToolCards} from '@conciv/tools/cards'
import {coreToolCards} from '@conciv/core/cards'
import type {ToolCardEntry, ToolCatalogView} from '@conciv/protocol/tool-view-types'
import type {MarkerRow} from '@conciv/contract'
import type {ChatSession} from '@conciv/client'
import type {ChatMessage, SendContent} from '@conciv/protocol/chat-message-types'
import {HostApiProvider} from '@conciv/extension/host'
import type {Grab} from '@conciv/grab'
import {paneAttachments, returnUnsentToDraft} from './pane-attachments.js'
import {useAnnounce, useAppData, useConnected, useInstances, useLiveSessions, useRpc} from '../app/context.js'
import {useHarnesses, useSessionHarness} from '../data/harness-meta.js'
import {usePanelComposerFocus} from '../app/panel-focus.js'
import {usePane} from '../app/pane-context.js'
import {foldToolDuration} from './tool-durations.js'
import {toolFallbackCard} from './tool-fallback-card.js'
import {useComposerTriggerSources} from './trigger-sources.js'
import {CompactSpinner, ConversationSkeleton, Divider} from './indicators.js'
import {ComposerActionsPending} from '../shell/pending.js'
import {EmptyStateSlot} from '../shell/empty-state.js'
import {guardedToolCards} from '../extension/extension-boundary.js'
import {ExtensionSurface} from '../extension/extension-slots.js'
import {makePaneGrabApi} from '../extension/pane-grab.js'
import {ComposerActions} from '../composer/actions.js'
import {SessionModelPrompt, useModelMenu} from '../composer/model-selector.js'
import {useEngineNotices} from '../shell/notice-context.js'
import {makeDraftStorage, type PaneDraftStorage} from './draft-storage.js'
import {useSessionCaptures} from './session-captures.js'
import {makeToolViewCtx} from './tool-view-ctx.js'
import {PendingApprovals} from './pending-approvals.js'
import type {ComposerInputHandle} from './composer-input-adapter.js'
import {PaneComposer} from './pane-composer.js'
import {OlderMessages} from './older-messages.js'
import {usePaneMessaging} from './use-pane-messaging.js'
import {RunErrorRow} from './run-error-row.js'
import {viewTabPanelAttributes} from './view-tab-ids.js'

const PAGE_SESSION: PageSessionConfig = {
  entry: pageSessionEntry,
  actNames: PAGE_ACT_TOOL_NAMES,
  toolPrefix: PAGE_TOOL_PREFIX,
}

const ABOVE_COMPOSER =
  'flex flex-row flex-wrap items-center min-h-0 shrink max-h-40 overflow-y-auto empty:hidden py-2 pe-5 ps-5 [background:var(--chat-queue-bg)] [border-block-start:1px_solid_var(--chat-line-soft)] [color:var(--chat-text-3)] [font-family:var(--chat-mono)] text-chat-xs leading-snug [&>*+*]:before:content-["·"] [&>*+*]:before:px-1 [&>*+*]:before:[color:var(--chat-separator)]'
const NOW_ROW = 'shrink-0 self-stretch min-w-0'
const THINKING_TITLE = 'Thinking…'
const RESPONDING_TITLE = 'Responding…'
const HARNESS_LABEL =
  'self-start ps-[var(--chat-trace-gutter)] text-chat-micro leading-loose [font-family:var(--chat-mono)] text-chat-faint'
const ERROR = 'flex gap-2 items-center text-chat-danger text-chat-sm anim-msg'
const LOAD_FAILED = 'Couldn’t load this conversation'

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

function DraftRestore(props: {
  storage: PaneDraftStorage
  draftKey: string
  input: () => ComposerInputHandle | undefined
}): JSX.Element {
  const context = useComposerContext()
  const controller = new AbortController()
  onCleanup(() => controller.abort())
  onMount(() => {
    const input = props.input
    const draftKey = props.draftKey
    void props.storage
      .restore((restored, edited) => {
        const draft = readComposerDraft(restored.snapshot, draftKey)
        if (!draft) return
        const untouched = !edited && context.snapshotDraft().draft === ''
        context.restoreDraft(draft)
        if (untouched) input()?.select(restored.selection)
      }, controller.signal)
      .catch((error: unknown) => {
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
    if (harnessId === undefined) return false
    return turns().some((turn) => turn.role === 'assistant' && (chat.harnessOf(turn.key) ?? harnessId) !== harnessId)
  })
  return (turn) => {
    if (!mixed() || turn.role !== 'assistant') return undefined
    const harnessId = chat.harnessOf(turn.key) ?? current()
    return harnessId === undefined ? undefined : harnesses.nameOf(harnessId)
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
  const opened = createMemo<OpenedChat | undefined>(
    (previous) => ({chat: pane.chat(), reopened: previous !== undefined}),
    undefined,
    {equals: (previous, next) => previous?.chat === next?.chat},
  )
  return (
    <Show when={opened()} keyed>
      {(current) => <OpenedChatPane opened={current} sessionId={props.sessionId} viewTab={props.viewTab} />}
    </Show>
  )
}

function OpenedChatPane(props: {opened: OpenedChat; sessionId: string; viewTab?: string}): JSX.Element {
  const rpc = useRpc()
  const appData = useAppData()
  const announce = useAnnounce()
  const connected = useConnected()
  const {reachability, notices} = useEngineNotices()
  const instances = useInstances()
  const pane = usePane()
  const sessionId = untrack(() => props.sessionId)
  const harness = useSessionHarness(() => sessionId)
  const chat = pane.chat()

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

  const markers = useQuery(() => appData.utils.markers.list.queryOptions({input: {sessionId}}))
  const registryCatalog = useQuery(() => ({...appData.utils.registry.catalog.queryOptions(), enabled: connected()}))
  const catalog: ToolCatalogView = {
    loaded: () => registryCatalog.data !== undefined,
    meta: (name) => registryCatalog.data?.find((signature) => signature.name === name),
  }
  const captures = useSessionCaptures(sessionId)
  const draftStorage = makeDraftStorage(rpc, sessionId)

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
    harnessId: () => harness()?.id ?? '',
    catalog,
    sendMessage: (text) => void chat.sendMessage(text),
    decide: (approvalId, approved, scope) => chat.decide(approvalId, approved, scope),
    onError: () => notices.notify('That permission request is no longer waiting for an answer.', {tone: 'warn'}),
    addResult: (toolCallId, value) => messaging.uiReply.mutate({toolCallId, value}),
    durationFor: (part, previous) => foldToolDuration(part, previous, Date.now),
    captureFor: captures.lookup,
  })

  const extensionToolCards = guardedToolCards(instances.map((instance) => instance.extension))
  const tools = (): ToolCardEntry[] => [
    ...extensionToolCards,
    ...concivToolCards,
    ...coreToolCards,
    ...builtinToolCards,
  ]

  const compacting = messaging.compacting

  const focusInput = () => requestAnimationFrame(() => inputHandle()?.focus())
  const modelMenu = useModelMenu(focusInput)
  const commandSources = useComposerTriggerSources({
    sessionId,
    openModelMenu: () => modelMenu.popover().setOpen(true),
  })
  const sendOrRunCommand = async (content: string | SendContent): Promise<void> => {
    if (typeof content === 'string' && commandSources.runTyped(content)) return
    await messaging.onSend(content)
  }
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
  const imageInput = () => harness()?.imageInput
  const attachments = createMemo(() =>
    paneAttachments(
      instances.map((instance) => instance.extension),
      imageInput(),
    ),
  )
  const PaneAttachment = (slotProps: {removable?: boolean}): JSX.Element => (
    <AttachmentByMime cards={attachments().chips} removable={slotProps.removable} />
  )
  const stageGrab = (grab: Grab) => {
    pane.grabStaging.stage(grab)
    focusInput()
  }
  const paneGrab = makePaneGrabApi(pane.grabStaging, pane.grabProvider)

  const renderDivider = (row: MarkerRow): JSX.Element => <Divider kind={row.kind} />
  const markerRowsAfter = markersAfter(chat, () => markers.data ?? [])

  const PaneBody = (): JSX.Element => {
    const thread = useThread()
    const lastTurn = () => thread.turns.at(-1)?.turn()
    const outOfBandAsks = createMemo(
      () =>
        chat
          .pendingApprovals()
          .filter((ask) => !lastTurn()?.parts.some((part) => part.type === 'tool-call' && part.id === ask.toolCallId)),
      [],
      {equals: sameEntries},
    )
    createEffect<number>((previous) => {
      const waiting = outOfBandAsks().length
      if (waiting > previous) announce('conciv is asking for permission.')
      return waiting
    }, 0)
    const narrationTitle = createMemo(() => {
      const call = narrating() ? activeToolCall(lastTurn()) : null
      if (call) return nowTitle(call, catalog)
      return isThinking() ? THINKING_TITLE : RESPONDING_TITLE
    })
    const composerPlaceholder = () => (thread.isEmpty ? 'Ask a question…' : 'Add an instruction…')
    const lastMessage = () => lastTurn()?.messages.at(-1)
    const trailingAnchor = createMemo(() => ((markers.data?.length ?? 0) > 0 ? lastMessage()?.id : undefined))
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
    return (
      <div class="contents">
        <ExtensionSurface name="header" instances={instances} />
        <ExtensionSurface name="widget" instances={instances} />
        <div
          {...viewTabPanelAttributes(props.viewTab)}
          onAnimationEnd={resetSlideOnSelf(pane.resetSlide)}
          class={`chat-density flex flex-1 flex-col min-h-0 ${pane.slideClass()}`}
        >
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
                      <EmptyStateSlot onStarter={(starter) => void chat.sendMessage(starter)} instances={instances} />
                    </Thread.Welcome>
                  </Show>
                  <Thread.Messages
                    tools={tools()}
                    attachmentCards={attachments().cards}
                    components={{ToolFallback: toolFallbackCard}}
                    turnPrefix={renderTurnPrefix}
                    pageSession={PAGE_SESSION}
                  />
                  <Show when={lastTurnStopped()}>
                    <Divider kind="stopped" />
                  </Show>
                  <Show when={!chat.loadFailed()}>
                    <For each={markerRowsAfter(trailingAnchor())}>{renderDivider}</For>
                  </Show>
                  <Show when={compacting()}>
                    <Divider kind="compact" pending />
                  </Show>
                  <Show when={outOfBandAsks().length > 0}>
                    <PendingApprovals asks={outOfBandAsks()} ctx={toolCtx} />
                  </Show>
                  <Show when={narrating()}>
                    <div class={NOW_ROW}>
                      <NowLine title={narrationTitle()} />
                    </div>
                  </Show>
                  <Show when={messaging.visibleError()}>
                    {(error) => (
                      <Show when={!chat.loadFailed()} fallback={<LoadFailedAlert busy={false} sessionId={sessionId} />}>
                        <RunErrorRow
                          error={error()}
                          compacting={compacting()}
                          onRetry={() => void chat.reload()}
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
                <ExtensionSurface name="status" instances={instances} />
                <ExtensionSurface name="footer" instances={instances} />
              </div>
              <Suspense>
                <PaneComposer
                  draftStorage={draftStorage.storage}
                  draftKey={sessionId}
                  placeholder={composerPlaceholder()}
                  inputLabel="Message the conciv agent"
                  attachmentAdapter={attachments().adapter}
                  AttachmentComponent={PaneAttachment}
                  onInputReady={setInputHandle}
                  onSelectionChange={draftStorage.noteSelection}
                  busy={compactingIndicator(compacting())}
                  triggers={commandSources.triggers}
                  prompt={<SessionModelPrompt sessionId={sessionId} menu={modelMenu} running={narrating()} />}
                >
                  <DraftRestore storage={draftStorage} draftKey={sessionId} input={inputHandle} />
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
              </Suspense>
            </Thread.Composer>
          </Thread>
        </div>
      </div>
    )
  }

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
              onSend: sendOrRunCommand,
              onSendError: messaging.onSendError,
              onCancel: () =>
                void chat.interruptAndFlush().then((unsent) => returnUnsentToDraft(unsent, {insert, addFile: attach})),
            }}
          >
            <PaneBody />
          </ComposerHandlersProvider>
        </ToolProvider>
      </ChatProvider>
    </HostApiProvider>
  )
}

function ConversationLoading(props: {reopened: boolean; sessionId: string}): JSX.Element {
  return (
    <Show when={props.reopened} fallback={<ConversationSkeleton />}>
      <LoadFailedAlert busy sessionId={props.sessionId} />
    </Show>
  )
}

function LoadFailedAlert(props: {busy: boolean; sessionId: string}): JSX.Element {
  const liveSessions = useLiveSessions()
  return <PaneAlert message={LOAD_FAILED} busy={props.busy} onRetry={() => liveSessions.reopen(props.sessionId)} />
}

function PaneAlert(props: {message: string; busy: boolean; onRetry: () => void}): JSX.Element {
  return (
    <div class={ERROR} role="alert">
      <span class="flex-1">{props.message}</span>
      <Button
        variant="outline-danger"
        size="sm"
        class="shrink-0 min-h-8 font-semibold"
        disabled={props.busy}
        aria-busy={props.busy}
        onClick={() => props.onRetry()}
      >
        {props.busy ? 'Retrying…' : 'Retry'}
      </Button>
    </div>
  )
}
