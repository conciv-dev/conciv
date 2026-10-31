import '../src/styles.css'
import {expect, test} from 'vitest'
import {page} from 'vitest/browser'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {until} from '@conciv/harness-testkit/until'
import {ChatPane} from '../src/pane/chat-pane.js'
import {bootedCore} from './helpers/booted-core.js'
import {keptPane} from './helpers/kept-pane.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession} from './helpers/core-session.js'
import {mountPane, type PaneMount} from './helpers/pane-harness.js'

const core = bootedCore('approval-replay')
const keep = keptPane()

const permissionRequest = () => page.getByRole('group', {name: 'Permission request'})
const approveButton = () => page.getByRole('button', {name: 'Approve'})
const composer = () => page.getByRole('textbox', {name: 'Message the conciv agent'})

async function newSession(): Promise<{rpc: RpcClient; sessionId: string}> {
  const sessionId = await createSession(coreRpc(core()))
  return {rpc: makeRpcClient(core(), {headers: {[CONCIV_SESSION_HEADER]: sessionId}}), sessionId}
}

async function attachedPane(sessionId: string): Promise<PaneMount> {
  const attached = await coreControl.pushSocketsOpened()
  const mount = mountPane({base: core(), sessionId}, () => <ChatPane sessionId={sessionId} />)
  await until(async () => (await coreControl.pushSocketsOpened()) > attached, {hangGuardMs: 20_000})
  return mount
}

async function refusedOutsideCall(rpc: RpcClient, sessionId: string, file: string): Promise<string> {
  expect(await coreControl.outsideReload(sessionId, file)).toBe('APPROVAL_DENIED')
  const pending = (await rpc.chat.hydrate({sessionId})).pendingApprovals
  expect(pending.map((approval) => approval.runId)).toEqual([null])
  const askedId = pending[0]?.approvalId
  if (askedId === undefined) throw new Error('the refused call left no pending ask')
  return askedId
}

test('an ask from a chat turn sits in the strip, and approving it posts the message that retries', async () => {
  const {sessionId} = await newSession()
  keep(await attachedPane(sessionId))
  await coreControl.scriptTurn({toolCalls: [], text: 'That needs your approval.'})
  await coreControl.scriptCustomEvent('approval-requested', {
    approvalId: 'turn-ask',
    title: 'Bash',
    input: {command: 'rm -rf build'},
  })

  await composer().fill('delete the build directory')
  await page.getByRole('button', {name: 'Send message'}).click()
  await expect.element(page.getByText('That needs your approval.')).toBeVisible()
  await expect.element(permissionRequest(), {timeout: 15_000}).toBeVisible()

  await coreControl.scriptTurn({toolCalls: [], text: 'Deleted.'})
  await approveButton().click()
  await expect.element(permissionRequest(), {timeout: 15_000}).not.toBeInTheDocument()
  await expect.element(page.getByText('Approved: Bash')).toBeVisible()
  await expect.element(page.getByText('Deleted.')).toBeVisible()
}, 120_000)

test('a CLI ask names what it asks for in the strip, not the CLI that raised it', async () => {
  const {sessionId} = await newSession()
  keep(await attachedPane(sessionId))
  await coreControl.scriptTurn({toolCalls: [], text: 'The CLI wants to run a command.'})
  await coreControl.scriptCustomEvent('approval-requested', {
    approvalId: 'cli-ask',
    title: 'Approve Bash: touch qa-approval.txt',
    provider: 'claude-code',
    toolName: 'Bash',
  })

  await composer().fill('create the approval file')
  await page.getByRole('button', {name: 'Send message'}).click()
  await expect
    .element(permissionRequest().getByText('Approve Bash: touch qa-approval.txt'), {timeout: 15_000})
    .toBeVisible()
  await expect.element(permissionRequest().getByText('claude-code')).not.toBeInTheDocument()

  await page.getByRole('button', {name: 'Deny'}).click()
  await expect.element(permissionRequest(), {timeout: 15_000}).not.toBeInTheDocument()
}, 120_000)

test('an ask from outside a chat turn sits in the strip, and approving it lets the retry run with no message', async () => {
  const {rpc, sessionId} = await newSession()
  keep(await attachedPane(sessionId))

  await refusedOutsideCall(rpc, sessionId, 'src/out-of-band.ts')
  await expect.element(permissionRequest(), {timeout: 15_000}).toBeVisible()

  await approveButton().click()
  await expect.element(permissionRequest(), {timeout: 15_000}).not.toBeInTheDocument()
  expect(await coreControl.outsideReload(sessionId, 'src/out-of-band.ts')).toBe('NO_BUNDLER')
  expect((await rpc.chat.hydrate({sessionId})).lastRun).toBeNull()
  await expect.element(page.getByText(/^Approved/)).not.toBeInTheDocument()
}, 120_000)

test('a pane opened while the ask waits draws the card from hydrate', async () => {
  const {rpc, sessionId} = await newSession()
  const first = await attachedPane(sessionId)

  const askedId = await refusedOutsideCall(rpc, sessionId, 'src/waiting-ask.ts')
  first.dispose()

  keep(await attachedPane(sessionId))
  await expect.element(permissionRequest(), {timeout: 15_000}).toBeVisible()

  await rpc.chat.permissionDecision({approvalId: askedId, approved: false})
  expect(await coreControl.outsideReload(sessionId, 'src/waiting-ask.ts')).toBe('APPROVAL_DENIED')
}, 120_000)

test('a waiting ask survives a core restart and still draws its card', async () => {
  const {rpc, sessionId} = await newSession()
  keep(await attachedPane(sessionId))

  const askedId = await refusedOutsideCall(rpc, sessionId, 'src/replayed-ask.ts')
  await expect.element(permissionRequest(), {timeout: 15_000}).toBeVisible()

  const opened = await coreControl.pushSocketsOpened()
  await coreControl.restartCore()
  await until(async () => (await coreControl.pushSocketsOpened()) > opened, {hangGuardMs: 30_000})

  expect((await rpc.chat.hydrate({sessionId})).pendingApprovals.map((approval) => approval.approvalId)).toEqual([
    askedId,
  ])
  await expect.element(permissionRequest(), {timeout: 15_000}).toBeVisible()

  await rpc.chat.permissionDecision({approvalId: askedId, approved: false})
}, 180_000)
