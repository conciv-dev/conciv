import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {ChatPane} from '../src/pane/chat-pane.js'
import {installFakeCore, sessionRow, type FakeCore} from './helpers/fake-core.js'
import {mountPane, PANE_SESSION} from './helpers/pane-harness.js'

let core: FakeCore | null = null

afterEach(() => {
  core?.restore()
  core = null
})

const HISTORY_TRANSCRIPT = [
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      {
        type: 'tool-call',
        id: 'f1',
        name: 'page.fill',
        arguments: '{"selector":"#name","value":"Ada"}',
        state: 'complete',
      },
      {type: 'tool-result', toolCallId: 'f1', content: '{"ok":true,"value":"Ada"}', state: 'complete'},
      {
        type: 'tool-call',
        id: 'f2',
        name: 'page.fill',
        arguments: '{"selector":"#email","value":"ada@example.com"}',
        state: 'complete',
      },
      {type: 'tool-result', toolCallId: 'f2', content: '{"ok":true,"value":"ada@example.com"}', state: 'complete'},
      {type: 'text', content: 'The profile form is filled in.'},
    ],
  },
]

test('a reloaded transcript of page acts renders one aggregated session card with the reply', async () => {
  core = installFakeCore({sessions: [sessionRow({id: PANE_SESSION})], snapshotFor: () => HISTORY_TRANSCRIPT})
  mountPane(() => <ChatPane sessionId={PANE_SESSION} />)

  await expect.element(page.getByText('Edited the page'), {timeout: 5000}).toBeVisible()
  await expect.element(page.getByText('The profile form is filled in.')).toBeVisible()
  expect(page.getByText('Edited the page').elements()).toHaveLength(1)
  await expect.element(page.getByText('Typed')).not.toBeInTheDocument()
  await expect.element(page.getByText('Chain of Thought')).not.toBeInTheDocument()
})
