import {describe, expect, test} from 'vitest'
import {z} from 'zod'
import {StreamProcessor, type AnyTool} from '@tanstack/ai'
import {writeReply, type ConcivDb} from '@conciv/db'
import type {ExtensionServerTool, ToolRequest} from '@conciv/extension'
import {makeChanges, type Changes} from '../../src/chat/attach.js'
import {makeRunGate, type PermissionGate} from '../../src/chat/gate.js'
import {gatedToolRun, makeCodeMode, withBindingNames} from '../../src/chat/code-mode.js'
import {testDb} from '../helpers/memory-store.js'

const request: ToolRequest = {sessionId: 'conciv_x', model: null}

const allowGate = {decide: async () => 'allow' as const}

const tool = (
  name: string,
  approval?: 'ask',
  execute: ExtensionServerTool['execute'] = async () => 'ok',
): ExtensionServerTool => ({
  name,
  description: `${name} does a thing. Extra prose here.`,
  inputSchema: z.object({}),
  approval,
  execute,
})

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const CodeResultSchema = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  error: z.object({message: z.string()}).optional(),
})

type CodeResult = z.infer<typeof CodeResultSchema>

async function runSandbox(tools: AnyTool[], typescriptCode: string): Promise<CodeResult> {
  const entry = tools.find((candidate) => candidate.name === 'execute_typescript')
  if (!entry?.execute) throw new Error('no execute_typescript tool')
  return CodeResultSchema.parse(await entry.execute({typescriptCode}, {}))
}

function codeModeOf(
  extensionTools: ExtensionServerTool[],
  gate: PermissionGate,
): {tools: AnyTool[]; systemPrompt: string} {
  const result = makeCodeMode(extensionTools, request, gate)
  if (!result) throw new Error('code mode unavailable: isolated-vm probe reported incompatible')
  return result
}

function denyingGate(risky: string[], db: ConcivDb, changes: Changes): PermissionGate {
  return makeRunGate({
    sessionId: 'conciv_x',
    processor: new StreamProcessor({events: {}}),
    db,
    changes,
    risky: new Set(risky),
    timeoutMs: 30,
    partWaitMs: 10,
  })
}

describe('makeCodeMode', () => {
  test('returns null for an empty tool list', () => {
    expect(makeCodeMode([], request, allowGate)).toBeNull()
  })

  test('binds every extension tool including approval-gated ones behind a discovery companion', () => {
    const result = makeCodeMode([tool('safe_tool'), tool('risky_tool', 'ask')], request, allowGate)
    expect(result).not.toBeNull()
    if (!result) throw new Error('no code mode')
    expect(result.tools.map((entry) => entry.name)).toEqual(['execute_typescript', 'discover_tools'])
    expect(result.systemPrompt).toContain('external_safe_tool')
    expect(result.systemPrompt).toContain('external_risky_tool')
    expect(result.systemPrompt).toContain('discover_tools')
  })

  test('advertises sanitized binding names for dotted tools', () => {
    const result = codeModeOf([tool('canvas.svg'), tool('comment.create')], allowGate)
    expect(result.systemPrompt).toContain('external_canvas_svg')
    expect(result.systemPrompt).toContain('external_comment_create')
    expect(result.systemPrompt).not.toContain('external_canvas.svg')
    const discovery = result.tools.find((entry) => entry.name === 'discover_tools')
    if (!discovery) throw new Error('no discover_tools')
    expect(discovery.description).toContain('external_canvas_svg')
    expect(discovery.description).not.toContain('external_canvas.svg')
  })
})

