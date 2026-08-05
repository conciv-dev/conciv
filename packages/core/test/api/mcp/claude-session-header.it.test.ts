import {randomUUID} from 'node:crypto'
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {createMCPClient} from '@tanstack/ai-mcp'
import {CONCIV_CLAUDE_SESSION_HEADER, CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {defineExtension, defineTool} from '@conciv/extension'
import {bootKit} from '../../helpers/boot.js'

const echo = defineTool({
  name: 'acme_echo_session',
  description: 'Echo the request session back',
  inputSchema: z.object({}),
}).server((_input, _ctx, request) => ({sessionId: request.sessionId}))

const acme = defineExtension({name: 'acme', tools: [echo]})

async function echoedSession(base: string, headers: Record<string, string>): Promise<string> {
  const mcp = await createMCPClient({transport: {type: 'http', url: `${base}/api/mcp`, headers}})
  try {
    const tool = (await mcp.tools()).find((candidate) => candidate.name === 'execute_typescript')
    if (!tool?.execute) throw new Error('execute_typescript not registered on /api/mcp')
    const raw = await tool.execute({typescriptCode: 'return await external_acme_echo_session({})'})
    const reply = z
      .object({result: z.object({sessionId: z.string()})})
      .loose()
      .parse(JSON.parse(z.string().parse(raw)))
    return reply.result.sessionId
  } finally {
    await mcp.close()
  }
}

describe('/api/mcp resolves the calling claude session', () => {
  it('scopes tools to the conciv session that adopted that claude session', async () => {
    const kit = await bootKit({extensions: [acme]})
    try {
      const claudeSessionId = randomUUID()
      const sessionId = await kit.session(claudeSessionId)
      expect(sessionId).toMatch(/^conciv_/)

      expect(await echoedSession(kit.base, {[CONCIV_CLAUDE_SESSION_HEADER]: claudeSessionId})).toBe(sessionId)
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('leaves the call unscoped when that claude session maps to nothing', async () => {
    const kit = await bootKit({extensions: [acme]})
    try {
      expect(await echoedSession(kit.base, {[CONCIV_CLAUDE_SESSION_HEADER]: randomUUID()})).toBe('')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)

  it('keeps honouring the conciv session header the owned and tty paths send', async () => {
    const kit = await bootKit({extensions: [acme]})
    try {
      expect(await echoedSession(kit.base, {[CONCIV_SESSION_HEADER]: 'conciv_x'})).toBe('conciv_x')
    } finally {
      await kit.cleanup()
    }
  }, 30_000)
})
