import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {call} from '@orpc/server'
import {makeSessionStore, makeUiState, openDb} from '@conciv/db'
import {makeLiveFeed} from './live.js'
import {makeRpcRouter, type RpcContext, type RpcDeps} from './router.js'

const rpcContext = (): {context: RpcContext} => ({context: {request: new Request('http://conciv.test/rpc')}})

type DepSpies = {
  stopped: string[]
  killed: string[]
  opened: Array<{file: string; line?: number}>
  launched: Array<{sessionId: string; model?: string; origin: string}>
}

function makeDeps(): RpcDeps & {spies: DepSpies} {
  const db = openDb(mkdtempSync(join(tmpdir(), 'conciv-rpc-')))
  const store = makeSessionStore({db})
  const live = makeLiveFeed()
  const uiState = makeUiState(db)
  store.watch(() => live.pulse())
  uiState.watch(() => live.pulse())
  const spies: DepSpies = {stopped: [], killed: [], opened: [], launched: []}
  return {
    spies,
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
    harnessModels: async () => ({
      models: [
        {id: 'm1', name: 'M1'},
        {id: 'm2', name: 'M2', disabled: true},
      ],
      defaultModel: 'm1',
    }),
    harnessMeta: {id: 'claude', name: 'Claude', canLaunch: true},
    harnessKind: 'claude',
    cwd: '/w',
    markStopped: (sessionId) => spies.stopped.push(sessionId),
    killLock: (sessionId) => spies.killed.push(sessionId),
    launch: async (opts) => {
      spies.launched.push(opts)
      return {supported: true, opened: true, command: 'claude'}
    },
    commands: async (opts) => ({
      commands: [{name: `echo-${opts.origin}`, description: '', source: 'harness' as const}],
    }),
    tools: [{name: 'conciv_page', description: 'page tool'}],
    openInEditor: (file, line) => spies.opened.push({file, ...(line === undefined ? {} : {line})}),
    openFromFrames: async () => ({status: 'opened' as const}),
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

  it('sessions.create mints a record and a new-marker', async () => {
    const deps = makeDeps()
    const router = makeRpcRouter(deps)
    const {sessionId} = await call(router.sessions.create, undefined, rpcContext())
    expect(sessionId).toMatch(/^conciv_/)
    expect(await deps.store.get(sessionId)).not.toBeNull()
    const marks = await deps.uiState.listMarkers(sessionId)
    expect(marks.map((marker) => marker.kind)).toEqual(['new'])
  })

  it('sessions.resolve adopts a foreign harness id as external', async () => {
    const deps = makeDeps()
    const router = makeRpcRouter(deps)
    const {sessionId} = await call(router.sessions.resolve, {id: 'harness-token-1'}, rpcContext())
    expect(sessionId).toMatch(/^conciv_/)
    const record = await deps.store.get(sessionId)
    expect(record?.origin).toBe('external')
    expect(record?.harnessSessionId).toBe('harness-token-1')
    const again = await call(router.sessions.resolve, {id: 'harness-token-1'}, rpcContext())
    expect(again.sessionId).toBe(sessionId)
  })

  it('sessions.rename sanitizes and persists the title', async () => {
    const deps = makeDeps()
    const router = makeRpcRouter(deps)
    const {sessionId} = await call(router.sessions.create, undefined, rpcContext())
    const renamed = await call(router.sessions.rename, {sessionId, title: '  a  b  '}, rpcContext())
    expect(renamed.title).toBe('a b')
    expect((await deps.store.get(sessionId))?.title).toBe('a b')
    await expect(call(router.sessions.rename, {sessionId: 'conciv_missing', title: 'x'}, rpcContext())).rejects.toMatchObject({code: 'NOT_FOUND'})
  })

  it('sessions.setModel rejects unknown and disabled models with typed errors', async () => {
    const deps = makeDeps()
    const router = makeRpcRouter(deps)
    const {sessionId} = await call(router.sessions.create, undefined, rpcContext())
    await expect(call(router.sessions.setModel, {sessionId, model: 'nope'}, rpcContext())).rejects.toMatchObject({code: 'UNKNOWN_MODEL'})
    await expect(call(router.sessions.setModel, {sessionId, model: 'm2'}, rpcContext())).rejects.toMatchObject({code: 'UNKNOWN_MODEL'})
    const set = await call(router.sessions.setModel, {sessionId, model: 'm1'}, rpcContext())
    expect(set.model).toBe('m1')
    expect((await deps.store.get(sessionId))?.model).toBe('m1')
  })

  it('sessions.remove kills the lock and clears rows', async () => {
    const deps = makeDeps()
    const router = makeRpcRouter(deps)
    const {sessionId} = await call(router.sessions.create, undefined, rpcContext())
    await call(router.drafts.set, {sessionId, text: 'x', selectionStart: 0, selectionEnd: 0, grabs: []}, rpcContext())
    await call(router.sessions.remove, {sessionId}, rpcContext())
    expect(await deps.store.get(sessionId)).toBeNull()
    expect(await deps.uiState.getDraft(sessionId)).toBeNull()
    expect(await deps.uiState.listMarkers(sessionId)).toEqual([])
    expect(deps.spies.killed).toEqual([sessionId])
  })

  it('sessions.stop marks stopped and kills the lock', async () => {
    const deps = makeDeps()
    const router = makeRpcRouter(deps)
    await call(router.sessions.stop, {sessionId: 'conciv_s'}, rpcContext())
    expect(deps.spies.stopped).toEqual(['conciv_s'])
    expect(deps.spies.killed).toEqual(['conciv_s'])
  })

  it('sessions.launch forwards model and request origin', async () => {
    const deps = makeDeps()
    const router = makeRpcRouter(deps)
    const result = await call(router.sessions.launch, {sessionId: 'conciv_l', model: 'm1'}, rpcContext())
    expect(result.opened).toBe(true)
    expect(deps.spies.launched).toEqual([{sessionId: 'conciv_l', model: 'm1', origin: 'http://conciv.test'}])
  })

  it('editor.open forwards file and line', async () => {
    const deps = makeDeps()
    const router = makeRpcRouter(deps)
    await call(router.editor.open, {file: 'src/x.ts', line: 12}, rpcContext())
    expect(deps.spies.opened).toEqual([{file: 'src/x.ts', line: 12}])
  })

  it('editor.openFromFrames returns the symbolication status', async () => {
    const deps = makeDeps()
    const router = makeRpcRouter(deps)
    const result = await call(router.editor.openFromFrames, {frames: [{fileName: 'a.js', line: 1}]}, rpcContext())
    expect(result.status).toBe('opened')
  })

  it('meta.models and meta.commands and meta.tools serve harness data', async () => {
    const deps = makeDeps()
    const router = makeRpcRouter(deps)
    const models = await call(router.meta.models, undefined, rpcContext())
    expect(models.defaultModel).toBe('m1')
    expect(models.harness.canLaunch).toBe(true)
    const commands = await call(router.meta.commands, {}, rpcContext())
    expect(commands.commands[0]?.name).toBe('echo-http://conciv.test')
    const tools = await call(router.meta.tools, undefined, rpcContext())
    expect(tools.tools.map((tool) => tool.name)).toEqual(['conciv_page'])
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
