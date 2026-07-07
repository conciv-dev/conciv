import {describe, it, expect, afterEach} from 'vitest'
import {Hono} from 'hono'
import {serve, type ServerType} from '@hono/node-server'
import {tmpdir} from 'node:os'
import {makeOpenSourceRoute} from '../../../src/api/page/open-source.js'
import {chunkWithInlineMap, cleanupChunks} from '../../page/fixtures.js'

const state: {server?: ServerType} = {}

afterEach(async () => {
  const server = state.server
  if (server) {
    if ('closeAllConnections' in server) server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  }
  state.server = undefined
  await cleanupChunks()
})

async function startServer(open: (file: string, line?: number) => void): Promise<string> {
  const app = new Hono().route('/api/page', makeOpenSourceRoute({openInEditor: open, root: tmpdir()}))
  const server = serve({fetch: app.fetch, port: 0, hostname: '127.0.0.1'})
  await new Promise<void>((resolve) => server.once('listening', resolve))
  state.server = server
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`
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
