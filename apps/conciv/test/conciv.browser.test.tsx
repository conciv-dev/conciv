import '../src/styles.css'
import {expect, test, vi, it, afterAll, afterEach, beforeAll, describe} from 'vitest'
import {page, userEvent, page as browserPage, type Locator} from 'vitest/browser'
import {CONCIV_SESSION_HEADER, type HarnessModelInfo, HarnessSessionId} from '@conciv/protocol/chat-types'
import {makeRpcClient, type RpcClient, type DraftRow, type EngineStaleness} from '@conciv/contract'
import {until} from '@conciv/harness-testkit/until'
import {ChatPane} from '../src/pane/chat-pane.js'
import {
  bootedCore,
  keptPane,
  coreControl,
  coreRpc,
  createSession,
  mountPane,
  type PaneMount,
  sendTurn,
  pinViewportToBottom,
  threadViewportElement,
  topEdgeRowIndex,
  topEdgeRowOffset,
  watchViewportScroll,
  type CalmWatch,
  forceReducedMotion,
  watchTextGrowth,
  STREAMED_CODE_CLOSING,
  STREAMED_TEXT_CHUNK,
  STREAMED_TEXT_PACE_MS,
  core,
  input,
  mountChatPane,
  multiToolStep,
  type ScriptedToolStep,
  newSession,
  promptWith,
  registerCalmCore,
  seedThread,
  startBoundaryRun,
  startHeldToolRun,
  startMultiToolRun,
  stopButton,
  streamCodeAnswer,
  streamedCodeAnswer,
  watchCalm,
  runTurn,
  seedDraft,
  grabProviderFor,
  HERO_GRAB,
  HERO_LABEL,
  persistedGrab,
  PRICING_GRAB,
  PRICING_LABEL,
  type PaneMountOptions,
  trackedFaults,
  createShellHarness,
  memoryStorage,
  expectRetryRecovers,
  type ShellMountOptions,
  makeAppContextValue,
} from './helpers.browser.js'
import {render} from '@solidjs/testing-library'
import {
  type JSX,
  createSignal,
  onMount,
  type Component,
  createMemo,
  For,
  createEffect,
  createRoot,
  createComputed,
  type Accessor,
  Show,
  batch,
} from 'solid-js'
import {
  AttachmentByMime,
  AttachmentProvider,
  type CompleteAttachment,
  ChatProvider,
  Composer,
  ComposerHandlersProvider,
  useComposerContext,
  type AttachmentAdapter,
  SCROLL_END_THRESHOLD_PX,
  VIRTUALIZE_THRESHOLD,
  type AttachmentState,
  ComposerActions as ComposerActionsPrimitive,
  ComposerActionsHost,
  type SessionStatus,
  Thread,
  type AttachmentCardSlot,
  useComposer,
} from '@conciv/ui-kit-chat'
import './utilities.css'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {useChatSession} from '@conciv/client'
import {
  defineAttachment,
  defineExtension,
  collectToolRenderers,
  getExtensionApi,
  type RegisterExtension,
  defineTool,
} from '@conciv/extension'
import {paneAttachments, returnUnsentToDraft} from '../src/pane/pane-attachments.js'
import type {ContentPart, ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import {
  type ToolCardEntry,
  INERT_TOOL_CATALOG,
  type ToolCatalogView,
  type ToolViewCtx,
} from '@conciv/protocol/tool-view-types'
import {
  CardChromeProvider,
  INERT_TOOL_CTX,
  ToolCallCard,
  ToolTraceRow,
  INERT_ADD_RESULT,
  ToolCard,
} from '@conciv/ui-kit-chat/tools'
import {builtinToolCards} from '@conciv/ui-kit-chat-tools'
import {concivToolCards, UiCard} from '@conciv/tools/cards'
import {coreToolCards, CodeRunCard, EXECUTE_TOOL_NAME} from '@conciv/core/cards'
import pageExtensionEntry from '@conciv/extension-page'
import pageExtension from '@conciv/extension-page/client'
import {GRAB_FILE_NAME, GRAB_MIME, grabToFile, MAX_PAYLOAD_BYTES, parseGrabPayload} from '@conciv/grab/grab-attachment'
import type {Grab, GrabApi} from '@conciv/grab'
import {QueueStrip} from '../src/pane/queue-strip.js'
import {RefreshButton} from '../src/shell/refresh-button.js'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'
import {ContextSummary, ContextTracker} from '../src/pane/context-tracker.js'
import '@conciv/ui-kit-system/tokens.css'
import {EngineStaleNotice} from '../src/shell/engine-notice.js'
import {makeGrabStaging, type ComposerGrabPort, type GrabStaging} from '../src/pane/grab-staging.js'
import {makePaneGrabApi} from '../src/extension/pane-grab.js'
import {ThinkingBubble} from '../src/pane/indicators.js'
import type {UiAnswerValue} from '@conciv/protocol/ui-types'
import {createNoticeStore, type Notify} from '../src/shell/notices.js'
import {QuickTerminalHeader} from '../src/routes/quick.js'
import {HostApiProvider} from '@conciv/extension/host'
import {ComposerActions} from '../src/composer/actions.js'
import {LaunchMenu} from '../src/composer/launch-menu.js'
import {makeLiveSessions, type LiveSessions} from '../src/app/live-sessions.js'
import {ModelSelectorView} from '../src/composer/model-selector.js'
import {
  createChat,
  createChatSession,
  type ChatSession,
  type ChatSessionConnection,
  type ChatSessionHydration,
} from '@conciv/ai/client'
import {createTextChunks, storyConnection} from '@conciv/ai/testkit'
import {EngineReachabilityContext} from '../src/app/reachability.js'
import {PaneComposer} from '../src/pane/pane-composer.jsx'
import type {ComposerInputHandle} from '../src/pane/composer-input-adapter.jsx'
import type {RunClockSource} from '@conciv/protocol/chat-event-types'
import {z} from 'zod'
import {guardedToolCards} from '../src/extension/extension-boundary.js'
import {RouterProvider, createMemoryHistory} from '@tanstack/solid-router'
import {parseConcivSettings} from '../src/data/settings.js'
import {createConcivRouter, disposeConcivRouter} from '../src/router.js'
import {AppContext, type AppContextValue} from '../src/app/context.js'
import {trackSessionActivity} from '../src/pane/session-activity.js'
import {SessionSelector} from '../src/composer/session-selector.js'
import {StatusBar} from '../src/pane/status-bar.jsx'
import {viewTabId, viewTabPanelId} from '../src/pane/view-tab-ids.js'
import {concivExtensionsToolDef, concivUiToolDef} from '@conciv/tools/defs'
import {BUILTIN_OPEN_TOOL, BUILTIN_SERVER_TOOLS} from '@conciv/tools/builtins'
import {createToolRegistry} from '@conciv/extension/registry'
import {PAGE_TOOL_DEFS} from '@conciv/extension-page/defs'
import {createWebStorageHistory, type WebStorage} from '@conciv/storage-history'

describe('approval replay', () => {
  const core = bootedCore('approval-replay')
  const keep = keptPane()

  const permissionRequest = () => page.getByRole('group', {name: 'Permission request'})
  const approveButton = () => page.getByRole('button', {name: 'Approve'})
  const composer = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

  async function newSession(): Promise<{rpc: RpcClient; sessionId: string}> {
    const sessionId = await createSession(coreRpc(core()))
    return {rpc: makeRpcClient(core(), {headers: {[CONCIV_SESSION_HEADER]: sessionId}}), sessionId}
  }

  async function attachedPane(sessionId: string): Promise<PaneMount> {
    const attached = await coreControl.pushSocketsOpened()
    const mount = mountPane({base: core(), sessionId}, () => <ChatPane sessionId={sessionId} />)
    await until(async () => (await coreControl.pushSocketsOpened()) > attached, {hangGuardMs: 20_000})
    return mount
  }

  async function refusedOutsideCall(rpc: RpcClient, sessionId: string, file: string): Promise<string> {
    expect(await coreControl.outsideReload(sessionId, file)).toBe('APPROVAL_DENIED')
    const pending = (await rpc.chat.hydrate({sessionId})).pendingApprovals
    expect(pending.map((approval) => approval.runId)).toEqual([null])
    const askedId = pending[0]?.approvalId
    if (askedId === undefined) throw new Error('the refused call left no pending ask')
    return askedId
  }

  test('an ask from a chat turn sits in the strip, and approving it posts the message that retries', async () => {
    const {sessionId} = await newSession()
    keep(await attachedPane(sessionId))
    await coreControl.scriptTurn({toolCalls: [], text: 'That needs your approval.'})
    await coreControl.scriptCustomEvent('approval-requested', {
      approvalId: 'turn-ask',
      title: 'Approve Bash: rm -rf build',
      input: {command: 'rm -rf build'},
    })

    await composer().fill('delete the build directory')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect.element(page.getByText('That needs your approval.')).toBeVisible()
    await expect.element(permissionRequest(), {timeout: 15_000}).toBeVisible()

    await coreControl.scriptTurn({toolCalls: [], text: 'Deleted.'})
    await approveButton().click()
    await expect.element(permissionRequest(), {timeout: 15_000}).not.toBeInTheDocument()
    await expect.element(page.getByText('Approved: Bash: rm -rf build', {exact: true})).toBeVisible()
    await expect.element(page.getByText('Deleted.')).toBeVisible()
  }, 120_000)

  test('an ask from a chat turn sits in the strip, and denying it posts the message that re-runs the turn refused', async () => {
    const {sessionId} = await newSession()
    keep(await attachedPane(sessionId))
    await coreControl.scriptTurn({toolCalls: [], text: 'That needs your approval.'})
    await coreControl.scriptCustomEvent('approval-requested', {
      approvalId: 'turn-deny',
      title: 'Approve Bash: git push --force',
      input: {command: 'git push --force'},
    })

    await composer().fill('force push main')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect.element(permissionRequest(), {timeout: 15_000}).toBeVisible()

    await coreControl.scriptTurn({toolCalls: [], text: 'Understood, I will not force push.'})
    await page.getByRole('button', {name: 'Deny'}).click()
    await expect.element(permissionRequest(), {timeout: 15_000}).not.toBeInTheDocument()
    await expect.element(page.getByText('Denied: Bash: git push --force', {exact: true})).toBeVisible()
    await expect.element(page.getByText('Understood, I will not force push.')).toBeVisible()
  }, 120_000)

  test('a CLI ask names what it asks for in the strip, not the CLI that raised it', async () => {
    const {sessionId} = await newSession()
    keep(await attachedPane(sessionId))
    await coreControl.scriptTurn({toolCalls: [], text: 'The CLI wants to run a command.'})
    await coreControl.scriptCustomEvent('approval-requested', {
      approvalId: 'cli-ask',
      title: 'Approve Bash: touch qa-approval.txt',
      provider: 'claude-code',
      toolName: 'Bash',
    })

    await composer().fill('create the approval file')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect
      .element(permissionRequest().getByText('Approve Bash: touch qa-approval.txt'), {timeout: 15_000})
      .toBeVisible()
    await expect.element(permissionRequest().getByText('claude-code')).not.toBeInTheDocument()

    await page.getByRole('button', {name: 'Deny'}).click()
    await expect.element(permissionRequest(), {timeout: 15_000}).not.toBeInTheDocument()
  }, 120_000)

  test('an ask from outside a chat turn sits in the strip, and approving it lets the retry run with no message', async () => {
    const {rpc, sessionId} = await newSession()
    keep(await attachedPane(sessionId))

    await refusedOutsideCall(rpc, sessionId, 'src/out-of-band.ts')
    await expect.element(permissionRequest(), {timeout: 15_000}).toBeVisible()

    await approveButton().click()
    await expect.element(permissionRequest(), {timeout: 15_000}).not.toBeInTheDocument()
    expect(await coreControl.outsideReload(sessionId, 'src/out-of-band.ts')).toBe('NO_BUNDLER')
    expect((await rpc.chat.hydrate({sessionId})).lastRun).toBeNull()
    await expect.element(page.getByText(/^Approved/)).not.toBeInTheDocument()
  }, 120_000)

  test('a pane opened while the ask waits draws the card from hydrate', async () => {
    const {rpc, sessionId} = await newSession()
    const first = await attachedPane(sessionId)

    const askedId = await refusedOutsideCall(rpc, sessionId, 'src/waiting-ask.ts')
    first.dispose()

    keep(await attachedPane(sessionId))
    await expect.element(permissionRequest(), {timeout: 15_000}).toBeVisible()

    await rpc.chat.permissionDecision({approvalId: askedId, approved: false})
    expect(await coreControl.outsideReload(sessionId, 'src/waiting-ask.ts')).toBe('APPROVAL_DENIED')
  }, 120_000)

  test('a waiting ask survives a core restart and still draws its card', async () => {
    const {rpc, sessionId} = await newSession()
    keep(await attachedPane(sessionId))

    const askedId = await refusedOutsideCall(rpc, sessionId, 'src/replayed-ask.ts')
    await expect.element(permissionRequest(), {timeout: 15_000}).toBeVisible()

    const opened = await coreControl.pushSocketsOpened()
    await coreControl.restartCore()
    await until(async () => (await coreControl.pushSocketsOpened()) > opened, {hangGuardMs: 30_000})

    expect((await rpc.chat.hydrate({sessionId})).pendingApprovals.map((approval) => approval.approvalId)).toEqual([
      askedId,
    ])
    await expect.element(permissionRequest(), {timeout: 15_000}).toBeVisible()

    await rpc.chat.permissionDecision({approvalId: askedId, approved: false})
  }, 180_000)
})

describe('attachment dispatch', () => {
  function mount(element: () => JSX.Element): HTMLElement {
    return render(element).container
  }

  const complete: CompleteAttachment = {
    id: 'a',
    type: 'document',
    name: 'rec',
    contentType: 'application/x-test',
    status: {type: 'complete'},
    content: [{type: 'document', source: {type: 'data', mimeType: 'application/x-test', value: 'eyJ4IjoxfQ=='}}],
  }

  test('renders the matching card for a document mime', () => {
    const Card = (): JSX.Element => <span>test document player</span>
    const host = mount(() => (
      <AttachmentProvider value={complete}>
        <AttachmentByMime cards={[{mime: 'application/x-test', render: Card}]} />
      </AttachmentProvider>
    ))
    expect(host.textContent).toContain('test document player')
  })

  test('falls back to the generic tile for an unknown mime', () => {
    const host = mount(() => (
      <AttachmentProvider value={complete}>
        <AttachmentByMime cards={[]} />
      </AttachmentProvider>
    ))
    expect(host.querySelector('[aria-label="rec"]')).not.toBeNull()
  })
})

describe('attachment widget', () => {
  function fixtureExtension() {
    const attachment = defineAttachment({mime: 'application/x-fixture'})
    attachment.card((props) => (
      <div>
        <span>fixture player</span>
        {props.remove}
      </div>
    ))
    return defineExtension({name: 'fixture', attachments: [attachment]})
  }

  function AttachmentFeeder(props: {file: File}): JSX.Element {
    const composer = useComposerContext()
    onMount(() => void composer.addAttachment(props.file))
    return <></>
  }

  test('composer chip area renders the fixture card with a remove affordance', async () => {
    const {cards, adapter} = paneAttachments([fixtureExtension()], false)
    const file = new File(['{"x":1}'], 'fixture.bin', {type: 'application/x-fixture'})
    render(() => {
      const chat = useChatSession({
        rpc: makeRpcClient('http://127.0.0.1:9'),
        apiBase: 'http://127.0.0.1:9',
        sessionId: 'conciv_widget',
      })
      return (
        <ChatProvider chat={chat}>
          <ComposerHandlersProvider value={{onSend: () => {}, onCancel: () => {}}}>
            <Composer
              attachmentAdapter={adapter}
              AttachmentComponent={(slotProps) => <AttachmentByMime cards={cards} removable={slotProps.removable} />}
            >
              <AttachmentFeeder file={file} />
            </Composer>
          </ComposerHandlersProvider>
        </ChatProvider>
      )
    })
    await expect.element(page.getByText('fixture player'), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Remove fixture.bin'}), {timeout: 2000}).toBeVisible()
  })

  function crashingChipSetup() {
    const crashing = defineAttachment({mime: 'application/x-crashing'})
    crashing.card(() => {
      throw new Error('fixture crash')
    })
    const calm = defineAttachment({mime: 'application/x-fixture'})
    calm.card(() => <span>calm player</span>)
    const extension = defineExtension({name: 'crash-attachment', attachments: [crashing, calm]})
    return {
      ...paneAttachments([extension], false),
      crashingFile: new File(['{}'], 'crashing.bin', {type: 'application/x-crashing'}),
      calmFile: new File(['{}'], 'calm.bin', {type: 'application/x-fixture'}),
    }
  }

  function ComposerFixture(props: {
    adapter: AttachmentAdapter
    AttachmentComponent: Component<{removable?: boolean}>
    onSend?: (content: unknown) => void
    children: JSX.Element
  }): JSX.Element {
    const chat = useChatSession({
      rpc: makeRpcClient('http://127.0.0.1:9'),
      apiBase: 'http://127.0.0.1:9',
      sessionId: 'conciv_widget',
    })
    return (
      <ChatProvider chat={chat}>
        <ComposerHandlersProvider value={{onSend: (content) => props.onSend?.(content), onCancel: () => {}}}>
          <Composer attachmentAdapter={props.adapter} AttachmentComponent={props.AttachmentComponent}>
            {props.children}
          </Composer>
        </ComposerHandlersProvider>
      </ChatProvider>
    )
  }

  test('a throwing attachment card reads as a failed card in the thread and a failed chip in the composer', async () => {
    const crash = vi.spyOn(console, 'error').mockImplementation(() => {})
    const {cards, chips, adapter, crashingFile, calmFile} = crashingChipSetup()
    render(() => (
      <ComposerFixture
        adapter={adapter}
        AttachmentComponent={(slotProps) => (
          <>
            <section aria-label="thread card">
              <AttachmentByMime cards={cards} />
            </section>
            <section aria-label="composer chip">
              <AttachmentByMime cards={chips} removable={slotProps.removable} />
            </section>
          </>
        )}
      >
        <AttachmentFeeder file={crashingFile} />
        <AttachmentFeeder file={calmFile} />
      </ComposerFixture>
    ))
    const threadCards = page.getByRole('region', {name: 'thread card'})
    const composerChips = page.getByRole('region', {name: 'composer chip'})

    await expect.element(threadCards.getByText('This card failed to render'), {timeout: 2000}).toBeVisible()
    await expect.element(composerChips.getByText('calm player').first(), {timeout: 2000}).toBeVisible()
    await expect
      .element(composerChips.getByRole('button', {name: 'Failed to render crash-attachment'}), {timeout: 2000})
      .toBeVisible()
    expect(crash.mock.calls.filter((call) => call[0] === '[conciv] extension "crash-attachment" crashed').length).toBe(
      2,
    )
    crash.mockRestore()
  })

  test('removing a failed chip un-stages its attachment, so the next send carries none', async () => {
    const crash = vi.spyOn(console, 'error').mockImplementation(() => {})
    const {chips, adapter, crashingFile} = crashingChipSetup()
    render(() => {
      const [sent, setSent] = createSignal<string>()
      return (
        <>
          <ComposerFixture
            adapter={adapter}
            onSend={(content) => setSent(JSON.stringify(content))}
            AttachmentComponent={(slotProps) => <AttachmentByMime cards={chips} removable={slotProps.removable} />}
          >
            <AttachmentFeeder file={crashingFile} />
          </ComposerFixture>
          <p>sent {sent()}</p>
        </>
      )
    })
    const failedChip = page.getByRole('button', {name: 'Failed to render crash-attachment'})

    await expect.element(failedChip, {timeout: 2000}).toBeVisible()
    await page.screenshot({path: '__screenshots__/extension-boundary/failed-chip.png'})
    await page.getByRole('button', {name: 'Remove crashing.bin'}).click()
    await expect.element(failedChip).not.toBeInTheDocument()

    await page.getByRole('textbox').fill('no attachment here')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect.element(page.getByText('sent "no attachment here"'), {timeout: 2000}).toBeVisible()
    crash.mockRestore()
  })

  test('a failed chip names the extension whose card was selected, not an earlier declaration of the mime', async () => {
    const crash = vi.spyOn(console, 'error').mockImplementation(() => {})
    const declared = defineAttachment({mime: 'application/x-crashing'})
    const carded = defineAttachment({mime: 'application/x-crashing'})
    carded.card(() => {
      throw new Error('fixture crash')
    })
    const {chips, adapter} = paneAttachments(
      [
        defineExtension({name: 'declares-only', attachments: [declared]}),
        defineExtension({name: 'card-owner', attachments: [carded]}),
      ],
      false,
    )
    render(() => (
      <ComposerFixture
        adapter={adapter}
        AttachmentComponent={(slotProps) => <AttachmentByMime cards={chips} removable={slotProps.removable} />}
      >
        <AttachmentFeeder file={new File(['{}'], 'crashing.bin', {type: 'application/x-crashing'})} />
      </ComposerFixture>
    ))

    await expect.element(page.getByRole('button', {name: 'Failed to render card-owner'}), {timeout: 2000}).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Failed to render declares-only'})).not.toBeInTheDocument()
    crash.mockRestore()
  })
})

describe('calm contract', () => {
  const SHOTS = '__screenshots__/calm-contract'
  const MIN_CODE_GROWTH_STEPS = 10
  const BOUNDARY_EXCHANGES = Math.floor(VIRTUALIZE_THRESHOLD / 2)
  const VIEWPORT_HEIGHT_PX = 600
  const SCROLL_UP_PX = 600
  const STREAM_STEP_GROWTH_PX = 160
  const CATCH_UP_DISTANCE_BUDGET_PX = SCROLL_END_THRESHOLD_PX + STREAM_STEP_GROWTH_PX
  const MIN_SCROLL_SAMPLES = 20
  const SCROLL_GATE_STEPS = 24
  const SCROLL_GATE_PACE_MS = 100
  const SCROLL_GATE_TEXT_PACE_MS = 100
  const SCROLL_GATE_EXCHANGES = 24
  const CATCH_UP_FRAME_BUDGET = 3
  const FOLD_GATE_SCROLL_PX = 170
  const ROW_ROUNDING_TOLERANCE_PX = 4

  registerCalmCore('calm-contract')

  const sendButton = () => page.getByRole('button', {name: 'Send message'})
  const traceToggle = () => page.getByText(/^(Show|Hide) trace$/)
  const approvalStrip = () => page.getByRole('list', {name: 'Permission requests'})

  function expectCalm(watch: CalmWatch): void {
    expect(watch.removed()).toEqual([])
    expect(watch.drifted()).toEqual([])
    expect(watch.narrationGlyphs()).toBeLessThanOrEqual(1)
    expect(watch.shiftedAboveLiveRegion()).toEqual([])
  }

  test('surface immortality and stillness across a multi-tool run [mechanism A: card remount, tool-call-card.tsx:113-124]', async () => {
    const watch = await startMultiToolRun()
    await page.screenshot({path: `${SHOTS}/multi-tool-mid-stream.png`})
    expectCalm(watch)

    await coreControl.releaseTurn()
    await expect.element(page.getByText('All twenty steps are done.')).toBeVisible()
    await watch.checkpoint()
    await page.screenshot({path: `${SHOTS}/multi-tool-settled.png`})
    expectCalm(watch)
  })

  test('a second run leaves the first run untouched [mechanism B: wrong streaming bit, thread.tsx:275-279]', async () => {
    const {sessionId} = await newSession()
    await coreControl.scriptTurn({toolCalls: [{name: 'Bash', input: {command: 'ls'}}], text: 'First answer.'})
    mountChatPane(sessionId)

    await promptWith('first question')
    await expect.element(page.getByText('First answer.')).toBeVisible()
    const watch = watchCalm()
    await watch.checkpoint()

    await coreControl.scriptTurn({toolCalls: [{name: 'Read', input: {filePath: 'second.ts'}}], text: 'Second answer.'})
    await coreControl.holdTools()
    await coreControl.holdResults()
    await coreControl.holdTurn()
    await promptWith('second question')
    await expect.element(stopButton()).toBeVisible()
    await watch.checkpoint()
    expect(watch.removed()).toEqual([])
    await watch.checkpoint({rebaseline: true})

    await coreControl.releaseTools()
    await expect.element(page.getByText('second.ts', {exact: true})).toBeVisible()
    await watch.checkpoint()
    await coreControl.releaseResults()
    await expect.element(page.getByText('Second answer.', {exact: true})).toBeVisible()
    await watch.checkpoint()
    await page.screenshot({path: `${SHOTS}/interleave-mid-stream.png`})
    expectCalm(watch)

    await coreControl.releaseTurn()
    await watch.checkpoint()
    expectCalm(watch)
  })

  test('an approval pause stays calm with the ask in the strip, and its retry keeps the turn rows', async () => {
    const {sessionId} = await newSession()
    await coreControl.scriptTurn({
      toolCalls: [{name: 'Bash', input: {command: 'rm -rf build'}}],
      text: 'That needs your approval.',
    })
    await coreControl.scriptCustomEvent('approval-requested', {
      approvalId: 'calm-ask-1',
      title: 'Bash',
      input: {command: 'rm -rf build'},
    })
    mountChatPane(sessionId)

    await promptWith('delete the build directory')
    await expect.element(page.getByText('That needs your approval.')).toBeVisible()
    await expect.element(approvalStrip().getByRole('group', {name: 'Permission request'})).toBeVisible()
    await expect.element(sendButton()).toBeVisible()
    const watch = watchCalm()
    await watch.checkpoint({rebaseline: true})
    await watch.checkpoint()
    await page.screenshot({path: `${SHOTS}/approval-paused.png`})
    expectCalm(watch)
    const rows = [...document.querySelectorAll('[data-conciv-msg]')]

    await coreControl.scriptTurn({toolCalls: [], text: 'Approved and finished.'})
    await page.getByRole('button', {name: 'Approve'}).click()
    await expect.element(page.getByText('Approved and finished.')).toBeVisible()
    await expect.element(approvalStrip()).not.toBeInTheDocument()
    await page.screenshot({path: `${SHOTS}/approval-resumed.png`})
    expect(rows.filter((row) => !row.isConnected)).toEqual([])
  })

  test('a run parked on an unresolved tool call settles in place when the next run starts [mechanism A: card remount, tool-call-card.tsx:113-124]', async () => {
    const {sessionId} = await newSession()
    await coreControl.scriptToolCall('Bash', {command: 'sleep forever'})
    mountChatPane(sessionId)

    await promptWith('start something that never finishes')
    await expect.element(page.getByText('sleep forever', {exact: true})).toBeVisible()
    const watch = watchCalm()
    await watch.checkpoint()
    await page.screenshot({path: `${SHOTS}/parked-on-tool-call.png`})
    expectCalm(watch)

    await coreControl.scriptTurn({toolCalls: [], text: 'Picked up where the parked call stopped.'})
    await promptWith('carry on without it')
    await watch.checkpoint({rebaseline: true})
    await expect.element(page.getByText('Picked up where the parked call stopped.')).toBeVisible()
    await watch.checkpoint()
    await page.screenshot({path: `${SHOTS}/parked-resumed.png`})
    expectCalm(watch)
  })

  test('an error mid-run replaces nothing above the live region [mechanism B: wrong streaming bit, thread.tsx:275-279]', async () => {
    const {sessionId} = await newSession()
    await coreControl.scriptTurn({toolCalls: [{name: 'Bash', input: {command: 'ls'}}], text: 'never delivered'})
    mountChatPane(sessionId)

    const watch = watchCalm({allow: ['error-replacement']})
    await coreControl.holdTurn()
    await promptWith('run a tool then fail')
    await expect.element(stopButton()).toBeVisible()
    await watch.checkpoint({rebaseline: true})

    await coreControl.scriptError('the scripted run failed')
    await coreControl.releaseTurn()
    await expect.element(page.getByRole('alert').first()).toBeVisible()
    await watch.checkpoint()
    await page.screenshot({path: `${SHOTS}/error-mid-run.png`})
    expectCalm(watch)
  })

  test('cancelling a run settles every surface in place [mechanism B: wrong streaming bit, thread.tsx:275-279]', async () => {
    const {sessionId} = await newSession()
    await coreControl.scriptTurn({toolCalls: [{name: 'Bash', input: {command: 'ls'}}], text: 'partial answer'})
    mountChatPane(sessionId)

    const watch = await startHeldToolRun({
      prompt: 'start something cancellable',
      pending: 'ls',
      settled: 'partial answer',
    })
    await stopButton().click()
    await expect.element(page.getByRole('button', {name: 'Send message'})).toBeVisible()
    await watch.checkpoint()
    await page.screenshot({path: `${SHOTS}/cancelled.png`})
    expectCalm(watch)
  })

  test('a pane remounted mid-run rejoins without churning its surfaces [mechanism A: card remount, tool-call-card.tsx:113-124]', async () => {
    const {sessionId} = await newSession()
    await coreControl.scriptTurn({
      toolCalls: [{name: 'Bash', input: {command: 'rejoin probe'}}],
      text: 'Finished after reload.',
    })
    await coreControl.holdTools()
    await coreControl.holdResults()
    await coreControl.holdTurn()
    await sendTurn(core.base, sessionId, 'a turn started before the reload')

    mountChatPane(sessionId)
    await expect.element(input()).toBeVisible()
    await expect.element(stopButton()).toBeVisible()
    const watch = watchCalm()
    await watch.checkpoint()

    await coreControl.releaseTools()
    await expect.element(page.getByText('rejoin probe', {exact: true})).toBeVisible()
    await watch.checkpoint()

    await coreControl.releaseResults()
    await coreControl.releaseTurn()
    await expect.element(page.getByText('Finished after reload.')).toBeVisible()
    await watch.checkpoint()
    await page.screenshot({path: `${SHOTS}/reload-mid-run.png`})
    expectCalm(watch)
  })

  test('toggling the trace mid-run keeps the surrounding surfaces still [mechanism A: card remount, tool-call-card.tsx:113-124]', async () => {
    const {sessionId} = await newSession()
    await coreControl.scriptTurn({
      toolCalls: [
        {name: 'Bash', input: {command: 'ls'}},
        {name: 'Read', input: {filePath: 'calm.ts'}},
      ],
      text: 'The trace survived the toggle.',
    })
    mountChatPane(sessionId)

    const watch = watchCalm({allow: ['user-collapsed-trace']})
    await coreControl.holdTools()
    await coreControl.holdTurn()
    await promptWith('run two tools while I fold the trace')
    await expect.element(stopButton()).toBeVisible()
    await watch.checkpoint({rebaseline: true})

    await coreControl.releaseTools()
    await expect.element(traceToggle()).toBeVisible()
    await watch.checkpoint()
    await traceToggle().click()
    await expect.element(traceToggle()).toBeVisible()
    await watch.checkpoint({rebaseline: true})
    await traceToggle().click()
    await expect.element(traceToggle()).toBeVisible()
    await watch.checkpoint({rebaseline: true})
    await page.screenshot({path: `${SHOTS}/trace-toggled.png`})
    expectCalm(watch)

    await coreControl.releaseTurn()
    await expect.element(page.getByText('The trace survived the toggle.')).toBeVisible()
    await watch.checkpoint()
    expectCalm(watch)
  })

  test('a run under reduced motion stays as still as one with motion [mechanism A: card remount, tool-call-card.tsx:113-124]', async () => {
    const restoreMotion = forceReducedMotion()
    try {
      const {sessionId} = await newSession()
      await coreControl.scriptTurn({
        toolCalls: [
          {name: 'Bash', input: {command: 'quiet probe'}},
          {name: 'Read', input: {filePath: 'calm.ts'}},
        ],
        text: 'Both steps are done.',
      })
      mountChatPane(sessionId)

      const watch = await startHeldToolRun({
        prompt: 'run two tools quietly',
        pending: 'quiet probe',
        settled: 'calm.ts',
      })
      expectCalm(watch)

      await coreControl.releaseTurn()
      await expect.element(page.getByText('Both steps are done.')).toBeVisible()
      await watch.checkpoint()
      await page.screenshot({path: `${SHOTS}/reduced-motion.png`})
      expectCalm(watch)
    } finally {
      restoreMotion()
    }
  })

  test('a long thread at the virtualization boundary stays still while a run streams [mechanism C: retroactive regrouping, page-session.ts:141-151]', async () => {
    const watch = await startBoundaryRun()
    expectCalm(watch)

    await coreControl.releaseTurn()
    await expect.element(page.getByText('The long thread is done.')).toBeVisible()
    await watch.checkpoint()
    await page.screenshot({path: `${SHOTS}/virtualization-boundary.png`})
    expectCalm(watch)
  }, 120_000)

  test('a thread crossing the virtualization threshold mid-run keeps its visible surfaces [mechanism A: card remount, tool-call-card.tsx:113-124]', async () => {
    const {sessionId} = await newSession()
    await seedThread(core.base, sessionId, BOUNDARY_EXCHANGES)
    await coreControl.scriptTurn({
      toolCalls: [{name: 'Bash', input: {command: 'cross the boundary'}}],
      text: 'Crossed the boundary.',
    })
    mountChatPane(sessionId)
    await expect.element(page.getByText(`seeded exchange ${BOUNDARY_EXCHANGES - 1}`, {exact: true})).toBeVisible()
    const restoreViewport = pinViewportToBottom(VIEWPORT_HEIGHT_PX)
    try {
      const watch = await startHeldToolRun({
        prompt: 'push the thread past the boundary',
        pending: 'cross the boundary',
        settled: 'Crossed the boundary.',
        allow: {allow: ['virtualization']},
      })
      await page.screenshot({path: `${SHOTS}/threshold-crossing.png`})
      expectCalm(watch)

      await coreControl.releaseTurn()
      await watch.checkpoint()
      expectCalm(watch)
    } finally {
      restoreViewport()
    }
  }, 120_000)

  test('a streamed code block stays calm [mechanism D: per-chunk re-tokenisation, render-sync.ts:19-24]', async () => {
    const watch = await streamCodeAnswer()
    await page.screenshot({path: `${SHOTS}/streamed-code-block.png`})
    expectCalm(watch)
  }, 120_000)

  test('a streamed code block grows on screen while it streams [mechanism D: render suppressed until settle]', async () => {
    const {sessionId} = await newSession()
    await coreControl.scriptTurn({
      toolCalls: [],
      text: streamedCodeAnswer(),
      textPace: {chunk: STREAMED_TEXT_CHUNK, everyMs: STREAMED_TEXT_PACE_MS},
    })
    mountChatPane(sessionId)

    await coreControl.holdTools()
    await promptWith('write the helper that resolves every step')
    await expect.element(stopButton()).toBeVisible()
    const growth = watchTextGrowth(() => [...document.querySelectorAll('.prose-chat pre')].at(-1) ?? null)

    await coreControl.releaseTools()
    await expect.element(page.getByText(STREAMED_CODE_CLOSING, {exact: true})).toBeVisible()
    growth.stop()

    const lengths = growth.lengths()
    expect(lengths.toSorted((left, right) => left - right)).toEqual(lengths)
    expect(lengths.length).toBeGreaterThanOrEqual(MIN_CODE_GROWTH_STEPS)
  }, 120_000)

  function scrollGateSteps(): ScriptedToolStep[] {
    return Array.from({length: SCROLL_GATE_STEPS}, (_, index): ScriptedToolStep => multiToolStep(index))
  }

  type ScrollGate = {viewport: HTMLElement; restore: () => void}

  async function seededScrollGate(): Promise<ScrollGate> {
    const {sessionId} = await newSession()
    await seedThread(core.base, sessionId, SCROLL_GATE_EXCHANGES)
    await coreControl.scriptTurn({
      toolCalls: scrollGateSteps(),
      text: streamedCodeAnswer(),
      textPace: {chunk: STREAMED_TEXT_CHUNK, everyMs: SCROLL_GATE_TEXT_PACE_MS},
    })
    mountChatPane(sessionId)
    await expect.element(page.getByText(`seeded exchange ${SCROLL_GATE_EXCHANGES - 1}`, {exact: true})).toBeVisible()
    const restore = pinViewportToBottom(VIEWPORT_HEIGHT_PX)
    return {viewport: threadViewportElement(), restore}
  }

  test('a reader who scrolled up keeps their exact position for the whole stream [gate a: released user never moves]', async () => {
    const gate = await seededScrollGate()
    try {
      await coreControl.holdTools()
      await coreControl.holdResults()
      await promptWith('run the whole batch while I read back')
      await expect.element(stopButton()).toBeVisible()

      await userEvent.wheel(gate.viewport, {delta: {y: -SCROLL_UP_PX}})
      await expect.element(page.elementLocator(gate.viewport)).not.toHaveAttribute('data-at-bottom')
      const rowBefore = topEdgeRowIndex(gate.viewport)
      expect(rowBefore, 'no thread row crosses the viewport top after the wheel').not.toBeNull()
      const watch = watchViewportScroll()

      await coreControl.releaseTools()
      await coreControl.releaseResults({everyMs: SCROLL_GATE_PACE_MS})
      await expect.element(sendButton()).toBeVisible()
      watch.stop()

      expect(watch.samples()).toBeGreaterThanOrEqual(MIN_SCROLL_SAMPLES)
      expect(watch.maxDrift()).toBe(0)
      expect(watch.topEdgeRow()).toBe(rowBefore)
      await expect.element(page.elementLocator(gate.viewport)).not.toHaveAttribute('data-at-bottom')
      await page.screenshot({path: `${SHOTS}/released-reader-held.png`})
    } finally {
      gate.restore()
    }
  }, 120_000)

  test('a reader parked at the end follows the whole stream [gate b: at-bottom user follows]', async () => {
    const gate = await seededScrollGate()
    try {
      await coreControl.holdTools()
      await coreControl.holdResults()
      await promptWith('run the whole batch while I watch the tail')
      await expect.element(stopButton()).toBeVisible()
      const watch = watchViewportScroll()

      await coreControl.releaseTools()
      await coreControl.releaseResults({everyMs: SCROLL_GATE_PACE_MS})
      await expect.element(page.getByText(STREAMED_CODE_CLOSING, {exact: true})).toBeVisible()
      watch.stop()

      expect(watch.samples()).toBeGreaterThanOrEqual(MIN_SCROLL_SAMPLES)
      const series = watch
        .distanceSeries()
        .map((value) => Math.round(value))
        .join(' ')
      expect(watch.framesBeyond(SCROLL_END_THRESHOLD_PX), series).toBeLessThanOrEqual(CATCH_UP_FRAME_BUDGET)
      expect(Math.round(watch.maxDistanceFromEnd()), series).toBeLessThanOrEqual(CATCH_UP_DISTANCE_BUDGET_PX)
      await expect.element(page.elementLocator(gate.viewport)).toHaveAttribute('data-at-bottom', '')
      await page.screenshot({path: `${SHOTS}/following-reader-pinned.png`})
    } finally {
      gate.restore()
    }
  }, 120_000)

  test('an appended turn never drags a reader who scrolls up while it streams [gate f: follow-on-append lands once]', async () => {
    const gate = await seededScrollGate()
    try {
      await coreControl.holdTools()
      await coreControl.holdResults()
      await promptWith('run the whole batch while I scroll back')
      await expect.element(stopButton()).toBeVisible()
      await coreControl.releaseTools()
      await coreControl.releaseResults({everyMs: SCROLL_GATE_PACE_MS})
      await expect.element(page.getByText('probe step 2', {exact: true})).toBeVisible()

      await userEvent.wheel(gate.viewport, {delta: {y: -SCROLL_UP_PX}})
      await expect.element(page.elementLocator(gate.viewport)).not.toHaveAttribute('data-at-bottom')
      const rowBefore = topEdgeRowIndex(gate.viewport)
      expect(rowBefore, 'no thread row crosses the viewport top after the wheel').not.toBeNull()
      const offsetBefore = topEdgeRowOffset(gate.viewport)
      const watch = watchViewportScroll()

      await expect.element(sendButton()).toBeVisible()
      watch.stop()

      expect(watch.samples()).toBeGreaterThanOrEqual(MIN_SCROLL_SAMPLES)
      expect(watch.topEdgeRow()).toBe(rowBefore)
      expect(watch.maxDrift()).toBe(0)
      expect(Math.abs(offsetBefore - topEdgeRowOffset(gate.viewport))).toBeLessThanOrEqual(ROW_ROUNDING_TOLERANCE_PX)
      await expect.element(page.elementLocator(gate.viewport)).not.toHaveAttribute('data-at-bottom')
      await page.screenshot({path: `${SHOTS}/appended-turn-holds-reader.png`})
    } finally {
      gate.restore()
    }
  }, 120_000)

  test('sending a prompt after scrolling up returns the viewport to the end [gate c: send is a gesture]', async () => {
    const gate = await seededScrollGate()
    try {
      await userEvent.wheel(gate.viewport, {delta: {y: -SCROLL_UP_PX}})
      await expect.element(page.elementLocator(gate.viewport)).not.toHaveAttribute('data-at-bottom')

      await coreControl.holdTools()
      await promptWith('take me back to the end')
      await expect.element(page.elementLocator(gate.viewport)).toHaveAttribute('data-at-bottom', '')
      await page.screenshot({path: `${SHOTS}/send-returns-to-end.png`})
    } finally {
      gate.restore()
    }
  }, 120_000)

  test('folding a card leaves a released reader exactly where they were [gate e: size compensation]', async () => {
    const {sessionId} = await newSession()
    await seedThread(core.base, sessionId, SCROLL_GATE_EXCHANGES)
    await coreControl.scriptTurn({
      toolCalls: [
        {name: 'Bash', input: {command: 'ls'}},
        {name: 'Read', input: {filePath: 'calm.ts'}},
      ],
      text: 'The fold left the reader alone.',
    })
    mountChatPane(sessionId)
    await expect.element(page.getByText(`seeded exchange ${SCROLL_GATE_EXCHANGES - 1}`, {exact: true})).toBeVisible()
    await promptWith('run two tools then answer')
    await expect.element(page.getByText('The fold left the reader alone.')).toBeVisible()
    await expect.element(traceToggle()).toBeVisible()

    const viewport = threadViewportElement()
    const restoreViewport = pinViewportToBottom(VIEWPORT_HEIGHT_PX)
    try {
      await userEvent.wheel(viewport, {delta: {y: -FOLD_GATE_SCROLL_PX}})
      await expect.element(page.elementLocator(viewport)).not.toHaveAttribute('data-at-bottom')
      const rowBefore = topEdgeRowIndex(viewport)
      const offsetBefore = topEdgeRowOffset(viewport)

      await traceToggle().click()
      await expect.element(traceToggle()).toBeVisible()
      await traceToggle().click()
      await expect.element(traceToggle()).toBeVisible()

      expect(topEdgeRowIndex(viewport)).toBe(rowBefore)
      expect(Math.abs(offsetBefore - topEdgeRowOffset(viewport))).toBeLessThanOrEqual(ROW_ROUNDING_TOLERANCE_PX)
      await page.screenshot({path: `${SHOTS}/fold-beside-released-reader.png`})
    } finally {
      restoreViewport()
    }
  }, 120_000)
})

describe('card body contract', () => {
  const registeredCards: ToolCardEntry[] = [
    ...collectToolRenderers([pageExtensionEntry]),
    ...concivToolCards,
    ...coreToolCards,
    ...builtinToolCards,
  ]

  const cardCases = registeredCards.map((entry) => ({name: entry.names[0] ?? '', entry}))

  function callPart(name: string, input: Record<string, unknown>): ToolCallPart {
    return {type: 'tool-call', id: 'c1', name, arguments: JSON.stringify(input), input, state: 'complete'}
  }

  function jsonResult(content: string): ToolResultPart {
    return {type: 'tool-result', toolCallId: 'c1', content, state: 'complete'}
  }

  function cardRendersBody(entry: ToolCardEntry, part: ToolCallPart, result: ToolResultPart | undefined): boolean {
    const {container} = render(() => (
      <CardChromeProvider value="embedded" headerChannel={() => () => {}} rowLine={() => ''}>
        <ToolCallCard part={part} result={result} ctx={INERT_TOOL_CTX} tools={() => [entry]} />
      </CardChromeProvider>
    ))
    const visual = container.querySelector('img, svg, canvas, iframe, input, button, pre, diffs-container')
    return visual !== null || (container.textContent ?? '').trim().length > 0
  }

  async function rowFramesBody(
    entry: ToolCardEntry,
    part: ToolCallPart,
    result: ToolResultPart | undefined,
  ): Promise<boolean> {
    const {container} = render(() => (
      <ToolTraceRow part={part} result={result} ctx={INERT_TOOL_CTX} tools={() => [entry]} />
    ))
    const row = browserPage.elementLocator(container)
    await expect.element(row.getByRole('img', {name: 'succeeded'})).toBeVisible()
    return container.querySelector('button:not(:disabled)') !== null
  }

  it.each(cardCases)(
    'frames the $name card under a trace row exactly when it renders a body',
    async ({name, entry}) => {
      const part = callPart(name, {})

      const renders = cardRendersBody(entry, part, undefined)
      const framed = await rowFramesBody(entry, part, undefined)

      expect(framed).toBe(renders)
    },
  )

  it.each(cardCases)(
    'frames the $name card with a settled result exactly when it renders a body',
    async ({name, entry}) => {
      const part = callPart(name, {selector: '#main', file: 'src/app.ts', command: 'ls'})
      const result = jsonResult('{"ok":true}')

      const renders = cardRendersBody(entry, part, result)
      const framed = await rowFramesBody(entry, part, result)

      expect(framed).toBe(renders)
    },
  )
})

describe('chat pane', () => {
  const HYDRATE_PATH = ['chat', 'hydrate']
  const UNSCRIPTED_REPLY = 'an unscripted reply'

  const core = {base: ''}
  const active: {pane: PaneMount | null} = {pane: null}
  const faults = trackedFaults()

  beforeAll(async () => {
    const booted = await coreControl.bootCore({
      id: 'chat-pane',
      text: UNSCRIPTED_REPLY,
      allowedOrigins: [window.location.origin],
    })
    core.base = booted.base
  }, 60_000)

  afterAll(async () => {
    await coreControl.closeCore()
  }, 30_000)

  afterEach(async () => {
    await coreControl.releaseTurn()
    active.pane?.dispose()
    active.pane = null
  })

  async function draftAttachments(sessionId: string): Promise<DraftRow['attachments']> {
    const draft = await coreRpc(core.base).drafts.get({sessionId})
    return draft?.attachments ?? []
  }

  async function newSession(): Promise<{rpc: RpcClient; sessionId: string}> {
    const rpc = coreRpc(core.base)
    return {rpc, sessionId: await createSession(rpc)}
  }

  function grabOptions(...grabs: Grab[]): Pick<PaneMountOptions, 'grabProvider' | 'extensions'> {
    return {grabProvider: grabProviderFor(...grabs), extensions: [pageExtension]}
  }

  function mountChatPane(
    sessionId: string,
    options: Pick<PaneMountOptions, 'grabProvider' | 'extensions' | 'transport'> = {},
  ): PaneMount {
    const mount = mountPane({base: core.base, sessionId, ...options}, (pane) => {
      const queue = createMemo(() => pane.chat().queue())
      return (
        <>
          <ChatProvider chat={pane.chat()}>
            <QueueStrip queue={queue()} />
          </ChatProvider>
          <ChatPane sessionId={sessionId} />
          <RefreshButton />
        </>
      )
    })
    active.pane = mount
    return mount
  }

  const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const removeGrab = () => page.getByRole('button', {name: `Remove ${GRAB_FILE_NAME}`})
  const overflowTrigger = () => page.getByRole('button', {name: 'More composer actions'})
  const grabItem = () => page.getByRole('menuitem', {name: 'Select an element from the page'})
  const snapshot = () => page.getByTitle('Grabbed element snapshot')
  const notifications = () => page.getByRole('region', {name: /Notifications/})
  const stopButton = () => page.getByRole('button', {name: 'Stop generating'})
  const stoppedLine = () => page.getByRole('separator', {name: 'Stopped'})
  const skeleton = () => page.getByRole('status', {name: 'Loading conversation'})
  const narration = () => page.getByText('Responding…', {exact: true})
  const FROZEN_GLYPH = '⠿'
  const frozenGlyph = () => page.getByText(FROZEN_GLYPH, {exact: true})
  const traceList = () => page.getByRole('list', {name: 'Execution trace'})

  async function pickGrabFromOverflow(): Promise<void> {
    await userEvent.click(overflowTrigger())
    await userEvent.click(grabItem())
  }

  async function stageGrabThroughComposer(): Promise<void> {
    await expect.element(input()).toBeVisible()
    await pickGrabFromOverflow()
    await expect.element(snapshot()).toBeVisible()
    await expect.element(page.getByText(`↳ in ${HERO_LABEL}`)).toBeVisible()
  }

  async function sendWithStagedGrab(options: Pick<PaneMountOptions, 'transport'> = {}): Promise<void> {
    const {sessionId} = await newSession()
    mountChatPane(sessionId, {...grabOptions(HERO_GRAB), ...options})
    await stageGrabThroughComposer()
    await input().fill('explain the section I grabbed')
    await userEvent.keyboard('{Enter}')
  }

  async function startStreamingRun(): Promise<void> {
    const {sessionId} = await newSession()
    await coreControl.holdTurn()
    mountChatPane(sessionId)
    await input().fill('first turn')
    await userEvent.keyboard('{Enter}')
    await expect.element(stopButton()).toBeVisible()
    await expect.element(page.getByText(UNSCRIPTED_REPLY)).toBeVisible()
  }

  test('restores the server-side draft text and staged grabs when the pane mounts', async () => {
    const {rpc, sessionId} = await newSession()
    await seedDraft(rpc, sessionId, {
      text: 'kept across the reload',
      attachments: [persistedGrab('grab-1', HERO_GRAB)],
    })

    mountChatPane(sessionId, grabOptions(HERO_GRAB))

    await expect.element(input()).toHaveTextContent('kept across the reload')
    await expect.element(snapshot()).toBeVisible()
    await expect.element(page.getByText(`↳ in ${HERO_LABEL}`)).toBeVisible()
  })

  test('a staged grab keeps its snapshot and source label across a panel reload', async () => {
    const {sessionId} = await newSession()
    const first = mountChatPane(sessionId, grabOptions(HERO_GRAB))
    await stageGrabThroughComposer()

    await until(async () => (await draftAttachments(sessionId)).length > 0, {hangGuardMs: 30_000, intervalMs: 100})
    expect((await draftAttachments(sessionId)).map((attachment) => attachment.contentType)).toEqual([GRAB_MIME])
    first.dispose()

    mountChatPane(sessionId, {extensions: [pageExtension]})

    await expect.element(snapshot()).toBeVisible()
    await expect.element(page.getByText(`↳ in ${HERO_LABEL}`)).toBeVisible()
  })

  test('a rejected send keeps the draft in the composer and tells the user why', async () => {
    const {sessionId} = await newSession()
    await faults.install({kind: 'chat-refused', status: 500})
    mountChatPane(sessionId, {transport: 'fetch'})

    await expect.element(input()).toBeVisible()
    await input().fill('a message the server refuses')
    await userEvent.keyboard('{Enter}')

    await expect.element(notifications()).toMatchTextContent(/Internal Server Error|could not be sent/)
    await expect.element(input()).toHaveTextContent('a message the server refuses')
  })

  test('sending drops the staged grab card at once, while the turn is still streaming', async () => {
    await coreControl.holdTurn()
    await sendWithStagedGrab()

    await expect.element(stopButton()).toBeVisible()
    await expect.element(removeGrab()).not.toBeInTheDocument()
  })

  test('a send the server refuses puts the staged grab card back', async () => {
    await faults.install({kind: 'chat-refused', status: 500})
    await sendWithStagedGrab({transport: 'fetch'})

    await expect.element(notifications()).toMatchTextContent(/Internal Server Error|could not be sent/)
    await expect.element(removeGrab()).toBeVisible()
    await expect.element(page.getByText(`↳ in ${HERO_LABEL}`).last()).toBeVisible()
  })

  test('a send that throws at the transport puts the staged grab card back', async () => {
    await faults.install({kind: 'chat-dropped'})
    await sendWithStagedGrab({transport: 'fetch'})

    await expect.element(notifications()).toMatchTextContent(/could not be sent|Stream response body read failed/)
    await expect.element(removeGrab()).toBeVisible()
    await expect.element(page.getByText(`↳ in ${HERO_LABEL}`).last()).toBeVisible()
  })

  test('a queued second send cannot cross-restore the grabs of the turn that failed', async () => {
    const {rpc, sessionId} = await newSession()
    await seedDraft(rpc, sessionId, {attachments: [persistedGrab('grab-1', HERO_GRAB)]})
    await coreControl.holdTurn()
    mountChatPane(sessionId, grabOptions(PRICING_GRAB))

    await expect.element(page.getByText(`↳ in ${HERO_LABEL}`)).toBeVisible()
    await input().fill('turn A')
    await userEvent.keyboard('{Enter}')
    await expect.element(stopButton()).toBeVisible()

    await pickGrabFromOverflow()
    await expect.element(page.getByText(`↳ in ${PRICING_LABEL}`)).toBeVisible()
    await input().fill('turn B')
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByRole('button', {name: 'Remove from queue'})).toBeVisible()
    await expect.element(page.getByText(`↳ in ${PRICING_LABEL}`)).not.toBeInTheDocument()

    await coreControl.scriptError('turn A failed')
    await coreControl.releaseTurn()

    await expect.element(removeGrab()).toBeVisible()
    await expect.element(page.getByText(`↳ in ${HERO_LABEL}`).last()).toBeVisible()
    await expect.element(page.getByText(`↳ in ${PRICING_LABEL}`)).not.toBeInTheDocument()
  })

  test('sending announces the settled reply through the live region', async () => {
    const {sessionId} = await newSession()
    mountChatPane(sessionId)

    await expect.element(input()).toBeVisible()
    await input().fill('rename the widget package')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByRole('log', {name: 'Announcements'})).toHaveTextContent('conciv replied.')
  })

  test('a run in flight narrates what the agent is doing above the composer', async () => {
    const {sessionId} = await newSession()
    await coreControl.holdTurn()
    mountChatPane(sessionId)

    await expect.element(input()).toBeVisible()
    await input().fill('start a long run')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByText('Responding…', {exact: true})).toBeVisible()
    await page.screenshot({path: '__screenshots__/chat-pane/now-line-above-composer.png'})

    await coreControl.releaseTurn()
    await expect.element(page.getByText('Responding…', {exact: true})).not.toBeInTheDocument()
  })

  test('one narration line rides the whole run, outside the trace, across the tool and text boundary', async () => {
    const restoreMotion = forceReducedMotion()
    const {sessionId} = await newSession()
    await coreControl.scriptTurn({
      toolCalls: [
        {name: 'Bash', input: {command: 'ls'}},
        {name: 'Read', input: {filePath: 'widget-shell.tsx'}},
      ],
      text: 'Both steps are done.',
      thinking: 'mapping the two steps',
    })
    await coreControl.holdTools()
    await coreControl.holdTurn()
    mountChatPane(sessionId)

    await expect.element(input()).toBeVisible()
    await input().fill('run a couple of tools then answer')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByText('mapping the two steps')).toBeVisible()
    await expect.element(frozenGlyph()).toBeVisible()
    await expect.element(traceList().getByText(FROZEN_GLYPH, {exact: true})).not.toBeInTheDocument()
    await page.screenshot({path: '__screenshots__/chat-pane/now-line-during-tools.png'})

    await coreControl.releaseTools()
    await expect.element(page.getByText('Both steps are done.')).toBeVisible()
    await expect.element(frozenGlyph()).toBeVisible()
    await expect.element(traceList().getByText(FROZEN_GLYPH, {exact: true})).not.toBeInTheDocument()
    await page.screenshot({path: '__screenshots__/chat-pane/now-line-after-text.png'})

    await coreControl.releaseTurn()
    await expect.element(frozenGlyph()).not.toBeInTheDocument()
    restoreMotion()
  })

  test('a pane that joins a run another client already started narrates it, and stops when it ends', async () => {
    const {sessionId} = await newSession()
    await coreControl.holdTurn()
    await sendTurn(core.base, sessionId, 'a turn driven from another client')

    mountChatPane(sessionId)

    await expect.element(input()).toBeVisible()
    await expect.element(narration()).toBeVisible()
    await page.screenshot({path: '__screenshots__/chat-pane/now-line-joins-remote-run.png'})

    await coreControl.releaseTurn()

    await expect.element(narration()).not.toBeInTheDocument()
  })

  test('an open pane streams a run another client starts, then settles it, without duplicating either turn', async () => {
    const {sessionId} = await newSession()
    mountChatPane(sessionId)
    await expect.element(page.getByText('How can I help you today?')).toBeVisible()

    await coreControl.scriptTurn({toolCalls: [], text: 'streamed from the other client'})
    await coreControl.holdTurn()
    const turn = await sendTurn(core.base, sessionId, 'a prompt typed in the other client')

    await expect.element(page.getByText('a prompt typed in the other client')).toBeVisible()
    await expect.element(page.getByText('streamed from the other client')).toBeVisible()
    await expect.element(narration()).toBeVisible()

    await coreControl.releaseTurn()
    await turn.awaitTurnEnd()
    turn.close()

    await expect.element(narration()).not.toBeInTheDocument()
    expect(page.getByText('a prompt typed in the other client').elements()).toHaveLength(1)
    expect(page.getByText('streamed from the other client').elements()).toHaveLength(1)
  })

  test('the refresh affordance re-subscribes and shows the transcript the server re-leads', async () => {
    const {sessionId} = await newSession()
    mountChatPane(sessionId)
    await expect.element(page.getByText('How can I help you today?')).toBeVisible()

    const gate = await faults.install({kind: 'gate', path: HYDRATE_PATH})
    await page.getByRole('button', {name: 'Refresh the conversation'}).click()

    await coreControl.scriptTurn({toolCalls: [], text: 'the refreshed transcript'})
    const turn = await sendTurn(core.base, sessionId, 'lead the transcript from the server')
    await turn.awaitTurnEnd()
    turn.close()
    await coreControl.releaseFault(gate)

    await expect.element(page.getByText('the refreshed transcript')).toBeVisible()
  })

  test('the refresh affordance is disabled while the run streams', async () => {
    const {sessionId} = await newSession()
    await coreControl.holdTurn()
    mountChatPane(sessionId)

    await expect.element(input()).toBeVisible()
    await input().fill('start a run')
    await userEvent.keyboard('{Enter}')

    await expect.element(stopButton()).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Refresh the conversation'})).toBeDisabled()
  })

  test('the initial load shows a conversation skeleton until the snapshot arrives', async () => {
    const {sessionId} = await newSession()
    const gate = await faults.install({kind: 'gate', path: HYDRATE_PATH})
    mountChatPane(sessionId)

    await expect.element(skeleton()).toBeVisible()

    await coreControl.releaseFault(gate)

    await expect.element(page.getByText('How can I help you today?')).toBeVisible()
    await expect.element(skeleton()).not.toBeInTheDocument()
  })

  test('the trailing control morphs from send to a single stop button while streaming, and back once the run stops', async () => {
    const {sessionId} = await newSession()
    await coreControl.holdTurn()
    mountChatPane(sessionId)

    await expect.element(page.getByRole('button', {name: 'Send message'})).toBeVisible()
    await expect.element(stopButton()).not.toBeInTheDocument()

    await input().fill('start a run')
    await userEvent.keyboard('{Enter}')

    await expect.element(stopButton()).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Send message'})).not.toBeInTheDocument()

    await stopButton().click()

    await expect.element(page.getByRole('button', {name: 'Send message'})).toBeVisible()
    await expect.element(stopButton()).not.toBeInTheDocument()
  })

  test('Enter while streaming queues the draft instead of sending or stopping', async () => {
    await startStreamingRun()

    await input().fill('a queued follow-up')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByText('a queued follow-up')).toBeVisible()
    await expect.element(stopButton()).toBeVisible()
    await expect.element(input()).toHaveTextContent('')
  })

  test('clicking stop with a queue interrupts the run and flushes every queued message, in order, as one turn', async () => {
    await startStreamingRun()

    await input().fill('alpha step')
    await userEvent.keyboard('{Enter}')
    await input().fill('bravo step')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByText('alpha step')).toBeVisible()
    await expect.element(page.getByText('bravo step')).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Remove from queue'}).first()).toBeVisible()

    await stopButton().click()

    await expect.element(page.getByRole('button', {name: 'Remove from queue'})).not.toBeInTheDocument()
    await expect.element(page.getByText(/alpha step[\s\S]*bravo step/)).toBeVisible()
  })

  test('clicking stop with an empty queue just stops the run', async () => {
    await startStreamingRun()

    await stopButton().click()

    await expect.element(page.getByRole('button', {name: 'Send message'})).toBeVisible()
  })

  test('a stopped turn ends with a Stopped line that a reload still shows', async () => {
    const {sessionId} = await newSession()
    await coreControl.holdTurn()
    mountChatPane(sessionId)
    await input().fill('stop this one')
    await userEvent.keyboard('{Enter}')
    await expect.element(stopButton()).toBeVisible()
    await expect.element(stoppedLine()).not.toBeInTheDocument()

    await stopButton().click()

    await expect.element(stoppedLine()).toBeVisible()
    active.pane?.dispose()
    mountChatPane(sessionId)
    await expect.element(page.getByText('stop this one')).toBeVisible()
    await expect.element(stoppedLine()).toBeVisible()
  })

  test('a stopped turn keeps its Stopped line under it once the next turn answers, and after a reload', async () => {
    const {sessionId} = await newSession()
    await coreControl.holdTurn()
    mountChatPane(sessionId)
    await input().fill('stop this one')
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByText(UNSCRIPTED_REPLY)).toBeVisible()
    await stopButton().click()
    await expect.element(stoppedLine()).toBeVisible()
    await coreControl.releaseTurn()

    await input().fill('answer this one')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByRole('button', {name: 'Send message'})).toBeVisible()
    await expect.element(stoppedLine()).toBeVisible()
    expect(follows(stoppedLine(), page.getByText('answer this one'))).toBe(true)
    active.pane?.dispose()
    mountChatPane(sessionId)
    await expect.element(page.getByText('answer this one')).toBeVisible()
    await expect.element(stoppedLine()).toBeVisible()
    expect(follows(page.getByText('stop this one'), stoppedLine())).toBe(true)
    expect(follows(stoppedLine(), page.getByText('answer this one'))).toBe(true)
  })

  test('Escape in the focused composer does what the stop button does and leaves the draft untouched', async () => {
    await startStreamingRun()

    await input().fill('queued while running')
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByRole('button', {name: 'Remove from queue'})).toBeVisible()

    await input().fill('draft kept in place')
    await userEvent.keyboard('{Escape}')

    await expect.element(page.getByRole('button', {name: 'Remove from queue'})).not.toBeInTheDocument()
    await expect.element(page.getByText('queued while running')).toBeVisible()
    await expect.element(stopButton()).toBeVisible()
    await expect.element(input()).toHaveTextContent('draft kept in place')
  })

  test('Escape outside the composer does not stop the run', async () => {
    await startStreamingRun()

    await userEvent.click(page.getByText('first turn'))
    await userEvent.keyboard('{Escape}')

    await expect.element(stopButton()).toBeVisible()
  })

  test('a new-session divider does not flash before the transcript snapshot hydrates', async () => {
    const {sessionId} = await newSession()
    await runTurn(core.base, sessionId, 'restart with a clean slate')
    const gate = await faults.install({kind: 'gate', path: HYDRATE_PATH})
    const mount = mountChatPane(sessionId)

    await expect.element(skeleton()).toBeVisible()
    await mount.queryClient.ensureQueryData(mount.data.utils.markers.list.queryOptions({input: {sessionId}}))
    await expect.element(page.getByRole('separator', {name: 'New session'})).not.toBeInTheDocument()

    await coreControl.releaseFault(gate)

    await expect.element(page.getByText('restart with a clean slate')).toBeVisible()
    await expect.element(page.getByRole('separator', {name: 'New session'})).toBeVisible()
    await expect.element(skeleton()).not.toBeInTheDocument()
  })

  function follows(earlier: Locator, later: Locator): boolean {
    return (earlier.element().compareDocumentPosition(later.element()) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
  }
})

