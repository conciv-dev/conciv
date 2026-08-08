import {afterEach, expect, test, vi} from 'vitest'
import {makeRpcClient, type DraftRow} from '@conciv/contract'
import {appendDraft, makeDraftStorage, restoredDraft, type PaneDraftStorage} from '../src/pane/draft-storage.js'

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

function bootWritableStorage(): {server: Server; draftStorage: PaneDraftStorage} {
  const server: Server = {row: null, writes: [], failReads: false}
  installServer(server)
  const draftStorage = makeDraftStorage(makeRpcClient(BASE), SESSION)
  vi.useFakeTimers()
  return {server, draftStorage}
}

test('the storage handle never gates the composer behind a restore payload', () => {
  const server: Server = {row: draftRow('kept across the reload', ['a grabbed heading']), writes: [], failReads: false}
  installServer(server)

  const draftStorage = makeDraftStorage(makeRpcClient(BASE), SESSION)

  expect(draftStorage.storage.getItem('any')).toBeNull()
})

test('reads the persisted row into the restore payload the composer hydrates from', () => {
  expect(restoredDraft(draftRow('kept across the reload', ['a grabbed heading']))).toEqual({
    text: 'kept across the reload',
    grabs: ['a grabbed heading'],
    selection: {start: 22, end: 22},
  })
})

test('clamps a persisted caret that falls beyond the persisted text', () => {
  const row: DraftRow = {
    sessionId: SESSION,
    text: 'short',
    selectionStart: 40,
    selectionEnd: 44,
    grabs: [],
    updatedAt: 1,
  }

  expect(restoredDraft(row)?.selection).toEqual({start: 5, end: 5})
})

test('has nothing to restore when the server has no draft', () => {
  expect(restoredDraft(null)).toBeNull()
  expect(restoredDraft(draftRow('', []))).toBeNull()
})

test('writes the composer draft back to the server with the caret at the end', async () => {
  const {server, draftStorage} = bootWritableStorage()

  draftStorage.storage.setItem(
    'any',
    JSON.stringify({text: 'a fresh draft', quote: null, grabs: ['a heading'], attachments: []}),
  )
  await settleWrites()

  expect(server.writes).toEqual([
    {sessionId: SESSION, text: 'a fresh draft', selectionStart: 13, selectionEnd: 13, grabs: ['a heading']},
  ])
})

test('collapses a burst of writes into the last draft', async () => {
  const {server, draftStorage} = bootWritableStorage()

  draftStorage.storage.setItem('any', JSON.stringify({text: 'a', quote: null, grabs: [], attachments: []}))
  draftStorage.storage.setItem('any', JSON.stringify({text: 'ab', quote: null, grabs: [], attachments: []}))
  draftStorage.storage.setItem('any', JSON.stringify({text: 'abc', quote: null, grabs: [], attachments: []}))
  await settleWrites()

  expect(server.writes).toEqual([{sessionId: SESSION, text: 'abc', selectionStart: 3, selectionEnd: 3, grabs: []}])
})

test('ignores a payload that cannot be parsed instead of persisting it', async () => {
  const {server, draftStorage} = bootWritableStorage()

  draftStorage.storage.setItem('any', 'not json at all')
  await settleWrites()

  expect(server.writes).toEqual([])
})

test('persists the noted caret offsets with the draft text', async () => {
  const {server, draftStorage} = bootWritableStorage()

  draftStorage.storage.setItem('any', JSON.stringify({text: 'say hello!', quote: null, grabs: [], attachments: []}))
  draftStorage.noteSelection({start: 4, end: 4})
  await settleWrites()

  expect(server.writes).toEqual([
    {sessionId: SESSION, text: 'say hello!', selectionStart: 4, selectionEnd: 4, grabs: []},
  ])
})

test('clamps noted offsets that fall beyond the persisted text', async () => {
  const {server, draftStorage} = bootWritableStorage()

  draftStorage.noteSelection({start: 40, end: 44})
  draftStorage.storage.setItem('any', JSON.stringify({text: 'short', quote: null, grabs: [], attachments: []}))
  await settleWrites()

  expect(server.writes).toEqual([{sessionId: SESSION, text: 'short', selectionStart: 5, selectionEnd: 5, grabs: []}])
})

test('appends to the stored draft on a new line with the caret at the end', async () => {
  const server: Server = {row: draftRow('a first line', ['a heading']), writes: [], failReads: false}
  installServer(server)

  await appendDraft(makeRpcClient(BASE), SESSION, 'a second line')

  expect(server.writes).toEqual([
    {
      sessionId: SESSION,
      text: 'a first line\na second line',
      selectionStart: 26,
      selectionEnd: 26,
      grabs: ['a heading'],
    },
  ])
})

test('accepts writes even when the initial read is down', async () => {
  const server: Server = {row: null, writes: [], failReads: true}
  installServer(server)

  const draftStorage = makeDraftStorage(makeRpcClient(BASE), SESSION)
  server.failReads = false
  vi.useFakeTimers()
  draftStorage.storage.setItem(
    'any',
    JSON.stringify({text: 'after the outage', quote: null, grabs: [], attachments: []}),
  )
  await settleWrites()

  expect(server.writes).toEqual([
    {sessionId: SESSION, text: 'after the outage', selectionStart: 16, selectionEnd: 16, grabs: []},
  ])
})
