import '../src/styles.css'
import 'virtual:uno.css'
import {expect, test, vi, it, afterAll, afterEach, beforeAll, describe} from 'vitest'
import {page, userEvent, page as browserPage, type Locator} from 'vitest/browser'
import {HarnessSessionId, type ReasoningEffort} from '@conciv/protocol/chat-types'
import {makeBrowserRpcClient, makeRpcClient, type RpcClient, type EngineStaleness} from '@conciv/contract'
import appManifest from '../package.json' with {type: 'json'}
import {until} from '@conciv/harness-testkit/until'
import {formatForDisplay} from '@tanstack/solid-hotkeys'
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
  runTurn,
  seedDraft,
  grabProviderFor,
  HERO_GRAB,
  HERO_LABEL,
  persistedGrab,
  type PaneMountOptions,
  trackedFaults,
  createShellHarness,
  memoryStorage,
  expectRetryRecovers,
  type ShellMountOptions,
} from './helpers.browser.js'
import {z} from 'zod'
import {render} from '@solidjs/testing-library'
import {type JSX, createSignal, onMount, type Component, createMemo, createRoot, For, Show, Suspense} from 'solid-js'
import {createStore} from 'solid-js/store'
import {
  AttachmentByMime,
  ChatProvider,
  Thread,
  ToolProvider,
  useThread,
  Composer,
  ComposerActions,
  ComposerHandlersProvider,
  useComposerContext,
  type AttachmentAdapter,
  type SessionStatus,
  useComposer,
  createTextAttachmentAdapter,
} from '@conciv/ui-kit-chat'
import '@conciv/ui-kit-chat/theme/tokens.css'
import {useChatSession} from '@conciv/client'
import {
  defineAttachment,
  defineExtension,
  collectToolRenderers,
  getExtensionApi,
  type RegisterExtension,
} from '@conciv/extension'
import {paneAttachments, returnQueueToDraft} from '../src/pane/pane-attachments.js'
import type {ChatMessage, ContentPart, ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import {formatDuration, INERT_TOOL_CTX, ToolCallCard, ToolTraceRow} from '@conciv/ui-kit-chat/tools'
import {builtinToolCards} from '@conciv/ui-kit-chat-tools'
import {concivToolCards} from '@conciv/tools/cards'
import pageExtensionEntry from '@conciv/extension-page'
import pageExtension from '@conciv/extension-page/client'
import {GRAB_FILE_NAME} from '@conciv/grab/grab-attachment'
import type {Grab} from '@conciv/grab'
import {QueueStrip} from '../src/pane/queue-strip.js'
import {RunErrorRow} from '../src/pane/run-error-row.js'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'
import {ContextTracker} from '../src/pane/context-tracker.js'
import '@conciv/ui-kit-system/tokens.css'
import {EngineOutdatedNotice, EngineStaleNotice} from '../src/shell/engine-notice.js'
import {RefreshButton} from '../src/shell/refresh-button.js'
import {makePaneGrabApi} from '../src/extension/pane-grab.js'
import {createNoticeStore, type Notify} from '../src/shell/notices.js'
import {getHostApi} from '@conciv/extension/host'
import {
  createChat,
  createChatSession,
  type ChatSession,
  type ChatSessionCallbacks,
  type ChatSessionConnection,
  type ChatSessionHydration,
} from '@conciv/ai/client'
import type {ComposerInputHandle} from '../src/pane/composer-input-adapter.jsx'
import {createTextChunks, createToolCallChunks, createToolResultChunk, storyConnection} from '@conciv/ai/testkit'
import {createToolDurations} from '../src/pane/tool-durations.js'
import {EngineReachabilityContext} from '../src/app/reachability.js'
import {PaneComposer} from '../src/pane/pane-composer.jsx'
import {ChatEventType, type ChatEvent, type RunClockSource, type RunLifecycle} from '@conciv/protocol/chat-event-types'
import {SessionSelector} from '../src/composer/session-selector.js'
import {sessionPickerSearchSchema} from '../src/lib/session-search-schemas.js'
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
  stripSearchParams,
} from '@tanstack/solid-router'
import {StatusBar} from '../src/pane/status-bar.jsx'
import type {ToolCardEntry, ToolCardProps} from '@conciv/protocol/tool-view-types'
import {coreToolCards, EXECUTE_TOOL_NAME} from '@conciv/core/cards'
import {concivExtensionsToolDef, concivUiToolDef} from '@conciv/tools/defs'
import {BUILTIN_OPEN_TOOL, BUILTIN_SERVER_TOOLS} from '@conciv/tools/builtins'
import {createToolRegistry} from '@conciv/extension/registry'
import {PAGE_TOOL_DEFS} from '@conciv/extension-page/defs'

