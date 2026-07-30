import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {defineHarness, type HarnessAdapter} from '@conciv/protocol/harness-types'
import {createFakeHarness} from '@conciv/harness-testkit'
import {makeRpcClient} from '@conciv/contract'
import {connectPlanFor} from '../../src/chat/session.js'
import {start} from '../../src/start.js'
import {makeChatFixture} from '../helpers/chat-fixture.js'

function mcpEchoHarness(): HarnessAdapter {
  const fake = createFakeHarness({id: 'fake-mcp-base-path'})
  return defineHarness({
    id: fake.id,
    binName: fake.binName,
    chatConfig: fake.chatConfig,
    capabilities: {
      resume: false,
      permissionGate: 'none',
      transcriptHistory: false,
      compaction: false,
      systemPrompt: 'none',
      mcp: 'http',
      slashCommands: 'files',
      imageInput: false,
    },
    commands: ({mcpUrl}) => Promise.resolve([{name: mcpUrl ?? 'no-mcp-url'}]),
    connect: {plan: (ctx) => ({argv: [ctx.mcpUrl ?? 'no-mcp-url'], env: {}, files: []})},
  })
}

async function harnessFacingMcpUrl(accessToken?: string): Promise<string | undefined> {
  const root = mkdtempSync(join(tmpdir(), 'conciv-mcp-base-path-'))
  const harness = mcpEchoHarness()
  const engine = await start({
    options: {stateRoot: root, systemPrompt: false, harness: harness.id},
    root,
    harness,
    extensions: [],
    launchEditor: () => {},
    accessToken,
  })
  const prefix = accessToken ? `/t/${accessToken}` : ''
  const rpc = makeRpcClient(`http://127.0.0.1:${engine.port}${prefix}`)
  try {
    const {commands} = await rpc.meta.commands({sessionId: 'conciv_mcp_base_path'})
    return commands[0]?.name
  } finally {
    await engine.stop()
    rmSync(root, {recursive: true, force: true})
  }
}

describe('harness-facing mcp url', () => {
  it('carries the access-token base path when the app is mounted behind one', async () => {
    expect(await harnessFacingMcpUrl('tok-base-path')).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+\/t\/tok-base-path\/api\/mcp$/,
    )
  })

  it('has no token prefix when there is no access token', async () => {
    expect(await harnessFacingMcpUrl()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/mcp$/)
  })

  it('reaches the connect plan the launcher runs', async () => {
    const fixture = await makeChatFixture()
    try {
      const plan = await connectPlanFor(
        {...fixture.chat, basePath: '/t/tok-plan'},
        {sessionId: fixture.sessionId, requestUrl: 'http://127.0.0.1:4242/rpc'},
      )
      expect(plan?.argv.join(' ')).toContain('http://127.0.0.1:4242/t/tok-plan/api/mcp')
    } finally {
      rmSync(fixture.stateRoot, {recursive: true, force: true})
    }
  })
})
