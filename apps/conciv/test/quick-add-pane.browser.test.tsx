import './helpers/utilities.css'
import {afterEach, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {createShellHarness} from './helpers/shell-harness.js'
import {sessionRow} from './helpers/fake-core.js'
import {expectRetryRecovers} from './helpers/retry-recovery.js'

const PANEL_SESSION = 'conciv_1'
const harness = createShellHarness(PANEL_SESSION)
const mountShell = (config: Parameters<typeof harness.mountShell>[1] = {}): void => harness.mountShell('/quick', config)

afterEach(harness.dispose)

const startFailure = () => page.getByText(/conciv could not start a pane/)
const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

test('a quick terminal pane that fails to start shows a retry action', async () => {
  mountShell({resolveRejects: true})

  await expect.element(startFailure(), {timeout: 8000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Retry'})).toBeVisible()
})

test('retrying a failed quick terminal pane against a healthy engine starts it', async () => {
  mountShell({resolveRejects: true})
  await expect.element(startFailure(), {timeout: 8000}).toBeVisible()

  await expectRetryRecovers(() => harness.core()?.setResolveRejects(false), editor, startFailure)
})

test('rapid double-trigger creates exactly one pane', async () => {
  harness.mountShell('/quick?panes=conciv_1&focus=0', {
    sessions: [sessionRow({id: 'conciv_1'})],
    delays: {'/rpc/sessions/resolve': 300},
  })
  await expect.element(editor(), {timeout: 8000}).toBeVisible()

  const splitButton = page.getByRole('button', {name: 'Split pane (Mod+D)'})
  const firstClick = splitButton.click()
  const secondClick = splitButton.click()
  await Promise.all([firstClick, secondClick])

  await harness.core()?.idle()
  const addPaneCalls = harness
    .core()
    ?.calls.filter((call) => call.path === '/rpc/sessions/resolve' && Object.keys(call.body ?? {}).length === 0).length
  expect(addPaneCalls).toBe(1)
})
