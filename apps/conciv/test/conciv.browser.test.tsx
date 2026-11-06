import '../src/styles.css'
import {expect, test, vi, it, afterEach, describe} from 'vitest'
import {page, userEvent, page as browserPage} from 'vitest/browser'
import {CONCIV_SESSION_HEADER, HarnessSessionId, type ReasoningEffort} from '@conciv/protocol/chat-types'
import {makeRpcClient, type RpcClient, type EngineStaleness} from '@conciv/contract'
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
import {render} from '@solidjs/testing-library'
import {type JSX, createSignal, onMount, type Component, createMemo, createRoot, For, Show} from 'solid-js'
import {createStore} from 'solid-js/store'
import {
  AttachmentByMime,
  ChatProvider,
  Composer,
  ComposerHandlersProvider,
  useComposerContext,
  type AttachmentAdapter,
  ComposerActions as ComposerActionsPrimitive,
  ComposerActionsHost,
  type SessionStatus,
  useComposer,
  createTextAttachmentAdapter,
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
} from '@conciv/extension'
import {paneAttachments, returnUnsentToDraft} from '../src/pane/pane-attachments.js'
import type {ContentPart, ToolCallPart, ToolResultPart} from '@conciv/protocol/chat-message-types'
import {INERT_TOOL_CTX, ToolCallCard} from '@conciv/ui-kit-chat/tools'
import {builtinToolCards} from '@conciv/ui-kit-chat-tools'
import {concivToolCards} from '@conciv/tools/cards'
import pageExtensionEntry from '@conciv/extension-page'
import pageExtension from '@conciv/extension-page/client'
import {GRAB_FILE_NAME} from '@conciv/grab/grab-attachment'
import type {Grab, GrabApi} from '@conciv/grab'
import {QueueStrip} from '../src/pane/queue-strip.js'
import type {UsageSnapshot} from '@conciv/protocol/usage-types'
import {ContextTracker} from '../src/pane/context-tracker.js'
import '@conciv/ui-kit-system/tokens.css'
import {EngineStaleNotice} from '../src/shell/engine-notice.js'
import {makePaneGrabApi} from '../src/extension/pane-grab.js'
import {createNoticeStore, type Notify} from '../src/shell/notices.js'
import {HostApiProvider} from '@conciv/extension/host'
import {ComposerActions} from '../src/composer/actions.js'
import {
  createChat,
  createChatSession,
  type ChatSession,
  type ChatSessionConnection,
  type ChatSessionHydration,
} from '@conciv/ai/client'
import type {ComposerInputHandle} from '../src/pane/composer-input-adapter.jsx'
import {createTextChunks, storyConnection} from '@conciv/ai/testkit'
import {EngineReachabilityContext} from '../src/app/reachability.js'
import {PaneComposer} from '../src/pane/pane-composer.jsx'
import type {RunClockSource} from '@conciv/protocol/chat-event-types'
import {SessionSelector} from '../src/composer/session-selector.js'
import {StatusBar} from '../src/pane/status-bar.jsx'
import type {ToolCardEntry} from '@conciv/protocol/tool-view-types'
import {coreToolCards, EXECUTE_TOOL_NAME} from '@conciv/core/cards'
import {concivExtensionsToolDef, concivUiToolDef} from '@conciv/tools/defs'
import {BUILTIN_OPEN_TOOL, BUILTIN_SERVER_TOOLS} from '@conciv/tools/builtins'
import {createToolRegistry} from '@conciv/extension/registry'
import {PAGE_TOOL_DEFS} from '@conciv/extension-page/defs'

const PNG_PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

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
    const mount = mountPane({base: core(), sessionId, ...options}, (pane) => {
      const queue = createMemo(() => pane.chat().queue())
      return (
        <>
          <ChatProvider chat={pane.chat()}>
            <QueueStrip queue={queue()} />
          </ChatProvider>
          <ChatPane sessionId={sessionId} />
        </>
      )
    })
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

  test('Escape in the focused composer does what the stop button does and leaves the draft untouched', async () => {
    await startStreamingRun()

    await input().fill('queued while running')
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByRole('button', {name: 'Remove from queue'})).toBeVisible()

    await input().fill('draft kept in place')
    await userEvent.keyboard('{Escape}')

    await expect.element(page.getByRole('button', {name: 'Remove from queue'})).not.toBeInTheDocument()
    await expect.element(page.getByText('queued while running')).toBeVisible()
    await expect.element(input()).toHaveTextContent('draft kept in place')
    await expect.element(page.getByText(UNSCRIPTED_REPLY).nth(1)).toBeVisible()
    await coreControl.releaseTurn()
    await expect.element(stopButton()).not.toBeInTheDocument()
  })
})

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
      expect(host.textContent).toContain('778K')
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

    await expect
      .element(page.getByRole('alert'))
      .toHaveTextContent(
        'Engine is running outdated code: the server code on disk is newer than the running engine. Restart the dev server.Dismiss',
      )
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

  test('the menu of a harness with no models keeps focus in its search while the session list refreshes', async () => {
    const rpc = coreRpc(core())
    const sessionId = await createSession(rpc)
    await rpc.sessions.switchHarness({sessionId, harnessId: 'gamma'})
    await rpc.sessions.rename({sessionId, title: 'Listed before the menu'})
    shell.mountShell(`/panel/${sessionId}?open=true`)
    await expect.element(page.getByText('Listed before the menu').first()).toBeVisible()

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
        <SessionSelector variant="pill" activeId={() => activeId} onActivate={() => {}} onNewSession={() => {}} />
      )),
    )

    await page.getByRole('button', {name: 'Session: an alpha session'}).click()

    await expect.element(page.getByRole('option', {name: /^an alpha session, .*· Alpha/})).toBeVisible()
    await expect.element(page.getByRole('option', {name: /^a beta session, .*· Beta/})).toBeVisible()
  })
})