describe('withBindingNames', () => {
  test('sanitizes dotted names into identifier-safe bindings', () => {
    const named = withBindingNames([tool('canvas.svg'), tool('pin.setState'), tool('safe_tool')])
    expect(named.map((entry) => entry.bindingName)).toEqual(['canvas_svg', 'pin_setState', 'safe_tool'])
  })

  test('prefixes names that would start with a digit', () => {
    const named = withBindingNames([tool('3d.render')])
    expect(named[0]?.bindingName).toBe('_3d_render')
  })

  test('deterministically disambiguates colliding sanitized names', () => {
    const named = withBindingNames([tool('canvas.svg'), tool('canvas-svg'), tool('canvas_svg')])
    expect(named.map((entry) => entry.bindingName)).toEqual(['canvas_svg', 'canvas_svg_2', 'canvas_svg_3'])
  })

  test('keeps each binding paired with its original tool', () => {
    const named = withBindingNames([tool('canvas.svg'), tool('canvas-svg')])
    expect(named.map((entry) => entry.tool.name)).toEqual(['canvas.svg', 'canvas-svg'])
  })
})

describe('code mode sandbox execution', () => {
  test('runs a trivial script when a dotted tool is registered', async () => {
    const result = await runSandbox(codeModeOf([tool('canvas.svg')], allowGate).tools, 'return 1')
    expect(result.error?.message).toBeUndefined()
    expect(result.success).toBe(true)
    expect(result.result).toBe(1)
  })

  test('exposes a dotted tool as a callable sanitized binding', async () => {
    const dotted = tool('canvas.svg', undefined, async () => 'drew')
    const result = await runSandbox(codeModeOf([dotted], allowGate).tools, 'return await external_canvas_svg({})')
    expect(result.error?.message).toBeUndefined()
    expect(result.success).toBe(true)
    expect(result.result).toBe('drew')
  })

  test('gates a dotted risky tool on its original bare name', async () => {
    const db = testDb()
    const changes = makeChanges()
    const ran = {value: false}
    const gated = tool('canvas.delete', 'ask', async () => {
      ran.value = true
      return 'deleted'
    })
    const codeMode = codeModeOf([gated], denyingGate(['canvas.delete'], db, changes))
    const result = await runSandbox(codeMode.tools, 'return await external_canvas_delete({})')
    expect(result.success).toBe(false)
    expect(result.error?.message).toMatch(/denied/i)
    expect(ran.value).toBe(false)
  })

  test('leaves an unlisted dotted tool ungated', async () => {
    const db = testDb()
    const changes = makeChanges()
    const allowed = tool('canvas.read', undefined, async () => 'read')
    const codeMode = codeModeOf([allowed], denyingGate(['canvas.delete'], db, changes))
    const result = await runSandbox(codeMode.tools, 'return await external_canvas_read({})')
    expect(result.success).toBe(true)
    expect(result.result).toBe('read')
  })
})

describe('gatedToolRun', () => {
  test('deny reply blocks execute and throws a refusal', async () => {
    const db = testDb()
    const changes = makeChanges()
    const processor = new StreamProcessor({events: {}})
    const gate = makeRunGate({
      sessionId: 'conciv_x',
      processor,
      db,
      changes,
      risky: new Set(['canvas.delete']),
      timeoutMs: 30,
      partWaitMs: 10,
    })
    const ran = {value: false}
    const gated = tool('canvas.delete', 'ask', async () => {
      ran.value = true
      return 'deleted'
    })
    const run = gatedToolRun(gated, request, gate)
    await expect(run({})).rejects.toThrow(/denied/i)
    expect(ran.value).toBe(false)
  })

  test('allow reply lets execute run and returns its result', async () => {
    const db = testDb()
    const changes = makeChanges()
    const processor = new StreamProcessor({events: {}})
    const gate = makeRunGate({
      sessionId: 'conciv_x',
      processor,
      db,
      changes,
      risky: new Set(['canvas.delete']),
      timeoutMs: 5_000,
      partWaitMs: 10,
    })
    const ran = {value: false}
    const gated = tool('canvas.delete', 'ask', async () => {
      ran.value = true
      return 'deleted'
    })
    const run = gatedToolRun(gated, request, gate)
    const pending = run({})
    await sleep(60)
    const parts = processor.getMessages().flatMap((message) => message.parts)
    const toolPart = parts.find((part) => part.type === 'tool-call')
    const approvalId = toolPart && 'approval' in toolPart && toolPart.approval ? toolPart.approval.id : undefined
    if (approvalId === undefined) throw new Error('no approval id')
    writeReply(db, 'conciv_x', approvalId, true)
    changes.notify()
    await expect(pending).resolves.toBe('deleted')
    expect(ran.value).toBe(true)
  })
})

