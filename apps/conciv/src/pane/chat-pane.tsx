import {
  createEffect,
  createMemo,
  For,
  onCleanup,
  onMount,
  Show,
  Suspense,
  untrack,
  type Component,
  type JSX,
} from 'solid-js'
import {useMutation, useQuery} from '@tanstack/solid-query'
import {useChatSession} from '@conciv/client'
import {
  AttachmentByMime,
  ChatProvider,
  ComposerHandlersProvider,
  NowLine,
  Thread,
  ToolProvider,
  pairResults,
  useComposerContext,
  type AttachmentAdapter,
  type Turn,
} from '@conciv/ui-kit-chat'
import {builtinToolCards, nowTitle} from '@conciv/ui-kit-chat-tools'
import type {MessagePart, MultimodalContent, ToolCallPart, ToolResultPart} from '@tanstack/ai-client'
import type {ToolCardEntry, ToolCatalogView, ToolViewCtx} from '@conciv/protocol/tool-view-types'
import type {UiAnswerValue} from '@conciv/protocol/ui-types'
import type {MarkerRow} from '@conciv/contract'
import {collectToolRenderers, HostApiProvider} from '@conciv/extension'
import {Button} from '@conciv/ui-kit-system'
import type {Grab} from '@conciv/grab'
import {paneAttachments} from './pane-attachments.js'
import type {AttachmentCardSlot} from '@conciv/ui-kit-chat'
import {resolveGrabSource} from './grab-source-resolve.js'
import {useAnnounce, useAppData, useConnected, useInstances, useRpc} from '../app/context.js'
import {usePanelComposerFocus} from '../app/panel-focus.js'
import {usePane, type StagedGrab} from '../app/pane-context.js'
import {makeConcivUiCard} from './conciv-ui-card.js'
import {foldToolDurations} from './tool-durations.js'
import {ToolFallbackCard} from './tool-fallback-card.js'
import {useComposerTriggerSources} from './trigger-sources.js'
import {GrabReference} from './grab-reference.js'
import {CompactSpinner, ConversationSkeleton, Divider, ThinkingBubble} from './indicators.js'
import {EmptyStateSlot} from '../shell/empty-state.js'
import {ExtensionSurface} from '../extension/extension-slots.js'
import {makePaneGrabApi} from '../extension/pane-grab.js'
import {ComposerActions} from '../composer/actions.js'
import {SessionModelSelector} from '../composer/model-selector.js'
import {NoticeToaster, notify} from '../shell/notices.js'
import {EngineStaleNotice} from '../shell/engine-notice.js'
import {makeDraftStorage, restoredDraft, type RestoredDraft} from './draft-storage.js'
import type {ComposerInputHandle, ComposerTriggerSources, SelectionOffsets} from './composer-input-adapter.js'
import {PaneComposer} from './pane-composer.js'
import {checkSend, type SendVerdict} from './send-checks.js'

const GRAB_PREVIEW_MAX_W = 280

const ERROR = 'flex gap-2 items-center text-pw-danger text-[0.75rem] anim-msg'

function ErrorNotice(props: {message: string; retryLabel: string; onRetry: () => void}): JSX.Element {
  return (
    <div class={ERROR} role="alert">
      <span class="flex-1">{props.message}</span>
      <Button variant="outline-danger" size="md" class="shrink-0" onClick={props.onRetry}>
        {props.retryLabel}
      </Button>
    </div>
  )
}

type SendRejection = {rejected: true; message: string | null; tone: 'info' | 'warn'}

function sendRejection(verdict: Extract<SendVerdict, {ok: false}>): SendRejection {
  return {rejected: true, message: verdict.message, tone: verdict.tone}
}

function isSendRejection(failure: unknown): failure is SendRejection {
  return typeof failure === 'object' && failure !== null && 'rejected' in failure && failure.rejected === true
}

function failureMessage(failure: unknown): string {
  if (failure instanceof Error && failure.message.length > 0) return failure.message
  return 'The message could not be sent.'
}

function resetSlideOnSelf(reset: () => void) {
  return (event: AnimationEvent) => {
    if (event.target === event.currentTarget) reset()
  }
}

function callSettled(part: ToolCallPart, result: ToolResultPart | undefined): boolean {
  return result?.state === 'complete' || result?.state === 'error' || part.output !== undefined
}

