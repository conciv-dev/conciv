import {describe, it, expect, beforeEach} from 'vitest'
import {z} from 'zod'
import {defineExtension, definePageVerbs, pageVerb} from '@conciv/extension'
import {bindExtensionPageVerbs, clearExtensionPageVerbs, dispatchExtVerb} from '../src/page-verb-registry.js'

describe('extension pageVerbs mount lifecycle', () => {
  beforeEach(() => clearExtensionPageVerbs())

  it('registers client pageVerbs, dispatch runs the closure, dispose unregisters', async () => {
    let count = 0
    const ext = defineExtension({name: 'counter'}).client(() => ({
      value: {},
      pageVerbs: definePageVerbs({
        bump: pageVerb(z.object({}), () => ({count: (count += 1)})),
      }),
    }))
    const result = ext.__client?.()
    const dispose = bindExtensionPageVerbs('counter', result?.pageVerbs, result?.dispose)

    expect(await dispatchExtVerb('counter', 'bump', '{}')).toEqual({result: {count: 1}})
    expect(await dispatchExtVerb('counter', 'bump', '{}')).toEqual({result: {count: 2}})

    dispose()
    expect(await dispatchExtVerb('counter', 'bump', '{}')).toMatchObject({error: {code: 'unknown-verb'}})
  })

  it('unregisters the verbs even when the client dispose throws', async () => {
    const ext = defineExtension({name: 'throwing'}).client(() => ({
      value: {},
      pageVerbs: definePageVerbs({ping: pageVerb(z.object({}), () => ({ok: true}))}),
    }))
    const result = ext.__client?.()
    const dispose = bindExtensionPageVerbs('throwing', result?.pageVerbs, () => {
      throw new Error('client dispose blew up')
    })

    expect(await dispatchExtVerb('throwing', 'ping', '{}')).toEqual({result: {ok: true}})
    expect(() => dispose()).toThrow('client dispose blew up')
    expect(await dispatchExtVerb('throwing', 'ping', '{}')).toMatchObject({error: {code: 'unknown-verb'}})
  })

  it('calls the client dispose even when no pageVerbs are present', async () => {
    let disposed = false
    const dispose = bindExtensionPageVerbs('bare', undefined, () => {
      disposed = true
    })
    dispose()
    expect(disposed).toBe(true)
    expect(await dispatchExtVerb('bare', 'anything', '{}')).toMatchObject({error: {code: 'unknown-verb'}})
  })
})
