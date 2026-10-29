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

async function waitingApprovalId(rpc: RpcClient, sessionId: string, settled: Promise<string>): Promise<string> {
  const seen = {approvalId: ''}
  const refused = {code: ''}
  void settled.then((code) => {
    refused.code = code
  })
  await until(
    async () => {
      if (refused.code !== '') throw new Error(`the gated call settled as ${refused.code} before any ask was waiting`)
      seen.approvalId = (await rpc.chat.hydrate({sessionId})).pendingApprovals[0]?.approvalId ?? ''
      return seen.approvalId !== ''
    },
    {hangGuardMs: 20_000, intervalMs: 100},
  )
  return seen.approvalId
}

function settledCode(pending: Promise<unknown>): Promise<string> {
  return pending.then(
    () => 'resolved',
    (error: unknown) => (typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : 'error'),
  )
}

type GatedCall = {settled: Promise<string>}

async function gatedCall(rpc: RpcClient, file: string): Promise<GatedCall> {
  const before = (await coreControl.pushApprovalIds()).length
  const settled = settledCode(rpc.server.reload({file}))
  await until(async () => (await coreControl.pushApprovalIds()).length > before, {hangGuardMs: 20_000})
  return {settled}
}

test('an out-of-band gated call draws the approval card, and approving it releases the call', async () => {
  const {rpc, sessionId} = await newSession()
  keep(await attachedPane(sessionId))

  const {settled} = await gatedCall(rpc, 'src/out-of-band.ts')
  await expect.element(permissionRequest(), {timeout: 15_000}).toBeVisible()

  await approveButton().click()
  expect(await settled).toBe('NO_BUNDLER')
  await expect.element(permissionRequest(), {timeout: 15_000}).not.toBeInTheDocument()
}, 120_000)

test('a pane opened while the ask waits draws the card from hydrate', async () => {
  const {rpc, sessionId} = await newSession()
  const first = await attachedPane(sessionId)

  const {settled} = await gatedCall(rpc, 'src/waiting-ask.ts')
  const askedId = await waitingApprovalId(rpc, sessionId, settled)
  first.dispose()

  keep(await attachedPane(sessionId))
  await expect.element(permissionRequest(), {timeout: 15_000}).toBeVisible()

  await rpc.chat.permissionDecision({approvalId: askedId, approved: false})
  expect(await settled).toBe('APPROVAL_DENIED')
  await expect.element(permissionRequest(), {timeout: 15_000}).not.toBeInTheDocument()
}, 120_000)

test('a push socket that replaces a dropped one replays the waiting ask under its own id', async () => {
  const {rpc, sessionId} = await newSession()
  keep(await attachedPane(sessionId))

  const replayedBefore = (await coreControl.pushApprovalIds()).length
  const {settled} = await gatedCall(rpc, 'src/replayed-ask.ts')
  const askedId = await waitingApprovalId(rpc, sessionId, settled)
  expect((await coreControl.pushApprovalIds()).slice(replayedBefore)).toEqual([askedId])
  await expect.element(permissionRequest(), {timeout: 15_000}).toBeVisible()

  const opened = await coreControl.pushSocketsOpened()
  await coreControl.restartCore()
  await until(async () => (await coreControl.pushSocketsOpened()) > opened, {hangGuardMs: 30_000})
  await until(async () => (await coreControl.pushApprovalIds()).length > replayedBefore + 1, {hangGuardMs: 30_000})

  expect(new Set((await coreControl.pushApprovalIds()).slice(replayedBefore))).toEqual(new Set([askedId]))
  expect((await rpc.chat.hydrate({sessionId})).pendingApprovals.map((approval) => approval.approvalId)).toEqual([
    askedId,
  ])
  await expect.element(permissionRequest(), {timeout: 15_000}).toBeVisible()

  await rpc.chat.permissionDecision({approvalId: askedId, approved: false})
  await settled
}, 180_000)
