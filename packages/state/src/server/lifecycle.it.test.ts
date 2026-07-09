import {describe, expect, it} from 'vitest'
import {mkdtempSync} from 'node:fs'
import {tmpdir, homedir} from 'node:os'
import {join} from 'node:path'
import getPort from 'get-port'
import {ensureTrailBinary, startTrailBase} from './index.js'

describe('trailbase lifecycle', () => {
  it('downloads, starts, serves records, stops', async () => {
    const binary = await ensureTrailBinary({cacheDir: join(homedir(), '.cache/conciv/trailbase')})
    const dataDir = mkdtempSync(join(tmpdir(), 'traildepot-'))
    const port = await getPort()
    const server = await startTrailBase({binary, dataDir, port, dev: true})
    const response = await fetch(`${server.url}/api/records/v1/sessions`)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({total_count: 0, records: []})
    await server.stop()
  }, 120000)
})
