import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {call} from '@orpc/server'
import {makeSessionStore, makeUiState, openDb} from '@conciv/db'
import {makeLiveFeed} from './live.js'
import {makeRpcRouter, type RpcContext, type RpcDeps} from './router.js'

const rpcContext = (): {context: RpcContext} => ({context: {request: new Request('http://conciv.test/rpc')}})

function makeDeps(): RpcDeps {
  const db = openDb(mkdtempSync(join(tmpdir(), 'conciv-rpc-')))
  const store = makeSessionStore({db})
  const live = makeLiveFeed()
  const uiState = makeUiState(db)
  store.watch(() => live.pulse())
  uiState.watch(() => live.pulse())
  return {
    store,
    live,
    uiState,
    buildSessionList: async () =>
      (await store.list()).map((record) => ({
        id: record.id,
        title: record.title ?? 'New session',
        updatedAt: record.updatedAt,
        messageCount: 0,
        running: false,
        origin: 'conciv' as const,
        usage: null,
        status: 'idle' as const,
        model: record.model,
      })),
  }
}

describe('rpc router', () => {
  it('sessions.list returns metas from the store', async () => {
    const deps = makeDeps()
    await deps.store.create({
      id: 'conciv_a',
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: 'hello',
      model: null,
      usage: null,
      cwd: '/w',
    })
    const router = makeRpcRouter(deps)
    const list = await call(router.sessions.list, undefined, rpcContext())
    expect(list.map((meta) => meta.id)).toEqual(['conciv_a'])
    expect(list[0]?.status).toBe('idle')
  })

  it('sessions.live re-emits after a store write and detaches on abort', async () => {
    const deps = makeDeps()
    const router = makeRpcRouter(deps)
    const abort = new AbortController()
    const iterator = await call(router.sessions.live, undefined, {...rpcContext(), signal: abort.signal})
    const collected: string[][] = []
    const consumer = (async () => {
      for await (const metas of iterator) {
        collected.push(metas.map((meta) => meta.id))
        if (collected.length === 2) abort.abort()
      }
    })()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await deps.store.create({
      id: 'conciv_live',
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: '/w',
    })
    await consumer
    expect(collected[0]).toEqual([])
    expect(collected[1]).toEqual(['conciv_live'])
    expect(deps.live.size()).toBe(0)
  })

  it('drafts.set round-trips through drafts.get', async () => {
    const deps = makeDeps()
    const router = makeRpcRouter(deps)
    await call(
      router.drafts.set,
      {sessionId: 'conciv_d', text: 'hi', selectionStart: 2, selectionEnd: 2, grabs: ['<div/>']},
      rpcContext(),
    )
    const draft = await call(router.drafts.get, {sessionId: 'conciv_d'}, rpcContext())
    expect(draft?.text).toBe('hi')
    expect(draft?.grabs).toEqual(['<div/>'])
  })

  it('drafts.live re-emits after a set and detaches on abort', async () => {
    const deps = makeDeps()
    const router = makeRpcRouter(deps)
    const abort = new AbortController()
    const iterator = await call(router.drafts.live, {sessionId: 'conciv_d'}, {...rpcContext(), signal: abort.signal})
    const collected: (string | null)[] = []
    const consumer = (async () => {
      for await (const draft of iterator) {
        collected.push(draft?.text ?? null)
        if (collected.length === 2) abort.abort()
      }
    })()
    await new Promise((resolve) => setTimeout(resolve, 0))
    await call(
      router.drafts.set,
      {sessionId: 'conciv_d', text: 'live!', selectionStart: 0, selectionEnd: 0, grabs: []},
      rpcContext(),
    )
    await consumer
    expect(collected).toEqual([null, 'live!'])
    expect(deps.live.size()).toBe(0)
  })

  it('markers.live first emission lists existing markers', async () => {
    const deps = makeDeps()
    const router = makeRpcRouter(deps)
    await deps.uiState.addMarker({sessionId: 'conciv_m', afterTurn: 0, kind: 'new'})
    const abort = new AbortController()
    const iterator = await call(router.markers.live, {sessionId: 'conciv_m'}, {...rpcContext(), signal: abort.signal})
    const first = await iterator.next()
    abort.abort()
    await iterator.return(undefined)
    if (first.done) throw new Error('markers.live ended before first emission')
    expect(first.value.map((marker) => marker.kind)).toEqual(['new'])
  })

  it('mounts at /rpc/* over HTTP', async () => {
    const {makeTestApp} = await import('./test-app.js')
    const {app, dispose} = await makeTestApp()
    const response = await app.request('/rpc/sessions/list', {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({}),
    })
    expect(response.status).not.toBe(404)
    await dispose()
  })
})