describe('composer overflow', () => {
  const menuitem = (name: string | RegExp) => page.getByRole('menuitem', {name})

  const COMPACT_PATH = ['sessions', 'compact']
  const NARROW_PX = 160
  const WIDE_PX = 460

  const PICKER_COMMANDS = [
    {name: '21st-ui-build', description: 'Build UI with the context of a component registry'},
    {name: 'show-context', description: 'Print the token budget'},
    {name: 'deploy', description: 'Ship the branch'},
    {name: 'context-summary', description: 'Summarize the conversation so far'},
    {name: 'context', description: 'Show what fills the window'},
  ]

  const core = bootedCore('composer-overflow', {commands: PICKER_COMMANDS})
  const keep = keptPane()
  const faults = trackedFaults()

  const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const grabButton = () => page.getByRole('button', {name: 'Select an element from the page'})
  const newSessionButton = () => page.getByRole('button', {name: 'Start a new session'})
  const compactButton = () => page.getByRole('button', {name: 'Compress the conversation'})
  const trigger = () => page.getByRole('button', {name: 'More composer actions'})
  const attachButton = () => page.getByRole('button', {name: 'Add an attachment'})
  const sendButton = () => page.getByRole('button', {name: 'Send message'})
  const newSessionItem = () => page.getByRole('menuitem', {name: 'Start a new session'})
  const compactItem = () => page.getByRole('menuitem', {name: 'Compress the conversation'})
  const commandOption = (position: number) => page.getByRole('option').nth(position)

  async function mountComposer(width?: number): Promise<PaneMount> {
    const sessionId = await createSession(coreRpc(core()))
    const [requests, setRequests] = createSignal<string[]>([])
    const mount = mountPane(
      {
        base: core(),
        sessionId,
        width,
        onNewSession: () => setRequests((current) => [...current, 'a new session']),
      },
      () => (
        <>
          <ul>
            <For each={requests()}>{(request) => <li>{`the pane requested ${request}`}</li>}</For>
          </ul>
          <ChatPane sessionId={sessionId} />
        </>
      ),
    )
    keep(mount)
    await expect.element(input()).toBeVisible()
    return mount
  }

  test('a wide composer keeps no actions inline and runs everything from the overflow menu', async () => {
    await mountComposer(WIDE_PX)

    await expect.element(grabButton()).not.toBeInTheDocument()
    await expect.element(trigger()).toHaveAttribute('aria-haspopup', 'menu')
    await expect.element(newSessionButton()).not.toBeInTheDocument()
    await expect.element(compactButton()).not.toBeInTheDocument()

    await userEvent.click(trigger())
    await expect.element(compactItem()).toBeVisible()
    await expect.element(menuitem('Select an element from the page')).toBeVisible()
    await userEvent.click(newSessionItem())

    await expect.element(page.getByText('the pane requested a new session')).toBeVisible()
    await expect.element(newSessionItem()).not.toBeInTheDocument()
  })

  test('the model pill is reachable from the overflow menu instead of sitting inline', async () => {
    const sessionId = await createSession(coreRpc(core()))
    const models = await coreRpc(core()).meta.models()
    const firstModel = models.models[0]
    const mount = mountPane({base: core(), sessionId, width: WIDE_PX}, () => <ChatPane sessionId={sessionId} />)
    keep(mount)
    await expect.element(input()).toBeVisible()

    await userEvent.click(trigger())
    if (firstModel) await expect.element(menuitem(new RegExp(`Model: ${firstModel.name}`))).toBeVisible()
  })

  test('the attachment button carries the same tooltip-backed name as the rest of the row', async () => {
    await mountComposer(WIDE_PX)

    await expect.element(attachButton()).toBeVisible()

    await userEvent.hover(attachButton())

    await expect.element(page.getByRole('tooltip')).toHaveTextContent('Add an attachment')
  })

  test('the send button carries a discoverable name of its own, as a labeled control rather than a tooltip-only icon', async () => {
    await mountComposer(WIDE_PX)

    await expect.element(sendButton()).toBeVisible()
    await expect.element(sendButton()).toHaveTextContent('Send⏎')
  })

  test('a narrow composer keeps only the attach button and the overflow trigger inline', async () => {
    const mount = await mountComposer()

    mount.setWidth(NARROW_PX)

    await expect.element(attachButton()).toBeVisible()
    await expect.element(trigger()).toBeVisible()
    await expect.element(grabButton()).not.toBeInTheDocument()
    await expect.element(newSessionButton()).not.toBeInTheDocument()
  })

  test('a session that is already compacting cannot be compacted again from the overflow menu', async () => {
    const gate = await faults.install({kind: 'gate', path: COMPACT_PATH})
    await mountComposer(WIDE_PX)

    await userEvent.click(trigger())
    await userEvent.click(compactItem())
    await coreControl.awaitFaultPending(gate, 1)

    await userEvent.click(trigger())
    await expect.element(compactItem()).toHaveAttribute('aria-disabled', 'true')

    await userEvent.click(newSessionItem())

    await expect.element(page.getByText('the pane requested a new session')).toBeVisible()
    await expect.element(compactItem()).not.toBeInTheDocument()
    expect(await coreControl.faultPending(gate)).toBe(1)
  })

  test('the slash picker ranks an exact name first, then a name prefix, a name match, and a description match', async () => {
    await mountComposer(WIDE_PX)

    await userEvent.click(input())
    await userEvent.keyboard('/context')

    await expect.element(commandOption(0)).toHaveTextContent('/contextShow what fills the window')
    await expect.element(commandOption(1)).toHaveTextContent('/context-summarySummarize the conversation so far')
    await expect.element(commandOption(2)).toHaveTextContent('/show-contextPrint the token budget')
    await expect
      .element(commandOption(3))
      .toHaveTextContent('/21st-ui-buildBuild UI with the context of a component registry')
    await expect.element(page.getByRole('option', {name: /deploy/})).not.toBeInTheDocument()

    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByRole('option').first()).not.toBeInTheDocument()
    await expect.element(input().getByText('/context')).toBeVisible()
    await expect.element(input().getByText('21st-ui-build')).not.toBeInTheDocument()
  })
})

