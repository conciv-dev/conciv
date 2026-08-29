import {randomUUID} from 'node:crypto'
import {afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {defineExtension, defineTool} from '@conciv/extension'
import {createTestHarness, type Kit, type TestHarness} from '@conciv/harness-testkit'
import {requireClaude} from '../helpers/adapters.js'
import {bootKit} from '../helpers/boot.js'

const probe = defineTool({
  name: 'probe_ping',
  description: 'Ping the probe.',
  inputSchema: z.object({}),
  outputSchema: z.object({pong: z.boolean()}),
  meta: {summary: 'ping the probe', category: 'fixture', mutating: false},
}).server(() => ({pong: true}))

const extension = defineExtension({name: 'probe', tools: [probe]})

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

async function bootProbe(): Promise<{kit: Kit; harness: TestHarness}> {
  const harness = createTestHarness(requireClaude())
  const kit = await bootKit({extensions: [extension]}, harness)
  cleanups.push(() => kit.cleanup())
  return {kit, harness}
}

async function snapshotToolNames(kit: Kit, harness: TestHarness, wireName: string): Promise<string[]> {
  const sessionId = await kit.session()
  harness.script.scriptToolCall(wireName, {}, {blocking: false})
  const stream = await kit.attach(sessionId)
  await kit.rpc.chat.send({runId: randomUUID(), sessionId, text: 'ping the probe'})
  const events = await stream.done({hangGuardMs: 10_000})
  return events.toolCalls().map((call) => call.name)
}

describe('tool-name normalization on the wire (IT)', () => {
  it('the bare registered name reaches the widget unchanged', async () => {
    const {kit, harness} = await bootProbe()
    expect(await snapshotToolNames(kit, harness, 'probe_ping')).toContain('probe_ping')
  })

  it('opencode bridge form (tanstack_probe_ping) is stripped back to the registered name', async () => {
    const {kit, harness} = await bootProbe()
    expect(await snapshotToolNames(kit, harness, 'tanstack_probe_ping')).toContain('probe_ping')
  })

  it('mcp server form (mcp__tanstack__probe_ping) is stripped back to the registered name', async () => {
    const {kit, harness} = await bootProbe()
    expect(await snapshotToolNames(kit, harness, 'mcp__tanstack__probe_ping')).toContain('probe_ping')
  })

  it('CLI-native names pass through untouched', async () => {
    const {kit, harness} = await bootProbe()
    expect(await snapshotToolNames(kit, harness, 'Bash')).toContain('Bash')
  })
})