function activeCallTitle(
  parts: ReadonlyArray<MessagePart>,
  catalog: ToolCatalogView,
  titleByName: Record<string, string>,
): string | null {
  const {byCallId} = pairResults(parts)
  let title: string | null = null
  for (const part of parts) {
    if (part.type !== 'tool-call' || !part.id) continue
    title = callSettled(part, byCallId.get(part.id)) ? title : nowTitle(part, catalog, titleByName)
  }
  return title
}

function streamingTitle(
  messages: ReadonlyArray<{role: string; parts: ReadonlyArray<MessagePart>}>,
  catalog: ToolCatalogView,
  titleByName: Record<string, string>,
): string | null {
  const last = messages[messages.length - 1]
  if (!last || last.role !== 'assistant') return null
  return activeCallTitle(last.parts, catalog, titleByName)
}

function reportSendFailure(failure: unknown): void {
  if (isSendRejection(failure)) {
    if (failure.message) notify(failure.message, {tone: failure.tone === 'warn' ? 'warn' : 'info'})
    return
  }
  notify(failureMessage(failure), {tone: 'danger'})
}

function harnessIdOf(models: {harness: {id: string}} | undefined): string {
  return models?.harness.id ?? ''
}

function announceTurn(working: boolean, failure: Error | undefined, announce: (message: string) => void): void {
  if (working) {
    announce('conciv is thinking…')
    return
  }
  if (!failure) announce('conciv replied.')
}

function reportableError(failure: Error | undefined): Error | undefined {
  return failure && failure.message !== 'stopped' ? failure : undefined
}

function renderDivider(row: MarkerRow): JSX.Element {
  return <Divider kind={row.kind} />
}

function grabTexts(grabs: ReadonlyArray<StagedGrab>): string[] {
  return grabs.map((grab) => grab.text)
}

type ComposerApi = {
  addAttachment: (file: File) => Promise<void>
}

function ComposerWiring(props: {onReady: (api: ComposerApi) => void}): JSX.Element {
  const pane = usePane()
  const context = useComposerContext()
  onMount(() => {
    props.onReady({addAttachment: context.addAttachment})
    for (const file of pane.attachments.drain()) void context.addAttachment(file)
  })
  createEffect(() => context.setGrabs(grabTexts(pane.grabStore.grabs())))
  return <></>
}

function DraftHydration(props: {
  draft: RestoredDraft
  restore: (text: string, selection: SelectionOffsets) => void
}): JSX.Element {
  const pane = usePane()
  const context = useComposerContext()
  onMount(() => {
    if (context.snapshotDraft().draft !== '' || pane.grabStore.grabs().length > 0) return
    props.restore(props.draft.text, props.draft.selection)
    if (props.draft.grabs.length > 0) pane.grabStore.stageTexts(props.draft.grabs)
  })
  return <></>
}

type TranscriptSectionProps = {
  connected: boolean
  tools: ToolCardEntry[]
  attachmentCards: AttachmentCardSlot[]
  turnPrefix: (turn: Turn) => JSX.Element
  trailingDividers: MarkerRow[]
  compacting: boolean
  thinking: boolean
  nowTitle: string | null
  error: Error | undefined
  onStarter: (starter: string) => void
  onStop: () => void
  onReload: () => void
}

function TranscriptSection(props: TranscriptSectionProps): JSX.Element {
  const instances = useInstances()
  return (
    <Suspense>
      <Thread.Welcome>
        <Show when={props.connected} fallback={<ConversationSkeleton />}>
          <EmptyStateSlot onStarter={props.onStarter} instances={instances} />
        </Show>
      </Thread.Welcome>
      <Thread.Messages
        tools={props.tools}
        attachmentCards={props.attachmentCards}
        components={{ToolFallback: ToolFallbackCard}}
        turnPrefix={props.turnPrefix}
      />
      <For each={props.trailingDividers}>{renderDivider}</For>
      <Show when={props.compacting}>
        <Divider kind="compact" pending />
      </Show>
      <Show when={props.thinking}>
        <ThinkingBubble />
      </Show>
      <Show when={props.nowTitle}>{(title) => <NowLine title={title()} onStop={props.onStop} />}</Show>
      <Show when={props.error}>
        {(failure) => <ErrorNotice message={failure().message} retryLabel="Retry" onRetry={props.onReload} />}
      </Show>
    </Suspense>
  )
}

