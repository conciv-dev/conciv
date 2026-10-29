import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {page, userEvent} from 'vitest/browser'
import {ChatPane} from '../src/pane/chat-pane.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession, runTurn} from './helpers/core-session.js'
import {mountPane, type PaneMount} from './helpers/pane-harness.js'

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
  await expect.element(page.getByText('Chain of Thought')).not.toBeInTheDocument()
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
