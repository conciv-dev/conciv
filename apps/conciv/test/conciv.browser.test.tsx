import '../src/styles.css'
import {expect, test, vi, it, afterEach, describe} from 'vitest'
import {page, userEvent, page as browserPage} from 'vitest/browser'
import {CONCIV_SESSION_HEADER, HarnessSessionId} from '@conciv/protocol/chat-types'
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
import {QueryClient} from '@tanstack/solid-query'
import {hubFor} from '../src/app/devframe-link.js'
import {makeAppData} from '../src/data/app-data.js'
import {type JSX, createSignal, onMount, type Component, createMemo, createRoot, For, Show} from 'solid-js'
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
  const HYDRATE_PATH = ['chat', 'hydrate']
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
    const gate = await faults.install({kind: 'gate', path: HYDRATE_PATH})
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
    await expect.element(stopButton()).toBeVisible()
    await expect.element(input()).toHaveTextContent('draft kept in place')
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

describe('launch actions', () => {
  const CONNECT_COMMAND_PATH = ['ext', 'terminal', 'connectCommand']
  const LAUNCH_PATH = ['ext', 'terminal', 'launch']

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
  const RESOLVE = ['conciv:sessions:resolve']

  const core = bootedCore('panel-connect')
  const harness = createShellHarness(core)
  const faults = trackedFaults()

  afterEach(harness.dispose)

  const mountShell = (): void => harness.mountShell('/panel/connect?open=true', [connectProbe])

  const simulateFound = () => page.getByRole('button', {name: 'Simulate found'})
  const bindFailure = () => page.getByText(/conciv couldn.t connect to that workspace/)
  const serverError = () => page.getByText('fault injected: INTERNAL_SERVER_ERROR')
  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

  test('a bind that fails with a transport failure shows the connect failure screen, and retrying against a healthy engine hands off to the panel', async () => {
    const unreachable = await faults.install({kind: 'hub-abort', names: RESOLVE})
    mountShell()

    await simulateFound().click()

    await expect.element(bindFailure(), {timeout: 8000}).toBeVisible()
    await expect.element(page.getByRole('button', {name: 'Retry'})).toBeVisible()

    await expectRetryRecovers(() => coreControl.releaseFault(unreachable), editor, bindFailure)
  }, 30_000)

  test('a bind that fails with a server error shows the actual error, not the workspace-unreachable message', async () => {
    const refused = await faults.install({kind: 'hub-fail', names: RESOLVE, code: 'INTERNAL_SERVER_ERROR'})
    mountShell()

    await expect.element(simulateFound(), {timeout: 8000}).toBeVisible()
    await simulateFound().click()

    await expect.element(serverError(), {timeout: 8000}).toBeVisible()
    await expect.element(bindFailure()).not.toBeInTheDocument()

    await expectRetryRecovers(() => coreControl.releaseFault(refused), editor, serverError)
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
  }, 30_000)

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

    const held = await faults.install({kind: 'hub-gate', names: ['conciv:sessions:create']})
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
  const core = bootedCore('quick-refresh')
  const harness = createShellHarness(core)
  const faults = trackedFaults()

  afterEach(harness.dispose)

  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const refresh = () => page.getByRole('button', {name: 'Refresh the conversation'})

  test('the quick terminal pane bar carries refresh while the composer is still loading', async () => {
    const sessionId = await createSession(coreRpc(core()))
    const gate = await faults.install({kind: 'hub-gate', names: ['conciv:drafts:get']})
    harness.mountShell(`/quick?panes=${sessionId}&focus=0`)

    await expect.element(refresh(), {timeout: 8000}).toBeVisible()
    await coreControl.awaitFaultPending(gate, 1)
    await expect.element(editor()).not.toBeInTheDocument()

    await coreControl.releaseFault(gate)

    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    await expect.element(refresh()).toBeVisible()
  }, 30_000)
})

