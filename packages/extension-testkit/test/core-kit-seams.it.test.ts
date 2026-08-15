import {afterEach, describe, expect, it} from 'vitest'
import type {EngineStaleness} from '@conciv/contract'
import {bootCoreKit, type CoreKit} from '../src/core-kit.js'

const STALENESS: EngineStaleness = {
  stale: true,
  changed: ['@conciv/kit-probe'],
  tracked: ['@conciv/kit-probe'],
  bootedAt: 1_700_000_000_000,
  fingerprint: 'kitprobe123',
}

const ORIGIN = 'https://widget.example.test'

const state = {kit: undefined as CoreKit | undefined}

afterEach(async () => {
  await state.kit?.cleanup()
  state.kit = undefined
})

describe('bootCoreKit seams', () => {
  it('adopts the harness transcript rows as external sessions with their message counts', async () => {
    const kit = await bootCoreKit({
      id: 'seams-history',
      history: [{id: 'native-1', derivedTitle: 'A native session', updatedAt: 1_700, messageCount: 7}],
    })
    state.kit = kit

    const sessions = await kit.rpc.sessions.list({})
    const adopted = sessions.find((meta) => meta.native?.nativeId === 'native-1')

    expect(adopted?.origin).toBe('external')
    expect(adopted?.messageCount).toBe(7)
    expect(adopted?.title).toBe('A native session')
    expect(adopted?.running).toBe(false)
  }, 30_000)

  it('serves the injected staleness probe to the widget rpc surface', async () => {
    const kit = await bootCoreKit({id: 'seams-staleness', staleness: () => STALENESS})
    state.kit = kit

    expect(await kit.rpc.meta.engine()).toEqual(STALENESS)
  }, 30_000)

  it('lets a non-loopback origin through only when the kit declares it allowed', async () => {
    const closed = await bootCoreKit({id: 'seams-origins-closed'})
    state.kit = closed
    const rejected = await fetch(`${closed.base}/rpc/meta/engine`, {
      method: 'OPTIONS',
      headers: {origin: ORIGIN, 'access-control-request-method': 'POST'},
    })
    await closed.cleanup()
    state.kit = undefined

    const open = await bootCoreKit({id: 'seams-origins-open', allowedOrigins: [ORIGIN]})
    state.kit = open
    const accepted = await fetch(`${open.base}/rpc/meta/engine`, {
      method: 'OPTIONS',
      headers: {origin: ORIGIN, 'access-control-request-method': 'POST'},
    })

    expect(rejected.status).toBe(403)
    expect(accepted.headers.get('access-control-allow-origin')).toBe(ORIGIN)
  }, 30_000)
})
