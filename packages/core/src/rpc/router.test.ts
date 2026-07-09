import {mkdtempSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {call} from '@orpc/server'
import {makeSessionStore, openDb} from '@conciv/db'
import {makeRpcRouter, type RpcContext, type RpcDeps} from './router.js'

const rpcContext = (): {context: RpcContext} => ({context: {request: new Request('http://conciv.test/rpc')}})

function makeDeps(): RpcDeps {
  const store = makeSessionStore({db: openDb(mkdtempSync(join(tmpdir(), 'conciv-rpc-')))})
  return {
    store,
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
