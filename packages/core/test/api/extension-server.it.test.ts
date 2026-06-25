import {expect, test} from 'vitest'
import {createMCPClient} from '@tanstack/ai-mcp'
import {startTestServer} from '../helpers/server.js'
import {sampleServerExtension, sampleState} from '../fixtures/sample-server-extension.js'

test('extension route serves typed config; tool runs against injected ctx; dispose on close', async () => {
  sampleState.disposed = false
  const {base, close} = await startTestServer({
    extensions: [sampleServerExtension],
    extensionConfig: {sample: {factor: 5}},
  })
  try {
    const echo = (await (await fetch(`${base}/api/ext/sample/echo`)).json()) as {factor: number; cwd: string}
    expect(echo.factor).toBe(5)

    const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
    const tool = (await mcp.tools()).find((candidate) => candidate.name === 'sample_mul')
    if (!tool?.execute) throw new Error('sample_mul not registered')
    expect(JSON.stringify(await tool.execute({n: 4}))).toContain('20')
    await mcp.close()
  } finally {
    await close()
  }
  expect(sampleState.disposed).toBe(true)
}, 30_000)
