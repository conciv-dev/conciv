import {beforeAll, afterAll, describe, expect, it} from 'vitest'
import {mkdtempSync} from 'node:fs'
import {tmpdir, homedir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {ensureTrailBinary, startTrailBase, createTrailBaseSessionStore} from './index.js'
import {SessionId} from '@conciv/protocol/chat-types'

let server: {url: string; stop(): Promise<void>}

beforeAll(async () => {
  const binary = await ensureTrailBinary({cacheDir: join(homedir(), '.cache/conciv/trailbase')})
  server = await startTrailBase({
    binary,
    dataDir: mkdtempSync(join(tmpdir(), 'depot-')),
    port: await getPort(),
    dev: true,
  })
}, 120000)

afterAll(async () => server.stop())

describe('trailbase session store', () => {
  const id = SessionId.parse('conciv_11111111-2222-4333-8444-555555555555')

  it('create/get/update/list/findByHarnessId/delete round-trip', async () => {
    const store = createTrailBaseSessionStore({baseUrl: server.url, now: () => 42})
    const created = await store.create({
      id,
      harnessSessionId: null,
      harnessKind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: '/tmp/x',
    })
    expect(created.createdAt).toBe(42)
    expect(await store.get(id)).toEqual(created)
    const updated = await store.update(id, {harnessSessionId: 'h-1', usage: {inputTokens: 5, outputTokens: 1}})
    expect(updated.harnessSessionId).toBe('h-1')
    expect(await store.findByHarnessId('h-1')).toEqual(updated)
    expect(await store.list()).toHaveLength(1)
    await store.setStatus(id, 'thinking')
    await store.delete(id)
    expect(await store.get(id)).toBeNull()
  })
})
