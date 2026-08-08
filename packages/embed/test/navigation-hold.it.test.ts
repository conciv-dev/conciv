import {describe, expect, it} from 'vitest'
import {setupWsProbeSuite} from './helpers/probe-suite.js'
import {currentHref, holdFirstNavigationWrite, navigationStamp} from './helpers/navigation.js'

const suite = setupWsProbeSuite()

describe('holdFirstNavigationWrite holds one websocket frame without stalling the socket', () => {
  it('retains the first navigation write, forwards a later call, and releases on its own response', async () => {
    const page = await suite.browser().newPage()
    const held = await holdFirstNavigationWrite(page)
    await page.goto(suite.host().base, {waitUntil: 'domcontentloaded'})
    await page.evaluate((wsUrl) => window.__CONCIV_WS_PROBE__.connect(wsUrl), suite.socketUrl())

    const {sessionId} = await suite.kit().rpc.sessions.create()
    const write = page.evaluate((payload) => window.__CONCIV_WS_PROBE__.call(['navigation', 'set'], payload), {
      entries: [{href: '/held-by-the-frame-tap'}],
      index: 0,
      updatedAt: navigationStamp(),
    })
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
})
