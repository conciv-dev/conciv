import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {coreControl} from './helpers/core-control.js'
import {trackedFaults} from './helpers/tracked-faults.js'

const core: {rpc: RpcClient | null} = {rpc: null}
const faults = trackedFaults()

function statusOf(value: unknown): number | null {
  if (typeof value !== 'object' || value === null || !('status' in value)) return null
  return typeof value.status === 'number' ? value.status : null
}

function rpc(): RpcClient {
  if (!core.rpc) throw new Error('the core kit did not boot')
  return core.rpc
}

beforeAll(async () => {
  const booted = await coreControl.bootCore({id: 'request-gate', allowedOrigins: [window.location.origin]})
  core.rpc = makeRpcClient(booted.base)
}, 60_000)

afterAll(async () => {
  core.rpc = null
  await coreControl.closeCore()
}, 30_000)

describe('gated rpc requests against a real core', () => {
  it('holds the session-events request until release, then streams the real channel', async () => {
    const {sessionId} = await rpc().sessions.create()
    const gate = await faults.install({kind: 'gate', path: ['chat', 'events']})
    const arrived = {value: false}
    const subscription = rpc()
      .chat.events({sessionId})
      .then((iterator: AsyncIterable<unknown>) => {
        arrived.value = true
        return iterator
      })

    await coreControl.awaitFaultPending(gate, 1)
    expect(arrived.value).toBe(false)

    await coreControl.releaseFault(gate)
    await subscription

    expect(arrived.value).toBe(true)
    expect(await coreControl.faultPending(gate)).toBe(0)
  }, 30_000)

  it('keeps a cross-origin injected failure an rpc rejection rather than a transport error', async () => {
    const {sessionId} = await rpc().sessions.create()
    const fault = await faults.install({kind: 'fail', path: ['sessions', 'rename'], status: 500})

    const rejection = await rpc()
      .sessions.rename({sessionId, title: 'renamed by the fault test'})
      .then(
        () => null,
        (reason: unknown) => reason,
      )

    expect(rejection).not.toBeInstanceOf(TypeError)
    expect(String(rejection)).not.toMatch(/failed to fetch/i)
    expect(statusOf(rejection)).toBe(500)

    await coreControl.releaseFault(fault)
    const renamed = await rpc().sessions.rename({sessionId, title: 'renamed by the fault test'})
    expect(renamed.title).toBe('renamed by the fault test')
  }, 30_000)
})
