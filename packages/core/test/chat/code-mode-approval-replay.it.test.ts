import {afterEach, describe, expect, it} from 'vitest'
import {tmpdir} from 'node:os'
import {z} from 'zod'
import {EventType, type StreamChunk} from '@tanstack/ai'
import {defineExtension, defineTool} from '@conciv/extension'
import {approvalIds, createTestHarness} from '@conciv/harness-testkit'
import {requireClaude} from '../helpers/adapters.js'
import {bootKit} from '../helpers/boot.js'
import {freshSubscriberSnapshot} from '../helpers/fake-session.js'
import type {SnapshotView} from '../helpers/snapshots.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

const purge = defineTool({
  name: 'vault_purge',
  description: 'Purge the vault.',
  inputSchema: z.object({}),
  outputSchema: z.object({purged: z.boolean()}),
  approval: 'ask',
  meta: {summary: 'purge the vault'},
}).server(() => ({purged: true}))

const vault = defineExtension({name: 'vault', tools: [purge]})

const ToolCallPartSchema = z
  .object({
    type: z.literal('tool-call'),
    name: z.string(),
    state: z.string().optional(),
    approval: z.object({id: z.string()}).loose().optional(),
  })
  .loose()

type ToolCallPart = z.infer<typeof ToolCallPartSchema>

function callThroughCatalog(name: string, input: unknown): string {
  return `
    const found = await external_catalog({name: ${JSON.stringify(name)}})
    const call = globalThis[found.call]
    if (typeof call !== 'function') throw new Error('binding missing: ' + found.call)
    return await call(${JSON.stringify(input)})
  `
}

function startsCall(chunk: StreamChunk, name: string): boolean {
  if (chunk.type !== EventType.TOOL_CALL_START) return false
  return (chunk.toolCallName ?? chunk.toolName) === name
}

function toolCallsNamed(snapshot: SnapshotView, name: string): ToolCallPart[] {
  return snapshot.messages
    .flatMap((message) => message.parts)
    .flatMap((part) => {
      const parsed = ToolCallPartSchema.safeParse(part)
      return parsed.success && parsed.data.name === name ? [parsed.data] : []
    })
}

describe('a subscriber attaching mid-gate rebuilds the code-mode call as approval-requested', () => {
  it('replays the inner tool call before the approval that belongs to it', async () => {
    const harness = createTestHarness(requireClaude())
    const kit = await bootKit({cwd: tmpdir(), extensions: [vault]}, harness)
    cleanups.push(() => kit.cleanup())
    const sessionId = await kit.session()
    harness.script.scriptToolCall('execute_typescript', {typescriptCode: callThroughCatalog('vault_purge', {})})
    const keeper = await kit.turn('purge the vault', {session: sessionId, runId: 'code-mode-approval-replay-1'})

    const asked = await keeper.waitFor((chunk) => approvalIds(chunk).length > 0, {hangGuardMs: 20_000})
    const approvalId = approvalIds(asked)[0]
    if (approvalId === undefined) throw new Error('no approval id reached the live stream')

    await keeper.waitFor((chunk) => startsCall(chunk, 'vault_purge'), {hangGuardMs: 20_000})

    const refreshed = await freshSubscriberSnapshot(kit, sessionId)
    expect(toolCallsNamed(refreshed, 'vault_purge')).toMatchObject([
      {state: 'approval-requested', approval: {id: approvalId}},
    ])

    await kit.rpc.chat.permissionDecision({approvalId, approved: false})
    await keeper.done({hangGuardMs: 20_000})
  }, 60_000)
})