type ComposerSectionProps = {
  sessionId: string
  attachmentAdapter: AttachmentAdapter | undefined
  AttachmentComponent: Component<{removable?: boolean}>
  triggers: ComposerTriggerSources
  compacting: boolean
  onCompact: () => void
  onStageGrab: (grab: Grab) => void
  onInputReady: (handle: ComposerInputHandle) => void
  onComposerApi: (api: ComposerApi) => void
  onRestoreDraft: (text: string, selection: SelectionOffsets) => void
}

function ComposerSection(props: ComposerSectionProps): JSX.Element {
  const rpc = useRpc()
  const appData = useAppData()
  const pane = usePane()
  const instances = useInstances()
  const sessionId = untrack(() => props.sessionId)
  const persistedDraft = useQuery(() => ({
    ...appData.utils.drafts.get.queryOptions({input: {sessionId}}),
    retry: 1,
  }))
  const draftStorage = makeDraftStorage(rpc, sessionId)
  const restorable = () => restoredDraft(persistedDraft.data)
  return (
    <>
      <ExtensionSurface name="status" instances={instances} />
      <ExtensionSurface name="footer" instances={instances} />
      <NoticeToaster />
      <EngineStaleNotice />
      <For each={pane.grabStore.grabs()}>
        {(grab) => (
          <GrabReference grab={grab} maxWidth={GRAB_PREVIEW_MAX_W} onRemove={() => pane.grabStore.remove(grab)} />
        )}
      </For>
      <Show when={persistedDraft.isError}>
        <ErrorNotice
          message="Your saved draft could not be loaded."
          retryLabel="Retry"
          onRetry={() => void persistedDraft.refetch()}
        />
      </Show>
      <PaneComposer
        draftStorage={draftStorage.storage}
        draftKey={sessionId}
        placeholder="Ask a question…"
        inputLabel="Message the conciv agent"
        attachmentAdapter={props.attachmentAdapter}
        AttachmentComponent={props.AttachmentComponent}
        onInputReady={props.onInputReady}
        onSelectionChange={draftStorage.noteSelection}
        busy={props.compacting ? <CompactSpinner /> : undefined}
        triggers={props.triggers}
      >
        <Suspense>
          <ComposerActions
            sessionId={sessionId}
            compacting={props.compacting}
            onCompact={props.onCompact}
            onNewSession={() => pane.newSession()}
            onStageGrab={props.onStageGrab}
          />
          <ExtensionSurface name="composer" instances={instances} />
          <SessionModelSelector sessionId={sessionId} />
          <ComposerWiring onReady={props.onComposerApi} />
          <Show when={restorable()}>
            {(payload) => <DraftHydration draft={payload()} restore={props.onRestoreDraft} />}
          </Show>
        </Suspense>
      </PaneComposer>
    </>
  )
}

