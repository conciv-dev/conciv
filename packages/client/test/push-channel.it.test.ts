import {afterEach, describe, expect, it} from 'vitest'
import {approvalIds} from '@conciv/harness-testkit'
import type {StreamChunk} from '@tanstack/ai'
import {PushFrameSchema, type PushFrame} from '@conciv/protocol/push-types'
import {acquirePushChannel, livePushChannelCount, pushSocketUrl, type PageQueryFrame} from '../src/push-channel.js'
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

async function nextApproval(source: AsyncIterable<StreamChunk>): Promise<string> {
  for await (const chunk of source) {
    const [approvalId] = approvalIds(chunk)
    if (approvalId !== undefined) return approvalId
  }
  throw new Error('the push channel closed before an approval ask arrived')
}

type RawSocket = {frames: PushFrame[]; close: () => void}

async function openRawSocket(url: string): Promise<RawSocket> {
  const socket = new WebSocket(url)
  const frames: PushFrame[] = []
  socket.onmessage = (event) => {
    const parsed = PushFrameSchema.safeParse(typeof event.data === 'string' ? JSON.parse(event.data) : null)
    if (parsed.success) frames.push(parsed.data)
  }
  await new Promise<void>((resolve, reject) => {
    socket.onopen = () => resolve()
    socket.onerror = () => reject(new Error(`the push socket never opened at ${url}`))
  })
  return {frames, close: () => socket.close()}
}

function approvalIn(frames: readonly PushFrame[]): string | undefined {
  for (const frame of frames) {
    if (frame.channel !== 'chat') continue
    const [approvalId] = approvalIds(frame.chunk)
    if (approvalId !== undefined) return approvalId
  }
  return undefined
}

function pageQueryIn(frames: readonly PushFrame[]): PageQueryFrame | undefined {
  for (const frame of frames) if (frame.channel === 'page') return {requestId: frame.requestId, query: frame.query}
  return undefined
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

  it('carries an out-of-band approval ask with no chat run in flight and the decision releases the call', async () => {
    const {booted, channel, abort} = await bootWithChannel()
    const asked = nextApproval(channel.events(abort.signal))
    const arriving = nextQuery(channel.queries(abort.signal))
    await settled(SETTLE_MS)
    const calling = booted.rpc.registry.call({name: 'page_eval', input: {code: '1 + 1'}})

    const approvalId = await asked
    await booted.rpc.chat.permissionDecision({approvalId, approved: true})

    const frame = await arriving
    await booted.rpc.page.reply({requestId: frame.requestId, outcome: {ok: true, result: {result: 2}}})

    expect(await calling).toEqual({result: 2})
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

  it('replays a pending out-of-band ask to the socket that replaces a dropped one', async () => {
    const booted = await bootClientKit()
    kit = booted
    const sessionId = await booted.session()
    const url = pushSocketUrl(booted.base, sessionId)
    const dropped = await openRawSocket(url)
    await settled(SETTLE_MS)
    const calling = booted.rpc.registry.call({name: 'page_eval', input: {code: '1 + 1'}})
    await expect.poll(() => approvalIn(dropped.frames), {timeout: 5_000}).toBeDefined()
    dropped.close()

    const replacement = await openRawSocket(url)
    await expect.poll(() => approvalIn(replacement.frames), {timeout: 5_000}).toBeDefined()
    const approvalId = approvalIn(replacement.frames)
    if (approvalId === undefined) throw new Error('the replacement socket never saw the pending ask')
    await booted.rpc.chat.permissionDecision({approvalId, approved: true})

    await expect.poll(() => pageQueryIn(replacement.frames), {timeout: 5_000}).toBeDefined()
    const query = pageQueryIn(replacement.frames)
    if (query === undefined) throw new Error('the replacement socket never saw the page query')
    await booted.rpc.page.reply({requestId: query.requestId, outcome: {ok: true, result: {result: 2}}})

    expect(await calling).toEqual({result: 2})
    replacement.close()
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
