import {describe, it, expect, beforeEach} from 'vitest'
import {z} from 'zod'
import {pageVerb} from '@conciv/extension'
import {registerExtensionPageVerbs, clearExtensionPageVerbs, dispatchExtVerb} from '../src/page-verb-registry.js'

describe('ext verb dispatch', () => {
  beforeEach(() => clearExtensionPageVerbs())
  it('runs a registered verb and returns its result', async () => {
    registerExtensionPageVerbs('demo', {ping: pageVerb(z.object({n: z.number()}), (a) => ({pong: a.n + 1}))})
    expect(await dispatchExtVerb('demo', 'ping', '{"n":41}')).toEqual({result: {pong: 42}})
  })
  it('reports unknown-verb and invalid-args as structured errors', async () => {
    registerExtensionPageVerbs('demo', {ping: pageVerb(z.object({n: z.number()}), () => ({}))})
    expect(await dispatchExtVerb('demo', 'nope', '{}')).toMatchObject({error: {code: 'unknown-verb'}})
    expect(await dispatchExtVerb('demo', 'ping', '{"n":"x"}')).toMatchObject({error: {code: 'invalid-args'}})
  })
})