describe('connection generation remount', () => {
  const DRAFT_GET_PATH = ['drafts', 'get']

  const coreBase = bootedCore('connection-generation-remount')
  const harness = createShellHarness(coreBase)
  const faults = trackedFaults()

  afterEach(async () => {
    await coreControl.releaseTurn()
    harness.dispose()
  })

  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const refresh = () => page.getByRole('button', {name: 'Refresh the conversation'})

  test('bumping the connection generation recreates the quick pane chat store', async () => {
    const sessionId = await createSession(coreRpc(coreBase()))
    harness.mountShell(`/quick?panes=${sessionId}&focus=0`)
    await expect.element(editor(), {timeout: 8000}).toBeVisible()

    const gate = await faults.install({kind: 'gate', path: DRAFT_GET_PATH})
    harness.bumpConnectionGeneration()

    await expect.element(editor()).not.toBeInTheDocument()
    await expect.element(refresh(), {timeout: 8000}).toBeVisible()

    await coreControl.releaseFault(gate)

    await expect.element(editor(), {timeout: 8000}).toBeVisible()
  }, 30_000)
})

describe('context summary', () => {
  function mount(usage: UsageSnapshot | null): HTMLElement {
    return render(() => <ContextSummary usage={usage} />).container
  }

  describe('ContextSummary inline menu content', () => {
    it('renders the percent, used/max, and stat rows as static content with no popover trigger', () => {
      const host = mount({contextTokens: 99_400, contextWindow: 200_000, inputTokens: 4, outputTokens: 113})
      expect(host.textContent).toContain('49.7%')
      expect(host.textContent).toContain('99K / 200K')
      expect(host.querySelector('[role="progressbar"]')).not.toBeNull()
      expect(host.querySelector('button')).toBeNull()
      expect(host.querySelector('[aria-haspopup]')).toBeNull()
    })

    it('shows the cost row when a total cost is reported', () => {
      const host = mount({contextTokens: 25_000, contextWindow: 200_000, totalCostUsd: 0.06})
      expect(host.textContent).toContain('$0.06')
    })

    it('renders nothing for null usage or an empty snapshot', () => {
      expect(mount(null).textContent).toBe('')
      expect(mount({}).textContent).toBe('')
    })
  })
})

describe('context tracker', () => {
  function mount(usage: UsageSnapshot | null): HTMLElement {
    return render(() => <ContextTracker usage={usage} />).container
  }

  describe('ContextTracker trigger badge', () => {
    it('shows percent and the ring from the contextTokens occupancy', () => {
      const host = mount({contextTokens: 25_000, contextWindow: 200_000, inputTokens: 20_000, outputTokens: 100})
      expect(host.textContent).toContain('12.5%')
      expect(host.querySelector('svg[aria-label="Model context usage"]')).not.toBeNull()
    })

    it('never derives a percent from cumulative billing totals (issue #78: 773K/200K = 386%)', () => {
      const host = mount({inputTokens: 700_000, cacheReadTokens: 73_000, contextWindow: 200_000, outputTokens: 5_000})
      expect(host.textContent).not.toContain('%')
      expect(host.querySelector('svg')).toBeNull()
      expect(host.textContent).toContain('778K')
    })

    it('falls back to a compact billing-token count when no occupancy is reported', () => {
      const host = mount({inputTokens: 24_000, outputTokens: 100})
      expect(host.textContent).toContain('24K')
      expect(host.querySelector('svg')).toBeNull()
    })

    it('renders nothing for null usage or an empty snapshot', () => {
      expect(mount(null).textContent).toBe('')
      expect(mount({}).textContent).toBe('')
    })
  })
})

describe('core request gate', () => {
  const core: {rpc: RpcClient | null} = {rpc: null}
  const faults = trackedFaults()

  function statusOf(value: unknown): number | null {
    if (typeof value !== 'object' || value === null || !('status' in value)) return null
    return typeof value.status === 'number' ? value.status : null
  }

  function rpc(): RpcClient {
    if (!core.rpc) throw new Error('the core kit did not boot')
    return core.rpc
  }

  beforeAll(async () => {
    const booted = await coreControl.bootCore({id: 'request-gate', allowedOrigins: [window.location.origin]})
    core.rpc = makeRpcClient(booted.base)
  }, 60_000)

  afterAll(async () => {
    core.rpc = null
    await coreControl.closeCore()
  }, 30_000)

  describe('gated rpc requests against a real core', () => {
    it('holds the session-events request until release, then streams the real channel', async () => {
      const {sessionId} = await rpc().sessions.create()
      const gate = await faults.install({kind: 'gate', path: ['chat', 'events']})
      const arrived = {value: false}
      const subscription = rpc()
        .chat.events({sessionId})
        .then((iterator: AsyncIterable<unknown>) => {
          arrived.value = true
          return iterator
        })

      await coreControl.awaitFaultPending(gate, 1)
      expect(arrived.value).toBe(false)

      await coreControl.releaseFault(gate)
      await subscription

      expect(arrived.value).toBe(true)
      expect(await coreControl.faultPending(gate)).toBe(0)
    }, 30_000)

    it('keeps a cross-origin injected failure an rpc rejection rather than a transport error', async () => {
      const {sessionId} = await rpc().sessions.create()
      const fault = await faults.install({kind: 'fail', path: ['sessions', 'rename'], status: 500})

      const rejection = await rpc()
        .sessions.rename({sessionId, title: 'renamed by the fault test'})
        .then(
          () => null,
          (reason: unknown) => reason,
        )

      expect(rejection).not.toBeInstanceOf(TypeError)
      expect(String(rejection)).not.toMatch(/failed to fetch/i)
      expect(statusOf(rejection)).toBe(500)

      await coreControl.releaseFault(fault)
      const renamed = await rpc().sessions.rename({sessionId, title: 'renamed by the fault test'})
      expect(renamed.title).toBe('renamed by the fault test')
    }, 30_000)
  })
})

