import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {page} from 'vitest/browser'
import type {RpcClient} from '@conciv/contract'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession} from './helpers/core-session.js'
import {createShellHarness} from './helpers/shell-harness.js'
import {trackedFaults} from './helpers/tracked-faults.js'
import {expectRetryRecovers} from './helpers/retry-recovery.js'

const RESOLVE_PATH = ['sessions', 'resolve']
const CREATE_PATH = ['sessions', 'create']

const core = {base: ''}
const harness = createShellHarness(() => core.base)
const faults = trackedFaults()

beforeAll(async () => {
  const booted = await coreControl.bootCore({id: 'quick-add-pane', allowedOrigins: [window.location.origin]})
  core.base = booted.base
}, 60_000)

afterAll(async () => {
  await coreControl.closeCore()
}, 30_000)

afterEach(harness.dispose)

const startFailure = () => page.getByText(/conciv could not start a pane/)
const editor = () => page.getByRole('textbox', {name: 'Message the conciv agent'})
const closePane = () => page.getByRole('button', {name: 'Close pane'})
const splitPane = () => page.getByRole('button', {name: 'Split pane (Mod+D)'})
const sessionTrigger = () => page.getByRole('button', {name: /^Session: /})

const sessionIdsOf = async (rpc: RpcClient): Promise<string[]> => (await rpc.sessions.list()).map((row) => row.id)

const idsAddedBy = (before: string[], after: string[]): string[] => after.filter((id) => !before.includes(id))

test('a quick terminal pane that fails to start shows a retry action', async () => {
  const refused = await faults.install({kind: 'fail', path: RESOLVE_PATH, status: 500})
  harness.mountShell('/quick')

  await expect.element(startFailure(), {timeout: 8000}).toBeVisible()
  await expect.element(page.getByRole('button', {name: 'Retry'})).toBeVisible()

  await coreControl.releaseFault(refused)
}, 30_000)

test('retrying a failed quick terminal pane against a healthy engine starts it', async () => {
  const refused = await faults.install({kind: 'fail', path: RESOLVE_PATH, status: 500})
  harness.mountShell('/quick')
  await expect.element(startFailure(), {timeout: 8000}).toBeVisible()

  await expectRetryRecovers(() => coreControl.releaseFault(refused), editor, startFailure)
}, 30_000)

test('rapid double-trigger creates exactly one pane', async () => {
  const sessionId = await createSession(coreRpc(core.base))
  harness.mountShell(`/quick?panes=${sessionId}&focus=0`)
  await expect.element(editor(), {timeout: 8000}).toBeVisible()

  const held = await faults.install({kind: 'gate', path: CREATE_PATH})
  const firstClick = splitPane().click()
  const secondClick = splitPane().click()
  await Promise.all([firstClick, secondClick])
  await coreControl.awaitFaultPending(held, 1)

  await coreControl.releaseFault(held)

  await expect.element(closePane().nth(1), {timeout: 8000}).toBeVisible()
  await expect.element(closePane().nth(2)).not.toBeInTheDocument()
}, 30_000)

test('splitting the quick terminal mints a session that is not already open', async () => {
  const rpc = coreRpc(core.base)
  const sessionId = await createSession(rpc)
  await rpc.sessions.rename({sessionId, title: 'Warm split source'})
  harness.mountShell(`/quick?panes=${sessionId}&focus=0`)
  await expect.element(page.getByRole('button', {name: /^Session: Warm split source$/}), {timeout: 8000}).toBeVisible()

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

  await expect.element(page.getByRole('button', {name: /^Session: Warm split source$/}).nth(1)).not.toBeInTheDocument()
}, 40_000)

test('adding and closing a pane never re-resolves the warm session', async () => {
  const rpc = coreRpc(core.base)
  const sessionId = await createSession(rpc)
  const resolvesBeforeMount = await coreControl.rpcCallCount(RESOLVE_PATH)
  const mountMark = await coreControl.rpcMark()
  harness.mountShell(`/quick?panes=${sessionId}&focus=0`)
  await expect.element(editor(), {timeout: 8000}).toBeVisible()
  await coreControl.awaitWarmSessionResolved(mountMark)
  const resolvesAfterWarmUp = await coreControl.rpcCallCount(RESOLVE_PATH)
  expect(resolvesAfterWarmUp - resolvesBeforeMount).toBe(1)

  const addMark = await coreControl.rpcMark()
  await splitPane().click()
  await expect.element(closePane().nth(1), {timeout: 8000}).toBeVisible()
  expect(await coreControl.awaitSessionsListed(addMark)).toBe(200)

  const closeMark = await coreControl.rpcMark()
  await closePane().nth(1).click()
  await expect.element(closePane().nth(1)).not.toBeInTheDocument()
  expect(await coreControl.awaitSessionsListed(closeMark)).toBe(200)
  await rpc.sessions.list()

  expect(await coreControl.rpcCallCount(RESOLVE_PATH)).toBe(resolvesAfterWarmUp)
}, 30_000)
