import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {ChatPane} from '../src/pane/chat-pane.js'
import {installFakeCore, sessionRow, type FakeCore} from './helpers/fake-core.js'
import {mountPane, PANE_SESSION} from './helpers/pane-harness.js'

const disposers: (() => void)[] = []
let core: FakeCore | null = null

afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  core?.restore()
  core = null
})

function mountChatPane(config: Parameters<typeof installFakeCore>[0] = {}): void {
  core = installFakeCore({sessions: [sessionRow({id: PANE_SESSION})], ...config})
  const mounted = mountPane(() => <ChatPane sessionId={PANE_SESSION} />)
  disposers.push(mounted.dispose)
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

test('the composer is present and typeable before the persisted draft resolves', async () => {
  mountChatPane({
    holdDraft: true,
    draft: {
      sessionId: PANE_SESSION,
      text: 'the draft still in flight',
      selectionStart: 24,
      selectionEnd: 24,
      grabs: [],
      updatedAt: 1,
    },
  })

  await expect.element(input()).toBeVisible()
  await input().click()
  await userEvent.keyboard('typed before the draft landed')

  await expect.element(input()).toHaveTextContent('typed before the draft landed')
})

test('a draft that resolves late never clobbers what the user already typed', async () => {
  mountChatPane({
    holdDraft: true,
    draft: {
      sessionId: PANE_SESSION,
      text: 'the stale server draft',
      selectionStart: 22,
      selectionEnd: 22,
      grabs: ['a grabbed heading'],
      updatedAt: 1,
    },
  })

  await expect.element(input()).toBeVisible()
  await input().click()
  await userEvent.keyboard('what the user actually wants')
  core?.releaseDraft()
  await core?.idle()

  await expect.element(page.getByText('the stale server draft')).not.toBeInTheDocument()
  await expect.element(page.getByText('a grabbed heading')).not.toBeInTheDocument()
  await expect.element(input()).toHaveTextContent('what the user actually wants')
})

test('a draft that resolves late hydrates the composer the user has not touched', async () => {
  mountChatPane({
    holdDraft: true,
    draft: {
      sessionId: PANE_SESSION,
      text: 'kept across the reload',
      selectionStart: 22,
      selectionEnd: 22,
      grabs: ['a grabbed heading'],
      updatedAt: 1,
    },
  })

  await expect.element(input()).toBeVisible()
  await input().click()
  core?.releaseDraft()

  await expect.element(input()).toHaveTextContent('kept across the reload')
  await expect.element(page.getByText('a grabbed heading')).toBeVisible()

  await userEvent.keyboard('!')
  await expect.element(input()).toHaveTextContent('kept across the reload!')
})

test('tells the user when the saved draft could not be loaded and restores it on retry', async () => {
  mountChatPane({
    failDraft: 2,
    draft: {
      sessionId: PANE_SESSION,
      text: 'kept across the reload',
      selectionStart: 22,
      selectionEnd: 22,
      grabs: [],
      updatedAt: 1,
    },
  })

  await expect
    .element(page.getByRole('alert'), {timeout: 4000})
    .toHaveTextContent('Your saved draft could not be loaded.')
  await expect.element(input()).toBeVisible()

  await page.getByRole('button', {name: 'Retry'}).click()

  await expect.element(input()).toHaveTextContent('kept across the reload')
  await expect.element(page.getByRole('alert')).not.toBeInTheDocument()
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
