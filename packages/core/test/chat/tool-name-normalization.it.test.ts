import {afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {EventType} from '@tanstack/ai'
import {defineExtension, defineTool} from '@conciv/extension'
import {createTestHarness, type Kit, type TestHarness} from '@conciv/harness-testkit'
import {toolCallParts} from '../../src/chat/gate.js'
import {requireClaude} from '../helpers/adapters.js'
import {bootKit} from '../helpers/boot.js'

const probe = defineTool({
  name: 'probe.ping',
  description: 'Ping the probe.',
  inputSchema: z.object({}),
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
  await kit.rpc.chat.send({sessionId, text: 'ping the probe'})
  const events = await stream.done({hangGuardMs: 10_000})
  const snapshot = events.all.findLast((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT)
  if (!snapshot || snapshot.type !== EventType.MESSAGES_SNAPSHOT) throw new Error('no snapshot')
  return toolCallParts(snapshot.messages).map((part) => part.name)
}

describe('tool-name normalization on the wire (IT)', () => {
  it('claude bridge form (probe_ping) reaches the widget as the registered name', async () => {
    const {kit, harness} = await bootProbe()
    expect(await snapshotToolNames(kit, harness, 'probe_ping')).toContain('probe.ping')
  })

  it('opencode bridge form (tanstack_probe_ping) reaches the widget as the registered name', async () => {
    const {kit, harness} = await bootProbe()
    expect(await snapshotToolNames(kit, harness, 'tanstack_probe_ping')).toContain('probe.ping')
  })

  it('mcp server form (mcp__tanstack__probe_ping) reaches the widget as the registered name', async () => {
    const {kit, harness} = await bootProbe()
    expect(await snapshotToolNames(kit, harness, 'mcp__tanstack__probe_ping')).toContain('probe.ping')
  })

  it('CLI-native names pass through untouched', async () => {
    const {kit, harness} = await bootProbe()
    expect(await snapshotToolNames(kit, harness, 'Bash')).toContain('Bash')
  })
})
