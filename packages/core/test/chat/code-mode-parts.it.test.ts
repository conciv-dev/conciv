import {afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {EventType} from '@tanstack/ai'
import {createTestHarness, type Kit, type TestHarness} from '@conciv/harness-testkit'
import {requireClaude} from '../helpers/adapters.js'
import {bootKit} from '../helpers/boot.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

const ChildPartSchema = z
  .object({
    type: z.literal('tool-call'),
    id: z.string(),
    name: z.string(),
    metadata: z.object({parentToolCallId: z.string()}).loose(),
  })
  .loose()

const MessageSchema = z.object({parts: z.array(z.unknown())}).loose()

function childParts(messages: unknown[]): z.infer<typeof ChildPartSchema>[] {
  return messages.flatMap((message) => {
    const parsed = MessageSchema.safeParse(message)
    if (!parsed.success) return []
    return parsed.data.parts.flatMap((part) => {
      const child = ChildPartSchema.safeParse(part)
      return child.success ? [child.data] : []
    })
  })
}

describe('code-mode per-tool parts on the wire (IT)', () => {
  it('conciv:tool_call events become tool-call parts nested under the script run', async () => {
    const harness: TestHarness = createTestHarness(requireClaude())
    const kit: Kit = await bootKit({}, harness)
    cleanups.push(() => kit.cleanup())
    const sessionId = await kit.session()
    const parentId = `tc-${sessionId}`
    harness.script.scriptToolCall(
      'execute_typescript',
      {typescriptCode: 'return await external_canvas_svg({})'},
      {
        blocking: false,
      },
    )
    harness.script.scriptCustomEvent('conciv:tool_call', {
      callId: 'call-1',
      name: 'canvas.svg',
      input: {shape: 'circle'},
      toolCallId: parentId,
    })
    harness.script.scriptCustomEvent('conciv:tool_result', {callId: 'call-1', result: 'drew'})
    const stream = await kit.attach(sessionId)
    await kit.rpc.chat.send({sessionId, text: 'draw a circle'})
    const events = await stream.done({hangGuardMs: 10_000})
    const snapshot = events.all.findLast((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT)
    if (!snapshot || snapshot.type !== EventType.MESSAGES_SNAPSHOT) throw new Error('no snapshot')
    const children = childParts(snapshot.messages)
    expect(children).toHaveLength(1)
    expect(children[0]).toMatchObject({name: 'canvas.svg', metadata: {parentToolCallId: parentId}})
    const raw = JSON.stringify(snapshot.messages)
    expect(raw).toContain('execute_typescript')
    expect(raw).toContain('drew')
  })
})
