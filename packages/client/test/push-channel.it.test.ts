import {afterEach, describe, expect, it} from 'vitest'
import {acquirePushChannel, livePushChannelCount, type PageQueryFrame} from '../src/push-channel.js'
import {bootClientKit, type ClientKit} from './helpers/boot.js'

const SETTLE_MS = 150
const RECONNECT_MS = 1500

let kit: ClientKit | undefined

afterEach(async () => {
  await kit?.cleanup()
  kit = undefined
})

async function bootWithChannel() {
  const booted = await bootClientKit()
  kit = booted
  const sessionId = await booted.session()
  const abort = new AbortController()
  const channel = acquirePushChannel({apiBase: booted.base, sessionId})
  return {booted, sessionId, channel, abort}
}

function settled(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function nextQuery(source: AsyncIterable<PageQueryFrame>): Promise<PageQueryFrame> {
  for await (const frame of source) return frame
  throw new Error('the push channel closed before a page query arrived')
}

describe('the per-tab push socket', () => {
  it('carries a page query to the tab and the reply resolves the caller', async () => {
    const {booted, channel, abort} = await bootWithChannel()
    const arriving = nextQuery(channel.queries(abort.signal))
    await settled(SETTLE_MS)
    const calling = booted.rpc.registry.call({name: 'page_text', input: {selector: 'body'}})

    const frame = await arriving
    await booted.rpc.page.reply({requestId: frame.requestId, outcome: {ok: true, result: {text: 'body text'}}})

    expect(await calling).toEqual({text: 'body text'})
    abort.abort()
    channel.dispose()
  })

  it('reopens itself after the engine restarts and serves page queries again', async () => {
    const {booted, channel, abort} = await bootWithChannel()
    const warming = nextQuery(channel.queries(abort.signal))
    await settled(SETTLE_MS)
    const warmup = booted.rpc.registry.call({name: 'page_text', input: {selector: 'body'}})
    const warmupFrame = await warming
    await booted.rpc.page.reply({requestId: warmupFrame.requestId, outcome: {ok: true, result: {text: 'before'}}})
    expect(await warmup).toEqual({text: 'before'})

    await booted.restartServer()
    const seen: PageQueryFrame[] = []
    const collecting = (async () => {
      for await (const frame of channel.queries(abort.signal)) seen.push(frame)
    })()
    await settled(RECONNECT_MS)
    const calling = booted.rpc.registry.call({name: 'page_text', input: {selector: 'body'}})
    await expect.poll(() => seen.length, {timeout: 5_000}).toBe(1)
    const frame = seen[0]
    if (!frame) throw new Error('the reconnected channel served no page query')
    await booted.rpc.page.reply({requestId: frame.requestId, outcome: {ok: true, result: {text: 'after'}}})

    expect(await calling).toEqual({text: 'after'})
    expect(seen).toHaveLength(1)
    abort.abort()
    await collecting
    channel.dispose()
  })

  it('hands the page plane and the chat stream the same socket for one session', async () => {
    const {booted, sessionId, channel, abort} = await bootWithChannel()
    const opened = livePushChannelCount()
    const second = acquirePushChannel({apiBase: booted.base, sessionId})

    expect(livePushChannelCount()).toBe(opened)
    second.dispose()
    expect(livePushChannelCount()).toBe(opened)

    abort.abort()
    channel.dispose()
    expect(livePushChannelCount()).toBe(opened - 1)
  })
})
