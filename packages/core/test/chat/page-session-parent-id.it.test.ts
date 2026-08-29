import {afterEach, describe, expect, it} from 'vitest'
import {z} from 'zod'
import {EventType, type StreamChunk} from '@tanstack/ai'
import type {PageOutcome} from '@conciv/protocol/page-types'
import {createTestHarness, withAutoApproval, type Kit, type RunStream, type TestHarness} from '@conciv/harness-testkit'
import {requireClaude} from '../helpers/adapters.js'
import {bootKit} from '../helpers/boot.js'
import {connectWidget, type FakeWidget} from '../helpers/fake-widget.js'

const cleanups: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup()
})

function answerFor(name: string): PageOutcome {
  void name
  return {ok: true, result: {result: 2}}
}

function callThroughCatalog(name: string, input: unknown): string {
  return `
    const found = await external_catalog({name: ${JSON.stringify(name)}})
    const call = globalThis[found.call]
    if (typeof call !== 'function') throw new Error('binding missing: ' + found.call)
    return await call(${JSON.stringify(input)})
  `
}

function callTwiceThroughCatalog(name: string, inputs: readonly unknown[]): string {
  return `
    const found = await external_catalog({name: ${JSON.stringify(name)}})
    const call = globalThis[found.call]
    const inputs = ${JSON.stringify(inputs)}
    const results = []
    for (const input of inputs) results.push(await call(input))
    return results
  `
}

async function bootScripted(): Promise<{kit: Kit; harness: TestHarness}> {
  const harness = createTestHarness(requireClaude())
  const kit = await bootKit({}, harness)
  cleanups.push(() => kit.cleanup())
  return {kit, harness}
}

async function bootWidget(kit: Kit): Promise<FakeWidget> {
  const widget = await connectWidget(kit, answerFor)
  cleanups.push(async () => widget.end())
  return widget
}

function isStartOf(toolName: string): (chunk: StreamChunk) => boolean {
  return (chunk) => chunk.type === EventType.TOOL_CALL_START && (chunk.toolCallName ?? chunk.toolName) === toolName
}

const StartChunkSchema = z.object({
  toolCallId: z.string(),
  metadata: z.object({parentToolCallId: z.string().optional()}).loose().optional(),
})

function startOf(chunk: StreamChunk): z.infer<typeof StartChunkSchema> {
  return StartChunkSchema.parse(chunk)
}

async function outerExecutionId(stream: RunStream): Promise<string> {
  return startOf(await stream.waitFor(isStartOf('execute_typescript'), {hangGuardMs: 15_000})).toolCallId
}

async function evalParentId(stream: RunStream): Promise<string | undefined> {
  return startOf(await stream.waitFor(isStartOf('page_eval'), {hangGuardMs: 15_000})).metadata?.parentToolCallId
}

const PartSchema = z
  .object({
    type: z.string(),
    id: z.string().optional(),
    name: z.string().optional(),
    metadata: z.object({parentToolCallId: z.string().optional()}).loose().optional(),
  })
  .loose()

function partsOf(messages: readonly unknown[]): z.infer<typeof PartSchema>[] {
  return messages.flatMap((message) => {
    const parsed = z
      .object({parts: z.array(z.unknown())})
      .loose()
      .safeParse(message)
    if (!parsed.success) return []
    return parsed.data.parts.flatMap((part) => {
      const parsedPart = PartSchema.safeParse(part)
      return parsedPart.success ? [parsedPart.data] : []
    })
  })
}

async function snapshotParts(kit: Kit, sessionId: string): Promise<z.infer<typeof PartSchema>[]> {
  const reattached = await kit.events(sessionId)
  const snapshot = await reattached.waitFor((chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT, {
    hangGuardMs: 10_000,
  })
  if (snapshot.type !== EventType.MESSAGES_SNAPSHOT) throw new Error('expected a messages snapshot chunk')
  return partsOf(snapshot.messages)
}

describe('the page-session parent id is the outer execution id on the chat producer path', () => {
  it('a page_eval run inside a chat turn carries the enclosing execute_typescript call id', async () => {
    const {kit, harness} = await bootScripted()
    await bootWidget(kit)
    const sessionId = await kit.session()
    harness.script.scriptToolCall('execute_typescript', {
      typescriptCode: callThroughCatalog('page_eval', {code: '1 + 1'}),
    })
    const executionId = await withAutoApproval(kit.base, sessionId, async () => {
      const stream = await kit.turn('evaluate it', {session: sessionId, runId: 'parent-id-chat-1'})
      const outer = await outerExecutionId(stream)
      expect(await evalParentId(stream)).toBe(outer)
      await stream.done({hangGuardMs: 15_000})
      return outer
    })

    const parts = await snapshotParts(kit, sessionId)
    const outer = parts.find((part) => part.name === 'execute_typescript')
    const inner = parts.find((part) => part.name === 'page_eval')
    expect(outer?.id).toBe(executionId)
    expect(inner?.metadata?.parentToolCallId).toBe(executionId)
  }, 60_000)

  it('every page_eval of a multi-eval script names the same one enclosing call', async () => {
    const {kit, harness} = await bootScripted()
    await bootWidget(kit)
    const sessionId = await kit.session()
    harness.script.scriptToolCall('execute_typescript', {
      typescriptCode: callTwiceThroughCatalog('page_eval', [{code: '1 + 1'}, {code: '2 + 2'}]),
    })
    const executionId = await withAutoApproval(kit.base, sessionId, async () => {
      const stream = await kit.turn('evaluate both', {session: sessionId, runId: 'parent-id-chat-2'})
      const outer = await outerExecutionId(stream)
      await stream.done({hangGuardMs: 20_000})
      return outer
    })

    const parts = await snapshotParts(kit, sessionId)
    const evals = parts.filter((part) => part.name === 'page_eval')
    expect(evals.length).toBe(2)
    expect(evals.map((part) => part.metadata?.parentToolCallId)).toEqual([executionId, executionId])
  }, 60_000)
})

describe('the page-session parent id is the outer execution id on the /api/mcp producer path', () => {
  it('a page_eval run through the mcp sandbox carries the enclosing execute_typescript call id', async () => {
    const kit = await bootKit({})
    cleanups.push(() => kit.cleanup())
    await bootWidget(kit)
    const sessionId = await kit.session()
    const stream = await kit.events(sessionId)

    await expect(
      withAutoApproval(kit.base, sessionId, () => kit.callTool('page_eval', {code: '1 + 1'}, sessionId)),
    ).resolves.toMatchObject({result: 2})

    const executionId = await outerExecutionId(stream)
    expect(await evalParentId(stream)).toBe(executionId)
  }, 60_000)
})
