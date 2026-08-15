import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession} from './helpers/core-session.js'
import {createShellHarness} from './helpers/shell-harness.js'

const WHILE_HELD = {timeout: 700}

const core = {base: ''}
const harness = createShellHarness(() => core.base)

beforeAll(async () => {
  const booted = await coreControl.bootCore({id: 'route-boundary', allowedOrigins: [window.location.origin]})
  core.base = booted.base
}, 60_000)

afterAll(async () => {
  await coreControl.closeCore()
}, 30_000)

afterEach(harness.dispose)

const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const launcher = () => page.getByRole('button', {name: 'Open conciv chat'})
const routePending = () => page.getByRole('progressbar', {name: 'Loading conciv'})

async function openPanel(): Promise<void> {
  const sessionId = await createSession(coreRpc(core.base))
  harness.mountShell(`/panel/${sessionId}?open=true`)
}

test('the pane paints its composer while the element captures query is still in flight', async () => {
  const held = await coreControl.installFault({kind: 'gate', path: ['captures', 'list']})
  await openPanel()

  await expect.element(editor(), WHILE_HELD).toBeVisible()
  await expect.element(routePending(), WHILE_HELD).not.toBeInTheDocument()

  await coreControl.releaseFault(held)
}, 30_000)

test('the shell keeps its launcher while the session list query is still in flight', async () => {
  const held = await coreControl.installFault({kind: 'gate', path: ['sessions', 'list']})
  harness.mountShell('/')

  await expect.element(launcher(), WHILE_HELD).toBeVisible()
  await expect.element(routePending(), WHILE_HELD).not.toBeInTheDocument()

  await coreControl.releaseFault(held)
}, 30_000)

test('a pane whose queries all answer immediately never shows the route pending loader', async () => {
  await openPanel()

  await expect.element(editor(), WHILE_HELD).toBeVisible()
  await expect.element(routePending(), WHILE_HELD).not.toBeInTheDocument()
}, 30_000)

test('a slow beforeLoad reveals the route pending loader, then hands off to the pane', async () => {
  const held = await coreControl.installFault({kind: 'gate', path: ['sessions', 'resolve']})
  harness.mountShell('/panel/latest?open=true')

  await expect.element(routePending()).toBeVisible()

  await coreControl.releaseFault(held)

  await expect.element(editor(), {timeout: 8000}).toBeVisible()
  await expect.element(routePending()).not.toBeInTheDocument()
}, 30_000)