const PNG_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('approval replay', () => {
  const core = bootedCore('approval-replay')
  const keep = keptPane()
  afterAll(() => coreControl.setHubConnection('codex', false))

  const permissionRequest = () => page.getByRole('group', {name: 'Permission request'})
  const approveButton = () => page.getByRole('button', {name: 'Approve'})
  const composer = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

  const newSession = () => createSession(coreRpc(core()))

  async function attachedPane(sessionId: string): Promise<PaneMount> {
    const attached = await coreControl.pushSocketsOpened()
    const mount = mountPane({base: core(), sessionId}, () => <ChatPane sessionId={sessionId} />)
    await until(async () => (await coreControl.pushSocketsOpened()) > attached, {hangGuardMs: 20_000})
    return mount
  }

  test('an ask from a chat turn sits in the strip, and approving it posts the message that retries', async () => {
    const sessionId = await newSession()
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
    const sessionId = await newSession()
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

  test('a pane opened while the ask waits draws the card from hydrate, inside the pane at any width', async () => {
    const sessionId = await newSession()
    const waiting = coreControl.hubExecute(sessionId, 'return 1')

    const pane = await attachedPane(sessionId)
    keep(pane)
    const requests = page.getByRole('list', {name: 'Permission requests'})
    const cardFits = async () => {
      await expect.element(permissionRequest()).toBeInViewport({ratio: 1})
      await expect.element(approveButton()).toBeInViewport({ratio: 1})
      await expect.element(page.getByRole('button', {name: 'Deny'})).toBeInViewport({ratio: 1})
    }
    await expect.element(permissionRequest(), {timeout: 15_000}).toBeVisible()
    await expect.element(requests.getByRole('listitem').nth(1)).not.toBeInTheDocument()
    await cardFits()

    await page.viewport(1000, 900)
    pane.setWidth(960)
    await cardFits()

    await approveButton().click()
    await expect.element(permissionRequest(), {timeout: 15_000}).not.toBeInTheDocument()
    expect(await waiting).toContain('{\\"result\\":1')
    expect(await coreControl.hubExecute(sessionId, 'return 40 + 2')).toContain('42')
  }, 120_000)
})

describe('attachment widget', () => {
  function AttachmentFeeder(props: {file: File}): JSX.Element {
    const composer = useComposerContext()
    onMount(() => void composer.addAttachment(props.file))
    return <></>
  }

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
})

describe('chat pane', () => {
  const UNSCRIPTED_REPLY = 'an unscripted reply'

  const core = bootedCore('chat-pane', {text: UNSCRIPTED_REPLY})
  const active: {pane: PaneMount | null} = {pane: null}
  const faults = trackedFaults()

  afterEach(async () => {
    await coreControl.releaseTurn()
    active.pane?.dispose()
    active.pane = null
  })

  async function newSession(): Promise<{rpc: RpcClient; sessionId: string}> {
    const rpc = coreRpc(core())
    return {rpc, sessionId: await createSession(rpc)}
  }

  function grabOptions(...grabs: Grab[]): Pick<PaneMountOptions, 'grabProvider' | 'extensions'> {
    return {grabProvider: grabProviderFor(...grabs), extensions: [pageExtension]}
  }

  function mountChatPane(
    sessionId: string,
    options: Pick<PaneMountOptions, 'grabProvider' | 'extensions' | 'transport'> = {},
  ): PaneMount {
    const mount = mountPane({base: core(), sessionId, ...options}, () => <ChatPane sessionId={sessionId} />)
    active.pane = mount
    return mount
  }

  const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const snapshot = () => page.getByTitle('Grabbed element snapshot')
  const notifications = () => page.getByRole('region', {name: /Notifications/})
  const stopButton = () => page.getByRole('button', {name: 'Stop generating'})
  const stoppedLine = () => page.getByRole('separator', {name: 'Stopped'})
  const skeleton = () => page.getByRole('status', {name: 'Loading conversation'})
  const narration = () => page.getByText('Responding…', {exact: true})

  async function startStreamingRun(): Promise<{rpc: RpcClient; sessionId: string}> {
    const session = await newSession()
    await coreControl.holdTurn()
    mountChatPane(session.sessionId)
    await input().fill('first turn')
    await userEvent.keyboard('{Enter}')
    await expect.element(stopButton()).toBeVisible()
    await expect.element(page.getByText(UNSCRIPTED_REPLY)).toBeVisible()
    return session
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

  describe('the composer never waits on the server draft', () => {
    const DRAFT_GET_PATH = ['drafts', 'get']

    test('a stalled draft read still renders a composer that accepts typing', async () => {
      const {sessionId} = await newSession()
      await faults.install({kind: 'gate', path: DRAFT_GET_PATH})
      mountChatPane(sessionId)

      await expect.element(input()).toBeVisible()
      await input().fill('typed while the draft is loading')
      await expect.element(input()).toHaveTextContent('typed while the draft is loading')
    })

    test('a server draft that arrives late fills a composer the user has not touched', async () => {
      const {rpc, sessionId} = await newSession()
      await seedDraft(rpc, sessionId, {
        text: 'restored once the read lands',
        attachments: [persistedGrab('grab-late', HERO_GRAB)],
      })
      const gate = await faults.install({kind: 'gate', path: DRAFT_GET_PATH})
      mountChatPane(sessionId, grabOptions(HERO_GRAB))
      await expect.element(input()).toBeVisible()

      await coreControl.releaseFault(gate)

      await expect.element(input()).toHaveTextContent('restored once the read lands')
      await expect.element(snapshot()).toBeVisible()
    })

    test('a server draft that arrives after the user typed keeps their text and adds its attachments', async () => {
      const {rpc, sessionId} = await newSession()
      await seedDraft(rpc, sessionId, {
        text: 'the stale server text',
        attachments: [persistedGrab('grab-merged', HERO_GRAB)],
      })
      const gate = await faults.install({kind: 'gate', path: DRAFT_GET_PATH})
      mountChatPane(sessionId, grabOptions(HERO_GRAB))
      await input().fill('what the user typed first')

      await coreControl.releaseFault(gate)

      await expect.element(snapshot()).toBeVisible()
      await expect.element(input()).toHaveTextContent('what the user typed first')
      await expect.element(input()).not.toHaveTextContent('the stale server text')
    })

    test('a server draft that arrives after the user typed its exact text leaves their caret where they put it', async () => {
      const {rpc, sessionId} = await newSession()
      await rpc.drafts.set({
        sessionId,
        text: 'the same words',
        selectionStart: 0,
        selectionEnd: 0,
        attachments: [persistedGrab('grab-caret', HERO_GRAB)],
      })
      const gate = await faults.install({kind: 'gate', path: DRAFT_GET_PATH})
      mountChatPane(sessionId, grabOptions(HERO_GRAB))
      await input().fill('the same words')

      await coreControl.releaseFault(gate)
      await expect.element(snapshot()).toBeVisible()
      await expect.element(input()).toHaveFocus()
      await userEvent.keyboard('!')

      await expect.element(input()).toHaveTextContent('the same words!')
    })

    test('a message sent before the server draft arrives leaves no stale draft behind', async () => {
      const {rpc, sessionId} = await newSession()
      await seedDraft(rpc, sessionId, {text: 'the draft saved before the send'})
      const read = await faults.install({kind: 'gate', path: DRAFT_GET_PATH})
      const write = await faults.install({kind: 'gate', path: ['drafts', 'set']})
      mountChatPane(sessionId)
      await input().fill('sent before the saved draft arrived')
      await userEvent.keyboard('{Enter}')
      await expect.element(page.getByRole('log').getByText('sent before the saved draft arrived')).toBeVisible()

      await coreControl.releaseFault(read)
      await coreControl.awaitFaultPending(write, 1)
      await expect.element(input()).not.toHaveTextContent('the draft saved before the send')
      await coreControl.releaseFault(write)
      await coreControl.awaitFaultAnswered(write)
      active.pane?.dispose()
      mountChatPane(sessionId)

      await expect.element(input()).toBeVisible()
      await expect.element(input()).not.toHaveTextContent('the draft saved before the send')
    })
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

  test('sending announces the settled reply through the live region', async () => {
    const {sessionId} = await newSession()
    mountChatPane(sessionId)

    await expect.element(input()).toBeVisible()
    await input().fill('rename the widget package')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByRole('log', {name: 'Announcements'})).toHaveTextContent('conciv replied.')
  })

  test('an open pane streams a run another client starts, then settles it, without duplicating either turn', async () => {
    const {sessionId} = await newSession()
    mountChatPane(sessionId)
    await expect.element(page.getByText('How can I help you today?')).toBeVisible()

    await coreControl.scriptTurn({toolCalls: [], text: 'streamed from the other client'})
    await coreControl.holdTurn()
    const turn = await sendTurn(core(), sessionId, 'a prompt typed in the other client')

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

  test('the initial load shows a conversation skeleton until the snapshot arrives', async () => {
    const {sessionId} = await newSession()
    const gate = await faults.install({kind: 'gate', path: ['chat', 'hydrate']})
    mountChatPane(sessionId)

    await expect.element(skeleton()).toBeVisible()

    await coreControl.releaseFault(gate)

    await expect.element(page.getByText('How can I help you today?')).toBeVisible()
    await expect.element(skeleton()).not.toBeInTheDocument()
  })

  test('clicking stop with a queue stops the run and puts the queued messages, in order, back in the composer unsent', async () => {
    const {rpc, sessionId} = await startStreamingRun()

    await input().fill('alpha step')
    await userEvent.keyboard('{Enter}')
    await input().fill('bravo step')
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByRole('button', {name: 'Remove from queue'}).nth(1)).toBeVisible()
    const stopGate = await faults.install({kind: 'gate', path: ['chat', 'stop']})

    await stopButton().click()

    await expect.element(input().filter({hasText: /alpha step\s*bravo step/})).toBeVisible()
    await input().click()
    await userEvent.keyboard('{Enter}')
    await coreControl.releaseFault(stopGate)

    await expect.element(stoppedLine()).toBeVisible()
    await expect.element(stopButton()).not.toBeInTheDocument()
    await expect.element(page.getByText('Queue', {exact: true})).not.toBeInTheDocument()
    await expect.element(input().filter({hasText: /alpha step\s*bravo step/})).toBeVisible()
    const asked = (await rpc.chat.hydrate({sessionId})).messages.filter((message) => message.role === 'user')
    expect(asked).toHaveLength(1)

    await page.getByRole('button', {name: 'Send message'}).click()

    await expect.element(stopButton()).toBeVisible()
    await expect.element(input().filter({hasText: /alpha step/})).not.toBeInTheDocument()
    await coreControl.releaseTurn()
    await expect.element(stopButton()).not.toBeInTheDocument()
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

  test('Escape in the focused composer does what the stop button does and keeps the typed draft ahead of the queue', async () => {
    await startStreamingRun()

    await input().fill('queued while running')
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByRole('button', {name: 'Remove from queue'})).toBeVisible()

    await input().fill('draft kept in place')
    await userEvent.keyboard('{Escape}')

    await expect.element(stoppedLine()).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Remove from queue'})).not.toBeInTheDocument()
    await expect.element(input().filter({hasText: /draft kept in place\s*queued while running/})).toBeVisible()
    await expect.element(stopButton()).not.toBeInTheDocument()
  })

  describe('loading the chat history', () => {
    const HYDRATE_PATH = ['chat', 'hydrate']
    const loadError = () => page.getByRole('alert')
    const retry = () => loadError().getByRole('button', {name: /^Retry/})

    afterEach(async () => {
      await coreControl.releaseTools()
    })

    async function sessionWithHistory(): Promise<string> {
      const {sessionId} = await newSession()
      await runTurn(core(), sessionId, 'a question from before')
      return sessionId
    }

    test('shows the loading skeleton first, then the conversation', async () => {
      const sessionId = await sessionWithHistory()
      const gate = await faults.install({kind: 'gate', path: HYDRATE_PATH})
      mountChatPane(sessionId)
      await coreControl.awaitFaultPending(gate, 1)

      await expect.element(skeleton()).toBeVisible()
      await expect.element(page.getByText('a question from before')).not.toBeInTheDocument()

      await coreControl.releaseFault(gate)

      await expect.element(page.getByText('a question from before')).toBeVisible()
      await expect.element(page.getByText(UNSCRIPTED_REPLY)).toBeVisible()
      await expect.element(skeleton()).not.toBeInTheDocument()
    })

    test('a failed load reads as a failed load with Retry, survives a failed Retry, and Retry brings the conversation back', async () => {
      const sessionId = await sessionWithHistory()
      const broken = await faults.install({kind: 'fail', path: HYDRATE_PATH, status: 500})
      mountChatPane(sessionId)

      await expect.element(retry()).toBeEnabled()
      await expect.element(loadError().getByText('Couldn’t load this conversation')).toBeVisible()
      await expect.element(page.getByText('Internal Server Error')).not.toBeInTheDocument()
      await expect.element(page.getByText('How can I help you today?')).not.toBeInTheDocument()
      await expect.element(page.getByRole('separator', {name: 'New session'})).not.toBeInTheDocument()
      await expect.element(skeleton()).not.toBeInTheDocument()
      await expect.element(page.getByText('a question from before')).not.toBeInTheDocument()

      await retry().click()

      await expect
        .element(page.getByRole('log', {name: 'Announcements'}))
        .toMatchTextContent(/conciv could not load this conversation\. Try again\./)
      await expect.element(loadError().getByText('Couldn’t load this conversation')).toBeVisible()
      await expect.element(retry()).toBeEnabled()
      await expect.element(page.getByText('How can I help you today?')).not.toBeInTheDocument()

      await coreControl.releaseFault(broken)
      const held = await faults.install({kind: 'gate', path: HYDRATE_PATH})
      await retry().click()
      await coreControl.awaitFaultPending(held, 1)

      await expect.element(retry()).toBeDisabled()
      await expect.element(retry()).toHaveAccessibleName('Retrying…')

      await coreControl.releaseFault(held)

      await expect.element(page.getByText('a question from before')).toBeVisible()
      await expect.element(page.getByText(UNSCRIPTED_REPLY)).toBeVisible()
      await expect.element(loadError()).not.toBeInTheDocument()
      await expect.element(skeleton()).not.toBeInTheDocument()
    })

    test('Refresh on a failed load reopens the conversation, with no error row left and no prompt sent again', async () => {
      const sessionId = await sessionWithHistory()
      const broken = await faults.install({kind: 'fail', path: HYDRATE_PATH, status: 500})
      active.pane = mountPane({base: core(), sessionId}, () => (
        <>
          <RefreshButton />
          <ChatPane sessionId={sessionId} />
        </>
      ))

      await expect.element(retry()).toBeEnabled()
      await coreControl.releaseFault(broken)
      await page.getByRole('button', {name: 'Refresh the conversation'}).click()

      await expect.element(page.getByText(UNSCRIPTED_REPLY)).toBeVisible()
      await expect.element(page.getByText('a question from before')).toBeVisible()
      await expect.element(loadError()).not.toBeInTheDocument()
      await expect.element(page.getByRole('button', {name: 'Refresh the conversation'})).toBeEnabled()
      expect(page.getByText('a question from before').elements()).toHaveLength(1)
      expect(page.getByText(UNSCRIPTED_REPLY).elements()).toHaveLength(1)
    })

    test('Retry after a failed load joins the run already in flight, so the rest of the reply arrives and the pane settles', async () => {
      const {sessionId} = await newSession()
      await coreControl.scriptTurn({toolCalls: [], text: 'the rest of the reply'})
      await coreControl.holdTools()
      const turn = await sendTurn(core(), sessionId, 'a prompt sent before the pane opened')
      const broken = await faults.install({kind: 'fail', path: HYDRATE_PATH, status: 500})
      mountChatPane(sessionId)

      await expect.element(retry()).toBeEnabled()
      await coreControl.releaseFault(broken)
      await retry().click()

      await expect.element(page.getByText('a prompt sent before the pane opened')).toBeVisible()
      await expect.element(narration()).toBeVisible()
      await expect.element(page.getByText('the rest of the reply')).not.toBeInTheDocument()

      await coreControl.releaseTools()

      await expect.element(page.getByText('the rest of the reply')).toBeVisible()
      await expect.element(narration()).not.toBeInTheDocument()
      await expect.element(loadError()).not.toBeInTheDocument()
      await turn.awaitTurnEnd()
      turn.close()
    })

    test('a run pushed to a chat whose load failed leaves the failed load in place, so Retry reopens instead of resending', async () => {
      const {rpc, sessionId} = await newSession()
      const broken = await faults.install({kind: 'fail', path: HYDRATE_PATH, status: 500})
      const attached = await coreControl.pushSocketsOpened()
      mountChatPane(sessionId)
      await expect.element(retry()).toBeEnabled()
      await until(async () => (await coreControl.pushSocketsOpened()) > attached, {hangGuardMs: 20_000})
      await coreControl.releaseFault(broken)

      await coreControl.scriptTurn({toolCalls: [], text: 'the reply from the other client'})
      await coreControl.holdTurn()
      const turn = await sendTurn(core(), sessionId, 'a prompt from the other client')
      await turn.awaitReply()

      await expect.element(loadError().getByText('Couldn’t load this conversation')).toBeVisible()
      await expect.element(page.getByText('a prompt from the other client')).not.toBeInTheDocument()

      await retry().click()

      await expect.element(page.getByText('a prompt from the other client')).toBeVisible()
      await expect.element(page.getByText('the reply from the other client')).toBeVisible()
      await expect.element(loadError()).not.toBeInTheDocument()

      await coreControl.releaseTurn()
      await turn.awaitTurnEnd()
      turn.close()

      await expect.element(narration()).not.toBeInTheDocument()
      const asked = (await rpc.chat.hydrate({sessionId})).messages.filter((message) => message.role === 'user')
      expect(asked).toHaveLength(1)
    })
  })
})

const LONG_ACTION_NAME = 'long-composer-action'
const LONG_ACTION_LABEL = 'AN_EXTENSION_COMPOSER_LABEL_LONG_ENOUGH_TO_CROWD_THE_WHOLE_ROW'
const PINNED_ACTION_TOOLTIP = 'Run the pinned extension action'
const [pinnedActionRuns, setPinnedActionRuns] = createSignal(0)

const longComposerAction = defineExtension({
  name: LONG_ACTION_NAME,
  Component: () => (
    <Show when={getExtensionApi(LONG_ACTION_NAME).useSlot() === 'composer'}>
      <span>{LONG_ACTION_LABEL}</span>
      <ComposerActions.ActionButton
        visible="always"
        tooltip={PINNED_ACTION_TOOLTIP}
        onClick={() => setPinnedActionRuns((runs) => runs + 1)}
      >
        P
      </ComposerActions.ActionButton>
      <Show when={pinnedActionRuns() > 0}>
        <p>the pinned extension action ran</p>
      </Show>
    </Show>
  ),
})

declare module '@conciv/protocol/config-types' {
  interface ExtensionRegistry extends RegisterExtension<typeof longComposerAction> {}
}

describe('composer overflow', () => {
  const menuitem = (name: string | RegExp) => page.getByRole('menuitem', {name})

  const COMPACT_PATH = ['sessions', 'compact']
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
  const newSessionItem = () => page.getByRole('menuitem', {name: 'Start a new session'})
  const compactItem = () => page.getByRole('menuitem', {name: 'Compress the conversation'})
  const commandOption = (position: number) => page.getByRole('option').nth(position)

  async function mountComposer(width?: number, extensions?: PaneMountOptions['extensions']): Promise<PaneMount> {
    const sessionId = await createSession(coreRpc(core()))
    const [requests, setRequests] = createSignal<string[]>([])
    const mount = mountPane(
      {
        base: core(),
        sessionId,
        width,
        extensions,
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

  test('a long extension action in the row leaves the message input and a pinned action reachable', async () => {
    await mountComposer(undefined, [longComposerAction])

    await expect.element(page.getByText(LONG_ACTION_LABEL)).toBeVisible()
    const pinnedAction = page.getByRole('button', {name: PINNED_ACTION_TOOLTIP})
    await expect.element(pinnedAction).toBeVisible()
    await userEvent.click(pinnedAction)
    await expect.element(page.getByText('the pinned extension action ran')).toBeVisible()
    await expect.element(input()).toBeVisible()
    await userEvent.click(input())
    await userEvent.keyboard('still typeable')

    await expect.element(input().getByText('still typeable')).toBeVisible()
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

  test('with a single harness the overflow menu offers no harness switcher', async () => {
    await mountComposer(WIDE_PX)

    await userEvent.click(trigger())

    await expect.element(compactItem()).toBeVisible()
    await expect.element(menuitem(/^Harness:/)).not.toBeInTheDocument()
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

describe('model menu', () => {
  const EFFORTS: ReasoningEffort[] = ['low', 'medium', 'high', 'xhigh', 'max']
  const MODELS = [
    {id: 'opus', name: 'Opus 5.5', group: 'Claude', efforts: EFFORTS},
    {id: 'sonnet', name: 'Sonnet 5.5', group: 'Claude', efforts: EFFORTS},
    {id: 'claude-opus-4-7', name: 'Opus 4.7', group: 'Older versions', efforts: EFFORTS},
    {id: 'claude-haiku-4-5', name: 'Haiku 4.5', group: 'Older versions'},
  ]

  const HARNESS_COMMANDS = [
    {name: 'model', description: 'Set the AI model for Claude Code'},
    {name: 'deploy', description: 'Ship the branch'},
  ]
  const REPLY = 'a model menu reply'

  const core = bootedCore('model-menu', {models: MODELS, commands: HARNESS_COMMANDS, text: REPLY})
  const keep = keptPane()
  const faults = trackedFaults()

  const prompt = (name: string) => page.getByRole('button', {name: `Model: ${name}`})
  const model = (name: string) => page.getByRole('option', {name, exact: true})
  const picker = () => page.getByRole('dialog', {name: 'Model'})
  const models = () => page.getByRole('listbox', {name: 'Model', exact: true})
  const search = () => page.getByRole('textbox', {name: 'Search models'})
  const older = () => page.getByRole('button', {name: 'Older versions'})
  const effortGroup = () => page.getByRole('radiogroup', {name: 'Effort'})
  const effort = (name: string) => effortGroup().getByText(name, {exact: true})
  const checkedEffort = (name: string) => effortGroup().getByRole('radio', {name, exact: true, checked: true})
  const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

  async function mountModelMenu(): Promise<void> {
    const sessionId = await createSession(coreRpc(core()))
    keep(mountPane({base: core(), sessionId, width: 460}, () => <ChatPane sessionId={sessionId} />))
    await expect.element(input()).toBeVisible()
  }

  test('the composer takes typing while the model list still loads, and keeps text and focus once it arrives', async () => {
    const sessionId = await createSession(coreRpc(core()))
    await faults.install({kind: 'gate', path: ['meta', 'models']})
    keep(mountPane({base: core(), sessionId, width: 460}, () => <ChatPane sessionId={sessionId} />))

    await expect.element(input()).toBeVisible()
    await input().fill('typed before the models arrived')
    await expect.element(input()).toHaveFocus()

    await faults.releaseAll()

    await expect.element(prompt('Opus 5.5')).toBeVisible()
    await expect.element(input()).toHaveTextContent('typed before the models arrived')
    await expect.element(input()).toHaveFocus()
  })

  test('/model before the model list arrives opens the menu on its search field, which lists the models once they load', async () => {
    const sessionId = await createSession(coreRpc(core()))
    await faults.install({kind: 'gate', path: ['meta', 'models']})
    keep(mountPane({base: core(), sessionId, width: 460}, () => <ChatPane sessionId={sessionId} />))

    await userEvent.click(input())
    await userEvent.keyboard('/model')
    await expect.element(page.getByRole('option').first()).toHaveTextContent('/modelSwitch the model')
    await userEvent.keyboard('{Enter}')

    await expect.element(search()).toHaveFocus()
    await expect.element(picker().getByRole('status')).toHaveTextContent('Loading models…')
    await expect.element(picker().getByRole('option').first()).not.toBeInTheDocument()

    await faults.releaseAll()

    await expect.element(model('Opus 5.5')).toHaveAttribute('aria-selected', 'true')
    await expect.element(search()).toHaveFocus()
  })

  test('a model list that failed to load offers a retry inside the menu, which then lists the models', async () => {
    const sessionId = await createSession(coreRpc(core()))
    const fault = await faults.install({kind: 'fail', path: ['meta', 'models'], status: 500})
    keep(mountPane({base: core(), sessionId, width: 460}, () => <ChatPane sessionId={sessionId} />))

    await userEvent.click(page.getByRole('button', {name: 'Couldn’t load models', exact: true}))
    const retry = picker().getByRole('button', {name: 'Couldn’t load models: Retry loading models'})
    await expect.element(retry).toBeVisible()
    await coreControl.releaseFault(fault)
    await userEvent.click(retry)

    await expect.element(prompt('Opus 5.5')).toBeVisible()
    await expect.element(model('Opus 5.5')).toHaveAttribute('aria-selected', 'true')
    await expect.element(search()).toBeVisible()
  })

  test('the slash list shows /model once, the built-in command replacing the harness one', async () => {
    await mountModelMenu()

    await userEvent.click(input())
    await userEvent.keyboard('/model')

    await expect.element(page.getByRole('option').first()).toHaveTextContent('/modelSwitch the model')
    expect(page.getByRole('option').elements()).toHaveLength(1)
  })

  test('/model and Enter opens the model menu on its search field, empties the composer and sends nothing', async () => {
    await mountModelMenu()

    await userEvent.click(input())
    await userEvent.keyboard('/model')
    await expect.element(page.getByRole('option').first()).toHaveTextContent('/modelSwitch the model')
    await userEvent.keyboard('{Enter}')

    await expect.element(search()).toHaveFocus()
    await expect.element(input()).not.toHaveTextContent()

    await userEvent.keyboard('{Escape}')
    await expect.element(picker()).not.toBeInTheDocument()
    await expect.element(input()).toHaveFocus()

    await userEvent.keyboard('hello')
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByText(REPLY)).toBeVisible()
    expect(page.getByText(REPLY).elements()).toHaveLength(1)
    await expect.element(page.getByText('/model')).not.toBeInTheDocument()
  })

  test('/model typed with the menu dismissed and sent opens the model menu instead of reaching the agent', async () => {
    await mountModelMenu()

    await userEvent.click(input())
    await userEvent.keyboard('/model')
    await expect.element(page.getByRole('option').first()).toHaveTextContent('/modelSwitch the model')
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('option').first()).not.toBeInTheDocument()
    await expect.element(input()).toHaveTextContent('/model')
    await userEvent.keyboard('{Enter}')

    await expect.element(search()).toHaveFocus()
    await expect.element(input()).not.toHaveTextContent()

    await userEvent.keyboard('{Escape}')
    await expect.element(input()).toHaveFocus()
    await userEvent.keyboard('hello')
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByText(REPLY)).toBeVisible()
    expect(page.getByText(REPLY).elements()).toHaveLength(1)
    await expect.element(page.getByText('/model')).not.toBeInTheDocument()
  })

  test('a harness command still inserts a chip and is sent to the agent', async () => {
    await mountModelMenu()

    await userEvent.click(input())
    await userEvent.keyboard('/deploy')
    await expect.element(page.getByRole('option').first()).toHaveTextContent('/deployShip the branch')
    await userEvent.keyboard('{Enter}')
    await expect.element(input().getByText('/deploy')).toBeVisible()
    await expect.element(picker()).not.toBeInTheDocument()

    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByText(REPLY)).toBeVisible()
    await expect.element(input()).not.toHaveTextContent()
  })

  test('the prompt names the current model, the caret sits outside it, and the overflow menu no longer lists models', async () => {
    await mountModelMenu()

    await expect.element(prompt('Opus 5.5')).toHaveTextContent('opus 5.5')
    await expect.element(prompt('Opus 5.5')).not.toHaveTextContent('❯')

    await userEvent.click(page.getByRole('button', {name: 'More composer actions'}))
    await expect.element(page.getByRole('menuitem', {name: 'Compress the conversation'})).toBeVisible()
    await expect.element(page.getByRole('menuitem', {name: /^Model:/})).not.toBeInTheDocument()
  })

  test('picking a model from the prompt menu switches the session, renames the prompt and focuses the composer', async () => {
    await mountModelMenu()

    await userEvent.click(prompt('Opus 5.5'))
    await expect.element(search()).toHaveFocus()
    await expect.element(model('Opus 5.5')).toHaveAttribute('aria-selected', 'true')
    await userEvent.click(model('Sonnet 5.5'))

    await expect.element(prompt('Sonnet 5.5')).toHaveTextContent('sonnet 5.5')
    await expect.element(picker()).not.toBeInTheDocument()
    await expect.element(input()).toHaveFocus()

    await userEvent.click(prompt('Sonnet 5.5'))
    await expect.element(model('Sonnet 5.5')).toHaveAttribute('aria-selected', 'true')
  })

  test('the arrow keys move from the current model and Enter picks it', async () => {
    await mountModelMenu()

    await userEvent.click(prompt('Opus 5.5'))
    await expect.element(search()).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}{Enter}')

    await expect.element(prompt('Sonnet 5.5')).toBeVisible()
    await expect.element(input()).toHaveFocus()
  })

  test('an older model is reached by keyboard through the Older versions section', async () => {
    await mountModelMenu()

    await userEvent.click(prompt('Opus 5.5'))
    await expect.element(search()).toHaveFocus()
    await userEvent.keyboard('{Tab}')
    await expect.element(models()).toHaveFocus()
    await userEvent.keyboard('{Tab}')
    await expect.element(older()).toHaveFocus()
    await expect.element(model('Opus 4.7')).not.toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    await expect.element(model('Opus 4.7')).toBeVisible()
    await expect.element(picker()).toBeVisible()
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    await expect.element(models()).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}')

    await expect.element(prompt('Opus 4.7')).toHaveTextContent('opus 4.7')
    await userEvent.click(prompt('Opus 4.7'))
    await expect.element(model('Opus 4.7')).toHaveAttribute('aria-selected', 'true')
  })

  test('an empty search keeps the older versions folded, a query reaches them too, and Enter picks the first match', async () => {
    await mountModelMenu()

    await userEvent.click(prompt('Opus 5.5'))
    await expect.element(model('Sonnet 5.5')).toBeVisible()
    await expect.element(older()).toBeVisible()
    await expect.element(model('Opus 4.7')).not.toBeInTheDocument()

    await userEvent.keyboard('4.7')
    await expect.element(model('Opus 4.7')).toBeVisible()
    await expect.element(model('Sonnet 5.5')).not.toBeInTheDocument()
    await expect.element(older()).not.toBeInTheDocument()
    await userEvent.keyboard('{Enter}')

    await expect.element(prompt('Opus 4.7')).toHaveTextContent('opus 4.7')
    await userEvent.click(prompt('Opus 4.7'))
    await userEvent.keyboard('opus')
    await expect.element(model('Opus 4.7')).toHaveAttribute('aria-selected', 'true')
    await expect.element(model('Opus 5.5')).toHaveAttribute('aria-selected', 'false')
  })

  test('the search matches a model by its id, ignoring case, and says so when nothing matches', async () => {
    await mountModelMenu()

    await userEvent.click(prompt('Opus 5.5'))
    await userEvent.keyboard('CLAUDE-HAIKU')
    await expect.element(model('Haiku 4.5')).toBeVisible()
    await expect.element(model('Opus 5.5')).not.toBeInTheDocument()

    await userEvent.fill(search(), 'zzz')
    await expect.element(picker().getByText('No models match “zzz”')).toBeVisible()
    await expect.element(page.getByRole('option')).not.toBeInTheDocument()
  })

  test('Escape clears the search first, then closes the menu and returns focus to the composer', async () => {
    await mountModelMenu()

    await userEvent.click(prompt('Opus 5.5'))
    await userEvent.keyboard('haiku')
    await expect.element(model('Sonnet 5.5')).not.toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await expect.element(search()).toHaveValue('')
    await expect.element(model('Sonnet 5.5')).toBeVisible()
    await expect.element(search()).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    await expect.element(picker()).not.toBeInTheDocument()
    await expect.element(input()).toHaveFocus()
  })

  test('picking an effort keeps the panel open and names it on the prompt', async () => {
    await mountModelMenu()

    await userEvent.click(prompt('Opus 5.5'))
    await expect.element(effortGroup()).toBeVisible()
    await expect.element(page.getByText('Using the model’s default effort.')).toBeVisible()
    await expect.element(checkedEffort('Default')).toBeInTheDocument()
    await userEvent.click(effort('Medium'))

    await expect.element(prompt('Opus 5.5, effort Medium')).toHaveTextContent('opus 5.5')
    await expect.element(picker()).toBeVisible()
    await expect.element(checkedEffort('Medium')).toBeInTheDocument()
  })

  test('the Default segment puts the model back on its default effort', async () => {
    await mountModelMenu()

    await userEvent.click(prompt('Opus 5.5'))
    await userEvent.click(effort('High'))
    await expect.element(prompt('Opus 5.5, effort High')).toBeVisible()
    await userEvent.click(effort('Default'))

    await expect.element(page.getByRole('button', {name: 'Model: Opus 5.5', exact: true})).toBeVisible()
    await expect.element(checkedEffort('Default')).toBeInTheDocument()
    await expect.element(page.getByText('Using the model’s default effort.')).toBeVisible()
  })

  test('a picked effort stays checked while the session list is still catching up', async () => {
    await mountModelMenu()

    await userEvent.click(prompt('Opus 5.5'))
    await expect.element(checkedEffort('Default')).toBeInTheDocument()
    const listing = await faults.install({kind: 'gate', path: ['sessions', 'list']})
    await userEvent.click(effort('Medium'))
    await coreControl.awaitFaultPending(listing, 1)

    await expect.element(checkedEffort('Medium')).toBeInTheDocument()
    await expect.element(prompt('Opus 5.5, effort Medium')).toBeVisible()
    await faults.releaseAll()
    await expect.element(checkedEffort('Medium')).toBeInTheDocument()
    await userEvent.click(effort('High'))
    await expect.element(checkedEffort('High')).toBeInTheDocument()
    await expect.element(prompt('Opus 5.5, effort High')).toBeVisible()
  })

  test('High+ is its own effort segment', async () => {
    await mountModelMenu()

    await userEvent.click(prompt('Opus 5.5'))
    await userEvent.click(effort('High+'))

    await expect.element(prompt('Opus 5.5, effort High+')).toHaveTextContent('opus 5.5')
    await expect.element(checkedEffort('High+')).toBeInTheDocument()
    await expect.element(page.getByText('Thinks even longer than High. Slower again, uses more tokens.')).toBeVisible()
  })

  test('the effort track takes the arrow keys', async () => {
    await mountModelMenu()

    await userEvent.click(prompt('Opus 5.5'))
    await userEvent.click(effort('Medium'))
    await expect.element(checkedEffort('Medium')).toBeInTheDocument()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(prompt('Opus 5.5, effort High')).toBeVisible()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(prompt('Opus 5.5, effort High+')).toBeVisible()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(prompt('Opus 5.5, effort Max')).toBeVisible()
  })

  test('an older model without effort hides the effort row and clears the effort', async () => {
    await mountModelMenu()

    await userEvent.click(prompt('Opus 5.5'))
    await userEvent.click(effort('High'))
    await expect.element(prompt('Opus 5.5, effort High')).toBeVisible()

    await userEvent.click(older())
    await userEvent.click(model('Haiku 4.5'))

    await expect.element(prompt('Haiku 4.5')).toHaveTextContent('haiku 4.5')
    await userEvent.click(prompt('Haiku 4.5'))
    await expect.element(model('Sonnet 5.5')).toBeVisible()
    await expect.element(effortGroup()).not.toBeInTheDocument()
  })
})

describe('context tracker', () => {
  function mount(usage: UsageSnapshot | null): HTMLElement {
    return render(() => <ContextTracker usage={usage} />).container
  }

  describe('ContextTracker trigger badge', () => {
    it('never derives a percent from cumulative billing totals (issue #78: 773K/200K = 386%)', () => {
      const host = mount({inputTokens: 700_000, cacheReadTokens: 73_000, contextWindow: 200_000, outputTokens: 5_000})
      expect(host.textContent).not.toContain('%')
      expect(host.querySelector('svg')).toBeNull()
      expect(host.textContent).toContain('705K')
    })
  })
})

describe('engine staleness', () => {
  const core = bootedCore('engine-staleness')
  const keep = keptPane()

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

  async function mountNotice(engine: EngineStaleness): Promise<PaneMount> {
    await coreControl.setStaleness(engine)
    const sessionId = await createSession(coreRpc(core()))
    return keep(mountPane({base: core(), sessionId}, () => <EngineStaleNotice />))
  }

  test('an engine running outdated code says so, and says it is the server code that moved', async () => {
    await mountNotice(staleness(true, 'stamp-boot'))

    const alert = page.getByRole('alert')
    await expect
      .element(alert)
      .toHaveTextContent(
        'Engine is running outdated code: the server code on disk is newer than the running engine. Restart the dev server.',
      )
    await expect.element(alert.getByRole('button', {name: 'Dismiss'})).toBeVisible()
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

describe('engine version', () => {
  const core = bootedCore('engine-version')
  const keep = keptPane()

  test('an engine from before release versions still answers the widget, and the widget asks to update it', async () => {
    await coreControl.installFault({kind: 'pre-version-engine'})
    const sessionId = await createSession(makeBrowserRpcClient(core()).rpc)
    keep(mountPane({base: core(), sessionId}, () => <EngineOutdatedNotice />))

    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent(
        `This widget is version ${appManifest.version} but the conciv engine is older. Update your @conciv packages to ${appManifest.version}, then restart your dev server.`,
      )
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

describe('chat history paging', () => {
  const HYDRATE_PATH = ['chat', 'hydrate']
  const SEEDED_EXCHANGES = 100
  const STREAMED_REPLY_CLOSING = 'That is the end of the streamed reply.'
  const STREAMED_REPLY = [
    ...Array.from({length: 30}, (_, line) => `Streamed reply line ${line} keeps the reader company while it grows.`),
    STREAMED_REPLY_CLOSING,
  ].join('\n\n')
  const STREAMED_REPLY_PACE = {chunk: 24, everyMs: 50}
  const core = bootedCore('history-paging', {
    displayName: 'Alpha',
    alternates: [{id: 'beta', displayName: 'Beta', text: 'Hello from beta'}],
  })
  const keep = keptPane()
  const faults = trackedFaults()
  const long: {sessionId: string} = {sessionId: ''}

  afterEach(() => coreControl.releaseTurn())

  const exchange = (index: number) => page.getByText(`seeded exchange ${index}`, {exact: true})
  const thread = () => page.getByRole('log').filter({hasText: 'seeded exchange'})
  const loadingOlder = () => page.getByRole('status', {name: 'Loading earlier messages'})
  const newSessionLine = () => page.getByRole('separator', {name: 'New session'})
  const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const hydrates = (): Promise<number> => coreControl.rpcCallCount(HYDRATE_PATH)
  const between = (from: string, marker: string, to: string): RegExp =>
    new RegExp(`${from}(?:(?!seeded exchange).)*${marker}(?:(?!seeded exchange).)*${to}`)
  const scrollToTop = () => userEvent.wheel(thread(), {delta: {y: -1_000_000}})
  const scrollToEnd = () => userEvent.wheel(thread(), {delta: {y: 1_000_000}})

  async function stoppedExchange(rpc: RpcClient, sessionId: string, text: string): Promise<void> {
    await coreControl.holdTurn()
    const turn = await sendTurn(core(), sessionId, text)
    await turn.awaitReply()
    const active = (await rpc.chat.hydrate({sessionId})).activeRun
    await rpc.chat.stop({sessionId, runIds: active === null ? [] : [active.runId]})
    await turn.awaitTurnEnd()
    await coreControl.releaseTurn()
  }

  async function seedLongChat(): Promise<string> {
    const rpc = coreRpc(core())
    const sessionId = await createSession(rpc)
    for (let index = 0; index < SEEDED_EXCHANGES; index += 1) {
      if (index === 97) await rpc.sessions.switchHarness({sessionId, harnessId: 'beta'})
      if (index === 95) await stoppedExchange(rpc, sessionId, `seeded exchange ${index}`)
      if (index !== 95) await runTurn(core(), sessionId, `seeded exchange ${index}`)
      if (index === 93) await rpc.sessions.compact({sessionId})
    }
    return sessionId
  }

  beforeAll(async () => {
    long.sessionId = await seedLongChat()
  }, 120_000)

  function mountPagedChat(sessionId: string) {
    return keep(
      mountPane({base: core(), sessionId, width: 460}, () => (
        <div style={{display: 'flex', 'flex-direction': 'column', height: '400px'}}>
          <ChatPane sessionId={sessionId} />
        </div>
      )),
    )
  }

  async function openChat(sessionId: string): Promise<number> {
    mountPagedChat(sessionId)
    await expect.element(exchange(SEEDED_EXCHANGES - 1)).toBeVisible()
    return await hydrates()
  }

  const threadShowing = (from: string, marker: string, to: string) =>
    thread().filter({hasText: between(from, marker, to)})

  async function expectMarkersInPlace(): Promise<void> {
    await expect.element(threadShowing('seeded exchange 93', 'Context compacted', 'seeded exchange 94')).toBeVisible()
    await expect.element(threadShowing('seeded exchange 95', 'Stopped', 'seeded exchange 96')).toBeVisible()
    await expect.element(threadShowing('seeded exchange 96', 'Alpha', 'Hello from conciv')).toBeVisible()
    await expect.element(threadShowing('seeded exchange 98', 'Beta', 'Hello from beta')).toBeVisible()
  }

  test('opening a long chat loads only the newest page, and the page before it lands without moving the message in view', async () => {
    const opened = await openChat(long.sessionId)
    await expectMarkersInPlace()
    await expect.element(newSessionLine()).not.toBeInTheDocument()
    await faults.install({kind: 'gate', path: HYDRATE_PATH})

    await scrollToTop()

    await expect.element(loadingOlder()).toBeVisible()
    await expect.element(exchange(76)).toBeInViewport()
    await expect.element(exchange(74)).not.toBeInTheDocument()
    await faults.releaseAll()

    await expect.element(exchange(75)).toBeInTheDocument()
    await expect.element(loadingOlder()).not.toBeInTheDocument()
    await expect.element(exchange(76)).toBeInViewport()
    expect(await hydrates()).toBe(opened + 1)
  })

  test('scrolling up loads the older page well before the top, and the messages in view stay where they were', async () => {
    const opened = await openChat(long.sessionId)
    await faults.install({kind: 'gate', path: HYDRATE_PATH})

    await userEvent.wheel(thread(), {delta: {y: -1000}})

    await expect.element(loadingOlder()).toBeInTheDocument()
    await expect.element(loadingOlder()).not.toBeInViewport()
    await expectInViewOnly([87, 88], [86, 91])
    await faults.releaseAll()

    await expect.element(loadingOlder()).not.toBeInTheDocument()
    await expectInViewOnly([87, 88], [86, 91])
    expect(await hydrates()).toBe(opened + 1)
  })

  test('the replies on screen are kept, not rebuilt, when the page before them lands', async () => {
    await openChat(long.sessionId)
    await faults.install({kind: 'gate', path: HYDRATE_PATH})
    await userEvent.wheel(thread(), {delta: {y: -1000}})
    await expect.element(loadingOlder()).toBeInTheDocument()
    await userEvent.hover(thread().getByText('Hello from conciv', {exact: true}).first())
    await userEvent.click(thread().getByRole('button', {name: 'Copy'}).first())
    const copyOutcome = thread()
      .getByRole('status')
      .filter({hasText: /^(Copied the message|Could not copy the message)$/})
    await expect.element(copyOutcome).toBeInTheDocument()

    await faults.releaseAll()

    await expect.element(loadingOlder()).not.toBeInTheDocument()
    await expect.element(copyOutcome).toBeInTheDocument()
  })

  async function expectInViewOnly(shown: number[], hidden: number[]): Promise<void> {
    for (const index of shown) await expect.element(exchange(index)).toBeInViewport()
    for (const index of hidden) await expect.element(exchange(index)).not.toBeInViewport()
  }

  test('an older page that fails waits for Retry instead of asking again, and Retry loads it', async () => {
    const opened = await openChat(long.sessionId)
    await faults.install({kind: 'fail', path: HYDRATE_PATH, status: 500})

    await scrollToTop()

    const failed = page.getByRole('alert').filter({hasText: 'Couldn’t load earlier messages.'})
    await expect.element(failed).toBeVisible()
    await expect.element(loadingOlder()).not.toBeInTheDocument()
    await faults.releaseAll()

    await userEvent.click(failed.getByRole('button', {name: 'Retry'}))

    await expect.element(exchange(75)).toBeInTheDocument()
    await expect.element(failed).not.toBeInTheDocument()
    expect(await hydrates()).toBe(opened + 1)
  })

  test('scrolling up page after page reaches the first message, then stops asking, and every marker stays on its message', async () => {
    const opened = await openChat(long.sessionId)
    for (const boundary of [74, 49, 24, 0]) {
      await scrollToTop()
      await expect.element(exchange(boundary)).toBeInTheDocument()
    }
    await expect.element(newSessionLine()).toBeVisible()
    await expect.element(loadingOlder()).not.toBeInTheDocument()
    expect(await hydrates()).toBe(opened + 4)

    await scrollToEnd()

    await expect.element(exchange(SEEDED_EXCHANGES - 1)).toBeVisible()
    await expectMarkersInPlace()
  })

  test('Latest glides to the newest message from far up, a wheel mid-glide leaves the reader where they scrolled, and scrolling back down by hand follows the stream again', async () => {
    const latest = () => page.getByRole('button', {name: 'Scroll to bottom'})
    await openChat(long.sessionId)
    for (const boundary of [74, 49]) {
      await scrollToTop()
      await expect.element(exchange(boundary)).toBeInTheDocument()
    }
    await faults.install({kind: 'gate', path: HYDRATE_PATH})

    await userEvent.click(latest())

    await expect.element(latest()).toBeEnabled()
    await expect.element(exchange(SEEDED_EXCHANGES - 1)).toBeInViewport()
    await expect.element(latest()).toBeDisabled()

    await scrollToTop()
    await expect.element(loadingOlder()).toBeInTheDocument()
    await userEvent.click(latest())
    await faults.releaseAll()
    await expect.element(loadingOlder()).not.toBeInTheDocument()
    await userEvent.wheel(thread(), {delta: {y: -40}})
    await expect.element(exchange(SEEDED_EXCHANGES - 1)).toBeInViewport()
    await coreRpc(core()).sessions.switchHarness({sessionId: long.sessionId, harnessId: 'history-paging'})
    await faults.install({kind: 'gate', path: HYDRATE_PATH})

    await scrollToTop()
    await expect.element(loadingOlder()).toBeInTheDocument()
    await userEvent.click(latest())
    await userEvent.wheel(thread(), {delta: {y: -400}})
    await faults.releaseAll()
    await expect.element(loadingOlder()).not.toBeInTheDocument()
    await streamReplyAndSettle('streamed while scrolled away')

    await expect.element(latest()).toBeEnabled()

    await userEvent.click(latest())
    await expect.element(latest()).toBeDisabled()
    await coreControl.scriptTurn({toolCalls: [], text: STREAMED_REPLY, textPace: STREAMED_REPLY_PACE})
    const streamed = await sendTurn(core(), long.sessionId, 'streamed while reading')
    await expect.element(page.getByText('streamed while reading', {exact: true})).toBeInViewport()
    await userEvent.wheel(thread(), {delta: {y: -300}})
    await expect.element(latest()).toBeEnabled()
    await scrollToEnd()
    await streamed.awaitTurnEnd()

    await expect.element(page.getByText(STREAMED_REPLY_CLOSING, {exact: true}).last()).toBeInViewport()
    await expect.element(latest()).toBeDisabled()
    await coreControl.clearScript()
  }, 60_000)

  async function streamReplyAndSettle(text: string): Promise<void> {
    const stop = page.getByRole('button', {name: 'Stop generating'})
    await coreControl.scriptTurn({toolCalls: [], text: STREAMED_REPLY, textPace: STREAMED_REPLY_PACE})
    const turn = await sendTurn(core(), long.sessionId, text)
    await expect.element(stop).toBeVisible()
    await turn.awaitTurnEnd()
    await expect.element(stop).not.toBeInTheDocument()
  }

  test('a turn run from elsewhere while older pages are loaded shows up and keeps those pages', async () => {
    const sessionId = await seedExchanges()
    await openChat(sessionId)
    await scrollToTop()
    await expect.element(exchange(74)).toBeInTheDocument()

    const elsewhere = await sendTurn(core(), sessionId, 'run from elsewhere')
    await elsewhere.awaitTurnEnd()

    await scrollToEnd()
    await expect.element(page.getByText('run from elsewhere', {exact: true})).toBeVisible()
    await scrollToTop()
    await expect.element(exchange(50)).toBeInViewport()
  })

  test('sending in a paged chat works and the server keeps the whole history', async () => {
    const sessionId = await seedExchanges()
    await openChat(sessionId)

    await userEvent.click(input())
    await userEvent.keyboard('sent from a paged chat{Enter}')

    await expect.element(page.getByText('sent from a paged chat', {exact: true})).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Stop generating'})).not.toBeInTheDocument()
    const stored = (await coreRpc(core()).chat.hydrate({sessionId})).messages
    expect(stored).toHaveLength(SEEDED_EXCHANGES * 2 + 2)
    expect(JSON.stringify(stored[0])).toContain('seeded exchange 0')
  })

  test('a short chat loads whole, starts with its New session line and never asks for more', async () => {
    const rpc = coreRpc(core())
    const sessionId = await createSession(rpc)
    for (const index of [0, 1]) await runTurn(core(), sessionId, `seeded exchange ${index}`)
    mountPagedChat(sessionId)
    await expect.element(exchange(1)).toBeVisible()
    const opened = await hydrates()

    await scrollToTop()

    await expect.element(newSessionLine()).toBeVisible()
    await expect.element(exchange(0)).toBeVisible()
    await expect.element(loadingOlder()).not.toBeInTheDocument()
    expect(await hydrates()).toBe(opened)
  })

  test('a long chat whose newest page fits the viewport loads older pages without any scroll', async () => {
    keep(
      mountPane({base: core(), sessionId: long.sessionId, width: 460}, () => (
        <div style={{display: 'flex', 'flex-direction': 'column', height: '9000px'}}>
          <ChatPane sessionId={long.sessionId} />
        </div>
      )),
    )

    await expect.element(exchange(SEEDED_EXCHANGES - 1)).toBeInTheDocument()
    await expect.element(exchange(74)).toBeInTheDocument()
  })

  test('a reply sent in the pane and then compacted keeps the compact line under it without reopening', async () => {
    const sessionId = await createSession(coreRpc(core()))
    const first = mountPagedChat(sessionId)

    await userEvent.click(input())
    await userEvent.keyboard('compact after this reply{Enter}')
    await expect.element(page.getByText('Hello from conciv')).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Stop generating'})).not.toBeInTheDocument()
    await faults.install({kind: 'gate', path: HYDRATE_PATH})
    await userEvent.click(page.getByRole('button', {name: 'More composer actions'}))
    await userEvent.click(page.getByRole('menuitem', {name: 'Compress the conversation'}))

    const compactedUnderReply = page
      .getByRole('log')
      .filter({hasText: /compact after this reply.*Hello from conciv.*Context compacted/})
    await expect.element(compactedUnderReply).toBeVisible()
    await faults.releaseAll()
    await expect.element(page.getByRole('status', {name: 'Compacting context…'})).not.toBeInTheDocument()
    await expect.element(page.getByText('Hello from conciv').nth(1)).toBeVisible()
    const settled = page
      .getByRole('log')
      .filter({hasText: /compact after this reply.*Hello from conciv.*Context compacted.*Hello from conciv/})
    await expect.element(settled).toBeVisible()

    first.dispose()
    mountPagedChat(sessionId)
    await expect.element(page.getByText('Hello from conciv').nth(1)).toBeVisible()
    await expect.element(settled).toBeVisible()
  })

  test('a refresh that lands past everything shown keeps the loaded messages and fills the gap', async () => {
    const sessionId = await seedExchanges(30)
    mountPagedChat(sessionId)
    await expect.element(exchange(29)).toBeVisible()
    await faults.install({kind: 'gate', path: HYDRATE_PATH})

    for (let index = 30; index < 56; index += 1) await runTurn(core(), sessionId, `seeded exchange ${index}`)
    await faults.releaseAll()

    await expect.element(exchange(55)).toBeVisible()
    await scrollToTop()
    await expect.element(exchange(5)).toBeInTheDocument()
    await scrollToTop()
    await expect.element(newSessionLine()).toBeVisible()
    await expect.element(exchange(0)).toBeVisible()
  }, 120_000)

  test('an empty pane that a refresh fills with more than one page can still scroll back to the first message', async () => {
    const sessionId = await createSession(coreRpc(core()))
    mountPagedChat(sessionId)
    await expect.element(page.getByText('How can I help you today?')).toBeVisible()
    await faults.install({kind: 'gate', path: HYDRATE_PATH})

    for (let index = 0; index < 30; index += 1) await runTurn(core(), sessionId, `seeded exchange ${index}`)
    await faults.releaseAll()

    await expect.element(exchange(29)).toBeVisible()
    await scrollToTop()
    await expect.element(exchange(0)).toBeInTheDocument()
    await expect.element(newSessionLine()).toBeVisible()
  }, 120_000)

  async function seedExchanges(count = SEEDED_EXCHANGES): Promise<string> {
    const rpc = coreRpc(core())
    const sessionId = await createSession(rpc)
    for (let index = 0; index < count; index += 1) {
      await runTurn(core(), sessionId, `seeded exchange ${index}`)
    }
    return sessionId
  }
})

describe('harness switching', () => {
  const BETA_MODELS = [
    {id: 'b-model', name: 'Beta Model'},
    {id: 'b-two', name: 'Beta Two'},
    {id: 'b-three', name: 'Beta Three'},
    {id: 'b-four', name: 'Beta Four'},
    {id: 'b-five', name: 'Beta Five'},
    {id: 'b-six', name: 'Beta Six'},
  ]
  const core = bootedCore('harness-switching', {
    displayName: 'Alpha',
    models: [{id: 'a-model', name: 'Alpha Model'}],
    commands: [{name: 'alpha-command', description: 'only alpha has it'}],
    alternates: [
      {
        id: 'beta',
        displayName: 'Beta',
        text: 'Hello from beta',
        models: BETA_MODELS,
        commands: [{name: 'beta-command', description: 'only beta has it'}],
      },
      {id: 'gamma', displayName: 'Gamma', models: []},
    ],
  })
  const keep = keptPane()
  const shell = createShellHarness(core)
  const faults = trackedFaults()

  afterEach(async () => {
    shell.dispose()
    await coreControl.releaseTurn()
  })

  const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const prompt = (name: string) => page.getByRole('button', {name: `Model: ${name}`})
  const model = (name: string) => page.getByRole('option', {name, exact: true})
  const search = () => page.getByRole('textbox', {name: 'Search models'})
  const harnessGroup = (name: string) => page.getByRole('group', {name})
  const confirmDialog = () => page.getByRole('alertdialog', {name: 'Switch harness?'})
  const announcements = () => page.getByRole('log', {name: 'Announcements'})
  const harnessLabel = (name: string) =>
    page.getByRole('log').filter({hasText: 'Hello from conciv'}).getByText(name, {exact: true})

  async function mountChat(sessionId: string): Promise<void> {
    keep(mountPane({base: core(), sessionId, width: 460}, () => <ChatPane sessionId={sessionId} />))
    await expect.element(input()).toBeVisible()
  }

  test('the prompt menu lists every harness’s models, each named with its harness, and the overflow has no harness rows', async () => {
    await mountChat(await createSession(coreRpc(core())))

    await expect.element(prompt('Alpha Model (Alpha)')).toHaveTextContent('alpha model (alpha)')
    await userEvent.click(prompt('Alpha Model (Alpha)'))

    await expect.element(harnessGroup('Alpha').getByRole('option', {name: 'Alpha Model (Alpha)'})).toBeVisible()
    await expect.element(model('Alpha Model (Alpha)')).toHaveAttribute('aria-selected', 'true')
    await expect.element(harnessGroup('Beta').getByRole('option', {name: 'Beta Model (Beta)'})).toBeVisible()
    await expect.element(model('Beta Four (Beta)')).toBeVisible()
    await expect.element(model('Beta Five (Beta)')).not.toBeInTheDocument()
    await expect.element(harnessGroup('Beta').getByText('2 more models, type to search')).toBeVisible()
    await userEvent.keyboard('{Escape}')

    await userEvent.click(page.getByRole('button', {name: 'More composer actions'}))
    await expect.element(page.getByRole('menuitem', {name: 'Compress the conversation'})).toBeVisible()
    await expect.element(page.getByRole('menuitem', {name: /^Harness:/})).not.toBeInTheDocument()
  })

  test('the prompt shows the session’s own model while the other harnesses’ models still load', async () => {
    await faults.install({kind: 'gate', path: ['meta', 'harnesses']})
    await mountChat(await createSession(coreRpc(core())))

    await expect.element(prompt('Alpha Model')).toHaveTextContent('alpha model')
    await userEvent.click(prompt('Alpha Model'))
    await expect.element(model('Alpha Model')).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Escape}')

    await faults.releaseAll()

    await expect.element(prompt('Alpha Model (Alpha)')).toHaveTextContent('alpha model (alpha)')
  })

  test('other harnesses’ models that failed to load keep the session’s own models and offer a retry', async () => {
    const fault = await faults.install({kind: 'fail', path: ['meta', 'harnesses'], status: 500})
    await mountChat(await createSession(coreRpc(core())))

    await userEvent.click(prompt('Alpha Model'))
    await expect.element(model('Alpha Model')).toHaveAttribute('aria-selected', 'true')
    const retry = page.getByRole('button', {name: 'Couldn’t load the other harnesses: Retry loading models'})
    await expect.element(retry).toBeVisible()
    await coreControl.releaseFault(fault)
    await userEvent.click(retry)

    await expect.element(harnessGroup('Beta').getByRole('option', {name: 'Beta Model (Beta)'})).toBeVisible()
  })

  test('a harness with nothing usable says so instead of listing models', async () => {
    await mountChat(await createSession(coreRpc(core())))

    await userEvent.click(prompt('Alpha Model (Alpha)'))

    await expect.element(harnessGroup('Gamma').getByText('Gamma has no usable models')).toBeVisible()
  })

  test('a session on a harness with no models still shows the prompt, named for the harness, and can switch away', async () => {
    const rpc = coreRpc(core())
    const sessionId = await createSession(rpc)
    await rpc.sessions.switchHarness({sessionId, harnessId: 'gamma'})
    await mountChat(sessionId)

    await expect.element(prompt('Gamma')).toHaveTextContent('gamma')
    await userEvent.click(prompt('Gamma'))
    await expect.element(harnessGroup('Gamma').getByText('Gamma has no usable models')).toBeVisible()
    await userEvent.click(model('Alpha Model (Alpha)'))

    await expect.element(announcements()).toHaveTextContent('Switched to Alpha Model (Alpha).')
    await expect.element(prompt('Alpha Model (Alpha)')).toHaveTextContent('alpha model (alpha)')
  })

  test('the menu of a harness with no models, opened after a trip to settings, keeps focus in its search while the sessions refresh', async () => {
    const rpc = coreRpc(core())
    const sessionId = await createSession(rpc)
    await rpc.sessions.switchHarness({sessionId, harnessId: 'gamma'})
    await rpc.sessions.rename({sessionId, title: 'Listed before the menu'})
    shell.mountShell(`/panel/${sessionId}?open=true`)
    await expect.element(page.getByText('Listed before the menu').first()).toBeVisible()
    await userEvent.click(page.getByRole('link', {name: 'Settings'}))
    await userEvent.click(page.getByRole('button', {name: 'Back to chat'}))
    await expect.element(input()).toBeVisible()

    await userEvent.click(prompt('Gamma'))
    await expect.element(search()).toHaveFocus()
    const listing = await faults.install({kind: 'gate', path: ['sessions', 'list']})
    await rpc.sessions.rename({sessionId, title: 'Listed again behind the menu'})
    const turn = await sendTurn(core(), sessionId, 'a run another client sent')
    await turn.awaitTurnEnd()
    turn.close()
    await coreControl.awaitFaultPending(listing, 1)
    await faults.releaseAll()

    await expect.element(page.getByText('Listed again behind the menu').first()).toBeVisible()
    await expect.element(search()).toHaveFocus()
  })

  test('the search reaches every model of every harness by harness name and by model id', async () => {
    await mountChat(await createSession(coreRpc(core())))

    await userEvent.click(prompt('Alpha Model (Alpha)'))
    await userEvent.keyboard('beta')
    await expect.element(model('Beta Six (Beta)')).toBeVisible()
    await expect.element(model('Beta Five (Beta)')).toBeVisible()
    await expect.element(model('Alpha Model (Alpha)')).not.toBeInTheDocument()

    await userEvent.fill(search(), 'b-six')
    await expect.element(model('Beta Six (Beta)')).toBeVisible()
    await expect.element(model('Beta Five (Beta)')).not.toBeInTheDocument()
    await userEvent.keyboard('{Enter}')

    await expect.element(announcements()).toHaveTextContent('Switched to Beta Six (Beta).')
    await expect.element(prompt('Beta Six (Beta)')).toHaveTextContent('beta six (beta)')
  })

  test('picking another harness’s model in an empty chat switches at once to that model, and slash commands follow', async () => {
    await mountChat(await createSession(coreRpc(core())))

    await userEvent.click(prompt('Alpha Model (Alpha)'))
    await userEvent.click(model('Beta Three (Beta)'))

    await expect.element(announcements()).toHaveTextContent('Switched to Beta Three (Beta).')
    await expect.element(confirmDialog()).not.toBeInTheDocument()
    await expect.element(prompt('Beta Three (Beta)')).toHaveTextContent('beta three (beta)')
    await userEvent.click(prompt('Beta Three (Beta)'))
    await expect.element(model('Beta Three (Beta)')).toHaveAttribute('aria-selected', 'true')
    await expect.element(model('Alpha Model (Alpha)')).toHaveAttribute('aria-selected', 'false')
    await userEvent.keyboard('{Escape}')
    await userEvent.click(input())
    await userEvent.keyboard('/')
    await expect.element(page.getByRole('option', {name: /beta-command/})).toBeVisible()
    await expect.element(page.getByRole('option', {name: /alpha-command/})).not.toBeInTheDocument()
  })

  test('a chat with history asks first, cancelling keeps the harness and the model', async () => {
    const sessionId = await createSession(coreRpc(core()))
    await runTurn(core(), sessionId, 'first question')
    await mountChat(sessionId)

    await userEvent.click(prompt('Alpha Model (Alpha)'))
    await userEvent.click(model('Beta Model (Beta)'))

    await expect
      .element(confirmDialog().getByText('Switching to Beta sends this chat’s history (about 8 tokens).'))
      .toBeVisible()
    await expect.element(page.getByRole('textbox', {name: 'Search models'})).not.toBeInTheDocument()
    await userEvent.click(page.getByRole('button', {name: 'Cancel'}))
    await expect.element(confirmDialog()).not.toBeInTheDocument()
    await expect.element(prompt('Alpha Model (Alpha)')).toBeVisible()
    await expect.element(input()).toHaveFocus()
  })

  test('labels appear on replies only once the chat has used a second harness', async () => {
    const sessionId = await createSession(coreRpc(core()))
    await runTurn(core(), sessionId, 'first question')
    await mountChat(sessionId)
    await expect.element(page.getByText('Hello from conciv')).toBeVisible()
    await expect.element(harnessLabel('Alpha')).not.toBeInTheDocument()

    await userEvent.click(prompt('Alpha Model (Alpha)'))
    await userEvent.click(model('Beta Two (Beta)'))
    await userEvent.click(confirmDialog().getByRole('button', {name: 'Switch to Beta'}))
    await expect.element(announcements()).toHaveTextContent('Switched to Beta Two (Beta).')
    await expect.element(prompt('Beta Two (Beta)')).toBeVisible()
    await userEvent.click(input())
    await userEvent.keyboard('second question{Enter}')

    await expect.element(page.getByText('Hello from beta')).toBeVisible()
    await expect.element(harnessLabel('Alpha')).toBeVisible()
    await expect.element(harnessLabel('Beta')).toBeVisible()
  })

  test('in the real panel the composer is ready while every model list still loads', async () => {
    const sessionId = await createSession(coreRpc(core()))
    await faults.install({kind: 'gate', path: ['meta', 'models']})
    await faults.install({kind: 'gate', path: ['meta', 'harnesses']})
    shell.mountShell(`/panel/${sessionId}?open=true`)

    await expect.element(input()).toBeVisible()
    await faults.releaseAll()
    await expect.element(prompt('Alpha Model (Alpha)')).toBeVisible()
  })

  test('in the real panel the confirm opens over the open panel and confirming switches', async () => {
    const sessionId = await createSession(coreRpc(core()))
    await runTurn(core(), sessionId, 'first question')
    shell.mountShell(`/panel/${sessionId}?open=true`)
    const panel = page.getByRole('dialog', {name: 'conciv chat agent'})
    await expect.element(panel.getByText('Hello from conciv'), {timeout: 8000}).toBeVisible()

    await userEvent.click(prompt('Alpha Model (Alpha)'))
    await userEvent.click(model('Beta Model (Beta)'))

    await expect.element(confirmDialog()).toBeVisible()
    await expect.element(page.getByText('Hello from conciv')).toBeVisible()
    await userEvent.click(confirmDialog().getByRole('button', {name: 'Switch to Beta'}))
    await expect.element(confirmDialog()).not.toBeInTheDocument()
    await expect.element(prompt('Beta Model (Beta)')).toBeVisible()
    await expect.element(panel.getByText('Hello from conciv')).toBeVisible()
  }, 30_000)

  test('another harness’s models are disabled while a run is streaming, the current harness’s are not', async () => {
    const sessionId = await createSession(coreRpc(core()))
    await coreControl.holdTurn()
    await sendTurn(core(), sessionId, 'keep this session busy')
    await mountChat(sessionId)

    await userEvent.click(prompt('Alpha Model (Alpha)'))

    await expect.element(model('Beta Model (Beta)')).toHaveAttribute('aria-disabled', 'true')
    await expect.element(model('Alpha Model (Alpha)')).not.toHaveAttribute('aria-disabled', 'true')
  })

  test('the session selector names each session’s harness', async () => {
    const rpc = coreRpc(core())
    const activeId = await createSession(rpc)
    await rpc.sessions.rename({sessionId: activeId, title: 'an alpha session'})
    const betaId = await createSession(rpc)
    await rpc.sessions.rename({sessionId: betaId, title: 'a beta session'})
    await rpc.sessions.switchHarness({sessionId: betaId, harnessId: 'beta'})
    keep(
      mountPane({base: core(), sessionId: activeId}, () => (
        <RouterProvider
          router={pickerRouter('/', () => (
            <SessionSelector variant="pill" activeId={() => activeId} onActivate={() => {}} onNewSession={() => {}} />
          ))}
        />
      )),
    )

    await page.getByRole('button', {name: 'Session: an alpha session'}).click()

    await expect.element(page.getByRole('option', {name: /^an alpha session, .*· Alpha/})).toBeVisible()
    await expect.element(page.getByRole('option', {name: /^a beta session, .*· Beta/})).toBeVisible()
  })
})

const STATUS_PROBE_NAME = 'status-probe'

const statusProbe = defineExtension({
  name: STATUS_PROBE_NAME,
  Component: () => (
    <Show when={getExtensionApi(STATUS_PROBE_NAME).useSlot() === 'status'}>
      <span>env: staging</span>
    </Show>
  ),
})

declare module '@conciv/protocol/config-types' {
  interface ExtensionRegistry extends RegisterExtension<typeof statusProbe> {}
}

describe('connect agents', () => {
  const core = bootedCore('connect-agents')
  const harness = createShellHarness(core)

  afterEach(async () => {
    harness.dispose()
    await coreControl.fakeHubCli(null)
  })

  const more = () => page.getByRole('button', {name: 'More composer actions'})
  const item = () => page.getByRole('menuitem', {name: 'Connect Claude'})
  const agents = () => page.getByRole('group', {name: 'Connected agents'})
  const disconnect = () => page.getByRole('button', {name: 'Disconnect Claude'})
  const composer = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

  test('a harness connects from the menu with a pending chip, shows in the connected row, and disconnects from it', async () => {
    await page.viewport(1000, 900)
    await coreControl.fakeHubCli('fail')
    const sessionId = await createSession(coreRpc(core()))
    harness.mountShell(`/panel/${sessionId}?open=true`, [statusProbe])
    await expect.element(composer(), {timeout: 8000}).toBeVisible()
    await expect.element(page.getByText('env: staging')).toBeVisible()
    await expect.element(agents()).not.toBeInTheDocument()

    await coreControl.setHubConnection('codex', true)
    await expect.element(agents().getByText('Codex', {exact: true}), {timeout: 8000}).toBeVisible()
    await coreControl.setHubConnection('codex', false)
    await expect.element(agents(), {timeout: 8000}).not.toBeInTheDocument()

    await more().click()
    await item().click()
    await expect.element(page.getByText('claude: could not add conciv-hub')).toBeVisible()
    await expect.element(agents()).not.toBeInTheDocument()

    await coreControl.fakeHubCli('hold')
    await more().click()
    await item().click()
    await expect.element(agents().getByRole('status')).toHaveTextContent('Connecting Claude…')
    await more().click()
    await expect.element(item()).toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')

    await coreControl.fakeHubCli('ok')
    await expect.element(page.getByText('Claude connected. Ask any Claude session for your conciv tab.')).toBeVisible()
    await expect.element(agents().getByText('Claude', {exact: true})).toBeVisible()
    await more().click()
    await expect.element(page.getByRole('menuitem', {name: 'Start a new session'})).toBeVisible()
    await expect.element(item()).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')

    await coreControl.fakeHubCli('hold-remove')
    await disconnect().click()
    await expect.element(agents().getByRole('status')).toHaveTextContent('Disconnecting Claude…')
    await more().click()
    await page.getByRole('menuitem', {name: 'Connect OpenCode'}).click()
    await expect
      .element(page.getByText('OpenCode connected. Ask any OpenCode session for your conciv tab.'))
      .toBeVisible()
    await expect.element(agents().getByRole('status')).toHaveTextContent('Disconnecting Claude…')
    await more().click()
    await expect.element(item()).toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')
    await coreControl.fakeHubCli('ok')
    await expect.element(page.getByText('Claude disconnected.')).toBeVisible()
    await expect.element(agents().getByText('OpenCode', {exact: true})).toBeVisible()
    await expect.element(composer()).toHaveFocus()
    await more().click()
    await expect.element(item()).not.toHaveAttribute('aria-disabled', 'true')
    await userEvent.keyboard('{Escape}')

    await page.getByRole('button', {name: 'Disconnect OpenCode'}).click()
    await expect
      .element(
        page.getByText(
          'OpenCode disconnected. OpenCode keeps its conciv-hub entry in opencode.json; conciv refuses it until you reconnect.',
        ),
      )
      .toBeVisible()
    await expect.element(agents()).not.toBeInTheDocument()
    await expect.element(composer()).toHaveFocus()
  }, 30_000)
})

describe('launcher activity', () => {
  const coreBase = bootedCore('launcher-activity')
  const harness = createShellHarness(coreBase)

  afterEach(async () => {
    await coreControl.releaseTurn()
    harness.dispose()
  })

  const launcher = () => page.getByRole('button', {name: 'Minimize conciv chat'})
  const composer = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

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
})

describe('launcher drag', () => {
  const core = bootedCore('launcher-drag')
  const harness = createShellHarness(core)
  const POSITION_KEY = 'conciv-fab-position'

  afterEach(() => {
    harness.dispose()
    localStorage.removeItem(POSITION_KEY)
  })

  const launcher = () => page.getByRole('button', {name: 'Open conciv chat'})
  const minimize = () => page.getByRole('button', {name: 'Minimize conciv chat'})
  const edgeTab = () => page.getByRole('button', {name: 'Show conciv launcher'})
  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const capture = (name: string) => page.screenshot({path: `__screenshots__/launcher-drag/${name}.png`})

  test('a drag off the right edge tucks the launcher into a tab without opening the chat, and the tab brings it back', async () => {
    await page.viewport(1000, 700)
    harness.mountShell('/')
    await expect.element(launcher()).toBeVisible()
    await coreControl.dragButton({name: 'Open conciv chat', moves: [{deltaX: 400, deltaY: -100, steps: 12}]})
    await expect.element(edgeTab()).toBeVisible()
    await expect.element(launcher()).not.toBeInTheDocument()
    await expect.element(editor()).not.toBeInTheDocument()
    await capture('tucked-right')
    await edgeTab().click()
    await expect.element(launcher()).toBeVisible()
    await expect.element(edgeTab()).not.toBeInTheDocument()
    await expect.element(launcher()).toHaveFocus()
    await capture('restored-right')
  })

  test('a tucked launcher stays tucked after a reload, and Enter on the focused tab restores it', async () => {
    await page.viewport(1000, 700)
    harness.mountShell('/')
    await coreControl.dragButton({name: 'Open conciv chat', moves: [{deltaX: -1200, deltaY: -200, steps: 16}]})
    await expect.element(edgeTab()).toBeVisible()
    harness.dispose()
    harness.mountShell('/')
    await expect.element(edgeTab()).toBeVisible()
    await expect.element(launcher()).not.toBeInTheDocument()
    await userEvent.tab()
    await expect.element(edgeTab()).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect.element(launcher()).toHaveFocus()
    await expect.element(edgeTab()).not.toBeInTheDocument()
    await capture('restored-left-keyboard')
  })

  test('Escape mid-drag drops the gesture, so a release past the edge leaves the launcher where it was', async () => {
    await page.viewport(1000, 700)
    harness.mountShell('/')
    await coreControl.dragButton({name: 'Open conciv chat', moves: [{deltaX: 400, deltaY: 0, steps: 12}], escape: true})
    await expect.element(launcher()).toBeVisible()
    await expect.element(edgeTab()).not.toBeInTheDocument()
    await capture('escape-cancelled')
    await coreControl.dragButton({name: 'Open conciv chat', moves: [{deltaX: 400, deltaY: 0, steps: 12}]})
    await expect.element(edgeTab()).toBeVisible()
  })

  test('a release within reach of a corner pins the launcher into it', async () => {
    await page.viewport(1000, 700)
    harness.mountShell('/')
    await coreControl.dragButton({
      name: 'Open conciv chat',
      moves: [{deltaX: -844, deltaY: -544, steps: 20}],
      settleMs: 300,
    })
    await capture('pinned-top-left')
    await launcher().click()
    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    await capture('pinned-top-left-panel')
    await minimize().click()
    await expect.element(launcher()).toBeVisible()
    await coreControl.dragButton({name: 'Open conciv chat', moves: [{deltaX: -90, deltaY: 0, steps: 6}]})
    await expect.element(edgeTab()).toBeVisible()
  })

  test('a release in the open leaves the launcher where it was dropped, under the grab point', async () => {
    await page.viewport(1000, 700)
    harness.mountShell('/')
    await coreControl.dragButton({
      name: 'Open conciv chat',
      moves: [{deltaX: -454, deltaY: -304, steps: 20}],
      settleMs: 300,
    })
    await capture('free-centre')
    await launcher().click()
    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    await capture('free-centre-panel')
    await minimize().click()
    await expect.element(launcher()).toBeVisible()
    await coreControl.dragButton({name: 'Open conciv chat', moves: [{deltaX: -520, deltaY: 0, steps: 12}]})
    await expect.element(edgeTab()).toBeVisible()
  })

  test('a press that moves 4px or less is a click and one that moves 5px is a drag that never toggles the chat', async () => {
    await page.viewport(1000, 700)
    harness.mountShell('/')
    await coreControl.dragButton({name: 'Open conciv chat', moves: [{deltaX: -5, deltaY: 0}], settleMs: 100})
    await coreControl.dragButton({name: 'Open conciv chat', moves: [{deltaX: -3, deltaY: 0}]})
    await expect.element(editor(), {timeout: 8000}).toBeVisible()
  }, 30_000)

  test('arrows nudge the focused launcher and Shift with an arrow pins it to a corner that a reload keeps', async () => {
    await page.viewport(1000, 700)
    harness.mountShell('/')
    await expect.element(launcher()).toBeVisible()
    await userEvent.tab()
    await expect.element(launcher()).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}{ArrowLeft}{ArrowUp}')
    await capture('keyboard-nudged')
    await userEvent.keyboard('{Shift>}{ArrowUp}{ArrowLeft}{/Shift}')
    await capture('keyboard-top-left')
    await expect.element(launcher()).toHaveFocus()
    await expect.element(editor()).not.toBeInTheDocument()
    harness.dispose()
    harness.mountShell('/')
    await expect.element(launcher()).toBeVisible()
    await capture('keyboard-top-left-reloaded')
    await coreControl.dragButton({name: 'Open conciv chat', moves: [{deltaX: -150, deltaY: 0, steps: 8}]})
    await expect.element(edgeTab()).toBeVisible()
  })

  const LOCKED_NAME = 'Unauthorized. Authorize conciv'
  const locked = () => page.getByRole('button', {name: LOCKED_NAME})
  const unauthorized = () => locked().getByText('Unauthorized')
  const mountLocked = () => harness.mountShell('/', [], {login: {apiBase: new URL(core()).origin}})
  const leaveLocked = () => coreControl.hoverButton({name: LOCKED_NAME, settleMs: 0, moves: [{deltaX: 0, deltaY: 200}]})

  test('the locked launcher dropped just right of the middle grows its pill to the right and its robot stays put', async () => {
    await page.viewport(1000, 700)
    mountLocked()
    await expect.element(locked()).toBeVisible()
    await coreControl.dragButton({name: LOCKED_NAME, moves: [{deltaX: -424, deltaY: -304, steps: 20}], settleMs: 300})
    await leaveLocked()
    await expect.element(unauthorized()).not.toBeVisible()
    await coreControl.hoverButton({name: LOCKED_NAME, settleMs: 500, moves: [{deltaX: 70, deltaY: 0}]})
    await expect.element(unauthorized()).toBeVisible()
    await capture('locked-right-of-middle-open')
    await leaveLocked()
    await expect.element(unauthorized()).not.toBeVisible()
    await coreControl.hoverButton({name: LOCKED_NAME, settleMs: 500, moves: [{deltaX: -30, deltaY: 0}]})
    await expect.element(unauthorized()).not.toBeVisible()
  })

  test('the locked launcher pinned in the bottom-right corner grows its pill to the left inside the window while its robot stays put', async () => {
    await page.viewport(1000, 700)
    mountLocked()
    await expect.element(locked()).toBeVisible()
    await capture('locked-bottom-right-closed')
    await coreControl.hoverButton({name: LOCKED_NAME, settleMs: 500, moves: [{deltaX: -30, deltaY: 0}]})
    await expect.element(unauthorized()).toBeVisible()
    await expect.element(unauthorized()).toBeInViewport({ratio: 1})
    await capture('locked-bottom-right-open')
  })

  test('the locked launcher dropped near the right edge without room for its pill grows it to the left and its robot stays put', async () => {
    await page.viewport(1000, 700)
    mountLocked()
    await expect.element(locked()).toBeVisible()
    await coreControl.dragButton({name: LOCKED_NAME, moves: [{deltaX: -60, deltaY: -300, steps: 20}], settleMs: 300})
    await coreControl.hoverButton({name: LOCKED_NAME, settleMs: 500, moves: [{deltaX: 0, deltaY: 200}]})
    await expect.element(unauthorized()).not.toBeVisible()
    await coreControl.hoverButton({name: LOCKED_NAME, settleMs: 500, moves: [{deltaX: -120, deltaY: 0}]})
    await expect.element(unauthorized()).toBeVisible()
    await expect.element(unauthorized()).toBeInViewport({ratio: 1})
    await capture('locked-near-right-edge-open')
    await coreControl.hoverButton({name: LOCKED_NAME, settleMs: 500, moves: [{deltaX: 0, deltaY: 200}]})
    await expect.element(unauthorized()).not.toBeVisible()
    await coreControl.hoverButton({name: LOCKED_NAME, settleMs: 500, moves: [{deltaX: 50, deltaY: 0}]})
    await expect.element(unauthorized()).not.toBeVisible()
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
})

describe('page session card', () => {
  const core = bootedCore('page-session-card')
  const keep = keptPane()

  test('a reloaded transcript of page acts renders one aggregated session card with the reply', async () => {
    const rpc = coreRpc(core())
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
    await runTurn(core(), sessionId, 'fill in the profile form')

    keep(mountPane({base: core(), sessionId}, () => <ChatPane sessionId={sessionId} />))

    await expect.element(page.getByText('Edited the page'), {timeout: 5000}).toBeVisible()
    await expect.element(page.getByText('The profile form is filled in.')).toBeVisible()
    expect(page.getByText('Edited the page').elements()).toHaveLength(1)
    await expect.element(page.getByText('Typed')).not.toBeInTheDocument()
    await expect.element(page.getByRole('button', {name: '2 steps'})).not.toBeInTheDocument()
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

describe('pane composer attachments', () => {
  function stagedNote(name: string) {
    return {id: name, type: 'document', name, contentType: 'text/plain', data: btoa(name)}
  }

  function mountWithStagedNotes(text: string, caret?: {start: number; end: number}) {
    const storage = memoryStorage()
    storage.setItem(
      'attachments',
      JSON.stringify({text, quote: null, attachments: [stagedNote('first.txt'), stagedNote('second.txt')]}),
    )
    const inputs: ComposerInputHandle[] = []
    const chat = () =>
      createChat({
        threadId: 'pane-composer-attachments',
        connection: storyConnection({chunks: createTextChunks('done')}),
      })
    render(() => (
      <EngineReachabilityContext.Provider value={{online: () => true, sustainedOffline: () => false}}>
        <ChatProvider chat={chat()}>
          <ComposerHandlersProvider value={{}}>
            <PaneComposer
              draftStorage={storage}
              draftKey="attachments"
              placeholder="Ask anything…"
              inputLabel="Message"
              attachmentAdapter={createTextAttachmentAdapter()}
              onInputReady={(handle) => inputs.push(handle)}
            />
          </ComposerHandlersProvider>
        </ChatProvider>
      </EngineReachabilityContext.Provider>
    ))
    const focus = () => {
      const handle = inputs[0]
      if (caret) handle?.select(caret)
      handle?.focus()
    }
    return {focus}
  }

  const removeButton = (name: string) => page.getByRole('button', {name: `Remove ${name}`})
  const input = () => page.getByRole('textbox', {name: 'Message'})

  it('Backspace with the caret at the start removes the attachments one by one, last first', async () => {
    const composer = mountWithStagedNotes('keep me', {start: 0, end: 0})
    await expect.element(removeButton('second.txt')).toBeVisible()
    composer.focus()
    await expect.element(input()).toHaveFocus()

    await userEvent.keyboard('{Backspace}')
    await expect.element(removeButton('second.txt')).not.toBeInTheDocument()
    await expect.element(removeButton('first.txt')).toBeVisible()

    await userEvent.keyboard('{Backspace}')
    await expect.element(removeButton('first.txt')).not.toBeInTheDocument()
    await expect.element(input()).toHaveTextContent('keep me')
  })

  it('Backspace after text deletes the text and leaves the attachments staged', async () => {
    const composer = mountWithStagedNotes('hi')
    await expect.element(removeButton('second.txt')).toBeVisible()
    composer.focus()
    await expect.element(input()).toHaveFocus()

    await userEvent.keyboard('{Backspace}')
    await expect.element(input()).toHaveTextContent('h')
    await expect.element(removeButton('first.txt')).toBeVisible()
    await expect.element(removeButton('second.txt')).toBeVisible()
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

  const core = bootedCore('panel-connect')
  const harness = createShellHarness(core)
  const faults = trackedFaults()

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
})

describe('panel escape', () => {
  const coreBase = bootedCore('panel-escape')
  const harness = createShellHarness(coreBase)

  afterEach(harness.dispose)

  const thumbnail = () => page.getByRole('button', {name: 'Open pixel.png'})
  const viewer = () => page.getByRole('dialog', {name: 'pixel.png'})
  const launcher = () => page.getByRole('button', {name: 'Open conciv chat'})
  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

  test('Escape in an image viewer closes the viewer and leaves the panel open', async () => {
    const rpc = coreRpc(coreBase())
    const sessionId = await createSession(rpc)
    await seedDraft(rpc, sessionId, {
      attachments: [{id: 'image-1', type: 'image', name: 'pixel.png', contentType: 'image/png', data: PNG_PIXEL}],
    })
    harness.mountShell(`/panel/${sessionId}?open=true`)

    await expect.element(thumbnail(), {timeout: 8000}).toBeVisible()
    await thumbnail().click()
    await expect.element(viewer()).toBeVisible()

    await userEvent.keyboard('{Escape}')

    await expect.element(viewer()).not.toBeInTheDocument()
    await expect.element(launcher()).not.toBeInTheDocument()

    await editor().click()
    await userEvent.keyboard('{Escape}')

    await expect.element(launcher()).toBeVisible()
  }, 30_000)
})

describe('panel header', () => {
  const REPLY_TEXT = 'the transcript that outlives a refresh'

  const coreBase = bootedCore('panel-refresh')
  const harness = createShellHarness(coreBase)
  const faults = trackedFaults()

  afterEach(harness.dispose)

  const reply = () => page.getByText(REPLY_TEXT)
  const skeleton = () => page.getByRole('status', {name: 'Loading conversation'})
  const sessionMenu = () => page.getByRole('button', {name: /session options$/})
  const refreshingMenu = () => page.getByRole('button', {name: /refreshing the conversation$/})
  const refreshRow = () => page.getByRole('button', {name: 'Refresh the conversation'})

  test('a session list still loading never hides the title or the view tabs behind skeletons', async () => {
    const rpc = coreRpc(coreBase())
    const sessionId = await createSession(rpc)
    await coreControl.scriptTurn({toolCalls: [], text: REPLY_TEXT})
    await runTurn(coreBase(), sessionId, 'seed the transcript')
    const gate = await faults.install({kind: 'gate', path: ['sessions', 'list']})
    harness.mountShell(`/panel/${sessionId}?open=true`)
    await coreControl.awaitFaultPending(gate, 1)

    await expect.element(reply(), {timeout: 8000}).toBeVisible()
    await expect.element(page.getByRole('banner').getByText('seed the transcript', {exact: true})).toBeVisible()
    await expect.element(page.getByRole('tab', {name: 'Chat', exact: true})).toBeVisible()
  })

  test('refreshing the conversation dismisses the menu, shows progress, and keeps the transcript', async () => {
    const rpc = coreRpc(coreBase())
    const sessionId = await createSession(rpc)
    await coreControl.scriptTurn({toolCalls: [], text: REPLY_TEXT})
    await runTurn(coreBase(), sessionId, 'seed the transcript')
    harness.mountShell(`/panel/${sessionId}?open=true`)

    await expect.element(reply(), {timeout: 8000}).toBeVisible()

    await sessionMenu().click()
    await expect.element(refreshRow(), {timeout: 8000}).toBeVisible()

    const gate = await faults.install({kind: 'gate', path: ['chat', 'hydrate']})
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

  test('a user opens the session menu by clicking the title, renames in place and switches sessions', async () => {
    const TITLE = 'the titled session'
    const RENAMED = 'renamed from the header'
    const OTHER = 'the other session'
    const header = () => page.getByRole('banner')
    const titleButton = (title: string) =>
      header().getByRole('button', {name: new RegExp(`^${title}, session options$`)})
    const pencil = () => header().getByRole('button', {name: 'Rename session'})
    const titleInput = () => header().getByRole('textbox', {name: 'Session title'})
    const menu = () => page.getByRole('dialog', {name: 'Session options'})
    const switcher = (title: string) => menu().getByRole('button', {name: `Session: ${title}`})
    const rpc = coreRpc(coreBase())
    const otherId = await createSession(rpc)
    await rpc.sessions.rename({sessionId: otherId, title: OTHER})
    const sessionId = await createSession(rpc)
    await rpc.sessions.rename({sessionId, title: TITLE})
    harness.mountShell(`/panel/${sessionId}?open=true`)

    await expect.element(titleButton(TITLE), {timeout: 8000}).toBeVisible()
    await titleButton(TITLE).hover()
    await expect.element(menu()).not.toBeInTheDocument()
    await titleButton(TITLE).click()
    await expect.element(menu()).toBeVisible()
    await expect.element(switcher(TITLE)).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect.element(menu()).not.toBeInTheDocument()
    await expect.element(titleButton(TITLE)).toHaveFocus()
    await userEvent.keyboard('{Enter}')
    await expect.element(menu()).toBeVisible()
    await expect.element(switcher(TITLE)).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect.element(titleButton(TITLE)).toHaveFocus()

    await pencil().click()
    await expect.element(titleInput()).toHaveValue(TITLE)
    await userEvent.type(titleInput(), ' discarded{Escape}')
    await expect.element(titleInput()).not.toBeInTheDocument()
    await expect.element(titleButton(TITLE)).toBeVisible()

    await faults.install({kind: 'fail', path: ['sessions', 'rename']})
    await pencil().click()
    await userEvent.clear(titleInput())
    await userEvent.type(titleInput(), `${RENAMED}{Enter}`)
    await expect.element(page.getByRole('alert'), {timeout: 8000}).toHaveTextContent('Rename failed')
    await expect.element(titleButton(TITLE)).toBeVisible()
    await faults.releaseAll()

    await pencil().click()
    await userEvent.clear(titleInput())
    await userEvent.type(titleInput(), `${RENAMED}{Enter}`)
    await expect.element(titleButton(RENAMED), {timeout: 8000}).toBeVisible()
    await expect.element(pencil()).toHaveFocus()

    await titleButton(RENAMED).click()
    await switcher(RENAMED).click()
    await expect.element(page.getByRole('option', {name: new RegExp(`^${RENAMED},`)})).toBeVisible()
    await page.getByRole('option', {name: new RegExp(`^${OTHER},`)}).click()
    await expect.element(titleButton(OTHER), {timeout: 8000}).toBeVisible()
    await expect.element(menu()).not.toBeInTheDocument()
    expect(harness.pathname()).toBe(`/panel/${otherId}`)

    const DRAFT = 'the draft that outlives the menu'
    const composer = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
    await composer().click()
    await userEvent.keyboard(DRAFT)
    await expect.element(composer()).toHaveTextContent(DRAFT)
    await titleButton(OTHER).click()
    await expect.element(menu()).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(menu()).not.toBeInTheDocument()
    await expect.element(composer()).toHaveTextContent(DRAFT)
    await titleButton(OTHER).click()
    await expect.element(menu()).toBeVisible()
    await switcher(OTHER).click()
    await page.getByRole('option', {name: new RegExp(`^${OTHER},`)}).click()
    await expect.element(menu()).not.toBeInTheDocument()
    expect(harness.pathname()).toBe(`/panel/${otherId}`)
    await expect.element(composer()).toHaveTextContent(DRAFT)
  }, 30_000)

  test('the session menu lives in the URL: back closes it, closing leaves no extra entry, a reload reopens it', async () => {
    const TITLE = 'the session in the address'
    const EARLIER = 'the session visited before'
    const titleButton = (title = TITLE) =>
      page.getByRole('banner').getByRole('button', {name: `${title}, session options`})
    const menu = () => page.getByRole('dialog', {name: 'Session options'})
    const switcher = () => menu().getByRole('button', {name: `Session: ${TITLE}`})
    const rpc = coreRpc(coreBase())
    const earlierId = await createSession(rpc)
    await rpc.sessions.rename({sessionId: earlierId, title: EARLIER})
    const sessionId = await createSession(rpc)
    await rpc.sessions.rename({sessionId, title: TITLE})
    harness.mountShell([`/panel/${earlierId}?open=true`, `/panel/${sessionId}?open=true`])

    await expect.element(titleButton(), {timeout: 8000}).toBeVisible()
    await titleButton().click()
    await expect.element(menu()).toBeVisible()
    expect(harness.pathname()).toBe(`/panel/${sessionId}/options`)

    harness.back()
    await expect.element(menu()).not.toBeInTheDocument()
    expect(harness.pathname()).toBe(`/panel/${sessionId}`)

    await titleButton().click()
    await expect.element(menu()).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(menu()).not.toBeInTheDocument()
    expect(harness.pathname()).toBe(`/panel/${sessionId}`)
    harness.back()
    await expect.element(titleButton(EARLIER), {timeout: 8000}).toBeVisible()
    expect(harness.pathname()).toBe(`/panel/${earlierId}`)

    harness.dispose()
    harness.mountShell(`/panel/${sessionId}/options?open=true`)
    await expect.element(menu(), {timeout: 8000}).toBeVisible()
    await expect.element(switcher()).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(menu()).not.toBeInTheDocument()
    await expect.element(titleButton()).toHaveFocus()
    expect(harness.pathname()).toBe(`/panel/${sessionId}`)

    harness.dispose()
    harness.mountShell([`/panel/${earlierId}?open=true`, `/panel/${sessionId}/options?open=true`])
    await expect.element(menu(), {timeout: 8000}).toBeVisible()
    await switcher().click()
    await page.getByRole('option', {name: new RegExp(`^${EARLIER},`)}).click()
    await expect.element(titleButton(EARLIER), {timeout: 8000}).toBeVisible()
    await expect.element(menu()).not.toBeInTheDocument()
    harness.back()
    await expect.element(titleButton(EARLIER), {timeout: 8000}).toBeVisible()
    await expect.element(menu()).not.toBeInTheDocument()
    expect(harness.pathname()).toBe(`/panel/${earlierId}`)
  }, 30_000)
})

describe('session options outside agents', () => {
  const coreBase = bootedCore('outside-agents')
  const harness = createShellHarness(coreBase)
  afterEach(harness.dispose)
  afterAll(() => coreControl.setHubConnection('codex', false))
  const strip = () => page.getByRole('group', {name: 'Permission request'})
  const allowRow = () => page.getByRole('button', {name: 'Allow outside agents'})
  const approve = () =>
    strip()
      .getByRole('button', {name: /Approve/})
      .click()

  test('allow outside agents lifts a deny and leaves the menu', async () => {
    const sessionId = await createSession(coreRpc(coreBase()))
    const denied = coreControl.hubExecute(sessionId, 'return 1')
    harness.mountShell(`/panel/${sessionId}?open=true`)
    await expect.element(strip().getByText('Allow codex to use this tab'), {timeout: 8000}).toBeVisible()
    await page.getByRole('button', {name: 'Deny'}).click()
    await expect.element(strip()).not.toBeInTheDocument()
    expect(await denied).toContain('The user denied codex access')
    await page.getByRole('button', {name: /session options$/}).click()
    await allowRow().click()
    await expect.element(allowRow()).not.toBeInTheDocument()
    const allowed = coreControl.hubExecute(sessionId, 'return 1')
    await approve()
    expect(await allowed).toContain('{\\"result\\":1')
  }, 30_000)

  test('an allowed outside call shows tagged with its agent and the pane settles, an in-page call has no tag', async () => {
    const sessionId = await createSession(coreRpc(coreBase()))
    harness.mountShell(`/panel/${sessionId}?open=true`)
    const waiting = coreControl.hubExecute(sessionId, 'return 40 + 2')
    await approve()
    await expect.element(strip()).not.toBeInTheDocument()
    expect(await waiting).toContain('42')
    expect(await coreControl.hubExecute(sessionId, 'return 7 * 6', 'in-page')).toContain('42')
    const outsideRow = page.getByRole('button', {name: /exec return 40 \+ 2/})
    const inPageRow = page.getByRole('button', {name: /exec return 7 \* 6/})
    await expect.element(outsideRow, {timeout: 8000}).toMatchTextContent(/from codex/)
    await expect.element(inPageRow).toBeVisible()
    await expect.element(inPageRow).not.toMatchTextContent(/from/)
    await expect.element(page.getByRole('button', {name: 'Stop generating'})).not.toBeInTheDocument()
    await expect.element(page.getByText('Responding…')).not.toBeInTheDocument()
    harness.dispose()
    harness.mountShell(`/panel/${sessionId}?open=true`)
    await expect.element(outsideRow, {timeout: 8000}).toMatchTextContent(/from codex/)
    await expect.element(inPageRow).not.toMatchTextContent(/from/)
  }, 30_000)

  test('a closed panel badges the launcher while an outside agent waits, and the answer clears it', async () => {
    await page.viewport(1000, 700)
    const sessionId = await createSession(coreRpc(coreBase()))
    harness.mountShell(`/panel/${sessionId}`)
    const launcher = () => page.getByRole('button', {name: 'Open conciv chat'})
    const waiting = () => page.getByRole('button', {name: 'Waiting for your Allow. Open conciv chat'})
    await expect.element(launcher()).toBeVisible()
    const call = coreControl.hubExecute(sessionId, 'return 1')
    await expect.element(waiting(), {timeout: 8000}).toBeVisible()
    await waiting().click()
    await expect.element(page.getByRole('button', {name: 'Minimize conciv chat'})).toBeVisible()
    await approve()
    await page.getByRole('button', {name: 'Minimize conciv chat'}).click()
    await expect.element(launcher()).toBeVisible()
    await expect.element(waiting()).not.toBeInTheDocument()
    expect(await call).toContain('{\\"result\\":1')
  }, 30_000)
})

describe('panel view tabs', () => {
  const SUBSCRIBE_PATH = ['chat', 'subscribe']
  const NOTES_BODY = 'the notes view body'
  const REPLY_TEXT = 'the transcript that outlives a tab switch'

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
  const notes = () => page.getByText(NOTES_BODY)
  const skeleton = () => page.getByRole('status', {name: 'Loading conversation'})
  const chatTab = () => page.getByRole('tab', {name: 'Chat', exact: true})
  const notesTab = () => page.getByRole('tab', {name: 'Notes', exact: true})

  async function mountSeededPanel(): Promise<void> {
    const rpc = coreRpc(coreBase())
    const sessionId = await createSession(rpc)
    await coreControl.scriptTurn({toolCalls: [], text: REPLY_TEXT})
    await runTurn(coreBase(), sessionId, 'seed the transcript')
    harness.mountShell(`/panel/${sessionId}?open=true`, [notesExtension])
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
    await expect.element(page.getByText('conciv replied.')).not.toBeInTheDocument()
  }, 30_000)

  test('the session menu opens over a view and a tab switch lands on the new view without it', async () => {
    const menu = () => page.getByRole('dialog', {name: 'Session options'})
    await mountSeededPanel()

    await expect.element(reply(), {timeout: 8000}).toBeVisible()
    await notesTab().click()
    await expect.element(notes(), {timeout: 8000}).toBeVisible()

    await page.getByRole('button', {name: /session options$/}).click()
    await expect.element(menu()).toBeVisible()
    await expect.element(notes()).toBeVisible()
    expect(harness.pathname()).toMatch(/\/notes\/options$/)

    await chatTab().click()
    await expect.element(reply(), {timeout: 8000}).toBeVisible()
    await expect.element(menu()).not.toBeInTheDocument()
    expect(harness.pathname()).not.toMatch(/options$/)
  }, 30_000)

  test('a locked view opens and closes its own session menu, and a session pick never leaves it', async () => {
    const LOCKED_BODY = 'the locked view body'
    const TITLE = 'the locked session'
    const OTHER = 'the session a lock keeps away'
    function LockedView(): JSX.Element {
      const lock = getHostApi().useViewLock()
      onMount(() => lock(true))
      return <p>{LOCKED_BODY}</p>
    }
    const lockedExtension = defineExtension({
      name: 'panel-view-lock',
      views: [{id: 'locked', label: 'Locked', Component: LockedView}],
    })
    const menu = () => page.getByRole('dialog', {name: 'Session options'})
    const titleButton = () => page.getByRole('banner').getByRole('button', {name: `${TITLE}, session options`})
    const lockedBody = () => page.getByText(LOCKED_BODY)
    const rpc = coreRpc(coreBase())
    const otherId = await createSession(rpc)
    await rpc.sessions.rename({sessionId: otherId, title: OTHER})
    const sessionId = await createSession(rpc)
    await rpc.sessions.rename({sessionId, title: TITLE})
    harness.mountShell(
      [`/panel/${otherId}?open=true`, `/panel/${sessionId}?open=true`, `/panel/${sessionId}/locked?open=true`],
      [lockedExtension],
    )

    await expect.element(lockedBody(), {timeout: 8000}).toBeVisible()
    await expect.element(chatTab()).toBeDisabled()

    await titleButton().click()
    await expect.element(menu()).toBeVisible()
    expect(harness.pathname()).toBe(`/panel/${sessionId}/locked/options`)
    await userEvent.keyboard('{Escape}')
    await expect.element(menu()).not.toBeInTheDocument()
    expect(harness.pathname()).toBe(`/panel/${sessionId}/locked`)

    await titleButton().click()
    await expect.element(menu()).toBeVisible()
    await menu()
      .getByRole('button', {name: `Session: ${TITLE}`})
      .click()
    await page.getByRole('option', {name: new RegExp(`^${OTHER},`)}).click()
    await expect.element(menu()).toBeVisible()
    await expect.element(lockedBody()).toBeVisible()
    await expect.element(titleButton()).toBeVisible()
    expect(harness.pathname()).toBe(`/panel/${sessionId}/locked/options`)

    await userEvent.keyboard('{Escape}')
    await expect.element(menu()).not.toBeInTheDocument()
    expect(harness.pathname()).toBe(`/panel/${sessionId}/locked`)
    await expect.element(lockedBody()).toBeVisible()
  }, 30_000)

  describe('during a running turn', () => {
    const STREAMED_TEXT = 'the reply that streams while the notes tab is open'
    const HYDRATE_PATH = ['chat', 'hydrate']
    const UNREACHABLE_BASE = 'http://127.0.0.1:9'
    const FOLLOW_UP_TEXT = 'the follow-up reply after returning to chat'

    afterEach(async () => {
      await coreControl.releaseTurn()
    })

    const composer = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
    const stopButton = () => page.getByRole('button', {name: 'Stop generating'})
    const launcher = () => page.getByRole('button', {name: 'Minimize conciv chat'})
    const narration = () => page.getByText('Responding…', {exact: true})
    const chatPanel = () => page.getByRole('tabpanel', {name: 'Chat'})

    async function mountHeldTurn(
      sessionId: string,
      options: ShellMountOptions = {},
    ): Promise<Awaited<ReturnType<typeof sendTurn>>> {
      await page.viewport(1000, 900)
      await coreControl.scriptTurn({toolCalls: [], text: STREAMED_TEXT})
      await coreControl.holdTurn()
      const turn = await sendTurn(coreBase(), sessionId, 'start a long turn')
      harness.mountShell(`/panel/${sessionId}?open=true`, [notesExtension], options)
      await expect.element(page.getByText(STREAMED_TEXT), {timeout: 8000}).toBeVisible()
      await expect.element(narration()).toBeVisible()
      return turn
    }

    test('the view tabs stay open mid-turn and Chat shows the finished reply once on return', async () => {
      const turn = await mountHeldTurn(await createSession(coreRpc(coreBase())))

      await expect.element(notesTab()).toBeEnabled()
      await notesTab().click()
      await expect.element(notes(), {timeout: 8000}).toBeVisible()
      await expect.element(launcher()).toHaveAttribute('aria-busy', 'true')

      await coreControl.releaseTurn()
      await turn.awaitTurnEnd()
      turn.close()
      await expect.element(launcher(), {timeout: 8000}).toHaveAttribute('aria-busy', 'false')

      await chatTab().click()
      await expect.element(page.getByText(STREAMED_TEXT), {timeout: 8000}).toBeVisible()
      await expect.element(chatPanel().getByText('start a long turn')).toBeVisible()
      await expect.element(narration()).not.toBeInTheDocument()
      await expect.element(stopButton()).not.toBeInTheDocument()

      await coreControl.scriptTurn({toolCalls: [], text: FOLLOW_UP_TEXT})
      await composer().fill('a follow-up after the switch')
      await userEvent.keyboard('{Enter}')
      await expect.element(page.getByText(FOLLOW_UP_TEXT), {timeout: 8000}).toBeVisible()
      await expect.element(page.getByText(STREAMED_TEXT)).toBeVisible()
    }, 30_000)

    const replied = () => page.getByText('conciv replied.')
    const option = (name: RegExp) => page.getByRole('option', {name})
    const openSessions = async (active: string) => {
      await page.getByRole('button', {name: /session options$/}).click()
      await page.getByRole('button', {name: `Session: ${active}`}).click()
    }
    type Titles = {running: string; other: string}

    async function twoSessions(tag: string): Promise<{running: string; titles: Titles}> {
      const rpc = coreRpc(coreBase())
      const [running, other] = [await createSession(rpc), await createSession(rpc)]
      const titles = {running: `the running session ${tag}`, other: `the other session ${tag}`}
      await rpc.sessions.rename({sessionId: running, title: titles.running})
      await rpc.sessions.rename({sessionId: other, title: titles.other})
      await page.viewport(1000, 900)
      return {running, titles}
    }

    async function switchToOther(titles: Titles): Promise<void> {
      await openSessions(titles.running)
      await option(new RegExp(`^${titles.other}`)).click()
      await expect.element(page.getByText('How can I help you today?'), {timeout: 8000}).toBeVisible()
      await expect.element(replied()).not.toBeInTheDocument()
    }

    async function returnToRunning(titles: Titles): Promise<void> {
      await openSessions(titles.other)
      await option(new RegExp(`^${titles.running}`)).click()
      await expect.element(chatPanel().getByText(STREAMED_TEXT), {timeout: 8000}).toBeVisible()
    }

    test('another session can open right after Send and the left run still settles in the background', async () => {
      const {running, titles} = await twoSessions('sent')
      await coreControl.scriptTurn({toolCalls: [], text: STREAMED_TEXT})
      harness.mountShell(`/panel/${running}?open=true`, [notesExtension], {transport: 'fetch'})
      await expect.element(composer(), {timeout: 8000}).toBeVisible()
      const unsent = await faults.install({kind: 'chat-gate'})
      await composer().fill('start a long turn')
      await userEvent.keyboard('{Enter}')
      await coreControl.awaitFaultPending(unsent, 1)

      await switchToOther(titles)

      await coreControl.releaseFault(unsent)
      await expect.element(replied(), {timeout: 8000}).toBeInTheDocument()
      await expect.element(launcher()).toHaveAttribute('aria-busy', 'false')
      await openSessions(titles.other)
      await expect.element(option(new RegExp(`^${titles.running}(?!.*running)`)), {timeout: 8000}).toBeVisible()

      await option(new RegExp(`^${titles.running}`)).click()
      await expect.element(chatPanel().getByText(STREAMED_TEXT), {timeout: 8000}).toBeVisible()
      await expect.element(chatPanel().getByText('start a long turn')).toBeVisible()
    }, 30_000)

    test('a follow-up queued then removed before leaving does not keep the left session connected', async () => {
      const {running, titles} = await twoSessions('removed')
      await coreControl.scriptTurn({toolCalls: [], text: STREAMED_TEXT})
      await coreControl.holdTurn()
      harness.mountShell(`/panel/${running}?open=true`, [notesExtension], {transport: 'fetch'})
      await composer().fill('start a long turn')
      await userEvent.keyboard('{Enter}')
      await expect.element(page.getByText(STREAMED_TEXT), {timeout: 8000}).toBeVisible()
      await composer().fill('a follow-up to take back')
      await userEvent.keyboard('{Enter}')
      await page.getByRole('button', {name: 'Remove from queue'}).click()
      await expect.element(page.getByText('a follow-up to take back')).not.toBeInTheDocument()

      await switchToOther(titles)
      await coreControl.releaseTurn()
      await expect.element(replied(), {timeout: 8000}).toBeInTheDocument()
      const hydrated = await coreControl.rpcCallCount(HYDRATE_PATH)

      await returnToRunning(titles)
      expect(await coreControl.rpcCallCount(HYDRATE_PATH)).toBeGreaterThan(hydrated)
    }, 30_000)

    test('a follow-up queued before leaving is still sent once the left run ends', async () => {
      const {running, titles} = await twoSessions('queued')
      await coreControl.scriptTurn({toolCalls: [], text: STREAMED_TEXT})
      await coreControl.scriptTurn({toolCalls: [], text: FOLLOW_UP_TEXT})
      await coreControl.holdTurn()
      harness.mountShell(`/panel/${running}?open=true`, [notesExtension], {transport: 'fetch'})
      await composer().fill('start a long turn')
      await userEvent.keyboard('{Enter}')
      await expect.element(page.getByText(STREAMED_TEXT), {timeout: 8000}).toBeVisible()
      await composer().fill('a follow-up that waits in the queue')
      await userEvent.keyboard('{Enter}')
      await expect.element(page.getByRole('button', {name: 'Remove from queue'})).toBeVisible()

      await switchToOther(titles)
      await coreControl.releaseTurn()

      await returnToRunning(titles)
      await expect.element(chatPanel().getByText(FOLLOW_UP_TEXT), {timeout: 8000}).toBeVisible()
      await expect.element(chatPanel().getByText('a follow-up that waits in the queue')).toBeVisible()
    }, 30_000)

    test('a run that ends while the connection is down settles once the replacement client hydrates', async () => {
      const {running, titles} = await twoSessions('offline')
      const [connection, setConnection] = createStore({apiBase: coreBase()})
      const turn = await mountHeldTurn(running, {transport: 'fetch', apiBase: () => connection.apiBase})

      await switchToOther(titles)
      setConnection('apiBase', UNREACHABLE_BASE)
      await coreControl.releaseTurn()
      await turn.awaitTurnEnd()
      turn.close()
      setConnection('apiBase', coreBase())

      await expect.element(replied(), {timeout: 8000}).toBeInTheDocument()
      await expect.element(launcher()).toHaveAttribute('aria-busy', 'false')
      await returnToRunning(titles)
    }, 30_000)

    test('approving an ask and leaving while its turn is still unsent settles that turn in the background', async () => {
      const {running, titles} = await twoSessions('approved')
      harness.mountShell(`/panel/${running}?open=true`, [notesExtension], {transport: 'fetch'})
      await coreControl.scriptTurn({toolCalls: [], text: 'That needs your approval.'})
      await coreControl.scriptCustomEvent('approval-requested', {
        approvalId: 'switch-ask',
        title: 'Approve Bash: rm -rf build',
        input: {command: 'rm -rf build'},
      })
      await composer().fill('delete the build directory')
      await userEvent.keyboard('{Enter}')
      await expect.element(page.getByRole('group', {name: 'Permission request'}), {timeout: 15_000}).toBeVisible()
      await expect.element(stopButton()).not.toBeInTheDocument()
      await coreControl.scriptTurn({toolCalls: [], text: STREAMED_TEXT})
      const unsent = await faults.install({kind: 'chat-gate'})
      await page.getByRole('button', {name: 'Approve'}).click()
      await coreControl.awaitFaultPending(unsent, 1)

      await switchToOther(titles)
      await coreControl.releaseFault(unsent)

      await expect.element(replied(), {timeout: 8000}).toBeInTheDocument()
      await returnToRunning(titles)
    }, 30_000)
  })

  describe('a crashing extension', () => {
    const RECOVERED_BODY = 'the recovered tab body'
    const AFTER_TOOLS_TEXT = 'the thread kept going after the tools'
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

  describe('QueueStrip', () => {
    it('shows a row per queued message, in order, once the composer queues work', async () => {
      render(() => <Harness count={2} />)
      await expect.element(page.getByText('Queue', {exact: true})).toBeVisible()
      await expect.element(page.getByText('2 waiting · runs in order')).toBeVisible()
      await expect.element(page.getByText('queued instruction 1')).toBeVisible()
      await expect.element(page.getByText('queued instruction 2')).toBeVisible()
    })

    it('collapses beyond three rows into a "+N more" line', async () => {
      render(() => <Harness count={5} />)
      await expect.element(page.getByText('queued instruction 1')).toBeVisible()
      await expect.element(page.getByText('queued instruction 3')).toBeVisible()
      await expect.element(page.getByText('+2 more')).toBeVisible()
      expect(page.getByText('queued instruction 4').elements()).toHaveLength(0)
    })
  })

  describe('Stop returns the queue to the draft', () => {
    afterEach(() => {
      for (const dispose of disposers.splice(0)) dispose()
    })

    it('puts every queued text, in order, in the draft and images back as attachments, and sends none of them', async () => {
      const {sent, session: create} = sessionOverHeldRuns()
      const {session, stop, attached} = mountDraftPane(create)
      const multipart = (text: string): ContentPart[] => [{type: 'text', content: text}]
      void session.sendMessage('first turn')
      await vi.waitFor(() => expect(sent).toEqual(['first turn']))
      await session.sendMessage({content: multipart('queued one')})
      await session.sendMessage('queued two')
      await session.sendMessage({
        content: [
          ...multipart('queued three'),
          {type: 'image', source: {type: 'data', mimeType: 'image/png', value: PNG_PIXEL}},
        ],
      })

      await stop()

      await expect.element(draftOutput()).toHaveTextContent('"queued one\\nqueued two\\nqueued three"')
      expect(attached.map((file) => file.type)).toEqual(['image/png'])
      expect(session.queue()).toEqual([])
      expect(sent).toEqual(['first turn'])
    })
  })

  const EMPTY_HYDRATION: ChatSessionHydration = {messages: [], messageHarness: {}, lastRun: null, pendingApprovals: []}

  type SentMessages = Parameters<ChatSessionConnection['send']>[0]

  function lastUserText(messages: SentMessages): string {
    const last = messages.at(-1)
    if (!last || !('parts' in last)) return ''
    return last.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(' ')
  }

  const abortOf = (signal: AbortSignal | undefined): Promise<void> =>
    new Promise((resolve) => signal?.addEventListener('abort', () => resolve(), {once: true}))

  function sessionOverHeldRuns() {
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
      refresh: () => Promise.resolve(EMPTY_HYDRATION),
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

  describe('a run announced after it already ended', () => {
    const ended = (runId: string, phase: RunLifecycle['phase'], startedAt = 1): RunLifecycle => ({
      runId,
      phase,
      startedAt,
      finishedAt: startedAt + 1,
      serverNow: startedAt + 1,
      error: null,
    })

    it('is not joined when this session saw it end, even mid-fetch, and still joined when the run is another client; a turn this session sent ends once another client stops it', async () => {
      const announcements: ChatSessionCallbacks[] = []
      const fetches: PromiseWithResolvers<void>[] = []
      const hydration: ChatSessionHydration = {...EMPTY_HYDRATION, lastRun: ended('other-client-run', 'completed')}
      const connection: ChatSessionConnection = {
        subscribe: async function* (signal) {
          await abortOf(signal)
          yield* []
        },
        send: async (_messages, _data, signal) => abortOf(signal),
        refresh: async () => {
          await fetches.shift()?.promise
          announcements[0]?.onHydrated(hydration)
          return hydration
        },
        close: () => undefined,
      }
      const session = createRoot((dispose) => {
        disposers.push(dispose)
        return createChatSession({
          sessionId: 'late-announcement',
          connect: (callbacks) => {
            announcements.push(callbacks)
            return connection
          },
          stop: () => Promise.resolve(),
          decide: () => Promise.resolve({startsTurn: false}),
        })
      })
      const callbacks = announcements[0]
      callbacks?.onLifecycle(ended('stopped-here', 'aborted'))
      const stoppedHere = await callbacks?.joinsRun('stopped-here')
      const otherClient = await callbacks?.joinsRun('other-client-run')
      const fetching = Promise.withResolvers<void>()
      fetches.push(fetching)
      callbacks?.onLifecycle({...ended('stopped-mid-fetch', 'running', 5), finishedAt: null})
      const midFetch = callbacks?.joinsRun('stopped-mid-fetch')
      callbacks?.onLifecycle(ended('stopped-mid-fetch', 'aborted', 5))
      fetching.resolve()
      const stoppedMidFetch = await midFetch
      void session.sendMessage('mine')
      const sent = await vi.waitUntil(() => session.runId())
      callbacks?.onLifecycle(ended('an-older-run', 'aborted', 7))
      const afterAnOlderRunStopped = session.isLoading()
      callbacks?.onLifecycle(ended(sent, 'aborted', 9))
      const settled = await vi
        .waitUntil(() => !session.isLoading())
        .then(
          () => 'settled',
          () => 'still loading',
        )
      expect({stoppedHere, otherClient, stoppedMidFetch, afterAnOlderRunStopped, settled}).toEqual({
        stoppedHere: false,
        otherClient: true,
        stoppedMidFetch: false,
        afterAnOlderRunStopped: true,
        settled: 'settled',
      })
    })
  })

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
    const stop = () => {
      returnQueueToDraft(session, sink)
      return session.stop()
    }
    return {session, stop, attached}
  }
})

describe('quick add pane', () => {
  const CREATE_PATH = ['sessions', 'create']

  const core = bootedCore('quick-add-pane')
  const harness = createShellHarness(core)
  const faults = trackedFaults()

  afterEach(harness.dispose)

  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const closePane = () => page.getByRole('button', {name: 'Close pane'})
  const splitPane = () => page.getByRole('button', {name: 'Split pane', exact: true})
  const sessionTrigger = () => page.getByRole('button', {name: /^Session: /})

  const sessionIdsOf = async (rpc: RpcClient): Promise<string[]> =>
    (await rpc.sessions.list({limit: 100})).sessions.map((row) => row.id)

  const idsAddedBy = (before: string[], after: string[]): string[] => after.filter((id) => !before.includes(id))

  test('rapid double-trigger creates exactly one pane', async () => {
    const sessionId = await createSession(coreRpc(core()))
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
    const rpc = coreRpc(core())
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
})

describe('quick refresh', () => {
  const DRAFT_GET_PATH = ['drafts', 'get']

  const core = bootedCore('quick-refresh')
  const harness = createShellHarness(core)
  const faults = trackedFaults()

  afterEach(harness.dispose)

  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const refresh = () => page.getByRole('button', {name: 'Refresh the conversation'})

  test('the quick terminal pane bar carries refresh and a usable composer while the draft is still loading', async () => {
    const sessionId = await createSession(coreRpc(core()))
    const gate = await faults.install({kind: 'gate', path: DRAFT_GET_PATH})
    harness.mountShell(`/quick?panes=${sessionId}&focus=0`)

    await expect.element(refresh(), {timeout: 8000}).toBeVisible()
    await expect.element(editor(), {timeout: 8000}).toBeVisible()

    await coreControl.releaseFault(gate)

    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    await expect.element(refresh()).toBeVisible()
  }, 30_000)
})

describe('reachability flows', () => {
  const core = bootedCore('reachability-flows')
  const harness = createShellHarness(core)
  const faults = trackedFaults()

  afterEach(harness.dispose)

  const errorScreen = () => page.getByText(/couldn.t reach the engine/)
  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const genericBoundary = () => page.getByText('Something went wrong!')
  const engineUnreachableNotice = () => page.getByText('conciv lost connection to the engine.')
  const serverError = () => page.getByText('Internal Server Error')

  async function openSessionPanel(options: ShellMountOptions = {}): Promise<void> {
    const sessionId = await createSession(coreRpc(core()))
    harness.mountShell(`/panel/${sessionId}?open=true`, [], options)
    await expect.element(editor(), {timeout: 8000}).toBeVisible()
  }

  test('a server error while resolving /panel/latest shows the actual error, not the unreachable message', async () => {
    const refused = await faults.install({kind: 'fail', path: ['sessions', 'resolve'], status: 500})
    harness.mountShell('/panel/latest?open=true')

    await expect.element(serverError(), {timeout: 8000}).toBeVisible()
    await expect.element(errorScreen()).not.toBeInTheDocument()
    await expect.element(genericBoundary()).not.toBeInTheDocument()

    await expectRetryRecovers(() => coreControl.releaseFault(refused), editor, serverError)
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
})

const SURFACE_PROBE_NAME = 'surface-probe'

const surfaceProbe = defineExtension({
  name: SURFACE_PROBE_NAME,
  Surface: () => <p>surface probe on {getExtensionApi(SURFACE_PROBE_NAME).useApiBase()()}</p>,
}).client(() => ({value: {}}))

declare module '@conciv/protocol/config-types' {
  interface ExtensionRegistry extends RegisterExtension<typeof surfaceProbe> {}
}

describe('engine login', () => {
  const core = bootedCore('engine-login')
  const harness = createShellHarness(core)
  const faults = trackedFaults()
  const origin = (): string => new URL(core()).origin
  const storageKey = (): string => `conciv:engine-token:${origin()}`

  afterEach(() => {
    harness.dispose()
    localStorage.removeItem(storageKey())
  })

  const locked = () => page.getByRole('button', {name: 'Unauthorized. Authorize conciv'})
  const opener = () => page.getByRole('button', {name: 'Open conciv chat'})
  const dialog = () => page.getByRole('dialog', {name: 'Authorize conciv'})
  const firstDigit = () => page.getByRole('textbox', {name: 'Digit 1 of 6'})
  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const reloginNotice = () =>
    page.getByRole('alert').filter({hasText: 'This browser is no longer authorized to use conciv.'})
  const loginNotice = () => page.getByRole('alert').filter({hasText: 'Log in to use conciv on this page.'})

  test('nothing pops up on load, the locked launcher opens the code dialog, and Escape dismisses it', async () => {
    harness.mountShell('/', [], {login: {apiBase: origin()}})
    await expect.element(locked()).toBeVisible()
    await expect.element(dialog()).not.toBeInTheDocument()
    await locked().hover()
    await expect.element(locked().getByText('Unauthorized')).toBeVisible()
    await expect.element(page.getByRole('tooltip')).not.toBeInTheDocument()
    await locked().click()
    await expect.element(dialog()).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(dialog()).not.toBeInTheDocument()
    await expect.element(locked()).toBeVisible()
  })

  test('a wrong code is refused inline and clears the boxes, and the printed code opens the panel', async () => {
    harness.mountShell('/', [], {login: {apiBase: origin()}})
    await locked().click()
    await expect.element(firstDigit()).toBeVisible()
    const code = await coreControl.printedCode()
    await userEvent.type(firstDigit(), code === '000000' ? '111111' : '000000')
    await expect.element(dialog().getByRole('alert')).toMatchTextContent(/That code didn.t match/)
    await expect.element(firstDigit()).toHaveValue('')
    await userEvent.type(firstDigit(), code)
    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    await expect.element(dialog()).not.toBeInTheDocument()
  }, 30_000)

  const openMagicLink = (code: string): void => {
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#conciv_otp=${code}`)
  }

  test('a reload while the magic link is being exchanged still logs in, and the link leaves the URL once trusted', async () => {
    openMagicLink(await coreControl.requestCode())
    const exchange = await faults.install({kind: 'cut-on-release', path: ['auth', 'exchange']})
    harness.mountShell('/', [], {login: {apiBase: origin()}})
    await coreControl.awaitFaultPending(exchange, 1)
    harness.dispose()
    await coreControl.releaseFault(exchange)
    harness.mountShell('/', [], {login: {apiBase: origin()}})
    await opener().click()
    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    expect(localStorage.getItem(storageKey())).not.toBeNull()
    expect(window.location.hash).toBe('')
  }, 30_000)

  test('a magic link whose exchange fails leaves the URL once the host token source trusts the page', async () => {
    const minted = await makeRpcClient(origin()).auth.exchange({code: await coreControl.requestCode()})
    if (!('token' in minted)) throw new Error(`the engine refused the test code: ${minted.refused}`)
    openMagicLink(await coreControl.requestCode())
    await faults.install({kind: 'fail', path: ['auth', 'exchange']})
    harness.mountShell('/', [], {login: {apiBase: origin(), tokenSource: async () => minted.token}})
    await opener().click()
    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    expect(window.location.hash).toBe('')
  }, 30_000)

  test('a magic link the engine already spent leaves the launcher locked, is dropped from the URL, and a fresh code still logs in', async () => {
    const code = await coreControl.requestCode()
    expect(await makeRpcClient(origin()).auth.exchange({code})).toHaveProperty('token')
    openMagicLink(code)
    const exchange = await faults.install({kind: 'gate', path: ['auth', 'exchange']})
    harness.mountShell('/', [], {login: {apiBase: origin()}})
    await coreControl.awaitFaultPending(exchange, 1)
    await coreControl.releaseFault(exchange)
    await coreControl.awaitFaultAnswered(exchange)
    await expect.element(locked()).toBeVisible()
    await expect.element(dialog()).not.toBeInTheDocument()
    await unlock()
    expect(window.location.hash).toBe('')
  }, 30_000)

  test('extension surfaces start only once the engine trusts the page, on the trusted base', async () => {
    harness.mountShell('/', [surfaceProbe], {login: {apiBase: origin()}})
    await expect.element(locked()).toBeVisible()
    await expect.element(page.getByText(/surface probe on/)).not.toBeInTheDocument()
    await locked().click()
    await userEvent.type(firstDigit(), await coreControl.printedCode())
    await expect.element(page.getByText(`surface probe on ${origin()}`, {exact: true})).toBeInTheDocument()
  }, 30_000)

  test('Send a new code prints a fresh code, and only the fresh code opens the panel', async () => {
    harness.mountShell('/', [], {login: {apiBase: origin()}})
    await locked().click()
    await expect.element(firstDigit()).toBeVisible()
    await expect
      .poll(() =>
        coreControl.printedCode().then(
          () => true,
          () => false,
        ),
      )
      .toBe(true)
    const first = await coreControl.printedCode()
    await dialog().getByRole('button', {name: 'Send a new code'}).click()
    await expect.element(dialog().getByRole('status')).toMatchTextContent(/A new code was printed/)
    await expect.poll(() => coreControl.printedCode()).not.toBe(first)
    await userEvent.type(firstDigit(), first)
    await expect.element(dialog().getByRole('alert')).toMatchTextContent(/That code didn.t match/)
    await userEvent.type(firstDigit(), await coreControl.printedCode())
    await expect.element(editor(), {timeout: 8000}).toBeVisible()
  }, 30_000)

  test('the host token source is asked only when there is no trusted stored token', async () => {
    const minted = {count: 0}
    const tokenSource = async (): Promise<string> => {
      minted.count += 1
      const result = await makeRpcClient(origin()).auth.exchange({code: await coreControl.requestCode()})
      if (!('token' in result)) throw new Error(`the engine refused the test code: ${result.refused}`)
      return result.token
    }
    const mountTrusted = async (): Promise<void> => {
      harness.mountShell('/', [], {login: {apiBase: origin(), tokenSource}})
      await opener().click()
      await expect.element(editor(), {timeout: 8000}).toBeVisible()
      harness.dispose()
    }
    await mountTrusted()
    await mountTrusted()
    expect(minted.count).toBe(1)
    localStorage.setItem(storageKey(), 'a-token-the-engine-never-granted')
    await mountTrusted()
    expect(minted.count).toBe(2)
  }, 30_000)

  test('a stored token the engine no longer trusts locks the launcher and is forgotten', async () => {
    localStorage.setItem(storageKey(), 'a-token-the-engine-never-granted')
    harness.mountShell('/', [], {login: {apiBase: origin()}})
    await expect.element(locked()).toBeVisible()
    expect(localStorage.getItem(storageKey())).toBeNull()
  })

  const unlock = async (): Promise<void> => {
    await locked().click()
    await userEvent.type(firstDigit(), await coreControl.printedCode())
    await expect.element(editor(), {timeout: 8000}).toBeVisible()
  }

  test('a revoked browser whose sockets the engine cannot reach locks on its next engine call', async () => {
    await faults.install({kind: 'detached-sockets'})
    harness.mountShell('/', [], {login: {apiBase: origin()}})
    await unlock()
    expect(await coreControl.revokeBrowsers()).toBeGreaterThan(0)
    await page.getByRole('button', {name: /session options$/}).click()
    await page.getByRole('button', {name: 'Refresh the conversation'}).click()
    await expect.element(reloginNotice(), {timeout: 8000}).toBeVisible()
    await expect.element(editor()).toBeVisible()
    expect(localStorage.getItem(storageKey())).toBeNull()
  }, 30_000)

  test('revoking a browser while its panel is open keeps the panel open behind a log-in notice, and the code restores it in place', async () => {
    harness.mountShell('/', [], {login: {apiBase: origin()}})
    await unlock()
    await expect.poll(() => coreControl.pushSocketsLive()).toBeGreaterThan(0)
    await coreControl.revokeBrowsers()
    await expect.element(reloginNotice(), {timeout: 8000}).toBeVisible()
    await expect.element(editor()).toBeVisible()
    await expect.poll(() => coreControl.pushSocketsLive()).toBe(0)
    await reloginNotice().getByRole('button', {name: 'Log in'}).click()
    await expect.element(dialog()).toBeVisible()
    await userEvent.type(firstDigit(), await coreControl.requestCode())
    await expect.element(dialog()).not.toBeInTheDocument()
    await expect.element(reloginNotice()).not.toBeInTheDocument()
    await expect.element(editor()).toHaveFocus()
    await coreControl.scriptTurn({toolCalls: [], text: 'Back in after the new code.'})
    await editor().fill('are we back')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect.element(page.getByText('Back in after the new code.')).toBeVisible()
  }, 30_000)

  test('revoking a browser keeps the earlier conversation on screen behind the notice, and the code resumes it in place', async () => {
    harness.mountShell('/', [], {login: {apiBase: origin()}})
    await unlock()
    await coreControl.scriptTurn({toolCalls: [], text: 'Answer before the revoke.'})
    await editor().fill('first question')
    await page.getByRole('button', {name: 'Send message'}).click()
    const earlierAnswer = () => page.getByRole('log').getByText('Answer before the revoke.')
    await expect.element(earlierAnswer()).toBeVisible()
    await expect.poll(() => coreControl.pushSocketsLive()).toBeGreaterThan(0)
    await coreControl.revokeBrowsers()
    await expect.element(reloginNotice(), {timeout: 8000}).toBeVisible()
    await expect.element(earlierAnswer()).toBeVisible()
    await expect.element(page.getByRole('status', {name: 'Loading conversation'})).not.toBeInTheDocument()
    await reloginNotice().getByRole('button', {name: 'Log in'}).click()
    await userEvent.type(firstDigit(), await coreControl.requestCode())
    await expect.element(reloginNotice()).not.toBeInTheDocument()
    await expect.element(earlierAnswer()).toBeVisible()
    await expect.poll(() => coreControl.pushSocketsLive()).toBeGreaterThan(0)
    await coreControl.scriptTurn({toolCalls: [], text: 'Answer after the new code.'})
    await editor().fill('second question')
    await page.getByRole('button', {name: 'Send message'}).click()
    await expect.element(page.getByRole('log').getByText('Answer after the new code.')).toBeVisible()
    await expect.element(earlierAnswer()).toBeVisible()
  }, 30_000)

  test('revoking a browser while its panel is closed locks the launcher', async () => {
    harness.mountShell('/', [], {login: {apiBase: origin()}})
    await unlock()
    await page.getByRole('button', {name: 'Close chat'}).click()
    await expect.element(opener()).toBeVisible()
    await coreControl.revokeBrowsers()
    await expect.element(locked(), {timeout: 8000}).toBeVisible()
    await expect.element(reloginNotice()).not.toBeInTheDocument()
    await locked().click()
    await expect.element(dialog()).toBeVisible()
  }, 30_000)

  test('Retry on the unreachable screen checks the login again: untrusted asks to log in inside the panel, trusted opens it', async () => {
    const retryWhileOffline = async (): Promise<void> => {
      const offline = await faults.install({kind: 'offline'})
      harness.mountShell('/', [], {login: {apiBase: origin()}})
      await opener().click()
      const screen = page.getByRole('alert').filter({hasText: /couldn.t reach the engine/})
      await expect.element(screen, {timeout: 8000}).toBeVisible()
      await coreControl.releaseFault(offline)
      await screen.getByRole('button', {name: 'Retry'}).click()
    }
    await retryWhileOffline()
    await expect.element(loginNotice(), {timeout: 8000}).toBeVisible()
    await loginNotice().getByRole('button', {name: 'Log in'}).click()
    await userEvent.type(firstDigit(), await coreControl.requestCode())
    await expect.element(loginNotice()).not.toBeInTheDocument()
    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    harness.dispose()
    await retryWhileOffline()
    await expect.element(editor(), {timeout: 8000}).toBeVisible()
  }, 30_000)

  test('an unreachable engine opens the panel onto the error screen instead of the login', async () => {
    harness.mountShell('/', [], {login: {apiBase: 'http://127.0.0.1:9'}})
    await opener().click()
    await expect.element(page.getByText(/couldn.t reach the engine/), {timeout: 8000}).toBeVisible()
    await expect.element(dialog()).not.toBeInTheDocument()
  }, 30_000)
})

describe('session picker after login', () => {
  const DAY_MS = 86_400_000
  const core = bootedCore('picker-after-login', {
    resume: true,
    holdTranscripts: true,
    history: [
      {
        id: HarnessSessionId.parse('gannet-notes'),
        derivedTitle: 'the gannet notes',
        updatedAt: Date.now() - DAY_MS,
      },
      {
        id: HarnessSessionId.parse('cliff-survey'),
        derivedTitle: 'a cliff survey',
        updatedAt: Date.now() - 2 * DAY_MS,
        text: 'a gannet colony nests on the stack',
      },
    ],
  })
  const harness = createShellHarness(core)
  const origin = (): string => new URL(core()).origin

  afterEach(() => {
    harness.dispose()
    localStorage.removeItem(`conciv:engine-token:${origin()}`)
  })

  test('a widget mounted while the engine refused it shows text matches indexed after the login, without reopening', async () => {
    harness.mountShell('/', [], {login: {apiBase: origin()}})
    const locked = page.getByRole('button', {name: 'Unauthorized. Authorize conciv'})
    await expect.element(locked).toBeVisible()
    await userEvent.click(locked)
    await userEvent.type(page.getByRole('textbox', {name: 'Digit 1 of 6'}), await coreControl.printedCode())
    await expect.element(page.getByRole('textbox', {name: 'Message the conciv agent'}), {timeout: 8000}).toBeVisible()

    await userEvent.click(page.getByRole('button', {name: /session options$/}))
    await userEvent.click(page.getByRole('button', {name: /^Session: /}))
    const search = page.getByRole('combobox', {name: /search sessions/i})
    await userEvent.click(search)
    await expect.element(search).toHaveFocus()
    for (const key of 'gannet') await userEvent.keyboard(key)
    await expect.element(search).toHaveValue('gannet')
    await expect.element(page.getByRole('option', {name: /^a cliff survey,/})).not.toBeInTheDocument()
    await expect.element(page.getByRole('option', {name: /^the gannet notes,/})).toBeVisible()

    await coreControl.releaseTranscripts()

    await expect.element(page.getByRole('option', {name: /^a cliff survey,/})).toBeVisible()
    await expect.element(search).toHaveFocus()
  }, 30_000)
})

describe('route boundary', () => {
  const core = bootedCore('route-boundary')
  const harness = createShellHarness(core)
  const faults = trackedFaults()

  afterEach(harness.dispose)

  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const routePending = () => page.getByRole('progressbar', {name: 'Loading conciv'})

  test('a slow beforeLoad reveals the route pending loader, then hands off to the pane', async () => {
    const held = await faults.install({kind: 'gate', path: ['sessions', 'resolve']})
    harness.mountShell('/panel/latest?open=true')

    await expect.element(routePending()).toBeVisible()

    await coreControl.releaseFault(held)

    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    await expect.element(routePending()).not.toBeInTheDocument()
  }, 30_000)
})

describe('session selector', () => {
  const EXTERNAL_ID = HarnessSessionId.parse('external-mid-run')
  const OLDER_SESSIONS = 40
  const DAY_MS = 86_400_000
  const HOUR_MS = 3_600_000

  const noon = new Date(Date.now() - 12 * HOUR_MS).setHours(12, 0, 0, 0)
  const localMidnight = new Date(noon).setHours(0, 0, 0, 0)
  const MINUTE_MS = 60_000

  beforeAll(() => {
    vi.useFakeTimers({toFake: ['Date'], now: noon, shouldAdvanceTime: true})
  })

  afterAll(() => {
    vi.useRealTimers()
  })
  const TIDE_TURNS = 30
  const tideLog = Array.from({length: TIDE_TURNS}, (_, turn): ChatMessage[] => [
    {id: `tide-question-${turn}`, role: 'user', parts: [{type: 'text', content: `question ${turn}`}]},
    {id: `tide-entry-${turn}`, role: 'assistant', parts: [{type: 'text', content: `tide log entry ${turn}`}]},
  ]).flat()

  const ELSEWHERE = '/elsewhere/gull-colony'
  const LONG_TITLE = 'the question nobody answered about the harbour lights and the old ferry timetable'

  const core = bootedCore('session-selector', {
    resume: true,
    resumeBin: 'claude',
    holdTranscripts: true,
    history: [
      {
        id: HarnessSessionId.parse('gull-away'),
        cwd: ELSEWHERE,
        derivedTitle: 'the gull census',
        updatedAt: noon - (OLDER_SESSIONS + 13) * DAY_MS,
        text: 'forty gulls on the breakwater',
      },
      {
        id: HarnessSessionId.parse('gull-home'),
        derivedTitle: 'a gull at home',
        updatedAt: noon - (OLDER_SESSIONS + 14) * DAY_MS,
      },
      {
        id: HarnessSessionId.parse('gulch-walk'),
        derivedTitle: 'a walk down the gulch',
        updatedAt: noon - (OLDER_SESSIONS + 15) * DAY_MS,
      },
      {
        id: HarnessSessionId.parse('harbour-lights'),
        derivedTitle: LONG_TITLE,
        updatedAt: noon - (OLDER_SESSIONS + 16) * DAY_MS,
      },
      {
        id: EXTERNAL_ID,
        derivedTitle: 'a session mid-run',
        updatedAt: noon,
        sizeBytes: 2_400_000,
      },
      {
        id: HarnessSessionId.parse('after-midnight'),
        derivedTitle: 'a minute after midnight',
        updatedAt: localMidnight + MINUTE_MS,
        messages: tideLog,
      },
      {
        id: HarnessSessionId.parse('before-midnight'),
        derivedTitle: 'a minute before midnight',
        updatedAt: localMidnight - MINUTE_MS,
        text: 'the evening ebb',
      },
      ...Array.from({length: OLDER_SESSIONS}, (_, index) => ({
        id: HarnessSessionId.parse(`older-${index}`),
        derivedTitle: `older session ${index}`,
        updatedAt: noon - (index + 1) * DAY_MS,
        sizeBytes: 1536,
      })),
      {
        id: HarnessSessionId.parse('kiwi-orchard'),
        derivedTitle: 'the kiwi orchard plan',
        updatedAt: noon - (OLDER_SESSIONS + 10) * DAY_MS,
      },
      {
        id: HarnessSessionId.parse('puffin-notes'),
        derivedTitle: 'the puffin notes',
        updatedAt: noon - (OLDER_SESSIONS + 11) * DAY_MS,
      },
      {
        id: HarnessSessionId.parse('seabird-survey'),
        derivedTitle: 'a seabird survey',
        updatedAt: noon - (OLDER_SESSIONS + 12) * DAY_MS,
        text: 'a puffin colony nests on the cliff',
      },
      ...['first', 'second'].map((ordinal, index) => ({
        id: HarnessSessionId.parse(`puffin-diary-${ordinal}`),
        derivedTitle: `the ${ordinal} puffin diary`,
        updatedAt: noon - (OLDER_SESSIONS + 12) * DAY_MS - (index + 1) * MINUTE_MS,
        text: `the ${ordinal} puffin count started at dawn on the northern stack, where the burrows run along the grass above the cliff edge and every pair returns to the same hole each spring, so the tally walks the slope in rows, marks each occupied burrow with a flag, and repeats the walk at dusk to catch the birds that were out fishing in the morning`,
      })),
    ],
  })
  const keep = keptPane()
  const faults = trackedFaults()

  afterEach(async () => {
    await coreControl.releaseTurn()
  })

  async function adoptNativeSession(rpc: RpcClient, nativeId: string): Promise<string> {
    const {sessions} = await rpc.sessions.list({limit: 100})
    const native = sessions.find((meta) => meta.native?.nativeId === nativeId)?.native
    if (!native) throw new Error('the harness history fixture never reached the session list')
    const {sessionId} = await rpc.sessions.open(native)
    return sessionId
  }

  async function activeSessionId(rpc: RpcClient): Promise<string> {
    const {sessions} = await rpc.sessions.list({limit: 100})
    const existing = sessions.find((meta) => meta.title === 'the active session')
    if (existing) return existing.id
    const {sessionId} = await rpc.sessions.create()
    await rpc.sessions.rename({sessionId, title: 'the active session'})
    return sessionId
  }

  type MountedPicker = {activeId: string; router: ReturnType<typeof pickerRouter>; pane: PaneMount}

  async function mountSelector(): Promise<MountedPicker> {
    const rpc = coreRpc(core())
    const activeId = await activeSessionId(rpc)
    const externalId = await adoptNativeSession(rpc, EXTERNAL_ID)
    await coreControl.holdTurn()
    await sendTurn(core(), externalId, 'keep this session busy')
    return mountPicker(activeId, '/')
  }

  function mountPicker(activeId: string, entry: string): MountedPicker {
    const router = pickerRouter(entry, () => (
      <Suspense>
        <SessionSelector variant="pill" activeId={() => activeId} onActivate={() => {}} onNewSession={() => {}} />
      </Suspense>
    ))
    const pane = keep(mountPane({base: core(), sessionId: activeId}, () => <RouterProvider router={router} />))
    return {activeId, router, pane}
  }

  async function typeKeyByKey(search: Locator, keys: string, typedBefore: string): Promise<void> {
    for (const [index, key] of [...keys].entries()) {
      await userEvent.keyboard(key)
      await expect.element(search).toHaveFocus()
      await expect.element(search).toHaveValue(`${typedBefore}${keys.slice(0, index + 1)}`)
    }
  }

  test('a user opens, searches, pages, picks by keyboard and by pointer, and the search follows the index', async () => {
    const mounted = await mountSelector()
    const trigger = page.getByRole('button', {name: 'Session: the active session'})
    const search = page.getByRole('combobox', {name: /search sessions/i})
    const option = (title: string) => page.getByRole('option', {name: new RegExp(`^${title},`)})

    await userEvent.click(trigger)
    await expect.element(option('older session 0')).toBeVisible()
    await expect
      .element(
        page.getByRole('option', {name: /^a session mid-run, Edited [^·]+ · 2\.4\sMB · started externally, running$/}),
      )
      .toBeVisible()
    await expect
      .element(
        page.getByRole('option', {name: /^the active session, Edited [^·]+ · started in conciv$/, selected: true}),
      )
      .toBeVisible()
    await expect
      .element(page.getByRole('listbox'))
      .toMatchTextContent(
        /Today(?:(?!Yesterday).)*a minute after midnight(?:(?!Earlier).)*Yesterday(?:(?!Earlier).)*a minute before midnight/,
      )

    await userEvent.keyboard('{Tab}')
    await expect.element(search).not.toHaveFocus()
    await userEvent.click(search)
    await expect.element(search).toHaveFocus()
    await faults.install({kind: 'gate', path: ['sessions', 'search']})
    await typeKeyByKey(search, 'p', '')
    await expect.element(page.getByRole('listbox')).toHaveAttribute('aria-busy', 'true')
    await expect.element(page.getByRole('progressbar', {name: 'Searching sessions'})).toBeVisible()
    await faults.releaseAll()
    await expect.element(option('the kiwi orchard plan')).toBeVisible()
    await expect.element(page.getByRole('listbox')).not.toHaveAttribute('aria-busy', 'true')
    await expect.element(page.getByRole('progressbar', {name: 'Searching sessions'})).not.toBeInTheDocument()
    await expect.element(option('older session 0')).not.toBeInTheDocument()
    await typeKeyByKey(search, 'u', 'p')
    await expect.element(option('the kiwi orchard plan')).not.toBeInTheDocument()
    await expect.element(option('the puffin notes')).toBeVisible()
    await typeKeyByKey(search, 'ffin', 'pu')
    await expect.element(option('the puffin notes')).toBeVisible()
    expect(option('a seabird survey').elements()).toHaveLength(0)
    await coreControl.releaseTranscripts()
    await expect.element(option('a seabird survey')).toBeVisible()
    await expect.element(search).toHaveFocus()
    await expect.element(option('a seabird survey')).toHaveAccessibleDescription('a puffin colony nests on the cliff')
    await expect.element(option('a seabird survey').getByRole('mark')).toHaveTextContent('puffin')
    await expect.element(option('the puffin notes').getByRole('mark')).toHaveTextContent('puffin')
    await expect.element(option('the puffin notes')).not.toHaveAccessibleDescription()
    await expect.element(option('the second puffin diary')).toBeVisible()
    const results = ['the puffin notes', 'a seabird survey', 'the first puffin diary', 'the second puffin diary']
    for (const title of results) {
      await userEvent.keyboard('{ArrowDown}')
      await expect.element(option(title)).toBeInViewport({ratio: 1})
    }
    for (const title of results.toReversed().slice(1)) {
      await userEvent.keyboard('{ArrowUp}')
      await expect.element(option(title)).toBeInViewport({ratio: 1})
    }
    await expect.element(search).toHaveFocus()

    await userEvent.keyboard('{Backspace}')
    await expect.element(search).toHaveValue('puffi')
    await typeKeyByKey(search, 'm', 'puffi')
    await expect.element(option('a seabird survey').getByRole('mark')).toHaveTextContent('puffin')
    await expect.element(option('a seabird survey')).toHaveAccessibleDescription('a puffin colony nests on the cliff')

    await userEvent.click(page.getByRole('button', {name: 'Clear search'}))
    await expect.element(search).toHaveValue('')
    await expect.element(search).toHaveFocus()
    await expect.element(page.getByRole('button', {name: 'Clear search'})).not.toBeInTheDocument()
    await expect.element(option('older session 0')).toBeVisible()
    await expect.element(page.getByRole('listbox').getByRole('mark')).not.toBeInTheDocument()
    await expect.element(option('older session 0')).not.toHaveAccessibleDescription()
    await expect.element(option('the puffin notes')).not.toBeInTheDocument()
    await expect.element(page.getByRole('option', {name: /^the active session,/, selected: true})).toBeVisible()

    await userEvent.wheel(option('older session 0'), {delta: {y: 1_000_000}})
    await expect.element(option('older session 28')).toBeInTheDocument()
    await userEvent.wheel(option('older session 20'), {delta: {y: 1_000_000}})
    await expect.element(option('older session 39')).toBeVisible()
    await expect.element(page.getByText('Loading more…')).not.toBeInTheDocument()
    await expect.element(option('older session 0')).not.toBeInTheDocument()
    await userEvent.click(search)
    await typeKeyByKey(search, 'kiwi', '')
    await expect.element(option('older session 39')).not.toBeInTheDocument()
    await expect.element(option('the kiwi orchard plan')).toBeVisible()

    await userEvent.keyboard('{ArrowDown}')
    await expect.element(search).toHaveAttribute('aria-activedescendant')
    await userEvent.keyboard('{Enter}')
    await expect
      .element(page.getByRole('log', {name: 'Announcements'}))
      .toHaveTextContent('Switched to the kiwi orchard plan')
    await expect.element(trigger).toHaveFocus()

    await userEvent.click(trigger)
    await expect.element(search).toHaveValue('kiwi')
    await expect.element(option('the kiwi orchard plan')).toBeVisible()
    await userEvent.click(page.getByRole('button', {name: 'Clear search'}))
    await expect.element(search).toHaveValue('')
    await expect.element(option('older session 0')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(option('older session 0')).not.toBeInTheDocument()
    await expect.element(trigger).toHaveFocus()

    await userEvent.click(trigger)
    await expect.element(option('older session 0')).toBeVisible()
    await userEvent.keyboard('{ArrowUp}')
    await expect.element(search).toHaveAttribute('aria-activedescendant')
    await expect.element(option('older session 0')).not.toBeInTheDocument()
    await userEvent.click(search)
    await typeKeyByKey(search, 'puffin', '')
    await expect.element(option('the kiwi orchard plan')).not.toBeInTheDocument()
    await userEvent.click(option('the puffin notes'))
    await expect
      .element(page.getByRole('log', {name: 'Announcements'}))
      .toHaveTextContent('Switched to the kiwi orchard plan | Switched to the puffin notes')

    const anyPreview = page.getByRole('dialog', {name: /^Preview of /})
    const preview = (title: string) => page.getByRole('dialog', {name: `Preview of ${title}`})
    const entry = (title: string, text: string) => preview(title).getByText(text, {exact: true})
    await userEvent.click(trigger)
    const searchArea = page.getByRole('search')
    const labelled = searchArea.getByRole('combobox', {name: 'Search sessions'})
    const allProjects = searchArea.getByRole('switch', {name: 'All projects'})
    await expect.element(labelled).toHaveValue('puffin')
    await expect.element(allProjects).not.toBeChecked()
    await userEvent.click(page.getByRole('button', {name: 'Clear search'}))
    await expect.element(labelled).toHaveFocus()
    await expect.element(option('older session 0')).toBeVisible()
    await typeKeyByKey(labelled, 'gull', '')
    await expect.element(option('a gull at home')).toBeVisible()
    await expect.element(option('a walk down the gulch')).not.toBeInTheDocument()
    expect(mounted.router.state.location.search.sessionSearch).toBe('gull')
    await expect.element(option('the gull census')).not.toBeInTheDocument()

    await userEvent.tab()
    await userEvent.tab()
    await userEvent.tab()
    await expect.element(allProjects).toHaveFocus()
    await userEvent.keyboard(' ')
    await expect.element(allProjects).toBeChecked()
    await expect.element(option('the gull census')).toBeVisible()
    expect(mounted.router.state.location.search.allProjects).toBe(true)
    await expect.element(option('the gull census')).toMatchTextContent(/· gull-colony$/)
    await expect.element(option('a gull at home')).toBeVisible()

    const copied = `cd '${ELSEWHERE}' && 'claude' '--resume' 'gull-away'`
    await userEvent.click(option('the gull census'))
    await expect.element(page.getByRole('tooltip')).toHaveTextContent('Copied')
    await expect.element(page.getByRole('log', {name: 'Announcements'})).toMatchTextContent(/puffin notes \| Copied$/)
    await userEvent.click(labelled)
    await userEvent.keyboard('{Backspace}')
    await expect.element(labelled).toHaveValue('gul')
    await expect.element(option('a walk down the gulch')).toBeVisible()
    await typeKeyByKey(labelled, 'l', 'gul')
    await expect.element(option('a walk down the gulch')).not.toBeInTheDocument()
    await expect.element(page.getByRole('tooltip')).toHaveTextContent('Copied')
    expect(await navigator.clipboard.readText()).toBe(copied)
    await expect.element(option('the gull census')).toBeVisible()
    await expect.element(page.getByRole('tooltip'), {timeout: 4000}).not.toBeInTheDocument()

    await userEvent.click(labelled)
    await userEvent.keyboard('{ArrowDown}')
    await expect.element(option('the gull census')).toHaveAttribute('data-highlighted')
    await expect.element(entry('the gull census', 'forty gulls on the breakwater')).toBeVisible()
    await expect.element(preview('the gull census').getByText('gull-colony', {exact: true})).toBeVisible()
    const resumeCopy = (name: string) => preview('the gull census').getByRole('button', {name})
    await expect.element(resumeCopy('Copy resume command')).toBeVisible()
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByRole('tooltip')).toHaveTextContent('Copied')
    await expect
      .element(page.getByRole('log', {name: 'Announcements'}))
      .toMatchTextContent(/puffin notes \| Copied \| Copied$/)
    await expect.element(option('the gull census')).toBeVisible()
    expect(resumeCopy('Copied').query()).toBeNull()
    await expect.element(page.getByRole('tooltip'), {timeout: 4000}).not.toBeInTheDocument()
    await navigator.clipboard.writeText('')
    await userEvent.click(resumeCopy('Copy resume command'), {position: {x: -6, y: 14}})
    await expect.element(resumeCopy('Copied')).toBeVisible()
    expect(page.getByRole('listbox').getByRole('tooltip').query()).toBeNull()
    await expect.element(preview('the gull census').getByRole('tooltip')).toHaveTextContent('Copied')
    await expect.element(preview('the gull census').getByRole('tooltip')).toBeVisible()
    expect(page.getByRole('listbox').getByRole('tooltip').query()).toBeNull()
    await expect
      .element(page.getByRole('log', {name: 'Announcements'}))
      .toMatchTextContent(/puffin notes \| Copied \| Copied \| Copied$/)
    expect(await navigator.clipboard.readText()).toBe(copied)

    await userEvent.click(labelled)
    await userEvent.keyboard('{Escape}')
    await expect.element(anyPreview).not.toBeInTheDocument()
    await expect.element(option('the gull census')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(option('the gull census')).not.toBeInTheDocument()
    await userEvent.click(trigger)
    await expect.element(labelled).toHaveValue('gull')
    await expect.element(option('the gull census')).toBeVisible()

    const href = mounted.router.state.location.href
    mounted.pane.dispose()
    const remounted = mountPicker(mounted.activeId, href)
    await userEvent.click(page.getByRole('button', {name: 'Session: the active session'}))
    await expect.element(labelled).toHaveValue('gull')
    await expect.element(allProjects).toBeChecked()
    await expect.element(option('the gull census')).toBeVisible()
    await expect.element(option('a gull at home')).toBeVisible()

    await userEvent.click(page.getByRole('button', {name: 'Clear search'}))
    await expect.element(option('a minute after midnight')).toBeVisible()
    expect(anyPreview.query()).toBeNull()
    await typeKeyByKey(search, 'tide', '')
    await expect.element(option('older session 0')).not.toBeInTheDocument()
    await userEvent.hover(option('a minute after midnight'))
    await expect.element(entry('a minute after midnight', 'tide log entry 29')).toBeVisible()
    await expect.element(preview('a minute after midnight').getByRole('mark').first()).toHaveTextContent('tide')
    await expect.element(search).toHaveFocus()
    await expect.element(preview('a minute after midnight').getByRole('button', {name: 'Copy'}).last()).toBeVisible()
    await expect
      .element(preview('a minute after midnight').getByRole('button', {name: 'Refresh'}))
      .not.toBeInTheDocument()
    await expect
      .element(preview('a minute after midnight').getByRole('button', {name: 'More message actions'}))
      .not.toBeInTheDocument()
    await typeKeyByKey(search, 'x', 'tide')
    await expect.element(option('a minute after midnight')).toBeVisible()
    await expect.element(anyPreview).not.toBeInTheDocument()
    await userEvent.hover(search)
    await userEvent.hover(option('a minute after midnight'))
    await expect.element(entry('a minute after midnight', 'tide log entry 29')).toBeVisible()
    await typeKeyByKey(search, 'y', 'tidex')
    await expect.element(option('a minute after midnight')).not.toBeInTheDocument()
    await expect.element(anyPreview).not.toBeInTheDocument()

    await userEvent.click(page.getByRole('button', {name: 'Clear search'}))
    await typeKeyByKey(search, 'question', '')
    await userEvent.hover(option('a minute after midnight'))
    await expect
      .element(preview('a minute after midnight').getByText('question 29', {exact: true}).getByRole('mark'))
      .toHaveTextContent('question')
    await userEvent.hover(option(LONG_TITLE).getByText(LONG_TITLE, {exact: true}))
    await expect.element(page.getByRole('tooltip')).toHaveTextContent(LONG_TITLE)
    await expect.element(preview(LONG_TITLE)).toBeVisible()
    await userEvent.keyboard('{Backspace}')
    await expect.element(search).toHaveValue('questio')
    await typeKeyByKey(search, 'n', 'questio')
    await expect.element(page.getByRole('progressbar', {name: 'Searching sessions'})).not.toBeInTheDocument()
    await expect.element(page.getByRole('tooltip')).toHaveTextContent(LONG_TITLE)
    await expect.element(option(LONG_TITLE)).toBeVisible()
    await userEvent.hover(option('a minute after midnight'))
    await expect
      .element(preview('a minute after midnight').getByText('question 29', {exact: true}).getByRole('mark'))
      .toHaveTextContent('question')
    await typeKeyByKey(search, 'xq', 'question')
    await expect.element(option('a minute after midnight')).not.toBeInTheDocument()

    await userEvent.click(page.getByRole('button', {name: 'Clear search'}))
    await expect.element(option('older session 0')).toBeVisible()
    await userEvent.hover(option('a minute after midnight'))
    await expect.element(entry('a minute after midnight', 'tide log entry 29')).toBeVisible()
    await expect.element(preview('a minute after midnight').getByRole('mark')).not.toBeInTheDocument()
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowUp}')
    expect(preview('older session 0').query()).toBeNull()
    expect(preview('a minute before midnight').query()).toBeNull()
    expect(entry('a minute after midnight', 'tide log entry 29').query()).not.toBeNull()
    await expect.element(entry('a minute before midnight', 'the evening ebb')).toBeVisible()
    expect(preview('a minute after midnight').query()).toBeNull()
    await userEvent.keyboard('{ArrowUp}')
    await expect.element(entry('a minute after midnight', 'tide log entry 29')).toBeVisible()

    const thread = preview('a minute after midnight').getByRole('log')
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}')
    await expect.element(thread).toHaveFocus()
    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}')
    await expect.element(search).toHaveFocus()
    await expect.element(entry('a minute after midnight', 'tide log entry 29')).toBeVisible()
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}')
    await expect.element(thread).toHaveFocus()
    await userEvent.keyboard('{Home}')
    await expect.element(entry('a minute after midnight', 'tide log entry 9')).toBeInTheDocument()

    await userEvent.keyboard('{Escape}')
    await expect.element(search).toHaveFocus()
    await expect.element(anyPreview).not.toBeInTheDocument()
    await expect.element(option('a minute after midnight')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(option('a minute after midnight')).not.toBeInTheDocument()
    await expect.element(trigger).toHaveFocus()

    remounted.pane.dispose()
    const twin = pickerRouter('/', () => (
      <Suspense>
        <SessionSelector
          variant="pill"
          activeId={() => mounted.activeId}
          onActivate={() => {}}
          onNewSession={() => {}}
        />
        <SessionSelector
          variant="pill"
          activeId={() => mounted.activeId}
          onActivate={() => {}}
          onNewSession={() => {}}
        />
      </Suspense>
    ))
    keep(mountPane({base: core(), sessionId: mounted.activeId}, () => <RouterProvider router={twin} />))
    const triggers = page.getByRole('button', {name: 'Session: the active session'})
    await userEvent.click(triggers.first())
    await expect.element(search).toHaveValue('')
    await typeKeyByKey(search, 'kiwi', '')
    await expect.element(option('the kiwi orchard plan')).toBeVisible()
    await userEvent.keyboard('{Escape}')
    await expect.element(option('the kiwi orchard plan')).not.toBeInTheDocument()
    await userEvent.click(triggers.last())
    await expect.element(search).toHaveValue('kiwi')
    await expect.element(page.getByRole('button', {name: 'Clear search'})).toBeVisible()
    await expect.element(option('the kiwi orchard plan')).toBeVisible()
  }, 45_000)

  test('a session past the first page shows its own title on the trigger', async () => {
    const sessionId = await adoptNativeSession(coreRpc(core()), HarnessSessionId.parse(`older-${OLDER_SESSIONS - 1}`))
    keep(
      mountPane({base: core(), sessionId}, () => (
        <RouterProvider
          router={pickerRouter('/', () => (
            <SessionSelector variant="pill" activeId={() => sessionId} onActivate={() => {}} onNewSession={() => {}} />
          ))}
        />
      )),
    )

    await expect.element(page.getByRole('button', {name: 'Session: older session 39'})).toBeVisible()
  })
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

    it('locks the tabs a view lock blocks while keeping the active one reachable', async () => {
      mountViews('chat', () => {}, true)

      await expect.element(page.getByRole('tab', {name: 'Board'})).toBeDisabled()
      await expect.element(page.getByRole('tab', {name: 'Chat'})).not.toBeDisabled()
    })
  })
})

describe('tool card dispatch', () => {
  function mount(child: () => JSX.Element): void {
    render(child)
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

describe('run errors', () => {
  const OVERFLOW_TEXT = 'prompt is too long: 250000 tokens > 200000 maximum'

  function FailedRun(props: {failure: ChatEvent; compacted: () => void; compacting?: boolean}): JSX.Element {
    const chat = createChat({
      threadId: 'run-errors',
      connection: {
        async *connect(_messages, _data, _signal, runContext) {
          yield {type: ChatEventType.RUN_STARTED, threadId: 'run-errors', runId: runContext?.runId ?? 'failed-run'}
          yield props.failure
        },
      },
    })
    onMount(() => void chat.sendMessage('go'))
    return (
      <Show when={chat.error()}>
        {(error) => (
          <RunErrorRow
            error={error()}
            compacting={props.compacting ?? false}
            onRetry={() => void chat.reload()}
            onCompact={props.compacted}
          />
        )}
      </Show>
    )
  }

  it('a context overflow says the conversation is too long and offers to compact it', async () => {
    const compacted = {count: 0}
    render(() => (
      <FailedRun
        failure={{type: ChatEventType.RUN_ERROR, message: OVERFLOW_TEXT, code: 'context_overflow'}}
        compacted={() => void (compacted.count += 1)}
      />
    ))

    const alert = page.getByRole('alert')
    await expect.element(alert.getByText(/This conversation is too long for the model\./)).toBeVisible()
    await expect.element(alert.getByText(OVERFLOW_TEXT)).not.toBeInTheDocument()
    await userEvent.click(page.getByRole('button', {name: 'Compact conversation'}))
    expect(compacted.count).toBe(1)
    await page.screenshot({path: '__screenshots__/run-errors/context-overflow.png'})
  })

  it('the Compact action is disabled while a compaction is already running', async () => {
    render(() => (
      <FailedRun
        failure={{type: ChatEventType.RUN_ERROR, message: OVERFLOW_TEXT, code: 'context_overflow'}}
        compacted={() => {}}
        compacting
      />
    ))

    const compact = page.getByRole('button', {name: 'Compact conversation'})
    await expect.element(compact).toBeVisible()
    await page.screenshot({path: '__screenshots__/run-errors/context-overflow-compacting.png'})
    await expect.element(compact).toBeDisabled()
  })

  it('any other provider error keeps its own text and a retry', async () => {
    render(() => (
      <FailedRun failure={{type: ChatEventType.RUN_ERROR, message: 'upstream is overloaded'}} compacted={() => {}} />
    ))

    await expect.element(page.getByRole('alert').getByText('upstream is overloaded')).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Retry'})).toBeVisible()
  })

  describe('in a live pane', () => {
    const core = bootedCore('run-errors-live')
    const keep = keptPane()

    const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
    const runError = (text: string) =>
      page.getByRole('alert').filter({hasText: text, has: page.getByRole('button', {name: 'Retry'})})

    async function typeTurn(text: string): Promise<void> {
      await userEvent.click(input())
      await userEvent.keyboard(`${text}{Enter}`)
    }

    it('a finished compaction clears the run error it resolved, and a later failure still shows', async () => {
      const sessionId = await createSession(coreRpc(core()))
      keep(mountPane({base: core(), sessionId, width: 460}, () => <ChatPane sessionId={sessionId} />))
      await expect.element(input()).toBeVisible()

      await coreControl.scriptError('upstream is overloaded')
      await typeTurn('first turn')
      await expect.element(runError('upstream is overloaded')).toBeVisible()

      await userEvent.click(page.getByRole('button', {name: 'More composer actions'}))
      await userEvent.click(page.getByRole('menuitem', {name: 'Compress the conversation'}))

      await expect.element(runError('upstream is overloaded')).not.toBeInTheDocument()
      await page.screenshot({path: '__screenshots__/run-errors/compacted-clears-error.png'})

      await coreControl.scriptError('the model went away')
      await typeTurn('second turn')
      await expect.element(runError('the model went away')).toBeVisible()
    })
  })
})

describe('tool durations across row eviction', () => {
  const EARLIER_EXCHANGES = 24
  const PROBE_CALL = 'probe-call'

  function ProbeCard(props: ToolCardProps): JSX.Element {
    return <p>{`probe took ${formatDuration(props.durationMs) ?? 'no time yet'}`}</p>
  }

  const probeEntries: ToolCardEntry[] = [
    {names: ['probe_tool'], render: ProbeCard, hasEmbeddedBody: () => true, display: 'standalone'},
  ]

  function earlierExchanges(): ChatMessage[] {
    return Array.from({length: EARLIER_EXCHANGES}, (_, index): ChatMessage[] => [
      {id: `earlier-u${index}`, role: 'user', parts: [{type: 'text', content: `earlier question ${index}`}]},
      {
        id: `earlier-a${index}`,
        role: 'assistant',
        parts: [{type: 'text', content: `earlier answer ${index} ${'with a long aside. '.repeat(30)}`}],
      },
    ]).flat()
  }

  function gatedProbeRun(resultGate: Promise<void>): ReturnType<typeof storyConnection> {
    return {
      async *connect(_messages, _data, _signal, runContext) {
        const run = {threadId: runContext?.threadId ?? 'durations', runId: runContext?.runId ?? 'durations-run'}
        yield {type: ChatEventType.RUN_STARTED, ...run}
        yield* createToolCallChunks('probe_tool', {target: 'everything'}, {toolCallId: PROBE_CALL})
        await resultGate
        yield createToolResultChunk(PROBE_CALL, 'probed')
        yield* createTextChunks('probe finished')
        yield {type: ChatEventType.RUN_FINISHED, ...run, finishReason: 'stop'}
      },
    }
  }

  function RunPhase(): JSX.Element {
    const thread = useThread()
    return <span>{thread.isRunning ? 'probe run live' : 'probe run settled'}</span>
  }

  function mountProbeThread(resultGate: Promise<void>): void {
    function ProbeThread(): JSX.Element {
      const chat = createChat({threadId: 'tool-durations', connection: gatedProbeRun(resultGate)})
      const ctx = {...INERT_TOOL_CTX, durationFor: createToolDurations(chat.messages, Date.now)}
      onMount(() => {
        chat.setMessages(earlierExchanges())
        void chat.sendMessage('run the probe')
      })
      return (
        <ChatProvider chat={chat}>
          <ToolProvider value={ctx}>
            <RunPhase />
            <div style={{height: '360px', width: '520px', display: 'flex', 'flex-direction': 'column'}}>
              <Thread>
                <Thread.Viewport>
                  <Thread.Messages tools={probeEntries} />
                </Thread.Viewport>
              </Thread>
            </div>
          </ToolProvider>
        </ChatProvider>
      )
    }
    render(() => <ProbeThread />)
  }

  const log = () => page.getByRole('log')
  const probeTook = () => page.getByText(/^probe took \d+(\.\d)?s$/)
  const probeCard = () => page.getByText(/^probe took/)

  async function scrollAway(): Promise<void> {
    await userEvent.wheel(log(), {delta: {y: -1_000_000}})
    await expect.element(page.getByText('earlier question 0'), {timeout: 3000}).toBeInViewport()
    await expect.element(probeCard()).not.toBeInTheDocument()
  }

  async function scrollBack(): Promise<void> {
    await userEvent.wheel(log(), {delta: {y: 1_000_000}})
    await expect.element(page.getByText('probe finished'), {timeout: 3000}).toBeInViewport()
  }

  it('keeps a finished tool duration after its message scrolls out of view and back', async () => {
    const gate = Promise.withResolvers<void>()
    mountProbeThread(gate.promise)
    await expect.element(page.getByText('probe took no time yet'), {timeout: 3000}).toBeVisible()
    gate.resolve()
    await expect.element(probeTook(), {timeout: 3000}).toBeVisible()

    await scrollAway()
    await scrollBack()

    await expect.element(probeTook(), {timeout: 3000}).toBeVisible()
  })

  it('shows a duration for a tool that finished while its message was scrolled away', async () => {
    const gate = Promise.withResolvers<void>()
    mountProbeThread(gate.promise)
    await expect.element(page.getByText('probe took no time yet'), {timeout: 3000}).toBeVisible()

    await scrollAway()
    gate.resolve()
    await expect.element(page.getByText('probe run settled'), {timeout: 3000}).toBeVisible()
    await scrollBack()

    await expect.element(probeTook(), {timeout: 3000}).toBeVisible()
  })
})

describe('tool outcomes', () => {
  const STOPPED_REASON = {denied: 'User declined tool execution', cancelled: 'Tool execution cancelled'} as const

  function stoppedTool(
    outcome: 'denied' | 'cancelled',
    name = 'Bash',
    input: Record<string, unknown> = {command: 'rm -rf build'},
  ): JSX.Element {
    const part: ToolCallPart = {
      type: 'tool-call',
      id: 'stopped-1',
      name,
      arguments: JSON.stringify(input),
      input,
      state: 'input-complete',
    }
    const result: ToolResultPart = {
      type: 'tool-result',
      toolCallId: 'stopped-1',
      content: JSON.stringify({error: STOPPED_REASON[outcome]}),
      state: 'error',
      outcome,
      error: STOPPED_REASON[outcome],
    }
    return <ToolTraceRow part={part} result={result} ctx={INERT_TOOL_CTX} tools={() => builtinToolCards} />
  }

  it('a denied tool reads as denied, not as a failure', async () => {
    render(() => stoppedTool('denied'))

    await expect.element(page.getByRole('img', {name: 'denied'})).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'failed'})).not.toBeInTheDocument()
    await page.screenshot({path: '__screenshots__/tool-outcomes/Bash-denied.png'})
  })

  it('a cancelled tool reads as cancelled, not as a failure', async () => {
    render(() => stoppedTool('cancelled'))

    await expect.element(page.getByRole('img', {name: 'cancelled'})).toBeVisible()
    await expect.element(page.getByRole('img', {name: 'failed'})).not.toBeInTheDocument()
    await page.screenshot({path: '__screenshots__/tool-outcomes/Bash-cancelled.png'})
  })

  for (const [outcome, name] of [
    ['denied', 'Grep'],
    ['cancelled', 'Glob'],
  ] as const) {
    it(`a ${outcome} ${name} search names the outcome on the row, never failed`, async () => {
      render(() => stoppedTool(outcome, name, {pattern: 'TODO'}))

      await expect.element(page.getByRole('img', {name: outcome})).toBeVisible()
      await page.screenshot({path: `__screenshots__/tool-outcomes/${name}-${outcome}.png`})
      await expect.element(page.getByText(outcome, {exact: true})).toBeVisible()
      await expect.element(page.getByText('failed', {exact: true})).not.toBeInTheDocument()
      await expect.element(page.getByText(STOPPED_REASON[outcome])).toBeVisible()
      await expect.element(page.getByRole('group', {name: 'Error output'})).not.toBeInTheDocument()
    })
  }
})

describe('settings page', () => {
  const probeSettingsSchema = z.object({
    wrap: z.boolean().default(false).meta({title: 'Wrap lines', description: 'Long lines wrap instead of scrolling.'}),
    density: z.enum(['compact', 'cozy']).default('cozy').meta({title: 'Density'}),
    theme: z.enum(['plain', 'ocean', 'forest', 'dusk']).default('plain').meta({title: 'Theme'}),
    fontSize: z.number().int().min(10).max(24).default(13).meta({title: 'Font size'}),
    greeting: z.string().default('').meta({title: 'Greeting', description: 'Shown above the notes.'}),
  })

  function SchemeProbe(): JSX.Element {
    const scheme = getHostApi().useColorScheme()
    const settings = settingsProbe.useSettings()
    return (
      <>
        <p>Widget colors: {scheme()}</p>
        <p>
          {`Probe settings: wrap=${settings().wrap} density=${settings().density} theme=${settings().theme} fontSize=${settings().fontSize} greeting=${settings().greeting}`}
        </p>
      </>
    )
  }

  const settingsProbe = defineExtension({
    name: 'settings-probe',
    settings: probeSettingsSchema,
    Surface: SchemeProbe,
    views: [{id: 'notes', label: 'Notes', Component: () => <p>the notes view</p>}],
  }).client(() => ({value: {}}))

  const coreBase = bootedCore('settings-page')
  const harness = createShellHarness(coreBase)

  afterEach(harness.dispose)
  afterEach(() => document.documentElement.style.removeProperty('--conciv-skin'))
  afterEach(() => localStorage.removeItem('conciv-modal-width'))

  const composer = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const gear = () => page.getByRole('link', {name: 'Settings'})
  const back = () => page.getByRole('button', {name: 'Back to chat'})
  const tab = (name: string) => page.getByRole('tab', {name, exact: true})
  const sections = () => page.getByRole('tablist', {name: 'Settings sections'})
  const widthHandle = () => page.getByRole('separator', {name: 'Resize chat width'})
  const colorMode = () => page.getByRole('radiogroup', {name: 'Color mode'})
  const probe = (scheme: string) => page.getByText(`Widget colors: ${scheme}`)
  const notesTab = () => page.getByRole('tab', {name: 'Notes', exact: true})
  const notesShown = () => page.getByRole('checkbox', {name: /^Notes/})
  const command = (label: string) => page.getByRole('button', {name: label, exact: true})
  const clash = () => page.getByRole('status').getByText(/is also/)
  const quickTerminal = () => page.getByRole('dialog', {name: 'conciv quick terminal'})
  const probeValues = (values: string) => page.getByText(`Probe settings: ${values}`, {exact: true})
  const PROBE_DEFAULTS = 'wrap=false density=cozy theme=plain fontSize=13 greeting='
  const PROBE_CHANGED = 'wrap=true density=compact theme=ocean fontSize=16 greeting=hi'
  const wrapLines = () => page.getByRole('switch', {name: 'Wrap lines'})
  const fontSize = () => page.getByRole('spinbutton', {name: 'Font size'})
  const greeting = () => page.getByRole('textbox', {name: 'Greeting'})
  const skin = (name: string) => page.getByRole('radio', {name, exact: true})
  const saveClash = () => page.getByRole('button', {name: 'Save', exact: true})
  const resetAll = () => page.getByRole('link', {name: 'Reset all', exact: true})
  const resetDialog = () => page.getByRole('alertdialog', {name: 'Reset all settings?'})
  const titled = (title: string) =>
    page.getByRole('banner').getByRole('button', {name: new RegExp(`^${title}, session options$`)})
  const RENAME_PATH = ['sessions', 'rename']
  const HARNESSES_PATH = ['meta', 'harnesses']
  const MODELS_PATH = ['meta', 'models']
  const MOUNT_READS = [HARNESSES_PATH, MODELS_PATH, ['registry', 'catalog']]
  const renameTo = async (title: string) => {
    await page.getByRole('banner').getByRole('button', {name: 'Rename session'}).click()
    await userEvent.clear(page.getByRole('banner').getByRole('textbox', {name: 'Session title'}))
    await userEvent.type(page.getByRole('banner').getByRole('textbox', {name: 'Session title'}), `${title}{Enter}`)
    await expect.element(titled(title), {timeout: 8000}).toBeVisible()
  }

  test('a journey through every settings tab that saves, applies, survives a reload and resets', async () => {
    await page.viewport(1000, 900)
    localStorage.removeItem('conciv:settings-tab')
    localStorage.removeItem('conciv-modal-width')
    const sessionId = await createSession(coreRpc(coreBase()))
    const settingsPath = (name: string) => `/panel/${sessionId}/settings/${name}`
    harness.mountShell(`/panel/${sessionId}/settings/general?open=true`, [])
    await expect.element(sections(), {timeout: 8000}).toHaveAttribute('aria-orientation', 'horizontal')
    await expect.element(tab('Advanced')).toBeVisible()
    await tab('General').click()
    await userEvent.keyboard('{ArrowRight}')
    await expect.element(tab('Views')).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Shift>}{Tab}{Tab}{/Shift}')
    await expect.element(widthHandle()).toHaveFocus()
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}')
    await expect.element(widthHandle()).toHaveAttribute('aria-valuenow', '548')
    await expect.element(sections()).toHaveAttribute('aria-orientation', 'vertical')
    await tab('Views').click()
    await userEvent.keyboard('{ArrowDown}')
    await expect.element(tab('Shortcuts')).toHaveAttribute('aria-selected', 'true')
    await tab('General').click()
    await expect.element(tab('General')).toHaveAttribute('aria-selected', 'true')
    harness.dispose()
    harness.mountShell(`/panel/${sessionId}?open=true`, [settingsProbe])
    await expect.element(composer(), {timeout: 8000}).toBeVisible()
    await expect.element(probe('light')).toBeInTheDocument()
    await expect.element(notesTab()).toBeVisible()
    await renameTo('renamed before settings')
    const firstVisit = await coreControl.rpcStartedOnceServed(RENAME_PATH, 1, MOUNT_READS)

    await gear().click()
    await expect.element(tab('General')).toHaveAttribute('aria-selected', 'true')
    expect(harness.pathname()).toBe(settingsPath('general'))
    await expect.element(sections()).toHaveAttribute('aria-orientation', 'vertical')

    const tabPaths: Record<string, string> = {
      General: 'general',
      Views: 'views',
      Shortcuts: 'shortcuts',
      'Settings probe': 'extensions/settings-probe',
      Advanced: 'advanced',
    }
    for (const name of ['Views', 'Shortcuts', 'Settings probe', 'Advanced']) {
      await tab(name).click()
      await expect.element(tab(name)).toHaveAttribute('aria-selected', 'true')
      expect(harness.pathname()).toBe(settingsPath(tabPaths[name] ?? ''))
    }
    for (const name of ['Settings probe', 'Shortcuts', 'Views', 'General']) {
      await userEvent.keyboard('{ArrowUp}')
      await expect.element(tab(name)).toHaveFocus()
      await expect.element(tab(name)).toHaveAttribute('aria-selected', 'true')
      expect(harness.pathname()).toBe(settingsPath(tabPaths[name] ?? ''))
    }

    await colorMode().getByText('Dark', {exact: true}).click()
    await expect.element(probe('dark')).toBeInTheDocument()

    await tab('Views').click()
    await expect.element(notesShown()).toBeChecked()
    await page.getByText(/^Notes/).click()
    await expect.element(notesShown()).not.toBeChecked()

    await back().click()
    await expect.element(composer(), {timeout: 8000}).toBeVisible()
    await expect.element(gear()).toHaveFocus()
    expect(harness.pathname()).toBe(`/panel/${sessionId}`)
    await expect.element(notesTab()).not.toBeInTheDocument()
    await renameTo('renamed after settings')
    const returned = await coreControl.rpcStartedOnceServed(RENAME_PATH, 2, MOUNT_READS)
    expect(returned).toEqual(firstVisit)
    Object.defineProperty(document, 'visibilityState', {configurable: true, value: 'hidden'})
    document.dispatchEvent(new Event('visibilitychange', {bubbles: true}))
    Reflect.deleteProperty(document, 'visibilityState')
    document.dispatchEvent(new Event('visibilitychange', {bubbles: true}))
    await coreControl.rpcStartedOnceServed(HARNESSES_PATH, (returned[0] ?? 0) + 1, [])
    await coreControl.rpcStartedOnceServed(MODELS_PATH, (returned[1] ?? 0) + 1, [])
    await expect.element(titled('renamed after settings')).toBeVisible()

    await gear().click()
    await expect.element(tab('Views')).toHaveAttribute('aria-selected', 'true')
    expect(harness.pathname()).toBe(settingsPath('views'))
    await tab('Shortcuts').click()
    await expect.element(tab('Shortcuts')).toHaveAttribute('aria-selected', 'true')
    harness.back()
    await expect.element(tab('Views')).toHaveAttribute('aria-selected', 'true')
    expect(harness.pathname()).toBe(settingsPath('views'))
    await back().click()
    await expect.element(composer(), {timeout: 8000}).toBeVisible()
    await gear().click()
    await expect.element(tab('Views')).toHaveAttribute('aria-selected', 'true')
    expect(harness.pathname()).toBe(settingsPath('views'))

    harness.dispose()
    document.documentElement.style.setProperty('--conciv-skin', 'terminal')
    harness.mountShell(`${settingsPath('general')}?open=true`, [settingsProbe])
    await expect.element(colorMode().getByRole('radio', {name: 'Dark'}), {timeout: 8000}).toBeChecked()
    await expect.element(probe('dark')).toBeInTheDocument()
    await expect.element(page.getByText('Set by the page in --conciv-skin')).toBeVisible()
    await expect.element(skin('Terminal')).toBeChecked()
    document.documentElement.style.removeProperty('--conciv-skin')
    await expect.element(page.getByText('Set by the page in --conciv-skin')).not.toBeInTheDocument()
    await expect.element(skin('Conciv')).toBeChecked()

    await tab('Settings probe').click()
    await expect.element(page.getByRole('heading', {name: 'Settings probe'})).toBeVisible()
    await expect.element(probeValues(PROBE_DEFAULTS)).toBeInTheDocument()
    await page.getByText('Wrap lines', {exact: true}).click()
    await expect.element(wrapLines()).toBeChecked()
    await page.getByRole('radiogroup', {name: 'Density'}).getByText('Compact', {exact: true}).click()
    await page.getByRole('combobox', {name: 'Theme'}).click()
    await page.getByRole('option', {name: 'Ocean'}).click()
    await fontSize().click()
    await userEvent.keyboard('{End}{Backspace}{Backspace}16{Enter}')
    await greeting().click()
    await userEvent.keyboard('hi')
    await expect.element(probeValues(PROBE_CHANGED)).toBeInTheDocument()

    harness.dispose()
    harness.mountShell(`/panel/${sessionId}/settings?open=true`, [settingsProbe])
    await expect.element(tab('Settings probe'), {timeout: 8000}).toHaveAttribute('aria-selected', 'true')
    expect(harness.pathname()).toBe(settingsPath('extensions/settings-probe'))
    await expect.element(probeValues(PROBE_CHANGED)).toBeInTheDocument()
    await expect.element(wrapLines()).toBeChecked()
    await expect
      .element(page.getByRole('radiogroup', {name: 'Density'}).getByRole('radio', {name: 'Compact'}))
      .toBeChecked()
    await expect.element(page.getByRole('combobox', {name: 'Theme'})).toHaveTextContent('Ocean')
    await expect.element(fontSize()).toHaveValue('16')
    await expect.element(greeting()).toHaveValue('hi')

    harness.dispose()
    harness.mountShell(`${settingsPath('extensions/nothing-here')}?open=true`, [settingsProbe])
    await expect.element(tab('General'), {timeout: 8000}).toHaveAttribute('aria-selected', 'true')
    expect(harness.pathname()).toBe(settingsPath('general'))

    await tab('Shortcuts').click()
    await command('Quick terminal').click()
    await userEvent.keyboard('{Control>}{Shift>}k{/Shift}{/Control}')
    await expect.element(command('Quick terminal')).toHaveFocus()
    await command('New quick terminal pane').click()
    await userEvent.keyboard('{Control>}{Shift>}k{/Shift}{/Control}')
    await expect.element(clash()).toBeVisible()
    await userEvent.tab()
    await expect.element(saveClash()).toHaveFocus()
    await userEvent.keyboard('{Escape}')
    await expect.element(clash()).not.toBeInTheDocument()
    await expect.element(command('New quick terminal pane')).toHaveFocus()
    expect(harness.pathname()).toBe(settingsPath('shortcuts'))
    await command('New quick terminal pane').click()
    await userEvent.keyboard('{Control>}{Shift>}j{/Shift}{/Control}')
    await expect.element(command('New quick terminal pane')).toHaveFocus()

    await userEvent.keyboard('{Escape}')
    await expect.element(composer(), {timeout: 8000}).toBeVisible()
    await expect.element(gear()).toHaveFocus()
    await userEvent.keyboard('{Control>}{Shift>}k{/Shift}{/Control}')
    await expect.element(quickTerminal(), {timeout: 8000}).toBeVisible()
    await quickTerminal().getByRole('button', {name: 'Split pane', exact: true}).hover()
    await expect
      .element(page.getByRole('tooltip'), {timeout: 3000})
      .toHaveTextContent(`Split pane${formatForDisplay('Control+Shift+J')}`)

    harness.dispose()
    harness.mountShell(`${settingsPath('advanced')}?open=true`, [settingsProbe])
    await expect.element(probeValues(PROBE_CHANGED), {timeout: 8000}).toBeInTheDocument()
    await page.getByRole('button', {name: 'Reset extension settings', exact: true}).click()
    await expect.element(probeValues(PROBE_DEFAULTS)).toBeInTheDocument()

    await resetAll().click()
    await expect.element(resetDialog()).toBeVisible()
    await expect.element(resetDialog().getByRole('button', {name: 'Cancel'})).toHaveFocus()
    expect(harness.pathname()).toBe(settingsPath('advanced/reset'))
    await userEvent.keyboard('{Escape}')
    await expect.element(resetDialog()).not.toBeInTheDocument()
    expect(harness.pathname()).toBe(settingsPath('advanced'))
    await expect.element(probe('dark')).toBeInTheDocument()

    await resetAll().click()
    await resetDialog().getByRole('button', {name: 'Reset everything'}).click()
    await expect.element(page.getByRole('status').getByText('Settings reset')).toBeInTheDocument()
    await expect.element(resetDialog()).not.toBeInTheDocument()
    expect(harness.pathname()).toBe(settingsPath('advanced'))
    await expect.element(probe('light')).toBeInTheDocument()

    await tab('Advanced').click()
    await userEvent.keyboard('{Escape}')
    await expect.element(gear()).toHaveFocus()
    await expect.element(notesTab()).toBeVisible()

    harness.dispose()
    harness.mountShell(`${settingsPath('shortcuts')}?open=true`, [settingsProbe], {
      host: {quickTerminal: {hotkey: 'Control+Shift+K'}},
    })
    await expect.element(command('New quick terminal pane'), {timeout: 8000}).toBeVisible()
    await command('New quick terminal pane').click()
    await userEvent.keyboard('{Control>}{Shift>}k{/Shift}{/Control}')
    await expect.element(page.getByRole('status').getByText(/set by this project/)).toBeVisible()
    await expect.element(saveClash()).not.toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    await expect.element(page.getByRole('status').getByText(/set by this project/)).not.toBeInTheDocument()
    await expect.element(command('New quick terminal pane')).toHaveFocus()
  }, 60_000)
})

function pickerRouter(entry: string, view: () => JSX.Element) {
  const root = createRootRoute({
    validateSearch: sessionPickerSearchSchema,
    search: {middlewares: [stripSearchParams({sessionSearch: '', allProjects: false})]},
    component: view,
  })
  return createRouter({routeTree: root, history: createMemoryHistory({initialEntries: [entry]})})
}