describe('session markers', () => {
  const core = bootedCore('session-markers')
  const harness = createShellHarness(core)
  const faults = trackedFaults()

  afterEach(harness.dispose)

  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const newSessionLine = () => page.getByRole('separator', {name: 'New session'})

  test('the new session divider waits for the marker list the hub serves', async () => {
    const sessionId = await createSession(coreRpc(core()))
    const gate = await faults.install({kind: 'hub-gate', names: ['conciv:markers:list']})
    harness.mountShell(`/panel/${sessionId}?open=true`)

    await expect.element(editor(), {timeout: 8000}).toBeVisible()
    await coreControl.awaitFaultPending(gate, 1)
    await expect.element(newSessionLine()).not.toBeInTheDocument()

    await coreControl.releaseFault(gate)

    await expect.element(newSessionLine(), {timeout: 8000}).toBeVisible()
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
  const serverError = () => page.getByText('fault injected: INTERNAL_SERVER_ERROR')

  async function openSessionPanel(options: ShellMountOptions = {}): Promise<void> {
    const sessionId = await createSession(coreRpc(core()))
    harness.mountShell(`/panel/${sessionId}?open=true`, [], options)
    await expect.element(editor(), {timeout: 8000}).toBeVisible()
  }

  test('a server error while resolving /panel/latest shows the actual error, not the unreachable message', async () => {
    const refused = await faults.install({
      kind: 'hub-fail',
      names: ['conciv:sessions:resolve'],
      code: 'INTERNAL_SERVER_ERROR',
    })
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

describe('route boundary', () => {
  const core = bootedCore('route-boundary')
  const harness = createShellHarness(core)
  const faults = trackedFaults()

  afterEach(harness.dispose)

  const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
  const routePending = () => page.getByRole('progressbar', {name: 'Loading conciv'})

  test('a slow beforeLoad reveals the route pending loader, then hands off to the pane', async () => {
    const held = await faults.install({kind: 'hub-gate', names: ['conciv:sessions:resolve']})
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

describe('sessions over the hub', () => {
  const core = bootedCore('sessions-hub')
  const harness = createShellHarness(core)
  const faults = trackedFaults()

  afterEach(harness.dispose)

  async function titledSession(rpc: RpcClient, title: string): Promise<string> {
    const {sessionId} = await rpc.sessions.create()
    await rpc.sessions.rename({sessionId, title})
    return sessionId
  }

  test('a rename the hub refuses announces the failure', async () => {
    const sessionId = await titledSession(coreRpc(core()), 'before the refusal')
    await faults.install({kind: 'hub-fail', names: ['conciv:sessions:rename']})
    harness.mountShell(`/quick?panes=${sessionId}&focus=0`)

    await page.getByRole('button', {name: 'Session: before the refusal'}).click()
    await page.getByRole('button', {name: 'Rename current session'}).click()
    await page.getByRole('textbox', {name: 'Rename session'}).fill('refused title')
    await userEvent.keyboard('{Enter}')

    await expect.element(page.getByRole('alert').filter({hasText: 'Rename failed'})).toBeInTheDocument()
  })

  test('a sessions call while the engine refuses fails with the attempt in flight', async () => {
    const deadBase = 'http://127.0.0.1:1/conciv'
    const hub = hubFor(deadBase)
    const data = makeAppData(makeRpcClient(deadBase), {connection: () => hub, connected: () => true}, new QueryClient())
    try {
      await expect(data.rpc.sessions.list({includeHidden: true})).rejects.toMatchObject({code: 'DISCONNECTED'})
      await expect(data.rpc.sessions.list({includeHidden: true})).rejects.toMatchObject({code: 'DISCONNECTED'})
      hub.close()
      await expect(data.rpc.sessions.list({includeHidden: true})).rejects.toMatchObject({code: 'DISCONNECTED'})
    } finally {
      hub.close()
    }
  }, 5_000)

  test('the open selector follows a rename and a delete made elsewhere', async () => {
    const rpc = coreRpc(core())
    const activeId = await titledSession(rpc, 'the open session')
    const otherId = await titledSession(rpc, 'renamed elsewhere soon')
    harness.mountShell(`/quick?panes=${activeId}&focus=0`)

    await page.getByRole('button', {name: 'Session: the open session'}).click()
    await expect.element(page.getByRole('option', {name: /^renamed elsewhere soon/})).toBeVisible()

    await rpc.sessions.rename({sessionId: otherId, title: 'renamed elsewhere'})
    await expect.element(page.getByRole('option', {name: /^renamed elsewhere,/})).toBeVisible()

    await rpc.sessions.delete({sessionId: otherId})
    await expect.element(page.getByRole('option', {name: /^renamed elsewhere,/})).not.toBeInTheDocument()
    await expect.element(page.getByRole('option', {name: /^the open session/})).toBeVisible()
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

    it('locks the tabs the leave guard blocks while keeping the active one reachable', async () => {
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