type EmittedEvent = {name: string; value: Record<string, unknown>}

function capturingContext(): {
  events: EmittedEvent[]
  context: {emitCustomEvent: (n: string, v: Record<string, unknown>) => void}
} {
  const events: EmittedEvent[] = []
  return {events, context: {emitCustomEvent: (name, value) => events.push({name, value})}}
}

describe('code mode per-tool call events', () => {
  test('gatedToolRun emits conciv:tool_call and conciv:tool_result with the registered name', async () => {
    const {events, context} = capturingContext()
    const dotted = tool('canvas.svg', undefined, async () => 'drew')
    const run = gatedToolRun(dotted, request, allowGate)
    await expect(run({shape: 'circle'}, context)).resolves.toBe('drew')
    const call = events.find((event) => event.name === 'conciv:tool_call')
    expect(call?.value).toMatchObject({name: 'canvas.svg', input: {shape: 'circle'}})
    expect(typeof call?.value.callId).toBe('string')
    const result = events.find((event) => event.name === 'conciv:tool_result')
    expect(result?.value).toEqual({callId: call?.value.callId, result: 'drew'})
  })

  test('gatedToolRun decides with the same id it stamps on the emitted call and result', async () => {
    const {events, context} = capturingContext()
    const decideIds: string[] = []
    const dotted = tool('canvas.svg', undefined, async () => 'drew')
    const run = gatedToolRun(dotted, request, {
      decide: async (_toolName, _toolInput, _sessionId, toolUseId) => {
        decideIds.push(toolUseId)
        return 'allow' as const
      },
    })
    await expect(run({shape: 'circle'}, context)).resolves.toBe('drew')
    const call = events.find((event) => event.name === 'conciv:tool_call')
    const result = events.find((event) => event.name === 'conciv:tool_result')
    expect(decideIds).toHaveLength(1)
    expect(decideIds[0]).toBe(call?.value.callId)
    expect(result?.value.callId).toBe(call?.value.callId)
  })

  test('gatedToolRun emits conciv:tool_error on deny', async () => {
    const db = testDb()
    const changes = makeChanges()
    const {events, context} = capturingContext()
    const gated = tool('canvas.delete', 'ask', async () => 'deleted')
    const run = gatedToolRun(gated, request, denyingGate(['canvas.delete'], db, changes))
    await expect(run({}, context)).rejects.toThrow(/denied/i)
    const failure = events.find((event) => event.name === 'conciv:tool_error')
    expect(failure?.value).toMatchObject({error: expect.stringMatching(/denied/i)})
    expect(events.some((event) => event.name === 'conciv:tool_result')).toBe(false)
  })

  test('gatedToolRun emits conciv:tool_error when execute throws', async () => {
    const {events, context} = capturingContext()
    const broken = tool('canvas.svg', undefined, async () => {
      throw new Error('draw failed')
    })
    const run = gatedToolRun(broken, request, allowGate)
    await expect(run({}, context)).rejects.toThrow('draw failed')
    expect(events.find((event) => event.name === 'conciv:tool_error')?.value).toMatchObject({error: 'draw failed'})
  })

  test('the real sandbox threads the events through a binding call', async () => {
    const {events, context} = capturingContext()
    const dotted = tool('canvas.svg', undefined, async () => 'drew')
    const tools = codeModeOf([dotted], allowGate).tools
    const entry = tools.find((candidate) => candidate.name === 'execute_typescript')
    if (!entry?.execute) throw new Error('no execute_typescript tool')
    const outcome = CodeResultSchema.parse(
      await entry.execute({typescriptCode: 'return await external_canvas_svg({})'}, context),
    )
    expect(outcome.success).toBe(true)
    const call = events.find((event) => event.name === 'conciv:tool_call')
    expect(call?.value).toMatchObject({name: 'canvas.svg'})
    const result = events.find((event) => event.name === 'conciv:tool_result')
    expect(result?.value).toMatchObject({callId: call?.value.callId, result: 'drew'})
  })
})
