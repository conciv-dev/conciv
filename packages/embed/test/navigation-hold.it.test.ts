import {afterAll, describe, expect, it} from 'vitest'
import {setupWsProbeSuite} from './helpers/probe-suite.js'
import {startProbeServer, type ProbeServer} from './helpers/probe-server.js'
import {currentHref, holdFirstNavigationWrite, navigationStamp} from './helpers/navigation.js'

const suite = setupWsProbeSuite()

const servers: ProbeServer[] = []

afterAll(async () => {
  for (const server of servers.splice(0)) await server.close()
})

function navigationInput(href: string): Record<string, unknown> {
  return {entries: [{href}], index: 0, updatedAt: navigationStamp()}
}

describe('holdFirstNavigationWrite holds one websocket frame without stalling the socket', () => {
  it('retains the first navigation write, forwards a later call, and releases on its own response', async () => {
    const page = await suite.browser().newPage()
    const held = await holdFirstNavigationWrite(page)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await page.evaluate((wsUrl) => window.__CONCIV_WS_PROBE__.connect(wsUrl), suite.socketUrl())

    const {sessionId} = await suite.kit().rpc.sessions.create()
    const write = page.evaluate(
      (payload) => window.__CONCIV_WS_PROBE__.call(['navigation', 'set'], payload),
      navigationInput('/held-by-the-frame-tap'),
    )
    await held.arrived
    expect(await currentHref(suite.kit())).toBe('')

    const overtaking = await page.evaluate((payload) => window.__CONCIV_WS_PROBE__.call(['drafts', 'set'], payload), {
      sessionId,
      text: 'sent while the navigation frame is held',
      selectionStart: 0,
      selectionEnd: 0,
      grabs: [],
    })
    expect(overtaking).toEqual({ok: true})
    expect(await currentHref(suite.kit())).toBe('')

    await held.release()
    await write
    expect(await currentHref(suite.kit())).toBe('/held-by-the-frame-tap')
    await page.close()
  })

  it('queues a second navigation write behind the retained one and flushes both in order', async () => {
    const server = await startProbeServer()
    servers.push(server)
    const page = await suite.browser().newPage()
    const held = await holdFirstNavigationWrite(page)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await page.evaluate((wsUrl) => window.__CONCIV_WS_PROBE__.connect(wsUrl), server.wsUrl)

    const first = page.evaluate(
      (payload) => window.__CONCIV_WS_PROBE__.call(['navigation', 'set'], payload),
      navigationInput('/first-write'),
    )
    await held.arrived
    const second = page.evaluate(
      (payload) => window.__CONCIV_WS_PROBE__.call(['navigation', 'set'], payload),
      navigationInput('/second-write'),
    )
    await page.evaluate(() => window.__CONCIV_WS_PROBE__.call(['fast'], undefined))
    expect(server.navigationWrites()).toEqual([])

    server.releaseNavigation()
    await held.release()
    expect(await first).toEqual({ok: true, applied: true})
    expect(await second).toEqual({ok: true, applied: true})
    expect(server.navigationWrites()).toEqual(['/first-write', '/second-write'])
    await page.close()
  })

  it('releases only after the retained write is answered, not when the gate opens', async () => {
    const server = await startProbeServer()
    servers.push(server)
    const page = await suite.browser().newPage()
    const held = await holdFirstNavigationWrite(page)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await page.evaluate((wsUrl) => window.__CONCIV_WS_PROBE__.connect(wsUrl), server.wsUrl)

    const write = page.evaluate(
      (payload) => window.__CONCIV_WS_PROBE__.call(['navigation', 'set'], payload),
      navigationInput('/answered-late'),
    )
    await held.arrived

    const settlement = {done: false}
    const releasing = held.release().then(() => {
      settlement.done = true
    })
    await server.navigationEntered(0)
    await page.evaluate(() => window.__CONCIV_WS_PROBE__.call(['fast'], undefined))
    expect(settlement.done).toBe(false)

    server.releaseNavigation()
    await releasing
    expect(settlement.done).toBe(true)
    expect(await write).toEqual({ok: true, applied: true})
    await page.close()
  })
})
