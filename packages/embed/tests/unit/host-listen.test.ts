import {createServer} from 'node:http'
import {describe, expect, it} from 'vitest'
import {listenLocal} from '../helpers/host.js'

describe('listenLocal', () => {
  it('rejects instead of hanging when the requested port is already bound', async () => {
    const holder = createServer()
    const bound = await listenLocal(holder)
    const contender = createServer()
    await expect(listenLocal(contender, bound.port)).rejects.toThrow()
    await bound.close()
  })
})
