import {afterEach, expect, test, vi} from 'vitest'
import {makeRpcClient, type DraftRow} from '@conciv/contract'
import {makeDraftStorage} from '../src/pane/draft-storage.js'

const BASE = 'http://conciv.test'
const SESSION = 'conciv_1'

type Server = {row: DraftRow | null; writes: unknown[]; failReads: boolean}

const realFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = realFetch
  vi.useRealTimers()
})

function reply(value: unknown): Response {
  return new Response(JSON.stringify({json: value, meta: []}), {
    status: 200,
    headers: {'content-type': 'application/json'},
  })
}

function installServer(server: Server): void {
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const request = input instanceof Request ? input : new Request(input, init)
    const path = new URL(request.url).pathname
    if (path === '/rpc/drafts/get') {
      if (server.failReads) return new Response('down', {status: 500})
      return reply(server.row)
    }
    if (path === '/rpc/drafts/set') {
      const parsed: unknown = await request.json()
      if (typeof parsed === 'object' && parsed !== null && 'json' in parsed) server.writes.push(parsed.json)
      return reply({ok: true})
    }
    throw new Error(`the fake core has no route for ${path}`)
  }
}

function draftRow(text: string, grabs: string[]): DraftRow {
  return {sessionId: SESSION, text, selectionStart: text.length, selectionEnd: text.length, grabs, updatedAt: 1}
}

async function settleWrites(): Promise<void> {
  await vi.advanceTimersByTimeAsync(350)
  await Promise.resolve()
}

test('seeds the cache from the server draft row in the composer draft shape', async () => {
  const server: Server = {row: draftRow('kept across the reload', ['a grabbed heading']), writes: [], failReads: false}
  installServer(server)

  const storage = await makeDraftStorage(makeRpcClient(BASE), SESSION)

  expect(JSON.parse(storage.getItem('any') ?? '')).toEqual({
    text: 'kept across the reload',
    quote: null,
    grabs: ['a grabbed heading'],
    attachments: [],
  })
})

test('starts empty when the server has no draft', async () => {
  const server: Server = {row: null, writes: [], failReads: false}
  installServer(server)

  const storage = await makeDraftStorage(makeRpcClient(BASE), SESSION)

  expect(storage.getItem('any')).toBeNull()
})

test('writes the composer draft back to the server with the caret at the end', async () => {
  const server: Server = {row: null, writes: [], failReads: false}
  installServer(server)
  const storage = await makeDraftStorage(makeRpcClient(BASE), SESSION)
  vi.useFakeTimers()

  storage.setItem('any', JSON.stringify({text: 'a fresh draft', quote: null, grabs: ['a heading'], attachments: []}))
  await settleWrites()

  expect(server.writes).toEqual([
    {sessionId: SESSION, text: 'a fresh draft', selectionStart: 13, selectionEnd: 13, grabs: ['a heading']},
  ])
})

test('collapses a burst of writes into the last draft', async () => {
  const server: Server = {row: null, writes: [], failReads: false}
  installServer(server)
  const storage = await makeDraftStorage(makeRpcClient(BASE), SESSION)
  vi.useFakeTimers()

  storage.setItem('any', JSON.stringify({text: 'a', quote: null, grabs: [], attachments: []}))
  storage.setItem('any', JSON.stringify({text: 'ab', quote: null, grabs: [], attachments: []}))
  storage.setItem('any', JSON.stringify({text: 'abc', quote: null, grabs: [], attachments: []}))
  await settleWrites()

  expect(server.writes).toEqual([{sessionId: SESSION, text: 'abc', selectionStart: 3, selectionEnd: 3, grabs: []}])
})

test('keeps the latest value readable even when the payload cannot be persisted', async () => {
  const server: Server = {row: null, writes: [], failReads: false}
  installServer(server)
  const storage = await makeDraftStorage(makeRpcClient(BASE), SESSION)
  vi.useFakeTimers()

  storage.setItem('any', 'not json at all')
  await settleWrites()

  expect(storage.getItem('any')).toBe('not json at all')
  expect(server.writes).toEqual([])
})

test('survives a failed initial read and still accepts writes', async () => {
  const server: Server = {row: null, writes: [], failReads: true}
  installServer(server)

  const storage = await makeDraftStorage(makeRpcClient(BASE), SESSION)
  server.failReads = false
  vi.useFakeTimers()
  storage.setItem('any', JSON.stringify({text: 'after the outage', quote: null, grabs: [], attachments: []}))
  await settleWrites()

  expect(storage.getItem('any')).toContain('after the outage')
  expect(server.writes).toEqual([
    {sessionId: SESSION, text: 'after the outage', selectionStart: 16, selectionEnd: 16, grabs: []},
  ])
})