describe('engine staleness', () => {
  const core = {base: ''}
  const mounted: {pane: PaneMount | null} = {pane: null}

  const TRACKED = ['@conciv/core', '@conciv/tools']

  function staleness(stale: boolean, fingerprint: string): EngineStaleness {
    return {
      stale,
      changed: stale ? ['@conciv/tools'] : [],
      tracked: TRACKED,
      bootedAt: 0,
      fingerprint,
    }
  }

  beforeAll(async () => {
    const booted = await coreControl.bootCore({id: 'engine-staleness', allowedOrigins: [window.location.origin]})
    core.base = booted.base
  }, 60_000)

  afterAll(async () => {
    await coreControl.closeCore()
  }, 30_000)

  afterEach(() => {
    mounted.pane?.dispose()
    mounted.pane = null
  })

  async function mountNotice(engine: EngineStaleness): Promise<PaneMount> {
    await coreControl.setStaleness(engine)
    const sessionId = await createSession(coreRpc(core.base))
    const pane = mountPane({base: core.base, sessionId}, () => <EngineStaleNotice />)
    mounted.pane = pane
    return pane
  }

  async function settleEngine(pane: PaneMount): Promise<void> {
    await pane.queryClient.ensureQueryData(pane.data.utils.meta.engine.queryOptions())
  }

  test('an engine running outdated code says so, and says it is the server code that moved', async () => {
    await mountNotice(staleness(true, 'stamp-boot'))

    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent(
        'Engine is running outdated code: the server code on disk is newer than the running engine. Restart the dev server.Dismiss',
      )
  })

  test('an engine that matches the code on disk raises nothing at all', async () => {
    const pane = await mountNotice(staleness(false, 'stamp-boot'))

    await settleEngine(pane)

    await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
  })

  test('the outdated-engine notice stands until it is dismissed by hand', async () => {
    await mountNotice(staleness(true, 'stamp-boot'))
    await expect.element(page.getByRole('alert')).toBeVisible()

    await page.getByRole('button', {name: 'Dismiss'}).click()

    await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
  })

  test('restarting the engine takes the notice down without anyone dismissing it', async () => {
    const pane = await mountNotice(staleness(true, 'stamp-boot'))
    await expect.element(page.getByRole('alert')).toBeVisible()

    await coreControl.setStaleness(staleness(false, 'stamp-restarted'))
    await pane.refetch()

    await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
  })

  test('a dismissed notice stays down while the engine is stale in the very same way', async () => {
    const pane = await mountNotice(staleness(true, 'stamp-boot'))
    await page.getByRole('button', {name: 'Dismiss'}).click()
    await expect.element(page.getByRole('alert')).not.toBeInTheDocument()

    await pane.refetch()
    await settleEngine(pane)

    await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
  })

  test('a further rebuild speaks up again even after the earlier notice was dismissed', async () => {
    const pane = await mountNotice(staleness(true, 'stamp-boot'))
    await page.getByRole('button', {name: 'Dismiss'}).click()
    await expect.element(page.getByRole('alert')).not.toBeInTheDocument()

    await coreControl.setStaleness(staleness(true, 'stamp-rebuilt-again'))
    await pane.refetch()

    await expect.element(page.getByRole('alert')).toBeVisible()
  })
})

describe('exec result shape', () => {
  const JSON_TREE_ROOT = '[data-scope="json-tree-view"][data-part="root"]'

  function mount(child: () => JSX.Element): HTMLElement {
    return render(child).container
  }

  function runPart(typescriptCode: string): ToolCallPart {
    const input = {typescriptCode}
    return {
      type: 'tool-call',
      id: 'x1',
      name: EXECUTE_TOOL_NAME,
      arguments: JSON.stringify(input),
      input,
      state: 'complete',
    }
  }

  function runResult(payload: unknown): ToolResultPart {
    return {type: 'tool-result', toolCallId: 'x1', content: JSON.stringify(payload), state: 'complete'}
  }

  function card(code: string, payload: unknown): () => JSX.Element {
    return () => (
      <CodeRunCard part={runPart(code)} result={runResult(payload)} ctx={INERT_TOOL_CTX} addResult={INERT_ADD_RESULT} />
    )
  }

  it('an object result opens as a json tree instead of a one-line stringified blob', async () => {
    const container = mount(card('return await report()', {success: true, result: {status: 'ok', pending: 3}}))

    await browserPage.getByRole('button', {name: /return await report/}).click()

    await expect.element(browserPage.getByText('status', {exact: true})).toBeVisible()
    expect(container.querySelectorAll(JSON_TREE_ROOT).length).toBe(1)
    expect(container.textContent).not.toContain('{"status":"ok","pending":3}')
  })

  it('a string result renders as the string itself, never re-escaped', async () => {
    const container = mount(card('return summary()', {success: true, result: 'the "quoted" bay is clear'}))

    await browserPage.getByRole('button', {name: /return summary/}).click()

    await expect.element(browserPage.getByText('the "quoted" bay is clear')).toBeVisible()
    expect(container.textContent).not.toContain('\\"quoted\\"')
    expect(container.querySelectorAll(JSON_TREE_ROOT).length).toBe(0)
  })

  it('console logs stay in their own block while the typed result renders structurally', async () => {
    const container = mount(
      card('return await report()', {success: true, logs: ['probing the bay'], result: {status: 'ok'}}),
    )

    await browserPage.getByRole('button', {name: /return await report/}).click()

    await expect.element(browserPage.getByText('status', {exact: true})).toBeVisible()
    await expect.element(browserPage.getByText('console', {exact: true})).toBeVisible()
    expect(container.querySelectorAll(JSON_TREE_ROOT).length).toBe(1)
  })
})

describe('grab staging module', () => {
  const GRAB: Grab = {
    text: '<h1>Payroll Deposit</h1> at src/routes/index.tsx:12:9',
    snippet: '<h1>Payroll Deposit</h1>',
    preview: {kind: 'dom', html: '<p>Payroll Deposit clone</p>', width: 200, height: 40},
    source: {componentName: 'Hero', filePath: 'src/routes/index.tsx', lineNumber: 12},
    rect: {x: 0, y: 0, width: 200, height: 40},
  }

  const GROUNDED: Grab = {...GRAB, text: '<h1>Payroll Deposit</h1> at src/routes/hero.tsx:4:1'}

  type FakeComposer = ComposerGrabPort & {
    list: () => AttachmentState[]
    nextAdd: () => Promise<AttachmentState>
    nextRemove: () => Promise<string>
    nextAddStart: () => Promise<void>
    nextReplace: () => Promise<AttachmentState>
    holdAdds: () => () => void
    failNextAdd: () => void
  }

  function fakeComposer(): FakeComposer {
    const entries: AttachmentState[] = []
    const addWaiters: ((attachment: AttachmentState) => void)[] = []
    const removeWaiters: ((id: string) => void)[] = []
    const startWaiters: (() => void)[] = []
    const replaceWaiters: ((attachment: AttachmentState) => void)[] = []
    const gate: {open: Promise<void> | null; release: () => void} = {open: null, release: () => {}}
    const failure = {pending: 0}
    let nextId = 0
    const entryFor = (id: string, file: File): AttachmentState => ({
      id,
      type: 'document',
      name: file.name,
      contentType: file.type,
      file,
      status: {type: 'requires-action', reason: 'composer-send'},
    })
    return {
      list: () => entries,
      nextAdd: () => new Promise<AttachmentState>((resolve) => addWaiters.push(resolve)),
      nextRemove: () => new Promise<string>((resolve) => removeWaiters.push(resolve)),
      nextAddStart: () => new Promise<void>((resolve) => startWaiters.push(resolve)),
      nextReplace: () => new Promise<AttachmentState>((resolve) => replaceWaiters.push(resolve)),
      holdAdds: () => {
        gate.open = new Promise<void>((resolve) => {
          gate.release = resolve
        })
        return () => {
          gate.open = null
          gate.release()
        }
      },
      failNextAdd: () => {
        failure.pending += 1
      },
      attachments: () => entries,
      hasAttachment: (id) => entries.some((entry) => entry.id === id),
      addAttachment: async (file) => {
        startWaiters.splice(0).forEach((resolve) => resolve())
        if (failure.pending > 0) {
          failure.pending -= 1
          throw new Error('the adapter refused the attachment')
        }
        if (gate.open) await gate.open
        nextId += 1
        const id = `attachment-${nextId}`
        const added = entryFor(id, file)
        entries.push(added)
        addWaiters.splice(0).forEach((resolve) => resolve(added))
        return id
      },
      replaceAttachment: async (id, file) => {
        const position = entries.findIndex((entry) => entry.id === id)
        if (position < 0) return null
        nextId += 1
        const next = `attachment-${nextId}`
        const swapped = entryFor(next, file)
        entries.splice(position, 1, swapped)
        replaceWaiters.splice(0).forEach((resolve) => resolve(swapped))
        return next
      },
      removeAttachment: async (id) => {
        const position = entries.findIndex((entry) => entry.id === id)
        if (position >= 0) entries.splice(position, 1)
        removeWaiters.splice(0).forEach((resolve) => resolve(id))
      },
    }
  }

  async function bodyOf(attachment: AttachmentState): Promise<string> {
    if (!attachment.file) throw new Error('expected the attachment to carry a file')
    return attachment.file.text()
  }

  async function grabTextOf(attachment: AttachmentState): Promise<string | undefined> {
    return parseGrabPayload(await bodyOf(attachment))?.text
  }

  function imageGrab(width: number, height: number): Grab {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('expected a canvas context')
    const pixels = context.createImageData(width, height)
    let noise = 1
    for (let index = 0; index < pixels.data.length; index += 1) {
      noise = (noise * 1_103_515_245 + 12_345) % 2_147_483_648
      pixels.data[index] = index % 4 === 3 ? 255 : noise % 256
    }
    context.putImageData(pixels, 0, 0)
    return {...GRAB, preview: {kind: 'image', dataUrl: canvas.toDataURL('image/png'), width, height}}
  }

  function stagedWhen(staging: GrabStaging, count: number): Promise<readonly Grab[]> {
    let release = () => {}
    const settledStaged = new Promise<readonly Grab[]>((resolve) => {
      createRoot((disposeRoot) => {
        release = disposeRoot
        createEffect(() => {
          const value = staging.staged()
          if (value.length === count) resolve(value)
        })
      })
    })
    return settledStaged.finally(() => release())
  }

  function neverGrounds(): Promise<Grab | null> {
    return Promise.resolve(null)
  }

  it('attaches optimistically and replaces the payload once grounding resolves', async () => {
    const composer = fakeComposer()
    const staging = makeGrabStaging({ground: async () => GROUNDED})
    staging.connect(composer)
    const replaced = composer.nextReplace()

    staging.stage(GRAB)
    await replaced

    expect(composer.list()).toHaveLength(1)
    expect(await grabTextOf(composer.list()[0] ?? never())).toBe(GROUNDED.text)
  })

  it('keeps the optimistic attachment when grounding yields nothing', async () => {
    const composer = fakeComposer()
    const staging = makeGrabStaging({ground: neverGrounds})
    staging.connect(composer)
    const added = composer.nextAdd()

    staging.stage(GRAB)
    await added

    expect(composer.list()).toHaveLength(1)
    expect(await grabTextOf(composer.list()[0] ?? never())).toBe(GRAB.text)
  })

  it('attaches a grab staged before the composer connected, carrying its grounded payload', async () => {
    const composer = fakeComposer()
    const staging = makeGrabStaging({ground: async () => GROUNDED})

    staging.stage(GRAB)
    expect(await stagedWhen(staging, 1)).toHaveLength(1)
    expect(composer.list()).toHaveLength(0)

    const added = composer.nextAdd()
    staging.connect(composer)
    await added

    expect(composer.list()).toHaveLength(1)
    expect(await grabTextOf(composer.list()[0] ?? never())).toBe(GROUNDED.text)
  })

  it('attaches a grab staged before the composer connected even when grounding yields nothing', async () => {
    const composer = fakeComposer()
    const staging = makeGrabStaging({ground: neverGrounds})

    staging.stage(GRAB)
    expect(await stagedWhen(staging, 1)).toHaveLength(1)

    const added = composer.nextAdd()
    staging.connect(composer)
    await added

    expect(composer.list()).toHaveLength(1)
    expect(await grabTextOf(composer.list()[0] ?? never())).toBe(GRAB.text)
  })

  it('reports a staged grab reactively once its payload is known', async () => {
    const composer = fakeComposer()
    const staging = makeGrabStaging({ground: neverGrounds})
    staging.connect(composer)
    const seen: number[] = []
    const dispose = createRoot((disposeRoot) => {
      createEffect(() => seen.push(staging.staged().length))
      return disposeRoot
    })

    staging.stage(GRAB)
    await stagedWhen(staging, 1)

    expect(seen.at(-1)).toBe(1)
    dispose()
  })

  it('clears only the grab attachments', async () => {
    const composer = fakeComposer()
    const staging = makeGrabStaging({ground: neverGrounds})
    staging.connect(composer)
    await composer.addAttachment(new File(['hello'], 'notes.txt', {type: 'text/plain'}))
    const added = composer.nextAdd()
    staging.stage(GRAB)
    await added

    const removed = composer.nextRemove()
    staging.clear()
    await removed

    expect(composer.list().map((entry) => entry.name)).toEqual(['notes.txt'])
    expect(staging.staged()).toHaveLength(0)
  })

  it('hydrates a restored grab attachment and prunes one that is gone', async () => {
    const composer = fakeComposer()
    const staging = makeGrabStaging({ground: neverGrounds})
    staging.connect(composer)
    const restored = await composer.addAttachment(grabToFile(GRAB))
    if (!restored) throw new Error('expected the restored attachment to be added')

    staging.reconcile(composer.attachments())

    expect((await stagedWhen(staging, 1)).map((grab) => grab.text)).toEqual([GRAB.text])

    await composer.removeAttachment(restored)
    staging.reconcile(composer.attachments())

    expect(await stagedWhen(staging, 0)).toHaveLength(0)
  })

  it('does not hydrate a payload whose attachment was removed while it decoded', async () => {
    const composer = fakeComposer()
    const staging = makeGrabStaging({ground: neverGrounds})
    staging.connect(composer)
    const body = grabToFile(GRAB)
    const restored = await composer.addAttachment(body)
    if (!restored) throw new Error('expected the restored attachment to be added')

    staging.reconcile(composer.attachments())
    await composer.removeAttachment(restored)
    await body.text()

    expect(staging.staged()).toHaveLength(0)
  })

  it('fits an oversized image preview into the payload budget instead of dropping it', async () => {
    const composer = fakeComposer()
    const oversized = imageGrab(1600, 1600)
    const preview = oversized.preview
    if (preview.kind !== 'image') throw new Error('expected an image preview')
    expect(new TextEncoder().encode(preview.dataUrl).length).toBeGreaterThan(MAX_PAYLOAD_BYTES)
    const staging = makeGrabStaging({ground: neverGrounds})
    staging.connect(composer)
    const added = composer.nextAdd()

    staging.stage(oversized)

    const payload = parseGrabPayload(await bodyOf(await added))
    expect(payload?.preview?.kind).toBe('image')
    expect(
      payload?.preview?.kind === 'image' ? new TextEncoder().encode(payload.preview.dataUrl).length : 0,
    ).toBeLessThanOrEqual(MAX_PAYLOAD_BYTES)
  })

  it('stages through a port that arrives and leaves again', async () => {
    const composer = fakeComposer()
    const staging: GrabStaging = makeGrabStaging({ground: async () => GROUNDED})
    staging.connect(composer)
    const replaced = composer.nextReplace()
    staging.stage(GRAB)
    await replaced
    await stagedWhen(staging, 1)

    staging.disconnect()

    expect(staging.staged()).toHaveLength(0)
    expect(composer.list()).toHaveLength(1)
    expect(composer.list()[0]?.contentType).toBe(GRAB_MIME)
  })

  function never(): never {
    throw new Error('expected an attachment')
  }

  it('a clear while a placement is in flight does not put the grab back on the composer', async () => {
    const composer = fakeComposer()
    const release = composer.holdAdds()
    const staging = makeGrabStaging({ground: neverGrounds})
    staging.connect(composer)
    const started = composer.nextAddStart()

    staging.stage(GRAB)
    await started
    const added = composer.nextAdd()
    const removed = composer.nextRemove()
    staging.clear()
    release()
    await added
    await removed

    expect(composer.list()).toHaveLength(0)
    expect(staging.staged()).toHaveLength(0)
  })

  it('a placement that lands after disconnect is redirected to the composer connected next', async () => {
    const first = fakeComposer()
    const second = fakeComposer()
    const release = first.holdAdds()
    const staging = makeGrabStaging({ground: neverGrounds})
    staging.connect(first)
    const started = first.nextAddStart()

    staging.stage(GRAB)
    await started
    const firstAdded = first.nextAdd()
    const firstRemoved = first.nextRemove()
    staging.disconnect()
    release()
    await firstAdded
    await firstRemoved

    const secondAdded = second.nextAdd()
    staging.connect(second)
    await secondAdded

    expect(first.list()).toHaveLength(0)
    expect(second.list()).toHaveLength(1)
  })

  it('a grab whose placement fails can still be placed on the next connection', async () => {
    const composer = fakeComposer()
    composer.failNextAdd()
    const grounding: {reached: () => void} = {reached: () => {}}
    const groundingReached = new Promise<void>((resolve) => {
      grounding.reached = resolve
    })
    const staging = makeGrabStaging({
      ground: async () => {
        grounding.reached()
        return null
      },
    })
    staging.connect(composer)

    staging.stage(GRAB)
    await groundingReached

    const added = composer.nextAdd()
    staging.connect(composer)
    await added

    expect(composer.list()).toHaveLength(1)
  })
})

describe('grab staging', () => {
  const core = bootedCore('grab-staging')
  const keep = keptPane()

  const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const snapshot = () => page.getByTitle('Grabbed element snapshot')
  const removeGrab = () => page.getByRole('button', {name: `Remove ${GRAB_FILE_NAME}`})

  test('the grab api an extension receives can stage, read and clear, as the terminal does', async () => {
    const sessionId = await createSession(coreRpc(core()))
    const mount = mountPane({base: core(), sessionId, extensions: [pageExtension]}, () => (
      <ChatPane sessionId={sessionId} />
    ))
    keep(mount)
    await expect.element(input()).toBeVisible()
    const api = makePaneGrabApi(mount.pane.grabStaging, mount.pane.grabProvider)

    api.stage(HERO_GRAB)

    await expect.element(snapshot()).toBeVisible()
    await expect.element(page.getByText(`↳ in ${HERO_LABEL}`)).toBeVisible()
    expect(api.staged().map((grab) => grab.text)).toEqual([HERO_GRAB.text])

    api.clear()

    await expect.element(removeGrab()).not.toBeInTheDocument()
    expect(api.staged()).toHaveLength(0)
  })
})

describe('indicators', () => {
  test('the thinking bubble renders its three dots', () => {
    const {container} = render(() => <ThinkingBubble />)
    expect(container.querySelectorAll('span')).toHaveLength(3)
  })
})

describe('kit controls', () => {
  function mount(view: () => JSX.Element): void {
    render(view)
  }

  function uiPart(spec: unknown): ToolCallPart {
    return {
      type: 'tool-call',
      id: 'call-1',
      name: 'conciv_ui',
      arguments: JSON.stringify(spec),
      state: 'input-complete',
    }
  }

  test('the way out of a notice explains itself with a tooltip a touch reader can reach, not a native title', async () => {
    const store = createNoticeStore()
    mount(() => <store.Toaster />)
    store.notify('Command copied. Paste it in your terminal.')

    await page.getByRole('button', {name: 'Dismiss'}).hover()

    await expect.element(page.getByRole('tooltip')).toHaveTextContent('Dismiss')
  })

  test('the quick terminal pop-out control explains itself with a tooltip, not a native title', async () => {
    mount(() => <QuickTerminalHeader onPip={() => {}} onSplit={() => {}} onClose={() => {}} />)

    await page.getByRole('button', {name: 'Pop out to a window'}).hover()

    await expect.element(page.getByRole('tooltip')).toHaveTextContent('Pop out to a window')
  })

  test('a form question answers with the option the reader picks out of the listbox', async () => {
    const answers: UiAnswerValue[] = []
    mount(() => (
      <UiCard
        part={uiPart({
          kind: 'form',
          title: 'Deploy settings',
          fields: [{name: 'env', label: 'Environment', type: 'select', options: ['staging', 'production']}],
        })}
        result={undefined}
        ctx={{apiBase: '', harnessId: 'fake', sendMessage: () => {}, catalog: INERT_TOOL_CATALOG, addResult: () => {}}}
        addResult={(value) => answers.push(value)}
      />
    ))

    await page.getByRole('combobox', {name: 'Environment'}).click()
    await page.getByRole('option', {name: 'production'}).click()

    await expect.element(page.getByRole('combobox', {name: 'Environment'})).toHaveTextContent('production')

    await page.getByRole('button', {name: 'Submit'}).click()

    expect(answers).toEqual([{env: 'production'}])
  })
})

describe('launch actions', () => {
  const CONNECT_COMMAND_PATH = ['ext', 'terminal', 'connectCommand']
  const LAUNCH_PATH = ['ext', 'terminal', 'launch']

  const core = {base: ''}
  const mounted: {pane: PaneMount | null} = {pane: null}
  const faults = trackedFaults()

  const grabApi: GrabApi = {
    pick: async () => null,
    comment: async () => null,
    cancel: () => {},
    isActive: () => false,
    stage: () => {},
    staged: () => [],
    clear: () => {},
  }

  beforeAll(async () => {
    const booted = await coreControl.bootCore({
      id: 'launch-actions',
      displayName: 'Claude',
      connect: true,
      terminal: true,
      resume: true,
      allowedOrigins: [window.location.origin],
    })
    core.base = booted.base
  }, 60_000)

  afterAll(async () => {
    await coreControl.closeCore()
  }, 30_000)

  afterEach(async () => {
    mounted.pane?.dispose()
    mounted.pane = null
    await coreControl.setTerminalLaunch(true)
  })

  async function mountActions(): Promise<void> {
    const sessionId = await createSession(coreRpc(core.base))
    mounted.pane = mountPane({base: core.base, sessionId}, () => (
      <HostApiProvider grab={grabApi} toast={() => {}}>
        <ComposerActionsHost>
          <ComposerActionsPrimitive.Trigger>
            <span aria-hidden="true" class="size-5 block" />
          </ComposerActionsPrimitive.Trigger>
          <ComposerActions
            sessionId={sessionId}
            compacting={false}
            onCompact={() => {}}
            onNewSession={() => {}}
            onStageGrab={() => {}}
          />
        </ComposerActionsHost>
      </HostApiProvider>
    ))
  }

  async function openMenu(): Promise<void> {
    await page.getByRole('button', {name: 'Terminal options for Claude'}).click()
  }

  test('the terminal menu offers launch and copy, and the connect candidates are gone', async () => {
    await mountActions()

    await openMenu()

    await expect.element(page.getByText('Open in Claude')).toBeVisible()
    await expect.element(page.getByText('Copy command')).toBeVisible()
    expect(page.getByText('Connect a running session').query()).toBeNull()
  })

  test('opening externally launches through the terminal extension', async () => {
    await mountActions()

    await openMenu()
    await page.getByText('Open in Claude').click()

    await expect.element(page.getByText('Opened in Claude.')).toBeVisible()
    expect(await coreControl.terminalLaunches()).toBe(1)
    expect(await coreControl.rpcCallCount(LAUNCH_PATH)).toBe(1)
  })

  test('when the terminal cannot open, the connect command is offered instead', async () => {
    await coreControl.setTerminalLaunch(false)
    await mountActions()
    const before = await coreControl.rpcCallCount(CONNECT_COMMAND_PATH)

    await openMenu()
    await page.getByText('Open in Claude').click()

    await expect.element(page.getByText(/Command copied|Run in your terminal: cd .*'claude' '--resume'/)).toBeVisible()
    expect((await coreControl.rpcCallCount(CONNECT_COMMAND_PATH)) - before).toBe(1)
  })

  test('copy command asks the terminal extension for the command', async () => {
    await mountActions()
    const before = await coreControl.rpcCallCount(CONNECT_COMMAND_PATH)

    await openMenu()
    await page.getByText('Copy command').click()

    await expect.element(page.getByText(/Command copied|Run in your terminal: cd .*'claude' '--resume'/)).toBeVisible()
    expect((await coreControl.rpcCallCount(CONNECT_COMMAND_PATH)) - before).toBe(1)
  })

  test('a launch failure is surfaced instead of swallowed', async () => {
    const fault = await faults.install({kind: 'fail', path: LAUNCH_PATH, status: 500})
    await mountActions()

    await openMenu()
    await page.getByText('Open in Claude').click()

    await expect.element(page.getByText('Couldn’t open Claude.')).toBeVisible()

    await coreControl.releaseFault(fault)
  })
})

