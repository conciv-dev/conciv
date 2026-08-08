import {afterEach, describe, expect, it} from 'vitest'
import getPort from 'get-port'
import {devServers, pageApiBase} from './helpers/dev-servers.js'

describe('two dev servers configured with the same engine port', () => {
  const servers = devServers()

  afterEach(() => servers.stopAll())

  it('both boot, and the second page points at the engine that is actually listening for it', async () => {
    const preferred = await getPort()
    const first = await servers.start({widget: false, port: preferred})
    expect(await pageApiBase(first.server)).toBe(`http://127.0.0.1:${preferred}`)

    const second = await servers.start({widget: false, port: preferred})
    const secondBase = await pageApiBase(second.server)
    expect(secondBase).not.toBe(`http://127.0.0.1:${preferred}`)
    expect((await fetch(`${secondBase}/health`)).ok).toBe(true)
    expect((await fetch(`http://127.0.0.1:${preferred}/health`)).ok).toBe(true)
  }, 60_000)
})
