import {describe, expect, it} from 'vitest'
import {createMCPClient} from '@tanstack/ai-mcp'
import {startTestServer} from '../../helpers/server.js'

describe('/api/mcp', () => {
  it('runs aidx_ui and bridges to uiBus', async () => {
    const injected: unknown[] = []
    const {base, close} = await startTestServer({onInjectUi: (s) => (injected.push(s), true)})
    const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`}})
    try {
      const tools = await mcp.tools()
      const uiTool = tools.find((t) => t.name === 'aidx_ui')
      if (!uiTool?.execute) throw new Error('aidx_ui not registered on /api/mcp')
      const result = await uiTool.execute({kind: 'confirm', question: 'ok?'})
      expect(injected).toHaveLength(1)
      expect(JSON.stringify(result)).toContain('renderId')
    } finally {
      await mcp.close()
      await close()
    }
  }, 30_000)
})
