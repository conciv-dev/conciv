import {expect, test as baseTest} from 'vitest'
import {makeRpcClient, type RpcClient} from '@conciv/contract'
import {bootCoreKit, type CoreKit} from '@conciv/extension-testkit/core-kit'
import {appendDraft, makeDraftStorage} from '../src/pane/draft-storage.js'
import {createSession, seedDraft} from './helpers/core-session.js'
import {proxyTo, type ProxyCore} from './helpers/proxy.js'

const DRAFTS_GET_PATH = '/rpc/drafts/get'
const DRAFTS_SET_PATH = '/rpc/drafts/set'

type StoredDraft = {sessionId: string; text: string; selectionStart: number; selectionEnd: number; grabs: string[]}

const test = baseTest.extend<{kit: CoreKit; core: ProxyCore; sessionId: string}>({
  kit: [
    // oxlint-disable-next-line no-empty-pattern -- vitest's fixture parser requires the literal `{}` destructuring
    async ({}, use) => {
      const kit = await bootCoreKit({id: 'draft-storage'})
      await use(kit)
      await kit.cleanup()
    },
    {scope: 'file'},
  ],
  core: async ({kit}, use) => {
    const core = await proxyTo(kit.base)
    await use(core)
    await core.close()
  },
  sessionId: async ({kit}, use) => {
    await use(await createSession(kit.rpc))
  },
})

function composerDraft(text: string, grabs: string[] = []): string {
  return JSON.stringify({text, quote: null, grabs, attachments: []})
}

async function storedDraft(rpc: RpcClient, sessionId: string): Promise<StoredDraft | null> {
  const row = await rpc.drafts.get({sessionId})
  if (!row) return null
  return {
    sessionId: row.sessionId,
    text: row.text,
    selectionStart: row.selectionStart,
    selectionEnd: row.selectionEnd,
    grabs: row.grabs,
  }
}

test('seeds the cache from the server draft row in the composer draft shape', async ({kit, core, sessionId}) => {
  await seedDraft(kit.rpc, sessionId, {text: 'kept across the reload', grabs: ['a grabbed heading']})

  const draftStorage = await makeDraftStorage(makeRpcClient(core.base), sessionId)

  expect(JSON.parse(draftStorage.storage.getItem('any') ?? '')).toEqual({
    text: 'kept across the reload',
    quote: null,
    grabs: ['a grabbed heading'],
    attachments: [],
  })
})

test('starts empty when the server has no draft', async ({core, sessionId}) => {
  const draftStorage = await makeDraftStorage(makeRpcClient(core.base), sessionId)

  expect(draftStorage.storage.getItem('any')).toBeNull()
})

test('writes the composer draft back to the server with the caret at the end', async ({kit, core, sessionId}) => {
  const draftStorage = await makeDraftStorage(makeRpcClient(core.base), sessionId)

  draftStorage.storage.setItem('any', composerDraft('a fresh draft', ['a heading']))

  await core.awaitRequest(DRAFTS_SET_PATH)

  expect(await storedDraft(kit.rpc, sessionId)).toEqual({
    sessionId,
    text: 'a fresh draft',
    selectionStart: 13,
    selectionEnd: 13,
    grabs: ['a heading'],
  })
})

test('collapses a burst of writes into the last draft', async ({kit, core, sessionId}) => {
  const draftStorage = await makeDraftStorage(makeRpcClient(core.base), sessionId)

  draftStorage.storage.setItem('any', composerDraft('a'))
  draftStorage.storage.setItem('any', composerDraft('ab'))
  draftStorage.storage.setItem('any', composerDraft('abc'))

  await core.awaitRequest(DRAFTS_SET_PATH)

  expect(await storedDraft(kit.rpc, sessionId)).toEqual({
    sessionId,
    text: 'abc',
    selectionStart: 3,
    selectionEnd: 3,
    grabs: [],
  })
  expect(core.requestCount(DRAFTS_SET_PATH)).toBe(1)
})

test('keeps the latest value readable even when the payload cannot be persisted', async ({kit, core, sessionId}) => {
  const draftStorage = await makeDraftStorage(makeRpcClient(core.base), sessionId)

  draftStorage.storage.setItem('any', 'not json at all')
  expect(draftStorage.storage.getItem('any')).toBe('not json at all')

  draftStorage.storage.setItem('any', composerDraft('a draft that parses'))

  await core.awaitRequest(DRAFTS_SET_PATH)

  expect(await storedDraft(kit.rpc, sessionId)).toEqual({
    sessionId,
    text: 'a draft that parses',
    selectionStart: 19,
    selectionEnd: 19,
    grabs: [],
  })
  expect(core.requestCount(DRAFTS_SET_PATH)).toBe(1)
})

test('persists the noted caret offsets with the draft text', async ({kit, core, sessionId}) => {
  const draftStorage = await makeDraftStorage(makeRpcClient(core.base), sessionId)

  draftStorage.storage.setItem('any', composerDraft('say hello!'))
  draftStorage.noteSelection({start: 4, end: 4})

  await core.awaitRequest(DRAFTS_SET_PATH)

  expect(await storedDraft(kit.rpc, sessionId)).toEqual({
    sessionId,
    text: 'say hello!',
    selectionStart: 4,
    selectionEnd: 4,
    grabs: [],
  })
})

test('clamps noted offsets that fall beyond the persisted text', async ({kit, core, sessionId}) => {
  const draftStorage = await makeDraftStorage(makeRpcClient(core.base), sessionId)

  draftStorage.noteSelection({start: 40, end: 44})
  draftStorage.storage.setItem('any', composerDraft('short'))

  await core.awaitRequest(DRAFTS_SET_PATH)

  expect(await storedDraft(kit.rpc, sessionId)).toEqual({
    sessionId,
    text: 'short',
    selectionStart: 5,
    selectionEnd: 5,
    grabs: [],
  })
})

test('appends to the stored draft on a new line with the caret at the end', async ({kit, core, sessionId}) => {
  await seedDraft(kit.rpc, sessionId, {text: 'a first line', grabs: ['a heading']})

  await appendDraft(makeRpcClient(core.base), sessionId, 'a second line')

  expect(await storedDraft(kit.rpc, sessionId)).toEqual({
    sessionId,
    text: 'a first line\na second line',
    selectionStart: 26,
    selectionEnd: 26,
    grabs: ['a heading'],
  })
})

test('survives a failed initial read and still accepts writes', async ({kit, core, sessionId}) => {
  await seedDraft(kit.rpc, sessionId, {text: 'unreachable at boot'})
  core.fail(DRAFTS_GET_PATH)

  const draftStorage = await makeDraftStorage(makeRpcClient(core.base), sessionId)

  expect(draftStorage.storage.getItem('any')).toBeNull()

  core.repair()
  draftStorage.storage.setItem('any', composerDraft('after the outage'))

  expect(draftStorage.storage.getItem('any')).toContain('after the outage')
  await core.awaitRequest(DRAFTS_SET_PATH)

  expect(await storedDraft(kit.rpc, sessionId)).toEqual({
    sessionId,
    text: 'after the outage',
    selectionStart: 16,
    selectionEnd: 16,
    grabs: [],
  })
})