describe('launch menu', () => {
  const NARROW_PX = 70
  const WIDE_PX = 460

  type MenuMount = {setWidth: (pixels: number) => void}

  function mountMenu(state: {pending?: boolean; failed?: boolean} = {}): MenuMount {
    const [made, setMade] = createSignal<string[]>([])
    const [width, setWidth] = createSignal(WIDE_PX)
    const choose = (choice: string) => setMade((choices) => [...choices, choice])
    render(() => (
      <>
        <ul>
          <For each={made()}>{(choice) => <li>chose {choice}</li>}</For>
        </ul>
        <div style={{width: `${width()}px`}}>
          <ComposerActionsHost>
            <ComposerActionsPrimitive.Trigger>
              <span aria-hidden="true">…</span>
            </ComposerActionsPrimitive.Trigger>
            <ComposerActionsPrimitive.Trailing>
              <span />
            </ComposerActionsPrimitive.Trailing>
            <ComposerActionsPrimitive.ActionButton
              priority={20}
              tooltip="Earlier action"
              onClick={() => choose('earlier')}
            >
              <span aria-hidden="true" />
            </ComposerActionsPrimitive.ActionButton>
            <LaunchMenu
              harnessName="Claude"
              class="size-8"
              pending={state.pending}
              failed={state.failed}
              onOpen={() => choose('open')}
              onCopy={() => choose('copy')}
              onRetry={() => choose('retry')}
            />
            <ComposerActionsPrimitive.ActionButton priority={5} tooltip="Later action" onClick={() => choose('later')}>
              <span aria-hidden="true" />
            </ComposerActionsPrimitive.ActionButton>
          </ComposerActionsHost>
        </div>
      </>
    ))
    return {setWidth}
  }

  const chosen = (): string[] =>
    page
      .getByRole('listitem')
      .elements()
      .map((item) => item.textContent ?? '')

  const overflowTrigger = () => page.getByRole('button', {name: 'More composer actions'})
  const launchTrigger = () => page.getByRole('button', {name: 'Terminal options for Claude'})
  const openItem = () => page.getByRole('menuitem', {name: 'Open in Claude'})
  const copyItem = () => page.getByRole('menuitem', {name: 'Copy command'})
  const retryItem = () => page.getByRole('menuitem', {name: /Terminal options unavailable for Claude/})
  const laterItem = () => page.getByRole('menuitem', {name: 'Later action'})

  const menuItemLabels = (): string[] =>
    page
      .getByRole('menuitem')
      .elements()
      .map((item) => item.textContent ?? '')

  test('offers opening the terminal or copying the command', async () => {
    mountMenu()
    const trigger = page.getByRole('button', {name: 'Terminal options for Claude'})

    await expect.element(trigger).toHaveAttribute('aria-haspopup', 'menu')
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')
    await trigger.click()
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'true')

    await page.getByRole('menuitem', {name: 'Open in Claude'}).click()
    await expect.element(page.getByText('chose open')).toBeVisible()
    expect(chosen()).toEqual(['chose open'])
    await expect.element(trigger).toHaveAttribute('aria-expanded', 'false')

    await trigger.click()
    await page.getByRole('menuitem', {name: 'Copy command'}).click()
    await expect.element(page.getByText('chose copy')).toBeVisible()
    expect(chosen()).toEqual(['chose open', 'chose copy'])
    expect(document.body.textContent).not.toContain('Connect a running session')
  })

  test('the trigger is there from the first frame, busy until the harness answers', async () => {
    mountMenu({pending: true})
    const trigger = page.getByRole('button', {name: 'Terminal options for Claude'})

    await expect.element(trigger).toBeVisible()
    await expect.element(trigger).toHaveAttribute('aria-busy', 'true')
    await expect.element(trigger).toBeDisabled()
  })

  test('a harness that could not be read says so and offers another go', async () => {
    mountMenu({failed: true})

    await page.getByRole('button', {name: 'Terminal options for Claude'}).click()
    const item = page.getByRole('menuitem', {name: /Terminal options unavailable for Claude/})
    await expect.element(item).toBeVisible()
    expect(page.getByRole('menuitem', {name: 'Open in Claude'}).elements()).toHaveLength(0)

    await item.click()
    await expect.element(page.getByText('chose retry')).toBeVisible()
    expect(chosen()).toEqual(['chose retry'])
  })

  test('a narrow composer folds the launch options into the shared overflow menu, kept together', async () => {
    const mount = mountMenu()
    await expect.element(launchTrigger()).toBeVisible()

    mount.setWidth(NARROW_PX)

    await expect.element(launchTrigger()).not.toBeInTheDocument()
    await userEvent.click(overflowTrigger())
    await expect.element(openItem()).toBeVisible()
    await expect.element(copyItem()).toBeVisible()
    await expect.element(laterItem()).toBeVisible()
    expect(menuItemLabels()).toEqual(['Earlier action', 'Open in Claude', 'Copy command', 'Later action'])

    await userEvent.click(openItem())
    await expect.element(page.getByText('chose open')).toBeVisible()
    expect(chosen()).toEqual(['chose open'])
  })

  test('a collapsed launch menu offers the retry instead when the harness could not be read', async () => {
    const mount = mountMenu({failed: true})
    await expect.element(launchTrigger()).toBeVisible()

    mount.setWidth(NARROW_PX)

    await userEvent.click(overflowTrigger())
    await expect.element(retryItem()).toBeVisible()
    await expect.element(openItem()).not.toBeInTheDocument()
    await expect.element(copyItem()).not.toBeInTheDocument()

    await userEvent.click(retryItem())
    await expect.element(page.getByText('chose retry')).toBeVisible()
    expect(chosen()).toEqual(['chose retry'])
  })

  test('a collapsed launch menu stays untouchable until the harness answers', async () => {
    const mount = mountMenu({pending: true})
    await expect.element(launchTrigger()).toBeVisible()

    mount.setWidth(NARROW_PX)

    await userEvent.click(overflowTrigger())
    await expect.element(openItem()).toHaveAttribute('aria-disabled', 'true')
    await expect.element(copyItem()).toHaveAttribute('aria-disabled', 'true')
  })
})

describe('launcher activity', () => {
  const coreBase = bootedCore('launcher-activity')
  const harness = createShellHarness(coreBase)

  afterEach(async () => {
    await coreControl.releaseTurn()
    await coreControl.releaseStart()
    harness.dispose()
  })

  const launcher = () => page.getByRole('button', {name: 'Minimize conciv chat'})
  const composer = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const sessionOptions = () => page.getByRole('button', {name: 'Session options'})
  const sessionPicker = () => page.getByRole('button', {name: 'Session: the session in front'})
  const refreshRow = () => page.getByRole('button', {name: 'Refresh the conversation'})
  const backgroundRow = () => page.getByRole('option', {name: /the session behind.*running/})

  test('a run in a session the launcher does not target leaves the launcher asleep', async () => {
    await page.viewport(1000, 900)
    const rpc = coreRpc(coreBase())
    const activeId = await createSession(rpc)
    await rpc.sessions.rename({sessionId: activeId, title: 'the session in front'})
    const backgroundId = await createSession(rpc)
    await rpc.sessions.rename({sessionId: backgroundId, title: 'the session behind'})
    await coreControl.holdTurn()
    await sendTurn(coreBase(), backgroundId, 'a run nobody opened')

    harness.mountShell(`/panel/${activeId}?open=true`)
    await expect.element(composer(), {timeout: 8000}).toBeVisible()
    await sessionOptions().click()
    await sessionPicker().click()
    await expect.element(backgroundRow(), {timeout: 8000}).toBeVisible()

    await expect.element(launcher(), {timeout: 2000}).toHaveAttribute('aria-busy', 'false')
  }, 30_000)

  test('the launcher follows the targeted session from the start of a run to its settle', async () => {
    await page.viewport(1000, 900)
    const rpc = coreRpc(coreBase())
    const sessionId = await createSession(rpc)

    harness.mountShell(`/panel/${sessionId}?open=true`)
    await expect.element(composer(), {timeout: 8000}).toBeVisible()
    await expect.element(launcher()).toHaveAttribute('aria-busy', 'false')

    await coreControl.holdTurn()
    await sendTurn(coreBase(), sessionId, 'a run this widget never sent')

    await expect.element(launcher(), {timeout: 8000}).toHaveAttribute('aria-busy', 'true')

    await coreControl.releaseTurn()

    await expect.element(launcher(), {timeout: 8000}).toHaveAttribute('aria-busy', 'false')
  }, 30_000)

  test('the status bar reads RUNNING and Refresh stays off while a compact run has not streamed its start yet, until it ends', async () => {
    await page.viewport(1000, 900)
    const sessionId = await createSession(coreRpc(coreBase()))

    harness.mountShell(`/panel/${sessionId}?open=true`)
    await expect.element(composer(), {timeout: 8000}).toBeVisible()
    await expect.element(page.getByText('DONE', {exact: true})).toBeVisible()

    await coreControl.holdStart()
    await page.getByRole('button', {name: 'More composer actions'}).click()
    await page.getByRole('menuitem', {name: 'Compress the conversation'}).click()

    await expect.element(page.getByText('Responding…'), {timeout: 8000}).toBeVisible()
    await expect.element(page.getByText('RUNNING', {exact: true})).toBeVisible()
    await sessionOptions().click()
    await expect.element(refreshRow()).toBeDisabled()
    await userEvent.keyboard('{Escape}')

    await coreControl.releaseStart()

    await expect.element(page.getByText('DONE', {exact: true}), {timeout: 8000}).toBeVisible()
    await sessionOptions().click()
    await expect.element(refreshRow()).toBeEnabled()
  }, 30_000)
})

describe('live sessions', () => {
  const TARGET = 'session-in-front'
  const OTHER = 'session-behind'

  function trackActivity(sessionId: string | null): {
    live: LiveSessions
    notifications: () => number
    dispose: () => void
  } {
    return createRoot((dispose) => {
      const live = makeLiveSessions()
      let runs = 0
      createComputed(() => {
        live.activityIn(sessionId)
        runs += 1
      })
      return {live, notifications: () => runs, dispose}
    })
  }

  function makeChat(): {working: Accessor<boolean>; setWorking: (value: boolean) => void} {
    const [working, setWorking] = createSignal(false)
    return {working, setWorking}
  }

  describe('makeLiveSessions', () => {
    it('reports no pane for a session nobody has mounted', () => {
      const {live, dispose} = trackActivity(TARGET)

      expect(live.activityIn(TARGET)).toBe('unmounted')
      dispose()
    })

    it('reports an idle pane without waking the launcher', () => {
      const {live, notifications, dispose} = trackActivity(TARGET)
      const chat = makeChat()

      expect(notifications()).toBe(1)
      const closePane = live.register(TARGET, chat.working)

      expect(live.activityIn(TARGET), 'a mounted idle pane owns the answer').toBe('idle')
      closePane()
      dispose()
    })

    it('notifies on the real start and the real settle of the targeted pane', () => {
      const {live, notifications, dispose} = trackActivity(TARGET)
      const chat = makeChat()
      const closePane = live.register(TARGET, chat.working)

      chat.setWorking(true)

      expect(live.activityIn(TARGET)).toBe('running')

      chat.setWorking(false)

      expect(live.activityIn(TARGET)).toBe('idle')
      expect(notifications(), 'only the registration and the two real edges notify').toBe(4)
      closePane()
      dispose()
    })

    it('never lets a run in another session answer for the targeted one', () => {
      const {live, notifications, dispose} = trackActivity(TARGET)
      const elsewhere = makeChat()
      const closePane = live.register(OTHER, elsewhere.working)
      const before = notifications()

      elsewhere.setWorking(true)

      expect(live.activityIn(TARGET), 'a run behind the targeted session stays behind it').toBe('unmounted')
      expect(live.activityIn(OTHER)).toBe('running')
      expect(notifications(), 'an unrelated session never wakes the launcher').toBe(before)
      closePane()
      dispose()
    })

    it('keeps the targeted session busy until every pane of that session settles', () => {
      const {live, dispose} = trackActivity(TARGET)
      const firstPane = makeChat()
      const secondPane = makeChat()
      const closeFirst = live.register(TARGET, firstPane.working)
      const closeSecond = live.register(TARGET, secondPane.working)

      firstPane.setWorking(true)
      secondPane.setWorking(true)
      firstPane.setWorking(false)

      expect(live.activityIn(TARGET), 'the second pane still holds the launcher busy').toBe('running')

      secondPane.setWorking(false)

      expect(live.activityIn(TARGET), 'the last pane settling releases the launcher').toBe('idle')
      closeFirst()
      closeSecond()
      dispose()
    })

    it('disposes registrations one at a time even when two panes share one accessor', () => {
      const {live, dispose} = trackActivity(TARGET)
      const chat = makeChat()
      const closeFirst = live.register(TARGET, chat.working)
      const closeSecond = live.register(TARGET, chat.working)
      chat.setWorking(true)

      closeFirst()

      expect(live.activityIn(TARGET), 'the surviving registration still holds the launcher').toBe('running')

      closeSecond()

      expect(live.activityIn(TARGET), 'the last registration leaves no pane behind').toBe('unmounted')
      dispose()
    })

    it('answers unmounted for a widget that targets no session at all', () => {
      const {live, dispose} = trackActivity(null)
      const chat = makeChat()
      const closePane = live.register(TARGET, chat.working)
      chat.setWorking(true)

      expect(live.activityIn(null)).toBe('unmounted')
      closePane()
      dispose()
    })
  })
})

describe('model selector', () => {
  const SONNET: HarnessModelInfo = {id: 'sonnet', name: 'Sonnet', group: 'Anthropic'}

  type Mounted = {retries: () => number; recover: () => void}

  function mountSelector(): Mounted {
    const [models, setModels] = createSignal<HarnessModelInfo[]>([])
    const [failed, setFailed] = createSignal(true)
    const [retries, setRetries] = createSignal(0)
    const recover = () => {
      setModels([SONNET])
      setFailed(false)
    }
    render(() => (
      <ModelSelectorView
        models={models()}
        value={null}
        failed={failed()}
        retrying={false}
        onRetry={() => setRetries(retries() + 1)}
        onSelect={() => {}}
      />
    ))
    return {retries, recover}
  }

  test('a model list that failed to load offers a retry instead of vanishing', async () => {
    const mounted = mountSelector()

    await expect.element(page.getByText('Couldn’t load models')).toBeVisible()
    const retry = page.getByRole('button', {name: 'Retry loading models'})
    await expect.element(retry).toBeVisible()
    expect(page.getByRole('button', {name: 'Select model'}).elements()).toHaveLength(0)

    await retry.click()
    expect(mounted.retries()).toBe(1)

    mounted.recover()
    await expect.element(page.getByRole('button', {name: 'Select model'})).toBeVisible()
    expect(page.getByText('Couldn’t load models').elements()).toHaveLength(0)
  })
})

describe('notices', () => {
  function mountToaster(): {notify: Notify; showToaster: (visible: boolean) => void} {
    const store = createNoticeStore()
    const [standing, setStanding] = createSignal(true)
    const mounted = render(() => (
      <Show when={standing()} fallback={<p>another session</p>}>
        <store.Toaster />
      </Show>
    ))
    mounted.container.className = 'dark'
    return {notify: store.notify, showToaster: (visible) => setStanding(visible)}
  }

  test('an empty notifications region takes no space above the header', async () => {
    const {notify} = mountToaster()

    await expect.element(page.getByRole('region', {name: /Notifications/})).not.toBeVisible()

    notify('Command copied. Paste it in your terminal.')
    await expect.element(page.getByRole('region', {name: /Notifications/})).toBeVisible()

    await page.getByRole('button', {name: 'Dismiss'}).click()

    await expect.element(page.getByText('Command copied. Paste it in your terminal.')).not.toBeInTheDocument()
    await expect.element(page.getByRole('region', {name: /Notifications/})).not.toBeVisible()
  })

  test('a notice stands in the notifications region until it is dismissed by hand', async () => {
    const {notify} = mountToaster()

    notify('Command copied. Paste it in your terminal.')

    await expect
      .element(
        page.getByRole('region', {name: /Notifications/}).getByText('Command copied. Paste it in your terminal.'),
      )
      .toBeVisible()

    await page.getByRole('button', {name: 'Dismiss'}).click()

    await expect.element(page.getByText('Command copied. Paste it in your terminal.')).not.toBeInTheDocument()
  })

  test('an alarming notice asks to be read at once, a plain one waits its turn', async () => {
    const {notify} = mountToaster()

    notify('Still connected to your terminal.', {tone: 'danger'})

    await expect.element(page.getByRole('alert').getByText('Still connected to your terminal.')).toBeVisible()

    notify('Command copied. Paste it in your terminal.')

    await expect.element(page.getByRole('status').getByText('Command copied. Paste it in your terminal.')).toBeVisible()
  })

  test('the way out of a notice runs once and takes the notice with it', async () => {
    const {notify} = mountToaster()
    let handedBack = 0
    notify('Now following fix the flaky test.', {
      action: {
        label: 'Undo',
        run: () => {
          handedBack += 1
        },
      },
    })

    await page.getByRole('button', {name: 'Undo'}).click()

    await expect.element(page.getByText('Now following fix the flaky test.')).not.toBeInTheDocument()
    expect(handedBack).toBe(1)
  })

  test('a notice raised again under the same name replaces the one already standing', async () => {
    const {notify} = mountToaster()

    notify('Still connected to your terminal.', {key: 'hand-back', tone: 'danger'})
    await expect.element(page.getByText('Still connected to your terminal.')).toBeVisible()

    notify('Handed the terminal back.', {key: 'hand-back', tone: 'success'})

    await expect.element(page.getByText('Handed the terminal back.')).toBeVisible()
    await expect.element(page.getByText('Still connected to your terminal.')).not.toBeInTheDocument()
  })

  test('a notice that offers a way out survives leaving the session it was raised in', async () => {
    const {notify, showToaster} = mountToaster()
    notify('Now following fix the flaky test.', {action: {label: 'Undo', run: () => {}}})
    await expect.element(page.getByText('Now following fix the flaky test.')).toBeVisible()

    showToaster(false)
    await expect.element(page.getByText('another session')).toBeVisible()
    showToaster(true)

    await expect.element(page.getByText('Now following fix the flaky test.')).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Undo'})).toBeVisible()
  })

  test('an alarming notice that offers a way out shows both the way out and the way to dismiss', async () => {
    const {notify} = mountToaster()

    notify('Still connected to your terminal.', {tone: 'danger', action: {label: 'Hand it back', run: () => {}}})

    await expect.element(page.getByRole('alert').getByText('Still connected to your terminal.')).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Hand it back'})).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Dismiss'})).toBeVisible()
  })

  test('the way out of a notice explains itself with a tooltip a touch reader can reach', async () => {
    const {notify} = mountToaster()
    notify('Command copied. Paste it in your terminal.')

    await page.getByRole('button', {name: 'Dismiss'}).hover()

    await expect.element(page.getByRole('tooltip')).toHaveTextContent('Dismiss')
  })
})

describe('page session card', () => {
  const core = {base: ''}
  const mounted: {pane: PaneMount | null} = {pane: null}

  beforeAll(async () => {
    const booted = await coreControl.bootCore({id: 'page-session-card', allowedOrigins: [window.location.origin]})
    core.base = booted.base
  }, 60_000)

  afterAll(async () => {
    await coreControl.closeCore()
  }, 30_000)

  afterEach(() => {
    mounted.pane?.dispose()
    mounted.pane = null
  })

  test('a reloaded transcript of page acts renders one aggregated session card with the reply', async () => {
    const rpc = coreRpc(core.base)
    const sessionId = await createSession(rpc)
    await coreControl.scriptTurn({
      toolCalls: [
        {name: 'page_fill', input: {selector: '#name', value: 'Ada'}, result: {ok: true, value: 'Ada'}},
        {
          name: 'page_fill',
          input: {selector: '#email', value: 'ada@example.com'},
          result: {ok: true, value: 'ada@example.com'},
        },
      ],
      text: 'The profile form is filled in.',
    })
    await runTurn(core.base, sessionId, 'fill in the profile form')

    mounted.pane = mountPane({base: core.base, sessionId}, () => <ChatPane sessionId={sessionId} />)

    await expect.element(page.getByText('Edited the page'), {timeout: 5000}).toBeVisible()
    await expect.element(page.getByText('The profile form is filled in.')).toBeVisible()
    expect(page.getByText('Edited the page').elements()).toHaveLength(1)
    await expect.element(page.getByText('Typed')).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', {name: '2 steps'})).not.toBeInTheDocument()
  })

  test('a live code-mode page act settles into one session card when the reply streams after it in the same message', async () => {
    const rpc = coreRpc(core.base)
    const sessionId = await createSession(rpc)
    mounted.pane = mountPane({base: core.base, sessionId}, () => <ChatPane sessionId={sessionId} />)
    await coreControl.scriptToolCall('execute_typescript', {
      typescriptCode: "await external_page_settext({selector: '#prose', text: 'rewritten'})",
    })

    await page.getByRole('textbox', {name: 'Message the conciv agent'}).fill('rewrite the prose')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByRole('button', {name: 'Send message'}), {timeout: 15_000}).toBeVisible()
    await expect.element(page.getByText('Edited the page')).toBeVisible()
    await expect.element(page.getByText('Hello from conciv')).toBeVisible()
    await expect.element(page.getByText(/stale value/)).not.toBeInTheDocument()
  })
})

describe('pane attachments', () => {
  function fixtureExtension() {
    const attachment = defineAttachment({mime: 'application/x-fixture'})
    attachment.card(() => null)
    return defineExtension({name: 'fixture', attachments: [attachment]})
  }

  describe('paneAttachments', () => {
    it('collects cards and accepts files of a registered mime', async () => {
      const {cards, adapter} = paneAttachments([fixtureExtension()], false)
      expect(cards.map((entry) => entry.mime)).toEqual(['application/x-fixture'])
      const pending = await adapter.add({file: new File(['{"x":1}'], 'fixture.bin', {type: 'application/x-fixture'})})
      if (Symbol.asyncIterator in pending) throw new Error('expected a promise-based adapter')
      expect(pending.contentType).toBe('application/x-fixture')
      expect(pending.type).toBe('document')
    })

    it('accepts grab attachments when the page extension is installed', () => {
      const {cards, adapter} = paneAttachments([pageExtension], false)

      expect(cards.some((entry) => entry.mime === 'application/vnd.conciv.grab+json')).toBe(true)
      expect(adapter.accept).toContain('application/vnd.conciv.grab+json')
    })

    it('does not accept grab attachments with no extensions installed', () => {
      const {cards, adapter} = paneAttachments([], false)

      expect(cards.some((entry) => entry.mime === 'application/vnd.conciv.grab+json')).toBe(false)
      expect(adapter.accept).not.toContain('application/vnd.conciv.grab+json')
    })

    it('still accepts text files and gates images on harness support', () => {
      expect(paneAttachments([], false).adapter.accept).not.toContain('image/*')
      expect(paneAttachments([], 'native').adapter.accept).toContain('image/*')
      expect(paneAttachments([], 'fileRef').adapter.accept).toContain('text/plain')
    })
  })
})

describe('pane composer stop send', () => {
  function Harness(): JSX.Element {
    const chat = createChat({
      threadId: 'pane-composer-stop-send',
      connection: storyConnection({chunks: createTextChunks('working on it'), runsUntilStopped: true}),
    })
    onMount(() => void chat.sendMessage('go'))
    return (
      <EngineReachabilityContext.Provider value={{online: () => true, sustainedOffline: () => false}}>
        <ChatProvider chat={chat}>
          <ComposerHandlersProvider value={{}}>
            <PaneComposer
              draftStorage={memoryStorage()}
              draftKey="test"
              placeholder="Ask anything…"
              inputLabel="Message"
            />
          </ComposerHandlersProvider>
        </ChatProvider>
      </EngineReachabilityContext.Provider>
    )
  }

  describe('PaneComposer stop/send swap', () => {
    it('swaps the Send control for Stop while the run streams, and back to Send once it settles', async () => {
      render(() => <Harness />)
      const stop = page.getByRole('button', {name: 'Stop generating'})
      await expect.element(stop).toBeVisible()
      await expect.element(stop).toHaveTextContent('Stop^C')
      await userEvent.click(stop)
      const send = page.getByRole('button', {name: 'Send message'})
      await expect.element(send).toBeVisible()
      await expect.element(send).toHaveTextContent('Send⏎')
    })
  })
})

describe('pane composer stopping', () => {
  function lifecycleSourceAt(phase: RunClockSource['lifecycle']['phase']): RunClockSource {
    return {
      lifecycle: {runId: 'run-1', phase, startedAt: 0, finishedAt: null, serverNow: 0, error: null},
      receivedAt: Date.now(),
    }
  }

  function Harness(props: {settle: (settle: () => void) => void}): JSX.Element {
    const chat = createChat({
      threadId: 'pane-composer-stopping',
      connection: storyConnection({chunks: createTextChunks('working on it'), runsUntilStopped: true}),
    })
    const [serverGenerating, setServerGenerating] = createSignal(true)
    const [runSource, setRunSource] = createSignal<RunClockSource | null>(null)
    const observed = {...chat, sessionGenerating: serverGenerating}
    const stopping = createMemo(() => runSource()?.lifecycle.phase === 'stopping')
    const stoppable = {
      ...observed,
      stopping,
      stop: () => {
        setRunSource(lifecycleSourceAt('stopping'))
        chat.stop()
      },
    }
    onMount(() => {
      void chat.sendMessage('go')
      props.settle(() => {
        setRunSource(lifecycleSourceAt('aborted'))
        setServerGenerating(false)
      })
    })
    return (
      <EngineReachabilityContext.Provider value={{online: () => true, sustainedOffline: () => false}}>
        <ChatProvider chat={stoppable}>
          <ComposerHandlersProvider value={{}}>
            <PaneComposer
              draftStorage={memoryStorage()}
              draftKey="test"
              placeholder="Ask anything…"
              inputLabel="Message"
            />
          </ComposerHandlersProvider>
        </ChatProvider>
      </EngineReachabilityContext.Provider>
    )
  }

  describe('PaneComposer stopping state', () => {
    it('shows a disabled Stopping control from the click until the server reports the run settled', async () => {
      const control = {settle: () => {}}
      render(() => <Harness settle={(settle) => void (control.settle = settle)} />)

      const stop = page.getByRole('button', {name: 'Stop generating'})
      await expect.element(stop).toBeEnabled()
      await expect.element(stop).toHaveTextContent('Stop^C')

      await userEvent.click(stop)

      const stopping = page.getByRole('button', {name: 'Stopping the run'})
      await expect.element(stopping).toBeVisible()
      await expect.element(stopping).toHaveTextContent('Stopping…')
      await expect.element(stopping).toBeDisabled()

      control.settle()

      const send = page.getByRole('button', {name: 'Send message'})
      await expect.element(send).toBeVisible()
      await expect.element(send).toHaveTextContent('Send⏎')
    })
  })
})

describe('pane harness disposal', () => {
  test('disposing a mounted pane disposes every extension instance it created', () => {
    const order: string[] = []
    const first = defineExtension({name: 'pane-harness-disposal-a'}).client(() => ({
      value: {},
      dispose: () => order.push('a'),
    }))
    const second = defineExtension({name: 'pane-harness-disposal-b'}).client(() => ({
      value: {},
      dispose: () => order.push('b'),
    }))
    const mount = mountPane({base: 'http://127.0.0.1:9', sessionId: 'conciv_1', extensions: [first, second]}, () => (
      <div>pane</div>
    ))

    expect(order).toEqual([])

    mount.dispose()

    expect(order).toEqual(['a', 'b'])
  })
})

