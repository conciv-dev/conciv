import './helpers/utilities.css'
import {afterAll, afterEach, beforeAll, expect, test} from 'vitest'
import {CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {until} from '@conciv/harness-testkit/until'
import {ChatPane} from '../src/pane/chat-pane.js'
import {coreControl} from './helpers/core-control.js'
import {coreRpc, createSession} from './helpers/core-session.js'
import {mountPane, type PaneMount} from './helpers/pane-harness.js'

const core = {base: ''}
const active: {pane: PaneMount | null} = {pane: null}

beforeAll(async () => {
  const booted = await coreControl.bootCore({id: 'approval-replay', allowedOrigins: [window.location.origin]})
  core.base = booted.base
}, 60_000)

afterAll(async () => {
  await coreControl.closeCore()
}, 30_000)

afterEach(() => {
  active.pane?.dispose()
  active.pane = null
})

async function newSession(): Promise<{rpc: RpcClient; sessionId: string}> {
  const sessionId = await createSession(coreRpc(core.base))
  return {rpc: makeRpcClient(core.base, {headers: {[CONCIV_SESSION_HEADER]: sessionId}}), sessionId}
}

async function waitingApprovalId(rpc: RpcClient, sessionId: string): Promise<string> {
  const waiting = (await rpc.chat.hydrate({sessionId})).pendingApprovals[0]
  if (!waiting) throw new Error('no approval is waiting on the session')
  return waiting.approvalId
}

test('a push socket that replaces a dropped one replays the waiting ask under its own id', async () => {
  const {rpc, sessionId} = await newSession()
  const attached = await coreControl.pushSocketsOpened()
  active.pane = mountPane({base: core.base, sessionId}, () => <ChatPane sessionId={sessionId} />)
  await until(async () => (await coreControl.pushSocketsOpened()) > attached, {hangGuardMs: 20_000})

  const asked = rpc.server.reload({file: 'src/replayed-ask.ts'}).catch(() => undefined)
  await until(async () => (await coreControl.pushApprovalIds()).length === 1, {hangGuardMs: 20_000})
  const askedId = await waitingApprovalId(rpc, sessionId)
  expect(await coreControl.pushApprovalIds()).toEqual([askedId])

  const opened = await coreControl.pushSocketsOpened()
  await coreControl.restartCore()
  await until(async () => (await coreControl.pushSocketsOpened()) > opened, {hangGuardMs: 30_000})
  await until(async () => (await coreControl.pushApprovalIds()).length > 1, {hangGuardMs: 30_000})

  expect(new Set(await coreControl.pushApprovalIds())).toEqual(new Set([askedId]))
  expect((await rpc.chat.hydrate({sessionId})).pendingApprovals.map((approval) => approval.approvalId)).toEqual([
    askedId,
  ])

  await rpc.chat.permissionDecision({approvalId: askedId, approved: false})
  await asked
}, 120_000)
