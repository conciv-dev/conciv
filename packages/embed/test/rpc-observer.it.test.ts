import {afterAll, describe, expect, it} from 'vitest'
import type {Page} from 'playwright'
import {encodeResponseMessage, MessageType} from '@orpc/standard-server-peer'
import {observeRpc, type RpcObserver} from '@conciv/extension-testkit/rpc-observer'
import {setupWsProbeSuite} from './helpers/probe-suite.js'
import {startProbeServer, type ProbeServer} from './helpers/probe-server.js'

const suite = setupWsProbeSuite()

const servers: ProbeServer[] = []

afterAll(async () => {
  for (const server of servers.splice(0)) await server.close()
})

type InjectingPage = {page: Page; observer: RpcObserver; inject: (frame: string) => void; server: ProbeServer}

async function openProbeServerPage(): Promise<InjectingPage> {
  const server = await startProbeServer()
  servers.push(server)
  const page = await suite.browser().newPage()
  const relay: {send: (frame: string) => void} = {
    send: () => {
      throw new Error('the probe socket was never routed')
    },
  }
  await page.routeWebSocket(
    (url) => url.pathname.endsWith('/rpc-ws'),
    (socket) => {
      const upstream = socket.connectToServer()
      relay.send = (frame) => socket.send(frame)
      socket.onMessage((message) => upstream.send(message))
      upstream.onMessage((message) => socket.send(message))
    },
  )
  const observer = observeRpc(page)
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await page.evaluate((wsUrl) => window.__CONCIV_WS_PROBE__.connect(wsUrl), server.wsUrl)
  return {page, observer, inject: (frame) => relay.send(frame), server}
}

function callProbe(page: Page, path: string[], input: unknown): Promise<unknown> {
  return page.evaluate((call) => window.__CONCIV_WS_PROBE__.call(call.path, call.input), {path, input})
}

async function openProbePage(): Promise<{page: Page; observer: ReturnType<typeof observeRpc>}> {
  const page = await suite.browser().newPage()
  const observer = observeRpc(page)
  await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
  await page.evaluate((wsUrl) => window.__CONCIV_WS_PROBE__.connect(wsUrl), suite.socketUrl())
  return {page, observer}
}

function draft(sessionId: string, text: string): Record<string, unknown> {
  return {sessionId, text, selectionStart: 0, selectionEnd: 0, grabs: []}
}

