import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {ChatPane} from '../src/pane/chat-pane.js'
import {installFakeCore, sessionRow, type FakeCore} from './helpers/fake-core.js'
import {mountPane, PANE_SESSION} from './helpers/pane-harness.js'

let core: FakeCore | null = null

afterEach(() => {
  core?.restore()
  core = null
})

function mountChatPane(config: Parameters<typeof installFakeCore>[0] = {}): void {
  core = installFakeCore({sessions: [sessionRow({id: PANE_SESSION})], ...config})
  mountPane(() => <ChatPane sessionId={PANE_SESSION} />)
}

const input = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

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