const FOUND_API_BASE = 'http://found.test'
const CONNECT_PROBE_NAME = 'connect-probe'

function ConnectProbe(): JSX.Element {
  const connect = getExtensionApi(CONNECT_PROBE_NAME).useConnect()
  return (
    <button type="button" onClick={() => connect.found(FOUND_API_BASE)}>
      Simulate found
    </button>
  )
}

const connectProbe = defineExtension({
  name: CONNECT_PROBE_NAME,
  Component: () => (
    <Show when={getExtensionApi(CONNECT_PROBE_NAME).useSlot() === 'connect'}>
      <ConnectProbe />
    </Show>
  ),
}).client(() => ({value: {}}))

declare module '@conciv/protocol/config-types' {
  interface ExtensionRegistry extends RegisterExtension<typeof connectProbe> {}
}

describe('panel connect', () => {
  const RESOLVE_PATH = ['sessions', 'resolve']

  const core = {base: ''}
  const harness = createShellHarness(() => core.base)
  const faults = trackedFaults()

  beforeAll(async () => {
    const booted = await coreControl.bootCore({id: 'panel-connect', allowedOrigins: [window.location.origin]})
    core.base = booted.base
  }, 60_000)

  afterAll(async () => {
    await coreControl.closeCore()
  }, 30_000)

  afterEach(harness.dispose)

  const mountShell = (): void => harness.mountShell('/panel/connect?open=true', [connectProbe])

  const simulateFound = () => page.getByRole('button', {name: 'Simulate found'})
  const bindFailure = () => page.getByText(/conciv couldn.t connect to that workspace/)
  const serverError = () => page.getByText('Internal Server Error')
  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

  test('a bind that fails with a transport failure shows the connect failure screen, and retrying against a healthy engine hands off to the panel', async () => {
    const unreachable = await faults.install({kind: 'abort', path: RESOLVE_PATH})
    mountShell()

    await simulateFound().click()

    await expect.element(bindFailure(), {timeout: 8000}).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Retry'})).toBeVisible()

    await expectRetryRecovers(() => coreControl.releaseFault(unreachable), editor, bindFailure)
  }, 30_000)

  test('a bind that fails with a server error shows the actual error, not the workspace-unreachable message', async () => {
    const refused = await faults.install({kind: 'fail', path: RESOLVE_PATH, status: 500})
    mountShell()

    await expect.element(simulateFound(), {timeout: 8000}).toBeVisible()
    await simulateFound().click()

    await expect.element(serverError(), {timeout: 8000}).toBeVisible()
    await expect.element(bindFailure()).not.toBeInTheDocument()

    await expectRetryRecovers(() => coreControl.releaseFault(refused), editor, serverError)
  }, 30_000)

  test('a bind that succeeds on the first try never shows the failure screen', async () => {
    mountShell()

    await simulateFound().click()

    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    await expect.element(bindFailure()).not.toBeInTheDocument()
  }, 30_000)
})

describe('panel focus stability', () => {
  const SETTLED = {timeout: 1500}

  const core = {base: ''}
  const harness = createShellHarness(() => core.base)
  const faults = trackedFaults()

  beforeAll(async () => {
    const booted = await coreControl.bootCore({id: 'panel-focus-stability', allowedOrigins: [window.location.origin]})
    core.base = booted.base
  }, 60_000)

  afterAll(async () => {
    await coreControl.closeCore()
  }, 30_000)

  afterEach(harness.dispose)

  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

  async function openPanel(): Promise<void> {
    const sessionId = await createSession(coreRpc(core.base))
    harness.mountShell(`/panel/${sessionId}?open=true`)
  }

  async function expectFocusSurvivesPendingRequest(path: string[]): Promise<void> {
    const held = await faults.install({kind: 'gate', path})
    await openPanel()
    await coreControl.awaitFaultPending(held, 1)

    await expect.element(editor(), SETTLED).toBeVisible()
    const mountedNode = editor().element()
    await expect.element(editor(), SETTLED).toHaveFocus()
    expect(await coreControl.faultPending(held)).toBe(1)

    await coreControl.releaseFault(held)
    await coreControl.awaitFaultAnswered(held)

    await expect.element(editor(), SETTLED).toHaveFocus()
    expect(editor().element().isSameNode(mountedNode)).toBe(true)
  }

  test('a composer that mounts after a slow draft load keeps the focus the panel gave it', async () => {
    const held = await faults.install({kind: 'gate', path: ['drafts', 'get']})
    await openPanel()
    await coreControl.awaitFaultPending(held, 1)

    await coreControl.releaseFault(held)
    await coreControl.awaitFaultAnswered(held)

    await expect.element(editor(), SETTLED).toBeVisible()
    const mountedNode = editor().element()
    await expect.element(editor(), SETTLED).toHaveFocus()
    expect(editor().element().isSameNode(mountedNode)).toBe(true)
  }, 30_000)

  test('a composer that mounts while the harness metadata is still loading takes the focus the panel gave it', async () => {
    await expectFocusSurvivesPendingRequest(['meta', 'models'])
  }, 30_000)

  test('a composer that mounts while the transcript is still loading takes the focus the panel gave it', async () => {
    await expectFocusSurvivesPendingRequest(['markers', 'list'])
  }, 30_000)

  test('a composer that mounts while the session list is still loading keeps the focus the panel gave it', async () => {
    await expectFocusSurvivesPendingRequest(['sessions', 'list'])
  }, 30_000)
})

describe('panel refresh', () => {
  const HYDRATE_PATH = ['chat', 'hydrate']
  const REPLY_TEXT = 'the transcript that outlives a refresh'

  const coreBase = bootedCore('panel-refresh')
  const harness = createShellHarness(coreBase)
  const faults = trackedFaults()

  afterEach(harness.dispose)

  const reply = () => page.getByText(REPLY_TEXT)
  const skeleton = () => page.getByRole('status', {name: 'Loading conversation'})
  const sessionMenu = () => page.getByRole('button', {name: 'Session options'})
  const refreshingMenu = () => page.getByRole('button', {name: 'Refreshing the conversation'})
  const refreshRow = () => page.getByRole('button', {name: 'Refresh the conversation'})

  test('refreshing the conversation dismisses the menu, shows progress, and keeps the transcript', async () => {
    const rpc = coreRpc(coreBase())
    const sessionId = await createSession(rpc)
    await coreControl.scriptTurn({toolCalls: [], text: REPLY_TEXT})
    await runTurn(coreBase(), sessionId, 'seed the transcript')
    harness.mountShell(`/panel/${sessionId}?open=true`)

    await expect.element(reply(), {timeout: 8000}).toBeVisible()

    await sessionMenu().click()
    await expect.element(refreshRow(), {timeout: 8000}).toBeVisible()

    const gate = await faults.install({kind: 'gate', path: HYDRATE_PATH})
    await refreshRow().click()
    await coreControl.awaitFaultPending(gate, 1)

    await expect.element(refreshingMenu(), {timeout: 8000}).toBeVisible()
    await expect.element(refreshRow()).not.toBeInTheDocument()
    await expect.element(reply()).toBeVisible()
    await expect.element(skeleton()).not.toBeInTheDocument()

    await coreControl.releaseFault(gate)

    await expect.element(sessionMenu(), {timeout: 8000}).toBeVisible()
    await expect.element(reply()).toBeVisible()
    await expect.element(skeleton()).not.toBeInTheDocument()
  }, 30_000)
})

describe('panel view tabs', () => {
  const SUBSCRIBE_PATH = ['chat', 'subscribe']
  const NOTES_BODY = 'the notes view body'
  const REPLY_TEXT = 'the transcript that outlives a tab switch'
  const LONG_REPLY_TEXT = 'the last turn of a virtualized transcript'
  const SEEDED_EXCHANGES = Math.ceil((VIRTUALIZE_THRESHOLD + 1) / 2)

  function NotesView(): JSX.Element {
    return <p>{NOTES_BODY}</p>
  }

  const notesExtension = defineExtension({
    name: 'panel-view-survival',
    views: [{id: 'notes', label: 'Notes', Component: NotesView}],
  })

  const coreBase = bootedCore('panel-view-tabs')
  const harness = createShellHarness(coreBase)
  const faults = trackedFaults()

  afterEach(harness.dispose)

  const reply = () => page.getByText(REPLY_TEXT)
  const longReply = () => page.getByText(LONG_REPLY_TEXT)
  const notes = () => page.getByText(NOTES_BODY)
  const skeleton = () => page.getByRole('status', {name: 'Loading conversation'})
  const chatTab = () => page.getByRole('tab', {name: 'Chat', exact: true})
  const notesTab = () => page.getByRole('tab', {name: 'Notes', exact: true})
  const panel = () => page.getByRole('tabpanel')

  function elementById(node: Node, id: string): Element | null {
    const root = node.getRootNode()
    if (root instanceof ShadowRoot) return root.getElementById(id)
    if (root instanceof Document) return root.getElementById(id)
    return null
  }

  async function mountSeededPanel(): Promise<void> {
    const rpc = coreRpc(coreBase())
    const sessionId = await createSession(rpc)
    await coreControl.scriptTurn({toolCalls: [], text: REPLY_TEXT})
    await runTurn(coreBase(), sessionId, 'seed the transcript')
    harness.mountShell(`/panel/${sessionId}?open=true`, [notesExtension])
  }

  function expectTabOwnsPanel(tab: Element, panelElement: Element): void {
    const controls = tab.getAttribute('aria-controls')
    expect(controls, 'the selected tab names the panel it controls').toBe(panelElement.id)
    expect(panelElement.getAttribute('aria-labelledby'), 'the panel names the tab that labels it').toBe(tab.id)
    expect(controls === null ? null : elementById(tab, controls), 'the idref resolves to that panel').toBe(panelElement)
  }

  test('the panel keeps its chat stream alive across a view tab round trip', async () => {
    await mountSeededPanel()

    await expect.element(reply(), {timeout: 8000}).toBeVisible()

    await notesTab().click()
    await expect.element(notes(), {timeout: 8000}).toBeVisible()

    const gate = await faults.install({kind: 'gate', path: SUBSCRIBE_PATH})
    await chatTab().click()

    await expect.element(reply(), {timeout: 8000}).toBeVisible()
    await expect.element(skeleton()).not.toBeInTheDocument()

    await coreControl.releaseFault(gate)
  }, 30_000)

  test('a virtualized transcript survives a view tab round trip', async () => {
    const rpc = coreRpc(coreBase())
    const sessionId = await createSession(rpc)
    for (let index = 0; index < SEEDED_EXCHANGES - 1; index += 1) {
      await coreControl.scriptTurn({toolCalls: [], text: `seeded answer ${index}`})
      await runTurn(coreBase(), sessionId, `seeded question ${index}`)
    }
    await coreControl.scriptTurn({toolCalls: [], text: LONG_REPLY_TEXT})
    await runTurn(coreBase(), sessionId, 'the last question')
    harness.mountShell(`/panel/${sessionId}?open=true`, [notesExtension])

    await expect.element(longReply(), {timeout: 8000}).toBeVisible()

    await notesTab().click()
    await expect.element(notes(), {timeout: 8000}).toBeVisible()

    await chatTab().click()
    await expect.element(longReply(), {timeout: 8000}).toBeVisible()
  }, 60_000)

  test('each view tab points at the panel that renders it', async () => {
    await mountSeededPanel()

    await expect.element(reply(), {timeout: 8000}).toBeVisible()
    await expect.element(panel(), {timeout: 8000}).toBeVisible()
    expectTabOwnsPanel(chatTab().element(), panel().element())

    await notesTab().click()
    await expect.element(notes(), {timeout: 8000}).toBeVisible()
    await expect.element(panel(), {timeout: 8000}).toBeVisible()
    expectTabOwnsPanel(notesTab().element(), panel().element())
  }, 30_000)

  describe('a crashing extension', () => {
    const CALM_CARD_BODY = 'the calm card body'
    const CALM_SURFACE_BODY = 'the calm surface body'
    const CALM_SLOT_BODY = 'the calm slot body'
    const RECOVERED_BODY = 'the recovered tab body'
    const AFTER_TOOLS_TEXT = 'the thread kept going after the tools'
    const CARD_FAILED = 'This card failed to render'
    const TOOL_SHAPE = {description: 'a fixture tool', inputSchema: z.object({}), outputSchema: z.object({})}
    const tabCrash = {armed: true}

    const crashReports = (name: string): number =>
      vi.mocked(console.error).mock.calls.filter((call) => call[0] === `[conciv] extension "${name}" crashed`).length

    function boom(): JSX.Element {
      throw new Error('fixture crash')
    }

    function CrashingTab(): JSX.Element {
      if (tabCrash.armed) boom()
      return <p>{RECOVERED_BODY}</p>
    }

    const crashingTab = defineExtension({
      name: 'crash-tab',
      views: [{id: 'crashing', label: 'Crashing', Component: CrashingTab}],
    })
    const crashingIcon = defineExtension({
      name: 'crash-icon',
      views: [{id: 'iconic', label: 'Iconic', icon: boom, Component: NotesView}],
    })
    const crashingSurface = defineExtension({name: 'crash-surface', Surface: boom})
    const calmSurface = defineExtension({name: 'calm-surface', Surface: () => <p>{CALM_SURFACE_BODY}</p>})
    const crashingSlot = defineExtension({name: 'crash-slot', Component: boom})
    const calmSlot = defineExtension({name: 'calm-slot', Component: () => <p>{CALM_SLOT_BODY}</p>})
    const crashingCard = defineExtension({
      name: 'crash-card',
      tools: [
        defineTool({name: 'crash_card', display: 'standalone', ...TOOL_SHAPE}).render({
          render: boom,
          hasEmbeddedBody: () => true,
        }),
        defineTool({name: 'calm_card', display: 'standalone', ...TOOL_SHAPE}).render({
          render: () => <p>{CALM_CARD_BODY}</p>,
          hasEmbeddedBody: () => true,
        }),
        defineTool({name: 'crash_predicate', ...TOOL_SHAPE}).render({
          render: () => <p>{CALM_CARD_BODY}</p>,
          hasEmbeddedBody: () => {
            throw new Error('fixture crash')
          },
        }),
      ],
    })

    async function mountAfterTurn(
      toolCalls: {name: string; input: Record<string, unknown>}[],
      extensions: Parameters<typeof harness.mountShell>[1],
    ): Promise<void> {
      const sessionId = await createSession(coreRpc(coreBase()))
      await coreControl.scriptTurn({toolCalls, text: AFTER_TOOLS_TEXT})
      await runTurn(coreBase(), sessionId, 'run the fixture tools')
      harness.mountShell(`/panel/${sessionId}?open=true`, extensions)
    }

    const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
    const retry = () => page.getByRole('button', {name: 'Retry'})

    afterEach(() => {
      tabCrash.armed = true
      vi.restoreAllMocks()
    })

    test('a throwing tab shows its fallback, Retry re-mounts it, and chat stays usable', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await mountAfterTurn([], [crashingTab])
      const crashed = () => page.getByText('The crash-tab extension crashed')

      await expect.element(page.getByRole('tab', {name: 'Crashing', exact: true}), {timeout: 8000}).toBeVisible()
      await page.getByRole('tab', {name: 'Crashing', exact: true}).click()

      await expect.element(crashed(), {timeout: 8000}).toBeVisible()
      await expect.element(page.getByText('Details are in the browser console.')).toBeVisible()
      await page.screenshot({path: '__screenshots__/extension-boundary/tab-fallback.png'})
      expect(crashReports('crash-tab')).toBe(1)

      await retry().click()
      await expect.element(crashed()).toBeVisible()
      expect(crashReports('crash-tab')).toBe(2)

      tabCrash.armed = false
      await retry().click()
      await expect.element(page.getByText(RECOVERED_BODY)).toBeVisible()
      await expect.element(crashed()).not.toBeInTheDocument()

      await chatTab().click()
      await expect.element(page.getByText(AFTER_TOOLS_TEXT), {timeout: 8000}).toBeVisible()
      await expect.element(editor()).toBeVisible()
    }, 30_000)

    test('Retry lands keyboard focus on the next Retry after a re-crash and on the view after recovery', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await mountAfterTurn([], [crashingTab])
      const crashingTabButton = () => page.getByRole('tab', {name: 'Crashing', exact: true})

      await expect.element(crashingTabButton(), {timeout: 8000}).toBeVisible()
      await crashingTabButton().click()
      await expect.element(page.getByText('The crash-tab extension crashed'), {timeout: 8000}).toBeVisible()

      await userEvent.tab({shift: true})
      await expect.element(retry()).toHaveFocus()

      await userEvent.keyboard('{Enter}')
      await expect.element(retry()).toHaveFocus()
      expect(retry().element().matches(':focus-visible'), 'the new Retry shows the focus ring').toBe(true)
      expect(crashReports('crash-tab')).toBe(2)

      tabCrash.armed = false
      await userEvent.keyboard('{Enter}')
      await expect.element(page.getByText(RECOVERED_BODY)).toBeVisible()
      const viewContent = () => panel().getByRole('group', {name: 'Crashing'})
      await expect.element(viewContent()).toHaveFocus()
      expect(viewContent().element().matches(':focus-visible'), 'the view content shows the focus ring').toBe(true)
    }, 30_000)

    const predicatePart = {
      type: 'tool-call',
      id: 'call',
      name: 'crash_streaming',
      arguments: '{}',
      state: 'input-complete',
    } as const
    const predicateCtx = {
      apiBase: '',
      harnessId: 'fixture',
      sendMessage: () => {},
      catalog: INERT_TOOL_CATALOG,
      addResult: () => {},
    }

    test('a throwing hasEmbeddedBody reports once per error message across evaluations', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const failure = {message: 'first failure'}
      const extension = defineExtension({
        name: 'crash-streaming-predicate',
        tools: [
          defineTool({name: 'crash_streaming', ...TOOL_SHAPE}).render({
            render: () => <p>{CALM_CARD_BODY}</p>,
            hasEmbeddedBody: () => {
              throw new Error(failure.message)
            },
          }),
        ],
      })
      const evaluate = guardedToolCards([extension])[0]?.hasEmbeddedBody

      expect(evaluate?.(predicatePart, undefined, predicateCtx)).toBe(true)
      expect(evaluate?.(predicatePart, undefined, predicateCtx)).toBe(true)
      expect(evaluate?.(predicatePart, undefined, predicateCtx)).toBe(true)
      expect(crashReports('crash-streaming-predicate')).toBe(1)

      failure.message = 'second failure'
      expect(evaluate?.(predicatePart, undefined, predicateCtx)).toBe(true)
      expect(evaluate?.(predicatePart, undefined, predicateCtx)).toBe(true)
      expect(crashReports('crash-streaming-predicate')).toBe(2)
    })

    test('a crash is reported against the extension whose renderer was selected, not an earlier declaration', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const declaresOnly = defineExtension({
        name: 'declares-only',
        tools: [defineTool({name: 'shared_tool', ...TOOL_SHAPE})],
      })
      const rendererOwner = defineExtension({
        name: 'renderer-owner',
        tools: [
          defineTool({name: 'shared_tool', ...TOOL_SHAPE}).render({
            render: () => <p>{CALM_CARD_BODY}</p>,
            hasEmbeddedBody: () => {
              throw new Error('fixture crash')
            },
          }),
        ],
      })

      guardedToolCards([declaresOnly, rendererOwner])[0]?.hasEmbeddedBody(predicatePart, undefined, predicateCtx)

      expect(crashReports('renderer-owner')).toBe(1)
      expect(crashReports('declares-only')).toBe(0)
    })

    test('a predicate that throws a value with no string form still reads as an embedded body and reports once', () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const extension = defineExtension({
        name: 'crash-opaque-predicate',
        tools: [
          defineTool({name: 'crash_streaming', ...TOOL_SHAPE}).render({
            render: () => <p>{CALM_CARD_BODY}</p>,
            hasEmbeddedBody: () => {
              throw Object.create(null)
            },
          }),
        ],
      })
      const evaluate = guardedToolCards([extension])[0]?.hasEmbeddedBody

      expect(evaluate?.(predicatePart, undefined, predicateCtx)).toBe(true)
      expect(evaluate?.(predicatePart, undefined, predicateCtx)).toBe(true)
      expect(crashReports('crash-opaque-predicate')).toBe(1)
    })

    test('a throwing embedded ToolCard header reads as the failed card and the thread stays up', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const throwingTitle = (): string => {
        throw new Error('fixture crash')
      }
      const crashingHeader = defineExtension({
        name: 'crash-header',
        tools: [
          defineTool({name: 'crash_header', ...TOOL_SHAPE}).render({
            render: (props) => <ToolCard part={props.part} result={props.result} title={throwingTitle()} />,
            hasEmbeddedBody: () => true,
          }),
        ],
      })
      await mountAfterTurn([{name: 'crash_header', input: {}}], [crashingHeader])

      await expect.element(page.getByText(AFTER_TOOLS_TEXT), {timeout: 8000}).toBeVisible()
      await expect.element(page.getByText(CARD_FAILED)).toBeVisible()
      await expect.element(editor()).toBeVisible()
      expect(crashReports('crash-header')).toBe(1)
    }, 30_000)

    test('an embedded ToolCard header that starts throwing after it was published falls back alone', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const LATE_TITLE = 'the late header title'
      const [broken, setBroken] = createSignal(false)
      const lateTitle = (): string => {
        if (broken()) throw new Error('fixture late crash')
        return LATE_TITLE
      }
      const lateHeader = defineExtension({
        name: 'late-header',
        tools: [
          defineTool({name: 'late_header', ...TOOL_SHAPE}).render({
            render: (props) => <ToolCard part={props.part} result={props.result} title={lateTitle()} />,
            hasEmbeddedBody: () => true,
          }),
        ],
      })
      await mountAfterTurn([{name: 'late_header', input: {}}], [lateHeader])

      await expect.element(page.getByText(AFTER_TOOLS_TEXT), {timeout: 8000}).toBeVisible()
      await expect.element(page.getByText(LATE_TITLE).first()).toBeVisible()
      expect(crashReports('late-header')).toBe(0)

      setBroken(true)

      await expect.element(page.getByText(CARD_FAILED)).toBeVisible()
      await expect.element(page.getByText(LATE_TITLE)).not.toBeInTheDocument()
      await expect.element(page.getByText(AFTER_TOOLS_TEXT)).toBeVisible()
      await editor().fill('still typing after the late crash')
      await expect.element(editor()).toHaveTextContent('still typing after the late crash')
      expect(crashReports('late-header')).toBe(1)
    }, 30_000)

    test('a throwing view icon leaves the status bar with its tab label', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await mountAfterTurn([], [crashingIcon])

      await expect.element(page.getByRole('tab', {name: 'Iconic', exact: true}), {timeout: 8000}).toBeVisible()
      await expect.element(editor()).toBeVisible()
      expect(crashReports('crash-icon')).toBe(1)
    }, 30_000)

    test('a throwing tool card leaves the thread and the other cards intact', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await mountAfterTurn(
        [
          {name: 'crash_card', input: {}},
          {name: 'calm_card', input: {}},
        ],
        [crashingCard],
      )

      await expect.element(page.getByText(CARD_FAILED), {timeout: 8000}).toBeVisible()
      await expect.element(page.getByText('crash-card')).toBeVisible()
      await expect.element(page.getByText(CALM_CARD_BODY)).toBeVisible()
      await expect.element(page.getByText(AFTER_TOOLS_TEXT)).toBeVisible()
      await expect.element(editor()).toBeVisible()
      await page.screenshot({path: '__screenshots__/extension-boundary/card-fallback.png'})
      expect(crashReports('crash-card')).toBe(1)
    }, 30_000)

    test('a throwing card body predicate leaves the thread up', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await mountAfterTurn([{name: 'crash_predicate', input: {}}], [crashingCard])

      await expect.element(page.getByText(AFTER_TOOLS_TEXT), {timeout: 8000}).toBeVisible()
      await expect.element(editor()).toBeVisible()
      expect(crashReports('crash-card')).toBeGreaterThan(0)
    }, 30_000)

    test('a throwing Surface leaves the widget up and the other surfaces alive', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await mountAfterTurn([], [crashingSurface, calmSurface])

      await expect.element(page.getByText(CALM_SURFACE_BODY), {timeout: 8000}).toBeVisible()
      await expect.element(editor(), {timeout: 8000}).toBeVisible()
      expect(crashReports('crash-surface')).toBe(1)
    }, 30_000)

    test('a throwing slot leaves the composer up and reports the crash once per slot', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      await mountAfterTurn([], [crashingSlot, calmSlot])

      await expect.element(editor(), {timeout: 8000}).toBeVisible()
      await expect.element(page.getByText(CALM_SLOT_BODY).first(), {timeout: 8000}).toBeVisible()
      expect(crashReports('crash-slot')).toBeGreaterThan(0)
    }, 30_000)
  })
})

