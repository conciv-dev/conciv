import {describe, it, expect, afterEach} from 'vitest'
import {registerHarness} from '@conciv/harness'
import {defineHarness} from '@conciv/protocol/harness-types'
import {ChatCommandsSchema, ChatToolsSchema} from '@conciv/protocol/chat-types'
import {startTestServer, type TestServer} from '../../helpers/server.js'

const liveHarness = defineHarness({
  id: 'commands-live-test',
  binName: 'true',
  buildArgs: () => [],
  async *decode() {},
  capabilities: {
    resume: false,
    permissionGate: 'none',
    transcriptHistory: false,
    compaction: false,
    systemPrompt: 'none',
    mcp: 'http',
    slashCommands: 'live',
    imageInput: false,
  },
  commands: async (ctx) => [
    {name: 'compact', description: 'Compact the context', argumentHint: '[instructions]'},
    {name: 'mcp__conciv__snapshot', description: 'Capture the board'},
    {name: 'conciv:extensions', description: 'Plugin skill'},
    {name: 'echo-mcp-url', description: ctx.mcpUrl ?? 'no-mcp-url'},
  ],
})

const noneHarness = defineHarness({
  id: 'commands-none-test',
  binName: 'true',
  buildArgs: () => [],
  async *decode() {},
  capabilities: {
    resume: false,
    permissionGate: 'none',
    transcriptHistory: false,
    compaction: false,
    systemPrompt: 'none',
    mcp: 'none',
    slashCommands: 'none',
    imageInput: false,
  },
})

registerHarness(liveHarness)
registerHarness(noneHarness)

describe('GET /api/chat/commands + /api/chat/tools (IT, real server)', () => {
  const state = {server: undefined as TestServer | undefined}
  afterEach(async () => {
    if (state.server) await state.server.close()
    state.server = undefined
  })

  it('serves harness commands with derived sources and the mcp url', async () => {
    const server = await startTestServer({harness: 'commands-live-test'})
    state.server = server
    const response = await fetch(`${server.base}/api/chat/commands`)
    expect(response.status).toBe(200)
    const payload = ChatCommandsSchema.parse(await response.json())
    const byName = new Map(payload.commands.map((command) => [command.name, command]))
    expect(byName.get('compact')).toEqual({
      name: 'compact',
      description: 'Compact the context',
      argumentHint: '[instructions]',
      source: 'harness',
    })
    expect(byName.get('mcp__conciv__snapshot')?.source).toBe('mcp')
    expect(byName.get('conciv:extensions')?.source).toBe('plugin')
    expect(byName.get('echo-mcp-url')?.description).toContain('/api/mcp')
  })

  it('returns an empty list for a harness without slash commands', async () => {
    const server = await startTestServer({harness: 'commands-none-test'})
    state.server = server
    const response = await fetch(`${server.base}/api/chat/commands`)
    expect(response.status).toBe(200)
    expect(ChatCommandsSchema.parse(await response.json())).toEqual({commands: []})
  })

  it('serves the registered tool list', async () => {
    const server = await startTestServer({harness: 'commands-none-test'})
    state.server = server
    const response = await fetch(`${server.base}/api/chat/tools`)
    expect(response.status).toBe(200)
    const payload = ChatToolsSchema.parse(await response.json())
    expect(payload.tools.length).toBeGreaterThan(0)
    for (const tool of payload.tools) {
      expect(tool.name.length).toBeGreaterThan(0)
      expect(tool.description.length).toBeGreaterThan(0)
    }
  })
})
