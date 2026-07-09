import {describe, it, expect, afterEach} from 'vitest'
import {defineHarness} from '@conciv/protocol/harness-types'
import {makeTextAdapter} from '@conciv/harness'
import type {Kit} from '@conciv/harness-testkit'
import {bootKit} from '../../helpers/boot.js'

const liveHarness = defineHarness({
  id: 'commands-live-test',
  binName: 'true',
  chatConfig: () => ({adapter: makeTextAdapter('commands-test', async function* () {})}),
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
  chatConfig: () => ({adapter: makeTextAdapter('commands-test', async function* () {})}),
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

describe('meta.commands + meta.tools over rpc (IT, real server)', () => {
  const state = {server: undefined as Kit | undefined}
  afterEach(async () => {
    if (state.server) await state.server.cleanup()
    state.server = undefined
  })

  it('serves harness commands with derived sources and the mcp url', async () => {
    const server = await bootKit({}, liveHarness)
    state.server = server
    const payload = await server.rpc.meta.commands({})
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
    const server = await bootKit({}, noneHarness)
    state.server = server
    expect(await server.rpc.meta.commands({})).toEqual({commands: []})
  })

  it('serves the registered tool list', async () => {
    const server = await bootKit({}, noneHarness)
    state.server = server
    const payload = await server.rpc.meta.tools(undefined)
    expect(payload.tools.length).toBeGreaterThan(0)
    for (const tool of payload.tools) {
      expect(tool.name.length).toBeGreaterThan(0)
      expect(tool.description.length).toBeGreaterThan(0)
    }
  })
})