describe('the shared rpc observer correlates calls on both transports', () => {
  it('correlates a websocket request id with its terminal response, not with the outbound frame', async () => {
    const {page, observer} = await openProbePage()
    const answered = observer.completed({path: ['meta', 'tools'], timeout: 15_000})
    const payload = await page.evaluate(() => window.__CONCIV_WS_PROBE__.call(['meta', 'tools'], undefined))
    const call = await answered
    expect(call.transport).toBe('websocket')
    expect(call.status).toBe(200)
    expect(observer.socketCount()).toBe(1)
    expect(JSON.stringify(payload)).toContain('tools')
    observer.dispose()
    await page.close()
  })

  it('matches a call by its decoded structured input, never by raw frame text', async () => {
    const {page, observer} = await openProbePage()
    const {sessionId} = await suite.kit().rpc.sessions.create()
    const wanted = observer.completed({
      path: ['drafts', 'set'],
      input: {text: 'the second draft'},
      timeout: 15_000,
    })
    await page.evaluate(
      (payload) => window.__CONCIV_WS_PROBE__.call(['drafts', 'set'], payload),
      draft(sessionId, 'the first draft'),
    )
    await page.evaluate(
      (payload) => window.__CONCIV_WS_PROBE__.call(['drafts', 'set'], payload),
      draft(sessionId, 'the second draft'),
    )
    const call = await wanted
    expect(call.input).toMatchObject({text: 'the second draft'})
    expect(observer.completedCount({path: ['drafts', 'set']})).toBe(2)
    observer.dispose()
    await page.close()
  })

  it('stays pending while the call is in flight and settles only on the terminal response', async () => {
    const {page, observer, server} = await openProbeServerPage()
    const answered = observer.completed({path: ['slow'], timeout: 15_000})
    const settlement = {done: false}
    void answered.then(() => {
      settlement.done = true
    })
    const inFlight = callProbe(page, ['slow'], {tag: 'held'})
    await server.slowEntered(0)
    await callProbe(page, ['fast'], undefined)
    await observer.completed({path: ['fast'], timeout: 15_000})

    expect(observer.startedCount({path: ['slow']})).toBe(1)
    expect(observer.completedCount({path: ['slow']})).toBe(0)
    expect(settlement.done).toBe(false)

    server.releaseSlow()
    expect((await answered).status).toBe(200)
    expect(await inFlight).toEqual({tag: 'held'})
    observer.dispose()
    await page.close()
  })

  it('ignores an inbound response whose request id belongs to no observed call', async () => {
    const {page, observer, inject, server} = await openProbeServerPage()
    const answered = observer.completed({path: ['slow'], timeout: 15_000})
    const settlement = {done: false}
    void answered.then(() => {
      settlement.done = true
    })
    const inFlight = callProbe(page, ['slow'], {tag: 'correlated'})
    await server.slowEntered(0)

    const impostor = await encodeResponseMessage('impostor-id', MessageType.RESPONSE, {
      status: 200,
      headers: {},
      body: {json: {tag: 'impostor'}, meta: []},
    })
    if (typeof impostor !== 'string') throw new Error('the impostor frame encoded to binary')
    inject(impostor)
    await callProbe(page, ['fast'], undefined)
    await observer.completed({path: ['fast'], timeout: 15_000})
    expect(settlement.done).toBe(false)

    server.releaseSlow()
    expect((await answered).status).toBe(200)
    expect(await inFlight).toEqual({tag: 'correlated'})
    observer.dispose()
    await page.close()
  })

  it('counts an in-flight call started after the mark and skips one that only completed after it', async () => {
    const {page, observer, server} = await openProbeServerPage()
    const early = callProbe(page, ['slow'], {tag: 'early'})
    await server.slowEntered(0)
    await callProbe(page, ['fast'], undefined)
    await observer.completed({path: ['fast'], timeout: 15_000})

    const mark = observer.mark()
    const late = callProbe(page, ['slow'], {tag: 'late'})
    await server.slowEntered(1)
    await callProbe(page, ['fast'], undefined)
    await observer.completed({path: ['fast'], since: mark, timeout: 15_000})

    expect(observer.startedCount({path: ['slow'], since: mark})).toBe(1)
    expect(observer.completedCount({path: ['slow'], since: mark})).toBe(0)

    server.releaseSlow()
    await early
    await late
    const barrier = observer.mark()
    await callProbe(page, ['fast'], undefined)
    await observer.completed({path: ['fast'], since: barrier, timeout: 15_000})
    expect(observer.startedCount({path: ['slow'], since: mark})).toBe(1)
    expect(observer.completedCount({path: ['slow'], since: mark})).toBe(2)
    observer.dispose()
    await page.close()
  })

  it('rejects a first-event wait for a call already answered over fetch instead of hanging', async () => {
    const {page, observer} = await openProbePage()
    await page.evaluate(
      (base) =>
        fetch(`${base}/rpc/meta/tools`, {
          method: 'POST',
          headers: {'content-type': 'application/json'},
          body: JSON.stringify({json: undefined, meta: []}),
        }).then((response) => response.status),
      suite.kit().base,
    )
    await observer.completed({path: ['meta', 'tools'], timeout: 15_000})
    const failure = await observer
      .firstEvent({path: ['meta', 'tools'], timeout: 2_000})
      .then(() => 'resolved')
      .catch((error: unknown) => (error instanceof Error ? error.message : String(error)))
    expect(failure).toContain('fetch transport')
    observer.dispose()
    await page.close()
  })

  it('never matches an extension procedure against the core procedure of the same name', async () => {
    const {page, observer} = await openProbePage()
    const core = observer.completed({path: ['page', 'queries'], timeout: 15_000})
    const settlement = {done: false}
    void core.then(() => {
      settlement.done = true
    })
    await page
      .evaluate(() => window.__CONCIV_WS_PROBE__.call(['ext', 'page-probe', 'page', 'queries'], undefined))
      .catch(() => undefined)
    expect(observer.startedCount({path: ['ext', 'page-probe', 'page', 'queries']})).toBe(1)
    expect(observer.startedCount({path: ['page', 'queries']})).toBe(0)
    expect(settlement.done).toBe(false)
    observer.dispose()
    await page.close()
  })

  it('reports a subscription as completed when its stream opens and surfaces the first iterator payload', async () => {
    const {page, observer} = await openProbePage()
    const opened = observer.completed({path: ['page', 'queries'], timeout: 15_000})
    const firstQuery = observer.firstEvent({path: ['page', 'queries'], timeout: 15_000})
    await page.evaluate(() => window.__CONCIV_WS_PROBE__.subscribe(['page', 'queries'], undefined))
    const call = await opened
    expect(call.streaming).toBe(true)
    await suite
      .kit()
      .rpc.registry.call({name: 'page.text', input: {selector: '#probe'}})
      .catch(() => {})
    const event = await firstQuery
    expect(JSON.stringify(event.data)).toContain('page.text')
    observer.dispose()
    await page.close()
  })
})
