import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {ChatPane} from '../src/pane/chat-pane.js'
import {installFakeCore, sessionRow, type FakeCore, type FakeCoreConfig} from './helpers/fake-core.js'
import {mountPane, PANE_SESSION, type PaneMount} from './helpers/pane-harness.js'

let core: FakeCore | null = null

afterEach(() => {
  core?.restore()
  core = null
})

function mountChatPane(config: FakeCoreConfig = {}): PaneMount {
  core = installFakeCore({sessions: [sessionRow({id: PANE_SESSION})], ...config})
  return mountPane(() => <ChatPane sessionId={PANE_SESSION} />)
}

const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const removeGrab = () => page.getByRole('button', {name: 'Remove grabbed element'})

function draftWithGrab(text: string): FakeCoreConfig['draft'] {
  return {
    sessionId: PANE_SESSION,
    text: '',
    selectionStart: 0,
    selectionEnd: 0,
    grabs: [text],
    updatedAt: 1,
  }
}

async function startStreamingRun(): Promise<void> {
  mountChatPane({holdRun: true})
  await input().fill('first turn')
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByRole('button', {name: 'Stop generating'})).toBeVisible()
}

test('restores the server-side draft text and staged grabs when the pane mounts', async () => {
  mountChatPane({
    draft: {
      sessionId: PANE_SESSION,
      text: 'kept across the reload',
      selectionStart: 22,
      selectionEnd: 22,
      grabs: ['a grabbed heading'],
      updatedAt: 1,
    },
  })

  await expect.element(input()).toHaveTextContent('kept across the reload')
  await expect.element(page.getByText('a grabbed heading')).toBeVisible()
})

test('a rejected send keeps the draft in the composer and tells the user why', async () => {
  mountChatPane({rejectSend: true})

  await expect.element(input()).toBeVisible()
  await input().fill('a message the server refuses')
  await userEvent.keyboard('{Enter}')

  await expect
    .element(page.getByRole('region', {name: /Notifications/}))
    .toHaveTextContent(/Internal Server Error|could not be sent/)
  await expect.element(input()).toHaveTextContent('a message the server refuses')
})

test('sending drops the staged grab card at once, while the turn is still streaming', async () => {
  mountChatPane({holdRun: true, draft: draftWithGrab('the grabbed hero section')})

  await expect.element(removeGrab()).toBeVisible()
  await input().fill('explain the section I grabbed')
  await userEvent.keyboard('{Enter}')

  await expect.element(page.getByRole('button', {name: 'Stop generating'})).toBeVisible()
  await expect.element(removeGrab()).not.toBeInTheDocument()
})

test('a send the server refuses puts the staged grab card back', async () => {
  mountChatPane({rejectSend: true, draft: draftWithGrab('the grabbed hero section')})

  await expect.element(removeGrab()).toBeVisible()
  await input().fill('explain the section I grabbed')
  await userEvent.keyboard('{Enter}')

  await expect
    .element(page.getByRole('region', {name: /Notifications/}))
    .toHaveTextContent(/Internal Server Error|could not be sent/)
  await expect.element(removeGrab()).toBeVisible()
  await expect.element(page.getByText('the grabbed hero section')).toBeVisible()
})

test('a queued second send cannot cross-restore the grabs of the turn that failed', async () => {
  const mount = mountChatPane({holdRun: true, draft: draftWithGrab('the grabbed hero section')})

  await expect.element(page.getByText('the grabbed hero section')).toBeVisible()
  await input().fill('turn A')
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByRole('button', {name: 'Stop generating'})).toBeVisible()

  mount.pane.grabStore.stageAll([{text: 'the grabbed pricing table'}])
  await expect.element(page.getByText('the grabbed pricing table')).toBeVisible()
  await input().fill('turn B')
  await userEvent.keyboard('{Enter}')
  await expect.element(page.getByRole('button', {name: 'Remove from queue'})).toBeVisible()
  await expect.element(page.getByText('the grabbed pricing table')).not.toBeInTheDocument()

  core?.push({type: 'RUN_ERROR', threadId: 'conciv_1', runId: 'conciv_run_1', message: 'turn A failed'})

  await expect.element(page.getByText('the grabbed hero section')).toBeVisible()
  await expect.element(page.getByText('the grabbed pricing table')).not.toBeInTheDocument()
})

