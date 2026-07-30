import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it} from 'vitest'
import {defineHarness, type HarnessAdapter} from '@conciv/protocol/harness-types'
import {createFakeHarness} from '@conciv/harness-testkit'
import {makeRpcClient} from '@conciv/contract'
import {start} from '../../src/start.js'

function mcpEchoHarness(): HarnessAdapter {
  const fake = createFakeHarness({id: 'fake-launch-base-path'})
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
      slashCommands: 'none',
      imageInput: false,
    },
    launch: (ctx) => ({opened: false, command: ctx.mcpUrl ?? 'no-mcp-url'}),
  })
}

async function launchCommand(accessToken?: string): Promise<string | null> {
  const root = mkdtempSync(join(tmpdir(), 'conciv-launch-base-path-'))
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
    const launched = await rpc.sessions.launch({sessionId: 'conciv_launch_base_path'})
    return launched.command
  } finally {
    await engine.stop()
    rmSync(root, {recursive: true, force: true})
  }
}

describe('harness-facing mcp url', () => {
  it('carries the access-token base path when the app is mounted behind one', async () => {
    expect(await launchCommand('tok-base-path')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/t\/tok-base-path\/api\/mcp$/)
  })

  it('has no token prefix when there is no access token', async () => {
    expect(await launchCommand()).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/api\/mcp$/)
  })
})
