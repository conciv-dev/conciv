import {createServer} from 'node:http'
import {Effect} from 'effect'
import {afterAll, describe, expect, it} from 'vitest'
import {listenLocal} from '@conciv/plugin-testkit/listen-local'
import {connect, type ConnectState} from '../src/connect/connect-model.js'
import {probeCore} from '../src/connect/probe.js'

const closers: Array<() => Promise<void>> = []

afterAll(() => Promise.all(closers.map((close) => close())))

async function serveHealth(token: string): Promise<number> {
  const server = createServer((request, response) => {
    response.writeHead(request.url === `/t/${token}/health` ? 200 : 404)
    response.end('ok')
  })
  const listening = await listenLocal(server)
  closers.push(listening.close)
  return listening.port
}

async function freePort(): Promise<number> {
  const listening = await listenLocal(createServer())
  await listening.close()
  return listening.port
}

function recorder() {
  const states: ConnectState[] = []
  const probing = Promise.withResolvers<void>()
  const slow = Promise.withResolvers<void>()
  const report = (state: ConnectState) => {
    states.push(state)
    if (state.phase === 'probing' && !state.slow) probing.resolve()
    if (state.phase === 'probing' && state.slow) slow.resolve()
  }
  return {states, report, probing: probing.promise, slow: slow.promise}
}

describe('probeCore', () => {
  it('finds a token-gated core on any candidate port', async () => {
    const otherPort = await serveHealth('tok-other')
    const tokenPort = await serveHealth('tok-p')
    expect(await probeCore('tok-p', [otherPort, tokenPort])).toBe(`http://127.0.0.1:${tokenPort}/t/tok-p`)
  })

  it('resolves null when nothing answers', async () => {
    const otherPort = await serveHealth('tok-other')
    expect(await probeCore('tok-none', [otherPort])).toBe(null)
  })
})

describe('connect model', () => {
  const timings = {probeMs: 50, holdMs: 50, slowMs: 60_000}

  it('a core that answers the first sweep is connected at once, with no hold', async () => {
    const port = await serveHealth('first')
    const log = recorder()

    await Effect.runPromise(connect({token: 'first', ports: [port], timings, report: log.report}))

    expect(log.states).toEqual([{phase: 'connected', base: `http://127.0.0.1:${port}/t/first`}])
  })

  it('a core that answers a later sweep is held as connected before the hand-off', async () => {
    const port = await freePort()
    const log = recorder()
    const running = Effect.runPromise(connect({token: 'later', ports: [port], timings, report: log.report}))

    await log.probing
    const server = createServer((request, response) => {
      response.writeHead(request.url === '/t/later/health' ? 200 : 404)
      response.end('ok')
    })
    const listening = await listenLocal(server, port)
    closers.push(listening.close)
    await running

    const base = `http://127.0.0.1:${port}/t/later`
    expect(log.states).toEqual([
      {phase: 'probing', slow: false},
      {phase: 'holding', base},
      {phase: 'connected', base},
    ])
  })

  it('hints that setup is slow once no core has answered for the slow wait', async () => {
    const port = await freePort()
    const log = recorder()
    const controller = new AbortController()
    const running = Effect.runPromise(
      connect({token: 'slow', ports: [port], timings: {...timings, slowMs: 200}, report: log.report}),
      {signal: controller.signal},
    ).catch(() => undefined)

    await log.slow
    controller.abort()
    await running

    expect(log.states).toEqual([
      {phase: 'probing', slow: false},
      {phase: 'probing', slow: true},
    ])
  })
})
