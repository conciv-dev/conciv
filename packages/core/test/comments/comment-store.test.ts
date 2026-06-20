import {mkdtemp, rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {afterEach, beforeEach, expect, test} from 'vitest'
import {createCommentStore, type CommentInput} from '../../src/comments/comment-store.js'

const state = {root: '', store: null as ReturnType<typeof createCommentStore> | null}
beforeEach(async () => {
  state.root = await mkdtemp(join(tmpdir(), 'mandarax-comments-'))
  state.store = createCommentStore({stateRoot: state.root})
})
afterEach(async () => {
  state.store?.close()
  await rm(state.root, {recursive: true, force: true})
})

function input(over: Partial<CommentInput> = {}): CommentInput {
  return {
    id: over.id ?? 'c1',
    sessionId: 'sess',
    previewId: 'local',
    threadId: over.threadId ?? over.id ?? 'c1',
    parts: [{type: 'text', text: 'fix this button'}],
    authorKind: 'human',
    kind: 'source-linked',
    anchorFile: 'src/Button.tsx',
    ...over,
  }
}

test('create then get round-trips a comment with parsed parts + open status', () => {
  const created = state.store!.create(input(), 1000)
  expect(created.status).toBe('open')
  expect(created.createdAt).toBe(1000)
  const got = state.store!.get('c1')
  expect(got?.parts).toEqual([{type: 'text', text: 'fix this button'}])
  expect(got?.anchorFile).toBe('src/Button.tsx')
})

test('list filters by session, file, and status', () => {
  state.store!.create(input({id: 'a', anchorFile: 'src/A.tsx'}))
  state.store!.create(input({id: 'b', anchorFile: 'src/B.tsx'}))
  expect(
    state
      .store!.list({sessionId: 'sess'})
      .map((c) => c.id)
      .toSorted(),
  ).toEqual(['a', 'b'])
  expect(state.store!.list({file: 'src/A.tsx'}).map((c) => c.id)).toEqual(['a'])
  state.store!.setStatus('b', 'resolved', 'human')
  expect(state.store!.list({status: 'open'}).map((c) => c.id)).toEqual(['a'])
})

test('FTS5 search matches comment body text', () => {
  state.store!.create(input({id: 'a', parts: [{type: 'text', text: 'the navbar is misaligned'}]}))
  state.store!.create(input({id: 'b', parts: [{type: 'text', text: 'spinner never stops'}]}))
  expect(state.store!.search('navbar').map((c) => c.id)).toEqual(['a'])
  expect(state.store!.search('spinner').map((c) => c.id)).toEqual(['b'])
})

test('resolve sets resolved_at + resolved_by; delete removes row and fts entry', () => {
  state.store!.create(input({id: 'a', parts: [{type: 'text', text: 'searchable text here'}]}))
  const resolved = state.store!.setStatus('a', 'resolved', 'ai', 2000)
  expect(resolved.status).toBe('resolved')
  expect(resolved.resolvedAt).toBe(2000)
  expect(resolved.resolvedBy).toBe('ai')
  state.store!.delete('a')
  expect(state.store!.get('a')).toBeNull()
  expect(state.store!.search('searchable')).toEqual([])
})

test('persists across reopen (same .mandarax/comments.db file)', () => {
  state.store!.create(input({id: 'persist'}))
  state.store!.close()
  const reopened = createCommentStore({stateRoot: state.root})
  expect(reopened.get('persist')?.id).toBe('persist')
  reopened.close()
})