test('sending announces thinking and then the reply through the live region', async () => {
  mountChatPane()

  await expect.element(input()).toBeVisible()
  await input().fill('rename the widget package')
  await userEvent.keyboard('{Enter}')

  await expect.element(page.getByRole('log', {name: 'Announcements'})).toHaveTextContent('conciv is thinking…')
  await expect.element(page.getByRole('log', {name: 'Announcements'})).toHaveTextContent('conciv replied.')
})

test('the refresh affordance re-subscribes and shows the transcript the server re-leads', async () => {
  mountChatPane({
    snapshotFor: (subscribeIndex) =>
      subscribeIndex < 2
        ? []
        : [{id: 'a1', role: 'assistant', parts: [{type: 'text', content: 'the refreshed transcript'}]}],
  })

  await expect.element(input()).toBeVisible()
  await page.getByRole('button', {name: 'Refresh the conversation'}).click()

  await expect.element(page.getByText('the refreshed transcript')).toBeVisible()
})

test('the refresh affordance is disabled while the run streams', async () => {
  mountChatPane({holdRun: true})

  await expect.element(input()).toBeVisible()
  await input().fill('start a run')
  await userEvent.keyboard('{Enter}')

  await expect.element(page.getByRole('button', {name: 'Stop generating'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Refresh the conversation'})).toBeDisabled()
})

test('the initial load shows a conversation skeleton until the snapshot arrives', async () => {
  mountChatPane({holdSnapshot: true})

  await expect.element(page.getByRole('status', {name: 'Loading conversation'})).toBeVisible()

  core?.releaseSnapshot()

  await expect.element(page.getByText('How can I help you today?')).toBeVisible()
  await expect.element(page.getByRole('status', {name: 'Loading conversation'})).not.toBeInTheDocument()
})

test('the trailing control morphs from send to a single stop button while streaming, and back once the run stops', async () => {
  mountChatPane({holdRun: true})

  await expect.element(page.getByRole('button', {name: 'Send message'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Stop generating'})).not.toBeInTheDocument()

  await input().fill('start a run')
  await userEvent.keyboard('{Enter}')

  await expect.element(page.getByRole('button', {name: 'Stop generating'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Send message'})).not.toBeInTheDocument()

  await page.getByRole('button', {name: 'Stop generating'}).click()

  await expect.element(page.getByRole('button', {name: 'Send message'})).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Stop generating'})).not.toBeInTheDocument()
})

test('Enter while streaming queues the draft instead of sending or stopping', async () => {
  await startStreamingRun()

  await input().fill('a queued follow-up')
  await userEvent.keyboard('{Enter}')

  await expect.element(page.getByText('a queued follow-up')).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Stop generating'})).toBeVisible()
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

  await page.getByRole('button', {name: 'Stop generating'}).click()

  await expect.element(page.getByRole('button', {name: 'Remove from queue'})).not.toBeInTheDocument()
  await expect.element(page.getByText(/alpha step[\s\S]*bravo step/)).toBeVisible()
})

test('clicking stop with an empty queue just stops the run', async () => {
  await startStreamingRun()

  await page.getByRole('button', {name: 'Stop generating'}).click()

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
  await expect.element(page.getByRole('button', {name: 'Stop generating'})).toBeVisible()
  await expect.element(input()).toHaveTextContent('draft kept in place')
})

test('Escape outside the composer does not stop the run', async () => {
  await startStreamingRun()

  await userEvent.click(page.getByRole('log', {name: 'Announcements'}))
  await userEvent.keyboard('{Escape}')

  await expect.element(page.getByRole('button', {name: 'Stop generating'})).toBeVisible()
})

test('a new-session divider does not flash before the transcript snapshot hydrates', async () => {
  mountChatPane({
    holdSnapshot: true,
    markers: [{id: 'marker-1', sessionId: PANE_SESSION, afterTurn: 0, kind: 'new'}],
    snapshotFor: () => [
      {id: 'u1', role: 'user', parts: [{type: 'text', content: 'restart with a clean slate'}]},
      {id: 'a1', role: 'assistant', parts: [{type: 'text', content: 'starting a fresh session'}]},
    ],
  })

  await expect.element(page.getByRole('status', {name: 'Loading conversation'})).toBeVisible()
  await core?.idle()
  await expect.element(page.getByRole('separator', {name: 'New session'})).not.toBeInTheDocument()

  core?.releaseSnapshot()

  await expect.element(page.getByText('starting a fresh session')).toBeVisible()
  await expect.element(page.getByRole('separator', {name: 'New session'})).toBeVisible()
  await expect.element(page.getByRole('status', {name: 'Loading conversation'})).not.toBeInTheDocument()
})
