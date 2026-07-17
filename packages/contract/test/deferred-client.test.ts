import {describe, expect, it} from 'vitest'
import {makeDeferredRpcClient} from '../src/client.js'

describe('makeDeferredRpcClient', () => {
  it('rejects calls before bind', async () => {
    const {rpc, bound} = makeDeferredRpcClient()
    expect(bound()).toBe(false)
    await expect(rpc.sessions.resolve({})).rejects.toThrow('conciv core not connected yet')
  })
  it('keeps the same rpc reference across bind', () => {
    const deferred = makeDeferredRpcClient()
    const before = deferred.rpc
    deferred.bind('http://127.0.0.1:1')
    expect(deferred.rpc).toBe(before)
    expect(deferred.bound()).toBe(true)
  })
  it('throws on double bind', () => {
    const deferred = makeDeferredRpcClient()
    deferred.bind('http://127.0.0.1:1')
    expect(() => deferred.bind('http://127.0.0.1:2')).toThrow()
  })
})
