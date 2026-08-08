import {describe, expect, it} from 'vitest'
import type {Page} from 'playwright'
import {observeRpc} from '@conciv/extension-testkit/rpc-observer'
import {setupWsProbeSuite} from './helpers/probe-suite.js'

const suite = setupWsProbeSuite()

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
