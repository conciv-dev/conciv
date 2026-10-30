import {mkdtempSync, readFileSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {expect, test} from 'vitest'
import {z} from 'zod'
import {start} from '../src/start.js'
import {statePaths} from '../src/lib/state-paths.js'

const EndpointSchema = z.object({mcpUrl: z.string()})

function recordedEndpoint(root: string): z.infer<typeof EndpointSchema> {
  return EndpointSchema.parse(JSON.parse(readFileSync(join(statePaths(root).dir, 'mcp-endpoint.json'), 'utf8')))
}

const initialize = {
  jsonrpc: '2.0',
  id: 1,
  method: 'initialize',
  params: {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'endpoint-test', version: '0.0.0'}},
}

test('start records the MCP endpoint a headless stdio bridge reads, and the endpoint answers', async () => {
  const root = mkdtempSync(join(tmpdir(), 'conciv-engine-mcp-'))
  try {
    const engine = await start({options: {harnessBin: 'true', stateRoot: root}, root, launchEditor: () => {}})
    try {
      const {mcpUrl} = recordedEndpoint(root)
      expect(mcpUrl).toBe(`http://127.0.0.1:${engine.port}/api/mcp`)
      const response = await fetch(mcpUrl, {
        method: 'POST',
        headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream'},
        body: JSON.stringify(initialize),
      })
      expect(response.status).toBe(200)
      await response.body?.cancel()
    } finally {
      await engine.stop()
    }
  } finally {
    rmSync(root, {recursive: true, force: true})
  }
})
