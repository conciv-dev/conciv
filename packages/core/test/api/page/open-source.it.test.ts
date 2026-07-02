import {describe, it, expect, afterEach} from 'vitest'
import {H3} from 'h3'
import {serve, type Server} from 'srvx'
import {tmpdir} from 'node:os'
import {registerOpenSourceRoute} from '../../../src/api/page/open-source.js'
import {chunkWithInlineMap, cleanupChunks} from '../../page/fixtures.js'

const state: {server?: Server} = {}

afterEach(async () => {
  if (state.server) await state.server.close()
  state.server = undefined
  await cleanupChunks()
})

async function startServer(open: (file: string, line?: number) => void): Promise<string> {
  const app = new H3()
  registerOpenSourceRoute(app, {openInEditor: open, root: tmpdir()})
  const server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
  await server.ready()
  state.server = server
  return new URL(server.url ?? '').origin
}

async function post(base: string, body: unknown): Promise<{status: number; json: unknown}> {
  const res = await fetch(`${base}/api/page/open-source`, {
    method: 'POST',
    headers: {'content-type': 'application/json'},
    body: JSON.stringify(body),
  })
  return {status: res.status, json: await res.json()}
}

describe('POST /api/page/open-source', () => {
  it('symbolicates frames and opens the resolved file', async () => {
    const opened: {file?: string; line?: number} = {}
    const base = await startServer((file, line) => {
      opened.file = file
      opened.line = line
    })
    const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
    const {json} = await post(base, {frames: [{fileName: `file://${chunk}`, line: 2, column: 1}]})
    expect(json).toEqual({status: 'opened'})
    expect(opened).toEqual({file: 'app/page.tsx', line: 17})
  })

  it('returns no-source when no frame resolves', async () => {
    const opened: {file?: string} = {}
    const base = await startServer((file) => {
      opened.file = file
    })
    const {json} = await post(base, {frames: [{fileName: 'file:///does-not-exist.js', line: 1, column: 1}]})
    expect(json).toEqual({status: 'no-source'})
    expect(opened.file).toBeUndefined()
  })
})
