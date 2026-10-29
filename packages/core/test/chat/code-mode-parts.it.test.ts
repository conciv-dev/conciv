import {afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {StreamProcessor} from '@tanstack/ai'
import {defineExtension, defineTool} from '@conciv/extension'
import {createTestHarness, type Kit, type TestHarness} from '@conciv/harness-testkit'
import {requireClaude} from '../helpers/adapters.js'
import {bootKit} from '../helpers/boot.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

const svg = defineTool({
  name: 'canvas_svg',
  description: 'Draw a shape on the canvas.',
  inputSchema: z.object({shape: z.string()}),
  outputSchema: z.object({drawn: z.string()}),
  meta: {summary: 'draw a shape on the canvas'},
}).server(() => ({drawn: 'drew'}))

const canvas = defineExtension({name: 'canvas', tools: [svg]})

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

function callThroughCatalog(name: string, input: unknown): string {
  return `
    const found = await external_catalog({name: ${JSON.stringify(name)}})
    const call = globalThis[found.call]
    if (typeof call !== 'function') throw new Error('binding missing: ' + found.call)
    return await call(${JSON.stringify(input)})
  `
}

describe('code-mode per-tool parts on the wire (IT)', () => {
  it('a capability called inside the sandbox becomes a tool-call part nested under the script run', async () => {
    const harness: TestHarness = createTestHarness(requireClaude())
    const kit: Kit = await bootKit({extensions: [canvas]}, harness)
    cleanups.push(() => kit.cleanup())
    const sessionId = await kit.session()
    const parentId = harness.script.scriptToolCall('execute_typescript', {
      typescriptCode: callThroughCatalog('canvas_svg', {shape: 'circle'}),
    })
    const stream = await kit.turn('draw a circle', {session: sessionId, runId: 'code-mode-parts-1'})
    const events = await stream.done({hangGuardMs: 15_000})
    const processor = new StreamProcessor({})
    for (const chunk of events.all) processor.processChunk(chunk)
    const messages = processor.getMessages()
    const children = childParts(messages)
    expect(children.map((child) => child.name)).toEqual(['catalog', 'canvas_svg'])
    expect(children.every((child) => child.metadata.parentToolCallId === parentId)).toBe(true)
    const raw = JSON.stringify(messages)
    expect(raw).toContain('execute_typescript')
    expect(raw).toContain('drew')
  }, 60_000)
})
