import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {createMemo} from 'solid-js'
import type {DraftRow, RpcClient} from '@conciv/contract'
import {until} from '@conciv/harness-testkit/until'
import pageExtension from '@conciv/extension-page/client'
import {GRAB_FILE_NAME, GRAB_MIME} from '@conciv/grab/grab-attachment'
import type {Grab} from '@conciv/grab'
import {ChatProvider} from '@conciv/ui-kit-chat'
import {ChatPane} from '../src/pane/chat-pane.js'
import {QueueStrip} from '../src/pane/queue-strip.js'
import {RefreshButton} from '../src/shell/refresh-button.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession, openTranscriptStream, runTurn, seedDraft, sendTurn} from './helpers/core-session.js'
import {
  grabProviderFor,
  HERO_GRAB,
  HERO_LABEL,
  persistedGrab,
  PRICING_GRAB,
  PRICING_LABEL,
} from './helpers/grab-fixtures.js'
import {mountPane, type PaneMount, type PaneMountOptions} from './helpers/pane-harness.js'
import {trackedFaults} from './helpers/tracked-faults.js'

const SEND_PATH = ['chat', 'send']
const SUBSCRIBE_PATH = ['chat', 'subscribe']

const core = {base: ''}
const active: {pane: PaneMount | null} = {pane: null}
const faults = trackedFaults()

beforeAll(async () => {
  const booted = await coreControl.bootCore({id: 'chat-pane', allowedOrigins: [window.location.origin]})
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
  options: Pick<PaneMountOptions, 'grabProvider' | 'extensions'> = {},
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
const skeleton = () => page.getByRole('status', {name: 'Loading conversation'})
const narration = () => page.getByText('Responding…', {exact: true})

async function pickGrabFromOverflow(): Promise<void> {
  await userEvent.click(overflowTrigger())
  await userEvent.click(grabItem())
}

async function stageGrabThroughComposer(): Promise<void> {
  await expect.element(input()).toBeVisible()
  await pickGrabFromOverflow()
  await expect.element(snapshot()).toBeVisible()
  await expect.element(page.getByText(HERO_LABEL)).toBeVisible()
}

async function sendWithStagedGrab(): Promise<void> {
  const {sessionId} = await newSession()
  mountChatPane(sessionId, grabOptions(HERO_GRAB))
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
  await expect.element(page.getByText(HERO_LABEL)).toBeVisible()
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
  await expect.element(page.getByText(HERO_LABEL)).toBeVisible()
})

test('a rejected send keeps the draft in the composer and tells the user why', async () => {
  const {sessionId} = await newSession()
  await faults.install({kind: 'fail', path: SEND_PATH, status: 500})
  mountChatPane(sessionId)

  await expect.element(input()).toBeVisible()
  await input().fill('a message the server refuses')
  await userEvent.keyboard('{Enter}')

  await expect.element(notifications()).toHaveTextContent(/Internal Server Error|could not be sent/)
  await expect.element(input()).toHaveTextContent('a message the server refuses')
})

test('sending drops the staged grab card at once, while the turn is still streaming', async () => {
  await coreControl.holdTurn()
  await sendWithStagedGrab()

  await expect.element(stopButton()).toBeVisible()
  await expect.element(removeGrab()).not.toBeInTheDocument()
})

test('a send the server refuses puts the staged grab card back', async () => {
  await faults.install({kind: 'fail', path: SEND_PATH, status: 500})
  await sendWithStagedGrab()

  await expect.element(notifications()).toHaveTextContent(/Internal Server Error|could not be sent/)
  await expect.element(removeGrab()).toBeVisible()
  await expect.element(page.getByText(HERO_LABEL).last()).toBeVisible()
})

test('a send that throws at the transport puts the staged grab card back', async () => {
  await faults.install({kind: 'abort', path: SEND_PATH})
  await sendWithStagedGrab()

  await expect.element(notifications()).toHaveTextContent(/could not be sent|fetch/)
  await expect.element(removeGrab()).toBeVisible()
  await expect.element(page.getByText(HERO_LABEL).last()).toBeVisible()
})

test('a queued second send cannot cross-restore the grabs of the turn that failed', async () => {
  const {rpc, sessionId} = await newSession()
  await seedDraft(rpc, sessionId, {attachments: [persistedGrab('grab-1', HERO_GRAB)]})
  await coreControl.holdTurn()
  mountChatPane(sessionId, grabOptions(PRICING_GRAB))

  await expect.element(page.getByText(HERO_LABEL)).toBeVisible()
  await input().fill('turn A')
  await userEvent.keyboard('{Enter}')
  await expect.element(stopButton()).toBeVisible()

  await pickGrabFromOverflow()
  await expect.element(page.getByText(PRICING_LABEL)).toBeVisible()
  await input().fill('turn B')
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByRole('button', {name: 'Remove from queue'})).toBeVisible()
  await expect.element(page.getByText(PRICING_LABEL)).not.toBeInTheDocument()

  await coreControl.scriptError('turn A failed')
  await coreControl.releaseTurn()

  await expect.element(removeGrab()).toBeVisible()
  await expect.element(page.getByText(HERO_LABEL).last()).toBeVisible()
  await expect.element(page.getByText(PRICING_LABEL)).not.toBeInTheDocument()
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

test('a pane that joins a run another client already started narrates it, and stops when it ends', async () => {
  const {rpc, sessionId} = await newSession()
  await coreControl.holdTurn()
  await sendTurn(rpc, sessionId, 'a turn driven from another client')

  mountChatPane(sessionId)

  await expect.element(input()).toBeVisible()
  await expect.element(narration()).toBeVisible()
  await page.screenshot({path: '__screenshots__/chat-pane/now-line-joins-remote-run.png'})

  await coreControl.releaseTurn()

  await expect.element(narration()).not.toBeInTheDocument()
})

test('the refresh affordance re-subscribes and shows the transcript the server re-leads', async () => {
  const {rpc, sessionId} = await newSession()
  mountChatPane(sessionId)
  await expect.element(page.getByText('How can I help you today?')).toBeVisible()

  const stream = await openTranscriptStream(rpc, sessionId)
  const gate = await faults.install({kind: 'gate', path: SUBSCRIBE_PATH})
  await page.getByRole('button', {name: 'Refresh the conversation'}).click()

  await coreControl.scriptTurn({toolCalls: [], text: 'the refreshed transcript'})
  await sendTurn(rpc, sessionId, 'lead the transcript from the server')
  await stream.awaitTurnEnd()
  stream.close()
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
  const gate = await faults.install({kind: 'gate', path: SUBSCRIBE_PATH})
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
  const {rpc, sessionId} = await newSession()
  await coreControl.scriptTurn({toolCalls: [], text: 'starting a fresh session'})
  await runTurn(rpc, sessionId, 'restart with a clean slate')
  const gate = await faults.install({kind: 'gate', path: SUBSCRIBE_PATH})
  const mount = mountChatPane(sessionId)

  await expect.element(skeleton()).toBeVisible()
  await mount.queryClient.ensureQueryData(mount.data.utils.markers.list.queryOptions({input: {sessionId}}))
  await expect.element(page.getByRole('separator', {name: 'New session'})).not.toBeInTheDocument()

  await coreControl.releaseFault(gate)

  await expect.element(page.getByText('starting a fresh session')).toBeVisible()
  await expect.element(page.getByRole('separator', {name: 'New session'})).toBeVisible()
  await expect.element(skeleton()).not.toBeInTheDocument()
})
