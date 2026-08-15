import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test, vi} from 'vitest'
import {page} from 'vitest/browser'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession} from './helpers/core-session.js'
import {createShellHarness} from './helpers/shell-harness.js'
import {trackedFaults} from './helpers/tracked-faults.js'

const SETTLED = {timeout: 1500}

const core = {base: ''}
const harness = createShellHarness(() => core.base)
const faults = trackedFaults()

beforeAll(async () => {
  const booted = await coreControl.bootCore({id: 'panel-focus-stability', allowedOrigins: [window.location.origin]})
  core.base = booted.base
}, 60_000)

afterAll(async () => {
  await coreControl.closeCore()
}, 30_000)

afterEach(harness.dispose)

const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

async function openPanel(): Promise<void> {
  const sessionId = await createSession(coreRpc(core.base))
  harness.mountShell(`/panel/${sessionId}?open=true`)
}

async function expectFocusSurvives(path: string[]): Promise<void> {
  const since = await coreControl.rpcMark()
  const held = await faults.install({kind: 'gate', path})
  await openPanel()
  await vi.waitUntil(async () => (await coreControl.faultPending(held)) > 0, {timeout: 5000, interval: 20})

  await coreControl.releaseFault(held)

  await expect.element(editor(), SETTLED).toBeVisible()
  const mountedNode = editor().element()
  await coreControl.awaitRpcCall(path, since)

  await expect.element(editor(), SETTLED).toHaveFocus()
  expect(editor().element().isSameNode(mountedNode)).toBe(true)
}

test('a composer that mounts after a slow draft load keeps the focus the panel gave it', async () => {
  await expectFocusSurvives(['drafts', 'get'])
}, 30_000)

test('a composer that mounts while the harness metadata is still loading takes the focus the panel gave it', async () => {
  await expectFocusSurvives(['meta', 'models'])
}, 30_000)

test('a composer that mounts while the transcript is still loading takes the focus the panel gave it', async () => {
  await expectFocusSurvives(['markers', 'list'])
}, 30_000)