describe('launch actions', () => {
  const CONNECT_COMMAND_PATH = ['ext', 'terminal', 'connectCommand']
  const LAUNCH_PATH = ['ext', 'terminal', 'launch']
  const STALE_API_BASE = 'http://127.0.0.1:1'

  const core = bootedCore('launch-actions', {displayName: 'Claude', connect: true, terminal: true, resume: true})
  const keep = keptPane()
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

  afterEach(async () => {
    await coreControl.setTerminalLaunch(true)
  })

  async function mountActions(): Promise<void> {
    const sessionId = await createSession(coreRpc(core()))
    keep(
      mountPane({base: core(), sessionId}, () => (
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
      )),
    )
  }

  async function openMenu(): Promise<void> {
    await page.getByRole('button', {name: 'Terminal options for Claude'}).click()
  }

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

  test('after a rebind, opening externally reaches the engine the widget is bound to, not the page api base it booted on', async () => {
    window.__CONCIV_API_BASE__ = STALE_API_BASE
    try {
      await mountActions()
      const before = await coreControl.terminalLaunches()

      await openMenu()
      await page.getByText('Open in Claude').click()

      await expect.element(page.getByText('Opened in Claude.')).toBeVisible()
      expect((await coreControl.terminalLaunches()) - before).toBe(1)
    } finally {
      delete window.__CONCIV_API_BASE__
    }
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

describe('panel refresh', () => {
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

  test('a session list still loading never hides the title or the view tabs behind skeletons', async () => {
    const rpc = coreRpc(coreBase())
    const sessionId = await createSession(rpc)
    await coreControl.scriptTurn({toolCalls: [], text: REPLY_TEXT})
    await runTurn(coreBase(), sessionId, 'seed the transcript')
    const gate = await faults.install({kind: 'gate', path: ['sessions', 'list']})
    harness.mountShell(`/panel/${sessionId}?open=true`)
    await coreControl.awaitFaultPending(gate, 1)

    await expect.element(reply(), {timeout: 8000}).toBeVisible()
    await expect.element(page.getByRole('banner').getByText('New session', {exact: true})).toBeVisible()
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
      await page.getByRole('button', {name: 'Session options'}).click()
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

  const EMPTY_HYDRATION: ChatSessionHydration = {messages: [], messageHarness: {}, lastRun: null, pendingApprovals: []}

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
  const CREATE_PATH = ['sessions', 'create']

  const core = bootedCore('quick-add-pane')
  const harness = createShellHarness(core)
  const faults = trackedFaults()

  afterEach(harness.dispose)

  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const closePane = () => page.getByRole('button', {name: 'Close pane'})
  const splitPane = () => page.getByRole('button', {name: 'Split pane (Mod+D)'})
  const sessionTrigger = () => page.getByRole('button', {name: /^Session: /})

  const sessionIdsOf = async (rpc: RpcClient): Promise<string[]> => (await rpc.sessions.list()).map((row) => row.id)

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

  test('the magic link logs in on load and is removed from the URL', async () => {
    const code = await coreControl.requestCode()
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#conciv_otp=${code}`)
    harness.mountShell('/', [], {login: {apiBase: origin()}})
    await expect.poll(() => localStorage.getItem(storageKey())).not.toBeNull()
    await expect.element(opener()).toBeVisible()
    expect(window.location.hash).toBe('')
  })

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
    await page.getByRole('button', {name: 'Session options'}).click()
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

  const core = bootedCore('session-selector', {
    resume: true,
    history: [{id: EXTERNAL_ID, derivedTitle: 'a session mid-run', updatedAt: Date.now(), messageCount: 3}],
  })
  const keep = keptPane()

  afterEach(async () => {
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
    const rpc = coreRpc(core())
    const activeId = (await rpc.sessions.create()).sessionId
    await rpc.sessions.rename({sessionId: activeId, title: 'the active session'})
    const externalId = await adoptExternalSession(rpc)
    await coreControl.holdTurn()
    await sendTurn(core(), externalId, 'keep this session busy')
    keep(
      mountPane({base: core(), sessionId: activeId}, () => (
        <SessionSelector variant="pill" activeId={() => activeId} onActivate={() => {}} onNewSession={() => {}} />
      )),
    )
  }

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