describe('queue strip', () => {
  function Harness(props: {count: number}): JSX.Element {
    const chat = createChat({
      threadId: 'queue-strip',
      connection: storyConnection({chunks: createTextChunks('working'), runsUntilStopped: true}),
      queue: {whenBusy: 'queue', drain: 'fifo'},
    })
    onMount(() => {
      void chat.sendMessage('active request')
      for (let index = 0; index < props.count; index += 1) void chat.sendMessage(`queued instruction ${index + 1}`)
    })
    return (
      <ChatProvider chat={chat}>
        <QueueStrip queue={chat.queue()} />
      </ChatProvider>
    )
  }

  function SwitchingHarness(): JSX.Element {
    const chatFor = (threadId: string) =>
      createChat({
        threadId,
        connection: storyConnection({chunks: createTextChunks('working'), runsUntilStopped: true}),
        queue: {whenBusy: 'queue', drain: 'fifo'},
      })
    const first = chatFor('queue-strip-first')
    const second = chatFor('queue-strip-second')
    const [current, setCurrent] = createSignal(first)
    onMount(() => {
      setCurrent(second)
      void second.sendMessage('active request')
      void second.sendMessage('queued after the switch')
    })
    return (
      <ChatProvider chat={current()}>
        <QueueStrip queue={current().queue()} />
      </ChatProvider>
    )
  }

  describe('QueueStrip', () => {
    it('renders no rows when the queue is empty', () => {
      const host = render(() => <QueueStrip queue={[]} />).container
      expect(host.textContent).toBe('')
    })

    it('shows a row per queued message, in order, once the composer queues work', async () => {
      render(() => <Harness count={2} />)
      await expect.element(page.getByText('Queue', {exact: true})).toBeVisible()
      await expect.element(page.getByText('2 waiting · runs in order')).toBeVisible()
      await expect.element(page.getByText('queued instruction 1')).toBeVisible()
      await expect.element(page.getByText('queued instruction 2')).toBeVisible()
    })

    it('Remove drops the queued message of the chat the strip shows after a session switch', async () => {
      render(() => <SwitchingHarness />)
      await expect.element(page.getByText('queued after the switch')).toBeVisible()
      await page.getByRole('button', {name: 'Remove from queue'}).click()
      await expect.element(page.getByText('queued after the switch')).not.toBeInTheDocument()
    })

    it('collapses beyond three rows into a "+N more" line', async () => {
      render(() => <Harness count={5} />)
      await expect.element(page.getByText('queued instruction 1')).toBeVisible()
      await expect.element(page.getByText('queued instruction 3')).toBeVisible()
      await expect.element(page.getByText('+2 more')).toBeVisible()
      expect(page.getByText('queued instruction 4').elements()).toHaveLength(0)
    })
  })

  describe('a later Stop returns a superseded queued flush to the draft', () => {
    afterEach(() => {
      for (const dispose of disposers.splice(0)) dispose()
    })

    it('appends the follow-up under typed text after a newer turn was started and stopped during the wait', async () => {
      const heldRefresh = Promise.withResolvers<ChatSessionHydration>()
      const refreshStarted = Promise.withResolvers<void>()
      const held = () => {
        refreshStarted.resolve()
        return heldRefresh.promise
      }
      const {sent, session: create} = sessionOverHeldRuns([held])
      const {session, cancel} = mountDraftPane(create)
      void session.sendMessage('first turn')
      await vi.waitFor(() => expect(sent).toEqual(['first turn']))
      await session.sendMessage('queued follow-up')
      const earlierCancel = cancel()
      await refreshStarted.promise
      void session.sendMessage('second turn')
      await vi.waitFor(() => expect(sent).toEqual(['first turn', 'second turn']))
      await cancel()
      await userEvent.click(page.getByRole('textbox', {name: 'Message'}))
      await userEvent.keyboard('still typing')
      await expect.element(draftOutput()).toHaveTextContent('"still typing"')
      heldRefresh.resolve(EMPTY_HYDRATION)
      await Promise.race([earlierCancel, vi.waitUntil(() => sent.length > 2)])
      expect(sent).toEqual(['first turn', 'second turn'])
      await expect.element(draftOutput()).toHaveTextContent('"still typing\\nqueued follow-up"')
    })

    it('returns only the unsent items, text in order and images as attachments, once a Stop lands mid-flush', async () => {
      const {sent, session: create} = sessionOverHeldRuns([])
      const {session, cancel, attached} = mountDraftPane(create)
      const multipart = (text: string): ContentPart[] => [{type: 'text', content: text}]
      void session.sendMessage('first turn')
      await vi.waitFor(() => expect(sent).toEqual(['first turn']))
      await session.sendMessage({content: multipart('queued one')})
      await session.sendMessage({content: multipart('queued two')})
      await session.sendMessage({
        content: [
          ...multipart('queued three'),
          {type: 'image', source: {type: 'data', mimeType: 'image/png', value: PNG_PIXEL}},
        ],
      })
      const flush = cancel()
      await vi.waitFor(() => expect(sent).toEqual(['first turn', 'queued one']))
      await session.stop()
      await Promise.race([flush, vi.waitUntil(() => sent.length > 2)])
      expect(sent).toEqual(['first turn', 'queued one'])
      await expect.element(draftOutput()).toHaveTextContent('"queued two\\nqueued three"')
      expect(attached.map((file) => file.type)).toEqual(['image/png'])
    })
  })

  const PNG_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  const EMPTY_HYDRATION: ChatSessionHydration = {messages: [], lastRun: null, pendingApprovals: []}

  type SentMessages = Parameters<ChatSessionConnection['send']>[0]

  function lastUserText(messages: SentMessages): string {
    const last = messages.at(-1)
    if (!last || !('parts' in last)) return ''
    return last.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(' ')
  }

  const abortOf = (signal: AbortSignal | undefined): Promise<void> =>
    new Promise((resolve) => signal?.addEventListener('abort', () => resolve(), {once: true}))

  function sessionOverHeldRuns(refreshes: Array<() => Promise<ChatSessionHydration>>) {
    const sent: string[] = []
    const connection: ChatSessionConnection = {
      subscribe: async function* (signal) {
        await abortOf(signal)
        yield* []
      },
      send: async (messages, _data, signal) => {
        sent.push(lastUserText(messages))
        await abortOf(signal)
      },
      refresh: () => refreshes.shift()?.() ?? Promise.resolve(EMPTY_HYDRATION),
      close: () => undefined,
    }
    return {
      sent,
      session: (): ChatSession =>
        createChatSession({
          sessionId: 'queue-flush',
          connect: () => connection,
          stop: () => Promise.resolve(),
          decide: () => Promise.resolve({startsTurn: false}),
        }),
    }
  }

  const draftOutput = () => page.getByRole('status', {name: 'Draft'})

  function DraftOutput(): JSX.Element {
    const composer = useComposer()
    return <output aria-label="Draft">{JSON.stringify(composer.text())}</output>
  }

  const disposers: Array<() => void> = []

  function mountDraftPane(create: () => ChatSession) {
    const attached: File[] = []
    const inputs: ComposerInputHandle[] = []
    const session = createRoot((dispose) => {
      disposers.push(dispose)
      return create()
    })
    render(() => (
      <EngineReachabilityContext.Provider value={{online: () => true, sustainedOffline: () => false}}>
        <ChatProvider chat={session}>
          <ComposerHandlersProvider value={{}}>
            <PaneComposer
              draftStorage={memoryStorage()}
              draftKey="queue-flush"
              placeholder="Ask anything…"
              inputLabel="Message"
              onInputReady={(handle) => inputs.push(handle)}
            >
              <DraftOutput />
            </PaneComposer>
          </ComposerHandlersProvider>
        </ChatProvider>
      </EngineReachabilityContext.Provider>
    ))
    const sink = {
      insert: (text: string) => inputs[0]?.append(text),
      addFile: (file: File) => void attached.push(file),
    }
    const cancel = () => session.interruptAndFlush().then((unsent) => returnUnsentToDraft(unsent, sink))
    return {session, cancel, attached}
  }
})

describe('quick add pane', () => {
  const RESOLVE_PATH = ['sessions', 'resolve']
  const CREATE_PATH = ['sessions', 'create']

  const core = {base: ''}
  const harness = createShellHarness(() => core.base)
  const faults = trackedFaults()

  beforeAll(async () => {
    const booted = await coreControl.bootCore({id: 'quick-add-pane', allowedOrigins: [window.location.origin]})
    core.base = booted.base
  }, 60_000)

  afterAll(async () => {
    await coreControl.closeCore()
  }, 30_000)

  afterEach(harness.dispose)

  const startFailure = () => page.getByText(/conciv could not start a pane/)
  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const closePane = () => page.getByRole('button', {name: 'Close pane'})
  const splitPane = () => page.getByRole('button', {name: 'Split pane (Mod+D)'})
  const sessionTrigger = () => page.getByRole('button', {name: /^Session: /})

  const sessionIdsOf = async (rpc: RpcClient): Promise<string[]> => (await rpc.sessions.list()).map((row) => row.id)

  const idsAddedBy = (before: string[], after: string[]): string[] => after.filter((id) => !before.includes(id))

  test('a quick terminal pane that fails to start shows a retry action', async () => {
    const refused = await faults.install({kind: 'fail', path: RESOLVE_PATH, status: 500})
    harness.mountShell('/quick')

    await expect.element(startFailure(), {timeout: 8000}).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Retry'})).toBeVisible()

    await coreControl.releaseFault(refused)
  }, 30_000)

  test('retrying a failed quick terminal pane against a healthy engine starts it', async () => {
    const refused = await faults.install({kind: 'fail', path: RESOLVE_PATH, status: 500})
    harness.mountShell('/quick')
    await expect.element(startFailure(), {timeout: 8000}).toBeVisible()

    await expectRetryRecovers(() => coreControl.releaseFault(refused), editor, startFailure)
  }, 30_000)

  test('rapid double-trigger creates exactly one pane', async () => {
    const sessionId = await createSession(coreRpc(core.base))
    harness.mountShell(`/quick?panes=${sessionId}&focus=0`)
    await expect.element(editor(), {timeout: 8000}).toBeVisible()

    const held = await faults.install({kind: 'gate', path: CREATE_PATH})
    const firstClick = splitPane().click()
    const secondClick = splitPane().click()
    await Promise.all([firstClick, secondClick])
    await coreControl.awaitFaultPending(held, 1)

    await coreControl.releaseFault(held)

    await expect.element(closePane().nth(1), {timeout: 8000}).toBeVisible()
    await expect.element(closePane().nth(2)).not.toBeInTheDocument()
  }, 30_000)

  test('splitting the quick terminal mints a session that is not already open', async () => {
    const rpc = coreRpc(core.base)
    const sessionId = await createSession(rpc)
    await rpc.sessions.rename({sessionId, title: 'Warm split source'})
    harness.mountShell(`/quick?panes=${sessionId}&focus=0`)
    await expect
      .element(page.getByRole('button', {name: /^Session: Warm split source$/}), {timeout: 8000})
      .toBeVisible()

    const beforeFirstSplit = await sessionIdsOf(rpc)
    await splitPane().click()
    await expect.element(closePane().nth(1), {timeout: 8000}).toBeVisible()
    await expect.element(sessionTrigger().nth(1), {timeout: 8000}).toBeVisible()
    const afterFirstSplit = await sessionIdsOf(rpc)
    const firstMinted = idsAddedBy(beforeFirstSplit, afterFirstSplit)
    expect(firstMinted).toHaveLength(1)
    expect(firstMinted).not.toContain(sessionId)

    await splitPane().click()
    await expect.element(closePane().nth(2), {timeout: 8000}).toBeVisible()
    await expect.element(sessionTrigger().nth(2), {timeout: 8000}).toBeVisible()
    const afterSecondSplit = await sessionIdsOf(rpc)
    const secondMinted = idsAddedBy(afterFirstSplit, afterSecondSplit)
    expect(secondMinted).toHaveLength(1)
    expect(secondMinted).not.toEqual(firstMinted)

    await expect
      .element(page.getByRole('button', {name: /^Session: Warm split source$/}).nth(1))
      .not.toBeInTheDocument()
  }, 40_000)

  test('adding and closing a pane never re-resolves the warm session', async () => {
    const rpc = coreRpc(core.base)
    const sessionId = await createSession(rpc)
    const resolvesBeforeMount = await coreControl.rpcCallCount(RESOLVE_PATH)
    const mountMark = await coreControl.rpcMark()
    harness.mountShell(`/quick?panes=${sessionId}&focus=0`)
    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    await coreControl.awaitWarmSessionResolved(mountMark)
    const resolvesAfterWarmUp = await coreControl.rpcCallCount(RESOLVE_PATH)
    expect(resolvesAfterWarmUp - resolvesBeforeMount).toBe(1)

    const addMark = await coreControl.rpcMark()
    await splitPane().click()
    await expect.element(closePane().nth(1), {timeout: 8000}).toBeVisible()
    expect(await coreControl.awaitSessionsListed(addMark)).toBe(200)

    const closeMark = await coreControl.rpcMark()
    await closePane().nth(1).click()
    await expect.element(closePane().nth(1)).not.toBeInTheDocument()
    expect(await coreControl.awaitSessionsListed(closeMark)).toBe(200)
    await rpc.sessions.list()

    expect(await coreControl.rpcCallCount(RESOLVE_PATH)).toBe(resolvesAfterWarmUp)
  }, 30_000)
})

describe('quick refresh', () => {
  const DRAFT_GET_PATH = ['drafts', 'get']
  const HYDRATE_PATH = ['chat', 'hydrate']

  const core = {base: ''}
  const harness = createShellHarness(() => core.base)
  const faults = trackedFaults()

  beforeAll(async () => {
    const booted = await coreControl.bootCore({id: 'quick-refresh', allowedOrigins: [window.location.origin]})
    core.base = booted.base
  }, 60_000)

  afterAll(async () => {
    await coreControl.closeCore()
  }, 30_000)

  afterEach(async () => {
    await coreControl.releaseTurn()
    harness.dispose()
  })

  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const refresh = () => page.getByRole('button', {name: 'Refresh the conversation'})
  const refreshing = () => page.getByRole('button', {name: 'Refreshing the conversation'})
  const stopButton = () => page.getByRole('button', {name: 'Stop generating'})

  test('the quick terminal pane bar carries refresh while the composer is still loading', async () => {
    const sessionId = await createSession(coreRpc(core.base))
    const gate = await faults.install({kind: 'gate', path: DRAFT_GET_PATH})
    harness.mountShell(`/quick?panes=${sessionId}&focus=0`)

    await expect.element(refresh(), {timeout: 8000}).toBeVisible()
    await expect.element(editor()).not.toBeInTheDocument()

    await coreControl.releaseFault(gate)

    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    await expect.element(refresh()).toBeVisible()
  }, 30_000)

  test('each quick terminal pane bar carries exactly one refresh affordance', async () => {
    const sessionId = await createSession(coreRpc(core.base))
    const gate = await faults.install({kind: 'gate', path: DRAFT_GET_PATH})
    harness.mountShell(`/quick?panes=${sessionId}&focus=0`)
    await expect.element(refresh(), {timeout: 8000}).toBeVisible()

    await page.getByRole('button', {name: 'Split pane (Mod+D)'}).click()

    await expect.element(refresh().nth(1), {timeout: 8000}).toBeVisible()
    await expect.element(refresh().nth(2)).not.toBeInTheDocument()

    await coreControl.releaseFault(gate)
  }, 30_000)

  test('a quick terminal pane disables its refresh affordance while the run streams', async () => {
    const sessionId = await createSession(coreRpc(core.base))
    await coreControl.holdTurn()
    harness.mountShell(`/quick?panes=${sessionId}&focus=0`)
    await expect.element(editor(), {timeout: 8000}).toBeVisible()

    await editor().fill('start a run')
    await userEvent.keyboard('{Enter}')

    await expect.element(stopButton()).toBeVisible()
    await expect.element(refresh()).toBeDisabled()
  }, 30_000)

  test('the quick terminal pane refresh affordance reports progress until the reconnect settles', async () => {
    const sessionId = await createSession(coreRpc(core.base))
    harness.mountShell(`/quick?panes=${sessionId}&focus=0`)
    await expect.element(editor(), {timeout: 8000}).toBeVisible()

    const gate = await faults.install({kind: 'gate', path: HYDRATE_PATH})
    await refresh().click()
    await coreControl.awaitFaultPending(gate, 1)

    await expect.element(refreshing(), {timeout: 8000}).toBeDisabled()

    await coreControl.releaseFault(gate)

    await expect.element(refresh(), {timeout: 8000}).toBeEnabled()
  }, 30_000)
})

describe('reachability flows', () => {
  const core = {base: ''}
  const harness = createShellHarness(() => core.base)
  const faults = trackedFaults()

  beforeAll(async () => {
    const booted = await coreControl.bootCore({id: 'reachability-flows', allowedOrigins: [window.location.origin]})
    core.base = booted.base
  }, 60_000)

  afterAll(async () => {
    await coreControl.closeCore()
  }, 30_000)

  afterEach(harness.dispose)

  const errorScreen = () => page.getByText(/couldn.t reach the engine/)
  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const genericBoundary = () => page.getByText('Something went wrong!')
  const engineUnreachableNotice = () => page.getByText('conciv lost connection to the engine.')
  const serverError = () => page.getByText('Internal Server Error')

  async function openSessionPanel(options: ShellMountOptions = {}): Promise<void> {
    const sessionId = await createSession(coreRpc(core.base))
    harness.mountShell(`/panel/${sessionId}?open=true`, [], options)
    await expect.element(editor(), {timeout: 8000}).toBeVisible()
  }

  test('a dead engine at boot shows our error screen, not the generic boundary, and Retry recovers it', async () => {
    const outage = await faults.install({kind: 'abort'})
    harness.mountShell('/panel/latest?open=true')

    await expect.element(errorScreen(), {timeout: 8000}).toBeVisible()
    await expect.element(genericBoundary()).not.toBeInTheDocument()

    await coreControl.releaseFault(outage)
    await page
      .getByRole('alert')
      .filter({hasText: /couldn.t reach the engine/})
      .getByRole('button', {name: 'Retry'})
      .click()

    await expect.element(editor(), {timeout: 8000}).toBeVisible()
  }, 30_000)

  test('a server error while resolving /panel/latest shows the actual error, not the unreachable message', async () => {
    const refused = await faults.install({kind: 'fail', path: ['sessions', 'resolve'], status: 500})
    harness.mountShell('/panel/latest?open=true')

    await expect.element(serverError(), {timeout: 8000}).toBeVisible()
    await expect.element(errorScreen()).not.toBeInTheDocument()
    await expect.element(genericBoundary()).not.toBeInTheDocument()

    await expectRetryRecovers(() => coreControl.releaseFault(refused), editor, serverError)
  }, 30_000)

  test('a healthy engine resolves /panel/latest straight to the warm session', async () => {
    harness.mountShell('/panel/latest?open=true')

    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    await expect.element(errorScreen()).not.toBeInTheDocument()
  }, 30_000)

  test('a sustained outage raises exactly one standing notice, and it clears once the engine returns', async () => {
    await openSessionPanel()

    const outage = await faults.install({kind: 'abort'})
    await editor().fill('rename the widget package')

    await expect.element(engineUnreachableNotice(), {timeout: 8000}).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Retry'})).toBeVisible()

    await coreControl.releaseFault(outage)
    await expect.element(engineUnreachableNotice(), {timeout: 8000}).not.toBeInTheDocument()
  }, 30_000)

  test('a 500 from an otherwise healthy engine never raises the unreachable notice', async () => {
    const refused = await faults.install({kind: 'chat-refused', status: 500})
    await openSessionPanel({transport: 'fetch'})

    await editor().fill('rename the widget package')
    await userEvent.keyboard('{Enter}')

    await expect
      .element(page.getByRole('region', {name: /Notifications/}))
      .toMatchTextContent(/Internal Server Error|could not be sent/)
    await expect.element(engineUnreachableNotice()).not.toBeInTheDocument()

    await coreControl.releaseFault(refused)
  }, 30_000)

  test('a failing engine-info probe on an otherwise healthy connection never raises the unreachable notice', async () => {
    const refused = await faults.install({kind: 'fail', path: ['meta', 'engine'], status: 500})
    await openSessionPanel()

    await coreControl.awaitFaultAnswered(refused)
    await expect.element(engineUnreachableNotice()).not.toBeInTheDocument()

    await coreControl.releaseFault(refused)
  }, 30_000)

  test('the composer disables sending with a distinct message once the engine is unreachable', async () => {
    await openSessionPanel()

    const outage = await faults.install({kind: 'abort'})
    await editor().fill('rename the widget package')

    await expect
      .element(page.getByRole('button', {name: 'conciv lost connection to the engine'}), {timeout: 8000})
      .toBeVisible()
    await expect.element(page.getByRole('button', {name: 'conciv lost connection to the engine'})).toBeDisabled()

    await coreControl.releaseFault(outage)
  }, 30_000)
})

describe('route boundary', () => {
  const WHILE_HELD = {timeout: 700}

  const core = {base: ''}
  const harness = createShellHarness(() => core.base)
  const faults = trackedFaults()

  beforeAll(async () => {
    const booted = await coreControl.bootCore({id: 'route-boundary', allowedOrigins: [window.location.origin]})
    core.base = booted.base
  }, 60_000)

  afterAll(async () => {
    await coreControl.closeCore()
  }, 30_000)

  afterEach(harness.dispose)

  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const launcher = () => page.getByRole('button', {name: 'Open conciv chat'})
  const routePending = () => page.getByRole('progressbar', {name: 'Loading conciv'})

  async function openPanel(): Promise<void> {
    const sessionId = await createSession(coreRpc(core.base))
    harness.mountShell(`/panel/${sessionId}?open=true`)
  }

  test('the pane paints its composer while the element captures query is still in flight', async () => {
    const held = await faults.install({kind: 'gate', path: ['captures', 'list']})
    await openPanel()

    await expect.element(editor(), WHILE_HELD).toBeVisible()
    await expect.element(routePending(), WHILE_HELD).not.toBeInTheDocument()

    await coreControl.releaseFault(held)
  }, 30_000)

  test('the shell keeps its launcher while the session list query is still in flight', async () => {
    const held = await faults.install({kind: 'gate', path: ['sessions', 'list']})
    harness.mountShell('/')

    await expect.element(launcher(), WHILE_HELD).toBeVisible()
    await expect.element(routePending(), WHILE_HELD).not.toBeInTheDocument()

    await coreControl.releaseFault(held)
  }, 30_000)

  test('a pane whose queries all answer immediately never shows the route pending loader', async () => {
    await openPanel()

    await expect.element(editor(), WHILE_HELD).toBeVisible()
    await expect.element(routePending(), WHILE_HELD).not.toBeInTheDocument()
  }, 30_000)

  test('a slow beforeLoad reveals the route pending loader, then hands off to the pane', async () => {
    const held = await faults.install({kind: 'gate', path: ['sessions', 'resolve']})
    harness.mountShell('/panel/latest?open=true')

    await expect.element(routePending()).toBeVisible()

    await coreControl.releaseFault(held)

    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    await expect.element(routePending()).not.toBeInTheDocument()
  }, 30_000)
})

