import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {mkdtempSync} from 'node:fs'
import {homedir, tmpdir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {ensureTrailBinary, recordsClient, startTrailBase} from './index.js'
import {uuidv7Base64} from '../uuid.js'

const spec = {extension: 'demo', name: 'notes', columns: `session_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT ''`}

let server: {url: string; stop(): Promise<void>}

beforeAll(async () => {
  const binary = await ensureTrailBinary({cacheDir: join(homedir(), '.cache/conciv/trailbase')})
  server = await startTrailBase({
    binary,
    dataDir: mkdtempSync(join(tmpdir(), 'depot-ext-')),
    port: await getPort(),
    dev: true,
    extensionTables: [spec],
  })
}, 120000)

afterAll(async () => server.stop())

describe('extension tables over the record api', () => {
  it('serves crud on ext_demo_notes and accepts a client-generated uuidv7 id', async () => {
    const records = recordsClient(server.url).extension
    const id = uuidv7Base64()
    await records.create('ext_demo_notes', {id, session_id: 'conciv_x', body: 'hello'})
    const rows = await records.list('ext_demo_notes')
    expect(rows).toHaveLength(1)
    const row = rows[0]
    expect(row).toMatchObject({id, session_id: 'conciv_x', body: 'hello'})
  })
})