export function ChatPane(props: {sessionId: string}): JSX.Element {
  const rpc = useRpc()
  const appData = useAppData()
  const announce = useAnnounce()
  const connected = useConnected()
  const instances = useInstances()
  const pane = usePane()
  const sessionId = untrack(() => props.sessionId)
  const chat = useChatSession({rpc, sessionId})

  const isThinking = () => chat.status() === 'submitted'
  const isStreaming = () => chat.status() === 'streaming'
  const working = () => isThinking() || isStreaming()
  const disconnected = () => chat.connectionStatus() !== 'connected'

  const panelFocus = usePanelComposerFocus()
  let inputHandle: ComposerInputHandle | undefined
  onCleanup(() => {
    if (inputHandle) panelFocus?.release(inputHandle)
  })
  const composerApi = {current: null as ComposerApi | null}

  const markers = useQuery(() => appData.utils.markers.list.queryOptions({input: {sessionId}}))
  const meta = useQuery(() => appData.utils.meta.models.queryOptions())
  const registryCatalog = useQuery(() => ({...appData.utils.registry.catalog.queryOptions(), enabled: connected()}))
  const catalog: ToolCatalogView = {
    loaded: () => registryCatalog.data !== undefined,
    meta: (name) => registryCatalog.data?.find((signature) => signature.name === name),
  }

  const startedAt = new Map<string, number>()
  const durations = createMemo<Record<string, number>>(
    (prev) => foldToolDurations(chat.messages(), startedAt, Date.now, prev),
    {},
  )

  const toolCtx: ToolViewCtx = {
    apiBase: '',
    harnessId: harnessIdOf(meta.data),
    sendMessage: (text) => void chat.sendMessage(text),
    catalog,
    respondApproval: (approvalId, approved) => {
      void rpc.chat.permissionDecision({approvalId, approved}).catch(() => {})
    },
    durationFor: (toolCallId) => durations()[toolCallId],
  }

  const uiReply = useMutation(() => ({
    mutationFn: (input: {toolCallId: string; value: UiAnswerValue}) =>
      rpc.chat.uiReply({sessionId, toolCallId: input.toolCallId, value: input.value}),
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
  const nowTitleText = (): string | null =>
    isStreaming() ? streamingTitle(chat.messages(), catalog, streamTitles()) : null

  createEffect<boolean>((was) => {
    const now = working()
    if (now === was) return was
    appData.invalidateSessions()
    if (!now) void markers.refetch()
    announceTurn(now, chat.error(), announce)
    return now
  }, false)

  const visibleError = () => reportableError(chat.error())

  const compact = useMutation(() => ({
    mutationFn: () => rpc.sessions.compact({sessionId}),
    onError: () => notify('Compaction failed. The session may be busy. Try again in a moment.'),
    onSettled: () => {
      appData.invalidateSessions()
      void markers.refetch()
    },
  }))
  const compacting = () => compact.isPending

  const triggerSources = useComposerTriggerSources(sessionId)
  const focusInput = () => requestAnimationFrame(() => inputHandle?.focus())
  const insert = (text: string) => {
    inputHandle?.append(text)
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
  const groundGrab = async (grab: Grab): Promise<void> => {
    const grounded = await resolveGrabSource(grab, (input) => rpc.page.symbolicate(input))
    if (!grounded) return
    pane.grabStore.replace(grab, grounded)
  }
  const stageGrab = (grab: Grab) => {
    pane.grabStore.stage(grab)
    focusInput()
    void groundGrab(grab)
  }
  const paneGrab = makePaneGrabApi(pane.grabStore, pane.grabProvider)

  const dividersAt = (count: number): MarkerRow[] => (markers.data ?? []).filter((row) => row.afterTurn === count)
  const dividersInRange = (start: number, end: number): MarkerRow[] =>
    (markers.data ?? []).filter((row) => row.afterTurn >= start && row.afterTurn <= end)

  const onSend = async (content: string | MultimodalContent) => {
    const verdict = checkSend(content, {
      busy: compacting(),
      connected: chat.connectionStatus() === 'connected',
    })
    if (!verdict.ok) throw sendRejection(verdict)
    await chat.sendMessage(content)
    pane.grabStore.clear()
  }

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
              onSend,
              onSendError: reportSendFailure,
              onRefresh: () => chat.refresh(),
              onCancel: () => chat.stop(),
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
                    <TranscriptSection
                      connected={!disconnected()}
                      tools={tools()}
                      attachmentCards={attachments().cards}
                      turnPrefix={renderTurnPrefix}
                      trailingDividers={dividersAt(chat.messages().length)}
                      compacting={compacting()}
                      thinking={isThinking()}
                      nowTitle={nowTitleText()}
                      error={visibleError()}
                      onStarter={(starter) => void chat.sendMessage(starter)}
                      onStop={() => chat.stop()}
                      onReload={() => void chat.reload()}
                    />
                  </Thread.Viewport>
                  <Thread.Composer>
                    <ComposerSection
                      sessionId={sessionId}
                      attachmentAdapter={attachments().adapter}
                      AttachmentComponent={PaneAttachment}
                      triggers={triggerSources}
                      compacting={compacting()}
                      onCompact={() => compact.mutate()}
                      onStageGrab={stageGrab}
                      onInputReady={(handle) => {
                        inputHandle = handle
                        panelFocus?.register(handle)
                      }}
                      onComposerApi={(api) => {
                        composerApi.current = api
                      }}
                      onRestoreDraft={(text, selection) => inputHandle?.restore(text, selection)}
                    />
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