describe('router wrap disposal', () => {
  function routerWithDisposeSpy(name: string, dispose: () => void) {
    const extension = defineExtension({name}).client(() => ({value: {}, dispose}))
    return createConcivRouter({
      rpc: makeRpcClient('http://127.0.0.1:9'),
      history: createMemoryHistory({initialEntries: ['/']}),
      environment: {rootNode: document, document},
      settings: parseConcivSettings(''),
      extensions: [extension],
    })
  }

  test('unmounting the router-rendered tree disposes every extension instance exactly once', async () => {
    const dispose = vi.fn()
    const router = routerWithDisposeSpy('wrap-disposal-probe', dispose)
    const mounted = render(() => <RouterProvider router={router} />)

    await expect.element(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    expect(dispose).not.toHaveBeenCalled()

    mounted.unmount()

    expect(dispose).toHaveBeenCalledTimes(1)
  })

  test('unmounting disposes every extension instance even when one disposer throws', async () => {
    const order: string[] = []
    const first = defineExtension({name: 'wrap-disposal-a'}).client(() => ({value: {}, dispose: () => order.push('a')}))
    const second = defineExtension({name: 'wrap-disposal-b'}).client(() => ({
      value: {},
      dispose: () => {
        order.push('b')
        throw new Error('teardown b blew up')
      },
    }))
    const third = defineExtension({name: 'wrap-disposal-c'}).client(() => ({value: {}, dispose: () => order.push('c')}))
    const router = createConcivRouter({
      rpc: makeRpcClient('http://127.0.0.1:9'),
      history: createMemoryHistory({initialEntries: ['/']}),
      environment: {rootNode: document, document},
      settings: parseConcivSettings(''),
      extensions: [first, second, third],
    })
    const mounted = render(() => <RouterProvider router={router} />)

    await expect.element(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible()

    expect(() => mounted.unmount()).not.toThrow()
    expect(order).toEqual(['a', 'b', 'c'])
  })

  test('calling disposeConcivRouter after an unmount is a no-op', async () => {
    const dispose = vi.fn()
    const router = routerWithDisposeSpy('wrap-disposal-idempotent', dispose)
    const mounted = render(() => <RouterProvider router={router} />)

    await expect.element(page.getByRole('button', {name: 'Open conciv chat'})).toBeVisible()
    mounted.unmount()

    disposeConcivRouter(router)

    expect(dispose).toHaveBeenCalledTimes(1)
  })

  test('disposeConcivRouter disposes a router that was never rendered, and is idempotent', () => {
    const dispose = vi.fn()
    const router = routerWithDisposeSpy('wrap-disposal-never-rendered', dispose)

    disposeConcivRouter(router)
    expect(dispose).toHaveBeenCalledTimes(1)

    disposeConcivRouter(router)
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})

describe('session activity', () => {
  const OFFLINE_BASE = 'http://127.0.0.1:1'
  const PANE_SESSION_ID = 'the-mounted-session'

  type ActivityProbe = {
    app: AppContextValue
    setActive: (value: boolean) => void
    invalidations: () => number
    settles: () => number
    unmount: () => void
  }

  function mountActivity(): ActivityProbe {
    const scope = createRoot((dispose) => ({app: makeAppContextValue({base: OFFLINE_BASE}), dispose}))
    const [active, setActive] = createSignal(false)
    let invalidations = 0
    let settles = 0
    const Pane = (): JSX.Element => {
      trackSessionActivity({
        sessionId: PANE_SESSION_ID,
        active,
        invalidateSessions: () => {
          invalidations += 1
        },
        onSettle: () => {
          settles += 1
        },
      })
      return <div>pane</div>
    }
    const mounted = render(() => (
      <AppContext.Provider value={scope.app}>
        <Pane />
      </AppContext.Provider>
    ))
    return {
      app: scope.app,
      setActive,
      invalidations: () => invalidations,
      settles: () => settles,
      unmount: () => {
        mounted.unmount()
        scope.dispose()
      },
    }
  }

  describe('trackSessionActivity', () => {
    it('invalidates the session list when a pane closes while its run is still in flight', () => {
      const probe = mountActivity()
      probe.setActive(true)

      probe.unmount()

      expect(probe.invalidations(), 'a pane closed mid-run hands the busy state to server truth').toBe(1)
    })

    it('invalidates the session list when the final settle and the close land in one batch', () => {
      const probe = mountActivity()
      probe.setActive(true)

      batch(() => {
        probe.setActive(false)
        probe.unmount()
      })

      expect(probe.settles(), 'the queued settle effect dies with the pane').toBe(0)
      expect(probe.invalidations(), 'teardown still refreshes the stale running row').toBe(1)
    })

    it('leaves the session list alone when a pane closes with no run in flight', () => {
      const probe = mountActivity()

      probe.unmount()

      expect(probe.invalidations(), 'an idle pane closing needs no refetch').toBe(0)
    })

    it('releases the launcher when the pane unmounts', () => {
      const probe = mountActivity()
      probe.setActive(true)

      expect(probe.app.liveSessions.activityIn(PANE_SESSION_ID)).toBe('running')

      probe.unmount()

      expect(probe.app.liveSessions.activityIn(PANE_SESSION_ID), 'an unmounted pane stops holding the launcher').toBe(
        'unmounted',
      )
    })
  })
})

describe('session selector', () => {
  const EXTERNAL_ID = HarnessSessionId.parse('external-mid-run')

  const core = {base: ''}
  const mounted: {pane: PaneMount | null} = {pane: null}

  beforeAll(async () => {
    const booted = await coreControl.bootCore({
      id: 'session-selector',
      resume: true,
      allowedOrigins: [window.location.origin],
      history: [{id: EXTERNAL_ID, derivedTitle: 'a session mid-run', updatedAt: Date.now(), messageCount: 3}],
    })
    core.base = booted.base
  }, 60_000)

  afterAll(async () => {
    await coreControl.closeCore()
  }, 30_000)

  afterEach(async () => {
    mounted.pane?.dispose()
    mounted.pane = null
    await coreControl.releaseTurn()
  })

  async function adoptExternalSession(rpc: RpcClient): Promise<string> {
    const listed = await rpc.sessions.list()
    const external = listed.find((meta) => meta.native?.nativeId === EXTERNAL_ID)
    if (!external?.native) throw new Error('the harness history fixture never reached the session list')
    const {sessionId} = await rpc.sessions.open(external.native)
    return sessionId
  }

  async function mountSelector(): Promise<void> {
    const rpc = coreRpc(core.base)
    const activeId = (await rpc.sessions.create()).sessionId
    await rpc.sessions.rename({sessionId: activeId, title: 'the active session'})
    const externalId = await adoptExternalSession(rpc)
    await coreControl.holdTurn()
    await sendTurn(core.base, externalId, 'keep this session busy')
    mounted.pane = mountPane({base: core.base, sessionId: activeId}, () => (
      <SessionSelector variant="pill" activeId={() => activeId} onActivate={() => {}} onNewSession={() => {}} />
    ))
  }

  const LONG_TITLE = 'Previous conversation: User: test fill in the form and accept the terms'

  const RAIL_MENU = 'p-2 flex flex-col gap-1 w-72'

  async function mountRailSelector(): Promise<void> {
    const rpc = coreRpc(core.base)
    const activeId = (await rpc.sessions.create()).sessionId
    await rpc.sessions.rename({sessionId: activeId, title: LONG_TITLE})
    mounted.pane = mountPane({base: core.base, sessionId: activeId}, () => (
      <div class={RAIL_MENU}>
        <SessionSelector variant="bar" activeId={() => activeId} onActivate={() => {}} onNewSession={() => {}} />
      </div>
    ))
  }

  test('the rail selector reveals a session title too long for the popover', async () => {
    await mountRailSelector()
    const trigger = page.getByRole('button', {name: `Session: ${LONG_TITLE}`})
    await expect.element(trigger).toBeVisible()

    await trigger.hover()

    await expect.element(page.getByRole('tooltip')).toHaveTextContent(LONG_TITLE)
  })

  test('a session with a live core run carries the running dot, an idle one does not', async () => {
    await mountSelector()

    await page.getByRole('button', {name: 'Session: the active session'}).click()

    await expect.element(page.getByRole('option', {name: /a session mid-run.*running/})).toBeVisible()
    await expect.element(page.getByRole('option', {name: /^the active session(?!.*running)/})).toBeVisible()
  })

  test('the selector keeps freshness, message count and origin in the row description', async () => {
    await mountSelector()

    await page.getByRole('button', {name: 'Session: the active session'}).click()

    await expect
      .element(page.getByRole('option', {name: /a session mid-run.*\d+ messages.*started externally/}))
      .toBeVisible()
  })
})

describe('session switch suspense', () => {
  const ALPHA_REPLY = 'the alpha transcript that must survive a session switch'
  const BETA_REPLY = 'the beta transcript that must survive a session switch'
  const PANEL_SELECTOR = 'section[data-conciv-panel]'
  const PANE_ROOT_CLASS = 'contents'

  const coreBase = bootedCore('session-switch-suspense')
  const harness = createShellHarness(coreBase)

  afterEach(harness.dispose)

  type PaneRootWatch = {reinserts: () => number; stop: () => void}

  function isPaneRoot(node: Node): boolean {
    return node instanceof HTMLElement && node.classList.contains(PANE_ROOT_CLASS)
  }

  function watchPaneRootReinserts(): PaneRootWatch {
    const panel = document.querySelector(PANEL_SELECTOR)
    if (!panel) throw new Error('the chat panel is not mounted')
    const detached = new Set<Node>()
    const seen = {reinserts: 0}
    const collect = (records: MutationRecord[]): void => {
      for (const entry of records) {
        for (const node of entry.removedNodes) {
          if (isPaneRoot(node)) detached.add(node)
        }
        for (const node of entry.addedNodes) {
          if (detached.has(node)) seen.reinserts += 1
        }
      }
    }
    const observer = new MutationObserver(collect)
    observer.observe(panel, {childList: true})
    return {
      reinserts: () => {
        collect(observer.takeRecords())
        return seen.reinserts
      },
      stop: () => observer.disconnect(),
    }
  }

  async function seedSession(base: string, rpc: ReturnType<typeof coreRpc>, reply: string): Promise<string> {
    const sessionId = await createSession(rpc)
    await coreControl.scriptTurn({toolCalls: [], text: reply})
    await runTurn(base, sessionId, 'seed the transcript')
    return sessionId
  }

  test('switching sessions never re-suspends a live pane over the router pending fallback', async () => {
    const base = coreBase()
    const rpc = coreRpc(base)
    const alpha = await seedSession(base, rpc, ALPHA_REPLY)
    const beta = await seedSession(base, rpc, BETA_REPLY)

    harness.mountShell(`/panel/${alpha}?open=true`)
    await expect.element(page.getByText(ALPHA_REPLY), {timeout: 15_000}).toBeVisible()

    const watch = watchPaneRootReinserts()
    const switches = [
      {sessionId: beta, reply: BETA_REPLY},
      {sessionId: alpha, reply: ALPHA_REPLY},
      {sessionId: beta, reply: BETA_REPLY},
      {sessionId: alpha, reply: ALPHA_REPLY},
    ]
    for (const step of switches) {
      harness.navigateToSession(step.sessionId)
      await expect.element(page.getByText(step.reply), {timeout: 15_000}).toBeVisible()
    }
    const reinserts = watch.reinserts()
    watch.stop()

    expect(reinserts, 'a session switch must not detach and re-insert the same pane root').toBe(0)
  }, 60_000)
})

describe('status bar', () => {
  function mountDynamic(): (status: SessionStatus) => void {
    const [status, setStatus] = createSignal<SessionStatus>({kind: 'running', label: 'RUNNING'})
    render(() => (
      <StatusBar
        status={status()}
        elapsedLabel="00:12"
        diff={{files: 2, adds: 5, dels: 1}}
        views={[{id: 'chat', label: 'Chat'}]}
        activeView="chat"
        onSelectView={() => {}}
        disabled={false}
      />
    ))
    return setStatus
  }

  describe('StatusBar session status derivation', () => {
    it('flips the state chip from RUNNING to DONE as the session settles', async () => {
      const setStatus = mountDynamic()
      await expect.element(page.getByText('RUNNING', {exact: true})).toBeVisible()
      setStatus({kind: 'done', label: 'DONE'})
      await expect.element(page.getByText('DONE', {exact: true})).toBeVisible()
      expect(page.getByText('RUNNING', {exact: true}).elements()).toHaveLength(0)
    })

    function mountViews(activeView: string, onSelectView: (id: string) => void = () => {}, disabled = false) {
      render(() => (
        <StatusBar
          status={{kind: 'done', label: 'DONE'}}
          elapsedLabel="00:12"
          diff={{files: 0, adds: 0, dels: 0}}
          views={[
            {id: 'chat', label: 'Chat'},
            {id: 'board', label: 'Board'},
          ]}
          activeView={activeView}
          onSelectView={onSelectView}
          disabled={disabled}
        />
      ))
    }

    it('exposes the view switcher as a tablist with the active view selected', async () => {
      mountViews('board')

      await expect.element(page.getByRole('tablist')).toBeVisible()
      await expect.element(page.getByRole('tab', {name: 'Board'})).toHaveAttribute('aria-selected', 'true')
      await expect.element(page.getByRole('tab', {name: 'Chat'})).toHaveAttribute('aria-selected', 'false')
    })

    it('names the panel each tab controls with a stable id the view can carry', async () => {
      mountViews('board')

      const board = page.getByRole('tab', {name: 'Board'})
      await expect.element(board).toHaveAttribute('id', viewTabId('board'))
      await expect.element(board).toHaveAttribute('aria-controls', viewTabPanelId('board'))
    })

    it('reports the picked view when another tab is chosen', async () => {
      const picked: string[] = []
      mountViews('chat', (id) => picked.push(id))

      await userEvent.click(page.getByRole('tab', {name: 'Board'}))

      await expect.element(page.getByRole('tab', {name: 'Board'})).toBeVisible()
      expect(picked).toEqual(['board'])
      await page.screenshot({path: '__screenshots__/status-bar/view-tab-indicator.png'})
    })

    it('locks the tabs the leave guard blocks while keeping the active one reachable', async () => {
      mountViews('chat', () => {}, true)

      await expect.element(page.getByRole('tab', {name: 'Board'})).toBeDisabled()
      await expect.element(page.getByRole('tab', {name: 'Chat'})).not.toBeDisabled()
    })

    it('announces the state chip through a polite live region', async () => {
      const setStatus = mountDynamic()
      await expect.element(page.getByRole('status')).toHaveTextContent('RUNNING')
      setStatus({kind: 'failed', label: 'FAILED'})
      await expect.element(page.getByRole('status')).toHaveTextContent('FAILED')
    })
  })
})

describe('tool card dispatch', () => {
  function mount(child: () => JSX.Element): void {
    render(child)
  }

  function ctxWith(catalog: ToolCatalogView): ToolViewCtx {
    return {...INERT_TOOL_CTX, catalog}
  }

  function part(name: string, input: Record<string, unknown> = {}): ToolCallPart {
    return {type: 'tool-call', id: 'd1', name, arguments: JSON.stringify(input), input, state: 'complete'}
  }

  function askingPart(input: Record<string, unknown>): ToolCallPart {
    return {
      type: 'tool-call',
      id: 'd1',
      name: 'conciv_ui',
      arguments: JSON.stringify(input),
      input,
      state: 'input-complete',
    }
  }

  function answerResult(content: unknown): ToolResultPart {
    return {type: 'tool-result', toolCallId: 'd1', content: JSON.stringify(content), state: 'complete'}
  }

  const allTools = () => [...concivToolCards, ...builtinToolCards]

  const realPageRenderers = collectToolRenderers([pageExtensionEntry])

  it('the real page extension registers a .render() card for its verbs', () => {
    expect(realPageRenderers.length).toBeGreaterThan(0)
    expect(realPageRenderers.some((entry) => entry.names.includes('page_click'))).toBe(true)
  })

  it('an extension-supplied .render() card wins over builtinToolCards for the same tool', async () => {
    const tools = [...realPageRenderers, ...builtinToolCards]

    mount(() => (
      <ToolCallCard
        part={part('page_click', {selector: '#cta'})}
        result={undefined}
        ctx={INERT_TOOL_CTX}
        tools={() => tools}
      />
    ))

    await browserPage.getByRole('button').click()
    await expect.element(browserPage.getByText('#cta')).toBeVisible()
    expect(document.body.textContent).not.toContain('Used tool:')
  })

  it('a conciv_ui question resolves to the packaged card and hands the picked choice back to the host', async () => {
    const answers: {toolCallId: string; value: UiAnswerValue}[] = []

    mount(() => (
      <ToolCallCard
        part={askingPart({kind: 'choices', question: 'Ship it or hold?', options: ['ship', 'hold']})}
        result={undefined}
        ctx={{...INERT_TOOL_CTX, addResult: (toolCallId, value) => answers.push({toolCallId, value})}}
        tools={allTools}
      />
    ))

    await browserPage.getByRole('button', {name: 'ship'}).click()

    await expect.element(browserPage.getByRole('button', {name: 'ship'})).toBeDisabled()
    expect(answers).toEqual([{toolCallId: 'd1', value: 'ship'}])
  })

  it('a multiSelect choices ask collects several answers behind Submit', async () => {
    const answers: {toolCallId: string; value: UiAnswerValue}[] = []

    mount(() => (
      <ToolCallCard
        part={askingPart({
          kind: 'choices',
          question: 'Which effects need live tuning knobs?',
          options: ['Ferrofluid', 'Shader glow', 'Grain'],
          multiSelect: true,
        })}
        result={undefined}
        ctx={{...INERT_TOOL_CTX, addResult: (toolCallId, value) => answers.push({toolCallId, value})}}
        tools={allTools}
      />
    ))

    await expect.element(browserPage.getByRole('button', {name: 'Submit'})).toBeDisabled()
    await browserPage.getByRole('button', {name: 'Ferrofluid'}).click()
    await browserPage.getByRole('button', {name: 'Shader glow'}).click()
    await browserPage.getByRole('button', {name: 'Submit'}).click()

    expect(answers).toEqual([{toolCallId: 'd1', value: ['Ferrofluid', 'Shader glow']}])
  })

  it('an allowOther choices ask answers with what the user typed instead of an option', async () => {
    const answers: {toolCallId: string; value: UiAnswerValue}[] = []

    mount(() => (
      <ToolCallCard
        part={askingPart({
          kind: 'choices',
          question: 'Which auth method?',
          options: ['OAuth', 'JWT'],
          allowOther: true,
        })}
        result={undefined}
        ctx={{...INERT_TOOL_CTX, addResult: (toolCallId, value) => answers.push({toolCallId, value})}}
        tools={allTools}
      />
    ))

    await browserPage.getByRole('textbox', {name: 'Other'}).fill('mTLS')
    await browserPage.getByRole('button', {name: 'Submit'}).click()

    expect(answers).toEqual([{toolCallId: 'd1', value: 'mTLS'}])
  })

  it('a single-select allowOther ask answers with the typed text, never the option picked before it', async () => {
    const answers: {toolCallId: string; value: UiAnswerValue}[] = []

    mount(() => (
      <ToolCallCard
        part={askingPart({
          kind: 'choices',
          question: 'Which auth method?',
          options: ['OAuth', 'JWT'],
          allowOther: true,
        })}
        result={undefined}
        ctx={{...INERT_TOOL_CTX, addResult: (toolCallId, value) => answers.push({toolCallId, value})}}
        tools={allTools}
      />
    ))

    await browserPage.getByRole('button', {name: 'OAuth'}).click()
    await browserPage.getByRole('textbox', {name: 'Other'}).fill('mTLS')
    await browserPage.getByRole('button', {name: 'Submit'}).click()

    expect(answers).toEqual([{toolCallId: 'd1', value: 'mTLS'}])
  })

  it('a conciv_ui question that already carries its result renders answered, with no controls left to press', async () => {
    mount(() => (
      <ToolCallCard
        part={askingPart({kind: 'choices', question: 'Ship it or hold?', options: ['ship', 'hold']})}
        result={answerResult({answered: true, value: 'ship'})}
        ctx={INERT_TOOL_CTX}
        tools={allTools}
      />
    ))

    await expect.element(browserPage.getByRole('status')).toHaveTextContent('ship')
    expect(browserPage.getByRole('button', {name: 'hold'}).query()).toBeNull()
  })

  it('builtinToolCards still win over the meta-driven default when a page verb has no .render() entry', async () => {
    const tools = [...realPageRenderers, ...builtinToolCards]
    const catalog: ToolCatalogView = {
      loaded: () => true,
      meta: (name) => (name === 'Bash' ? {summary: 'run a shell command', mutating: true, mirrors: false} : undefined),
    }

    mount(() => (
      <ToolCallCard
        part={part('Bash', {command: 'ls'})}
        result={undefined}
        ctx={ctxWith(catalog)}
        tools={() => tools}
      />
    ))

    await expect.element(browserPage.getByText('ls')).toBeVisible()
  })
})

describe('trace row churn', () => {
  const ROWS = 150
  const REDUNDANT_WRITE_BUDGET = ROWS * 3

  const coreBase = bootedCore('trace-row-churn')
  const active: {pane: PaneMount | null} = {pane: null}

  afterEach(async () => {
    await coreControl.releaseTools()
    await coreControl.releaseResults()
    await coreControl.releaseTurn()
    active.pane?.dispose()
    active.pane = null
  })

  async function newSession(): Promise<string> {
    return createSession(coreRpc(coreBase()))
  }

  function redundantClassWrites(records: readonly MutationRecord[]): number {
    return records.filter((record) => {
      if (record.type !== 'attributes' || record.attributeName !== 'class') return false
      if (!(record.target instanceof Element)) return false
      return record.target.getAttribute('class') === record.oldValue
    }).length
  }

  async function streamToolCalls(steps: number): Promise<number> {
    const sessionId = await newSession()
    await coreControl.scriptTurn({
      toolCalls: Array.from({length: steps}, (_, index) => ({name: 'Read', input: {filePath: `step-${index}.ts`}})),
      text: 'Every step is done.',
    })
    await coreControl.holdResults()
    active.pane = mountPane({base: coreBase(), sessionId}, () => <ChatPane sessionId={sessionId} />)

    const box = page.getByRole('textbox', {name: 'Message the conciv agent'})
    await expect.element(box).toBeVisible()
    await box.fill('run every step')
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByText('step-0.ts', {exact: true})).toBeVisible()

    const records: MutationRecord[] = []
    const observer = new MutationObserver((list) => records.push(...list))
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
      attributeOldValue: true,
    })
    await coreControl.releaseResults({everyMs: 40})
    await expect.element(page.getByText('Every step is done.')).toBeVisible()
    await expect.element(page.getByText(`step-${steps - 1}.ts`, {exact: true})).toBeVisible()
    for (const record of observer.takeRecords()) records.push(record)
    observer.disconnect()
    return redundantClassWrites(records)
  }

  test('streaming tool results rewrites no settled row', async () => {
    expect(await streamToolCalls(ROWS)).toBeLessThanOrEqual(REDUNDANT_WRITE_BUDGET)
  }, 120_000)
})

describe('user turn', () => {
  const PNG_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

  const userParts = [
    {type: 'text' as const, content: 'why?'},
    {type: 'document' as const, source: {type: 'data' as const, mimeType: 'application/x-test', value: 'eyJ4IjoxfQ=='}},
    {type: 'text' as const, content: 'clicked save', metadata: {modelOnly: true}},
    {
      type: 'image' as const,
      source: {type: 'data' as const, mimeType: 'image/png', value: PNG_PIXEL},
      metadata: {modelOnly: true},
    },
  ]

  function mountThread(cards: readonly AttachmentCardSlot[]): HTMLElement {
    return render(() => <ThreadApp cards={cards} />).container
  }

  function ThreadApp(props: {cards: readonly AttachmentCardSlot[]}): JSX.Element {
    const chat = useChatSession({
      rpc: makeRpcClient('http://127.0.0.1:9'),
      apiBase: 'http://127.0.0.1:9',
      sessionId: 'conciv_userturn',
    })
    onMount(() => void chat.sendMessage({content: userParts}).catch(() => {}))
    return (
      <ChatProvider chat={chat}>
        <Thread>
          <Thread.Viewport>
            <Thread.Messages attachmentCards={props.cards} />
          </Thread.Viewport>
        </Thread>
      </ChatProvider>
    )
  }

  test('renders the matching card, hides modelOnly parts', async () => {
    const Card = (): JSX.Element => <span>test document player</span>
    const host = mountThread([{mime: 'application/x-test', render: Card}])
    await expect.element(page.getByText('why?')).toBeVisible()
    expect(host.textContent).toContain('test document player')
    expect(host.textContent).not.toContain('clicked save')
    expect(host.querySelector('img')).toBeNull()
  })

  test('falls back to the generic tile with zero cards registered', async () => {
    const host = mountThread([])
    await expect.element(page.getByText('why?')).toBeVisible()
    expect(host.querySelector('[data-attachment]')).not.toBeNull()
  })
})

describe('wire name coverage', () => {
  function realRegistry(): ReturnType<typeof createToolRegistry> {
    const registry = createToolRegistry({pageCaller: async () => ({ok: true})})
    for (const tool of PAGE_TOOL_DEFS) registry.register(tool.client(), {owner: 'a built-in page tool'})
    for (const tool of BUILTIN_SERVER_TOOLS) {
      registry.register(tool, {owner: 'a built-in server tool', context: {bundler: () => undefined}})
    }
    registry.register(BUILTIN_OPEN_TOOL, {owner: 'a built-in editor tool', context: {openInEditor: () => {}}})
    return registry
  }

  const registry = realRegistry()

  const CATALOG_TOOL_NAME = 'catalog'

  const modelReachableNames = [
    EXECUTE_TOOL_NAME,
    CATALOG_TOOL_NAME,
    concivUiToolDef.name,
    concivExtensionsToolDef.name,
    ...registry.catalog.list().map((entry) => entry.name),
  ]

  const HARNESS_NATIVE_CARD_NAMES = [
    'Bash',
    'apply_patch',
    'Read',
    'Edit',
    'MultiEdit',
    'Write',
    'Grep',
    'Glob',
    'TodoWrite',
    'ToolSearch',
  ]

  const concivOwnedCards: ToolCardEntry[] = [
    ...collectToolRenderers([pageExtensionEntry]),
    ...concivToolCards,
    ...coreToolCards,
    ...builtinToolCards,
  ]

  const cardNames = new Set(concivOwnedCards.flatMap((entry) => entry.names))

  it('every model-reachable tool name resolves to a card entry or catalog meta', () => {
    expect(modelReachableNames.length).toBeGreaterThan(10)
    const unresolved = modelReachableNames.filter(
      (name) => !cardNames.has(name) && registry.catalog.list().every((entry) => entry.name !== name),
    )
    expect(unresolved).toEqual([])
  })

  it('no conciv-owned card is registered for a name the model can never put on the wire', () => {
    const reachable = new Set(modelReachableNames)
    const dead = concivOwnedCards
      .flatMap((entry) => entry.names)
      .filter((name) => !reachable.has(name) && !HARNESS_NATIVE_CARD_NAMES.includes(name))
    expect(dead).toEqual([])
  })
})

describe('router restore', () => {
  function makeMemoryStorage(): WebStorage {
    const map = new Map<string, string>()
    return {
      getItem: (key) => map.get(key) ?? null,
      setItem: (key, value) => void map.set(key, value),
    }
  }

  function routerOn(storage: WebStorage) {
    return createConcivRouter({
      rpc: makeRpcClient('http://127.0.0.1:9'),
      history: createWebStorageHistory({storage}),
      environment: {rootNode: document, document},
      settings: parseConcivSettings(''),
    })
  }

  describe('createConcivRouter with storage-history', () => {
    it('restores the last route after a simulated reload', async () => {
      const storage = makeMemoryStorage()
      const before = createWebStorageHistory({storage})
      before.push('/panel/conciv_abc123')
      const router = routerOn(storage)
      await router.load()
      expect(router.state.location.pathname).toBe('/panel/conciv_abc123')
      expect(router.state.matches.map((match) => match.routeId)).toContain('/panel/$sessionId')
      expect(router.state.matches.at(-1)?.params).toEqual({sessionId: 'conciv_abc123'})
    })

    it('restores quick-layer search params and back-stack through a reload', async () => {
      const storage = makeMemoryStorage()
      const before = createWebStorageHistory({storage})
      before.push('/panel/conciv_abc123')
      before.push('/quick?panes=conciv_abc123&focus=0')
      const router = routerOn(storage)
      await router.load()
      expect(router.state.location.pathname).toBe('/quick')
      expect(router.state.location.search).toEqual({panes: 'conciv_abc123', focus: 0})
      router.history.back()
      expect(router.history.location.pathname).toBe('/panel/conciv_abc123')
    })
  })
})
