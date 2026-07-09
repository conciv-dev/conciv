import {beforeAll, afterAll, describe, expect, it} from 'vitest'
import {mkdtempSync} from 'node:fs'
import {tmpdir, homedir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {ensureTrailBinary, startTrailBase, recordsClient} from './server/index.js'
import {stateClient, sessionsCollection} from './index.js'

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

describe('sessions collection', () => {
  it('sees server-side inserts', async () => {
    const writer = recordsClient(server.url)
    await writer.create('sessions', {
      session_id: 'conciv_aaaaaaaa-1111-4222-8333-444444444444',
      harness_session_id: null,
      harness_kind: 'claude',
      origin: 'chat',
      title: null,
      model: null,
      usage: null,
      cwd: '/tmp',
      created_at: 1,
      updated_at: 1,
    })
    const collection = sessionsCollection(stateClient(server.url))
    const rows = await collection.toArrayWhenReady()
    expect(rows).toHaveLength(1)
    expect(rows[0]?.session_id).toBe('conciv_aaaaaaaa-1111-4222-8333-444444444444')
  })
})
