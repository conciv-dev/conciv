import {describe, expect, test} from 'vitest'
import {z} from 'zod'
import type {AnyTool, StreamChunk} from '@tanstack/ai'
import {approvalIds} from '@conciv/harness-testkit'
import {toolError, type ToolRequest} from '@conciv/extension'
import {createAskRegistry, type AskRegistry} from '../../src/chat/ask.js'
import {makeAskGate, type PermissionGate} from '../../src/chat/gate.js'
import {gatedToolRun, makeCodeMode, withBindingNames, type CodeMode} from '../../src/chat/code-mode.js'
import type {CodeCapability} from '../../src/chat/capabilities.js'

const request: ToolRequest = {sessionId: 'conciv_x', model: null}

const allowGate = {decide: async () => 'allow' as const}

const untouchableGate: PermissionGate = {
  decide: async () => {
    throw new Error('the gate must not be consulted for a read')
  },
}

function capability(
  name: string,
  options: {
    mutating?: boolean
    category?: string
    inputSchema?: z.ZodObject<z.ZodRawShape>
    execute?: CodeCapability['execute']
  } = {},
): CodeCapability {
  const inputSchema = options.inputSchema ?? z.object({})
  return {
    name,
    description: `${name} does a thing. Extra prose here.`,
    summary: `${name} does a thing`,
    category: options.category ?? 'extension',
    mutating: options.mutating ?? false,
    reachable: true,
    inputSchema,
    execute: options.execute ?? (async () => 'ok'),
    signature: () => ({input: z.toJSONSchema(inputSchema, {io: 'input'}), output: undefined, errors: []}),
  }
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

const CodeResultSchema = z.object({
  success: z.boolean(),
  result: z.unknown().optional(),
  logs: z.array(z.string()).optional(),
  error: z.object({message: z.string()}).optional(),
})

type CodeResult = z.infer<typeof CodeResultSchema>

async function runSandbox(tools: AnyTool[], typescriptCode: string): Promise<CodeResult> {
  const entry = tools.find((candidate) => candidate.name === 'execute_typescript')
  if (!entry?.execute) throw new Error('no execute_typescript tool')
  return CodeResultSchema.parse(await entry.execute({typescriptCode}, {}))
}

function codeModeOf(
  capabilities: CodeCapability[],
  gate: PermissionGate,
  options: {timeoutMs?: number} = {},
): CodeMode {
  const result = makeCodeMode(() => capabilities, request, gate, options)
  if (!result) throw new Error('code mode unavailable: isolated-vm probe reported incompatible')
  return result
}

function denyingGate(): PermissionGate {
  return makeAskGate({sessionId: 'conciv_x', asks: createAskRegistry(), emit: () => {}, timeoutMs: 30})
}

function replyingGate(timeoutMs: number): {
  gate: PermissionGate
  asks: AskRegistry
  approvalId: () => string | undefined
} {
  const asks = createAskRegistry()
  const emitted: StreamChunk[] = []
  const gate = makeAskGate({sessionId: 'conciv_x', asks, emit: (chunk) => emitted.push(chunk), timeoutMs})
  return {gate, asks, approvalId: () => emitted.flatMap(approvalIds)[0]}
}

describe('makeCodeMode', () => {
  test('returns null for an empty capability list', () => {
    expect(makeCodeMode(() => [], request, allowGate)).toBeNull()
  })

  test('exposes one tool whose prompt documents only the catalog, never a capability', () => {
    const result = makeCodeMode(
      () => [capability('safe_tool'), capability('risky_tool', {mutating: true})],
      request,
      allowGate,
    )
    expect(result).not.toBeNull()
    if (!result) throw new Error('no code mode')
    expect(result.tools.map((entry) => entry.name)).toEqual(['execute_typescript'])
    expect(result.systemPrompt).toContain('external_catalog')
    expect(result.systemPrompt).not.toContain('external_safe_tool')
    expect(result.systemPrompt).not.toContain('external_risky_tool')
  })

  test('fails an execution when a capability declares a credential-shaped parameter', async () => {
    const leaky = capability('leaky', {inputSchema: z.object({apiKey: z.string()})})
    const result = await runSandbox(codeModeOf([leaky], allowGate).tools, 'return 1')
    expect(result.success).toBe(false)
    expect(result.error?.message).toMatch(/secret/i)
  })

  test('ranks a bounded category sample', () => {
    const capabilities = [
      capability('a.one', {category: 'read'}),
      capability('a.two', {category: 'read'}),
      capability('b.one', {category: 'act'}),
      capability('c.one', {category: 'edit-live'}),
      capability('d.one', {category: 'react'}),
      capability('e.one', {category: 'server'}),
      capability('f.one', {category: 'extension'}),
      capability('g.one', {category: 'assist'}),
    ]
    const result = codeModeOf(capabilities, allowGate)
    expect(result.categories.length).toBeLessThanOrEqual(6)
    expect(result.categories[0]).toBe('read')
  })
})

describe('withBindingNames', () => {
  test('sanitizes dotted names into identifier-safe bindings', () => {
    const named = withBindingNames([capability('canvas.svg'), capability('pin.setState'), capability('safe_tool')])
    expect(named.map((entry) => entry.bindingName)).toEqual(['canvas_svg', 'pin_setState', 'safe_tool'])
  })

  test('prefixes names that would start with a digit', () => {
    const named = withBindingNames([capability('3d.render')])
    expect(named[0]?.bindingName).toBe('_3d_render')
  })

  test('deterministically disambiguates colliding sanitized names', () => {
    const named = withBindingNames([capability('canvas.svg'), capability('canvas-svg'), capability('canvas_svg')])
    expect(named.map((entry) => entry.bindingName)).toEqual(['canvas_svg', 'canvas_svg_2', 'canvas_svg_3'])
  })

  test('keeps each binding paired with its original capability', () => {
    const named = withBindingNames([capability('canvas.svg'), capability('canvas-svg')])
    expect(named.map((entry) => entry.capability.name)).toEqual(['canvas.svg', 'canvas-svg'])
  })
})

describe('code mode sandbox execution', () => {
  test('runs a trivial script when a dotted tool is registered', async () => {
    const result = await runSandbox(codeModeOf([capability('canvas.svg')], allowGate).tools, 'return 1')
    expect(result.error?.message).toBeUndefined()
    expect(result.success).toBe(true)
    expect(result.result).toBe(1)
  })

  test('exposes a dotted tool as a callable sanitized binding', async () => {
    const dotted = capability('canvas.svg', {execute: async () => 'drew'})
    const result = await runSandbox(codeModeOf([dotted], allowGate).tools, 'return await external_canvas_svg({})')
    expect(result.error?.message).toBeUndefined()
    expect(result.success).toBe(true)
    expect(result.result).toBe('drew')
  })

  test('denies a mutating capability and the denial lands where the code called it', async () => {
    const ran = {value: false}
    const gated = capability('canvas.delete', {
      mutating: true,
      execute: async () => {
        ran.value = true
        return 'deleted'
      },
    })
    const codeMode = codeModeOf([gated], denyingGate())
    const result = await runSandbox(codeMode.tools, 'return await external_canvas_delete({})')
    expect(result.success).toBe(false)
    expect(result.error?.message).toMatch(/denied/i)
    expect(ran.value).toBe(false)
  })

  test('a read never consults the gate', async () => {
    const read = capability('canvas.read', {execute: async () => 'read'})
    const result = await runSandbox(codeModeOf([read], untouchableGate).tools, 'return await external_canvas_read({})')
    expect(result.success).toBe(true)
    expect(result.result).toBe('read')
  })
})

describe('catalog binding', () => {
  test('lists every capability with its callable sandbox name', async () => {
    const tools = codeModeOf([capability('canvas.svg'), capability('server.status', {category: 'read'})], allowGate)
    const result = await runSandbox(tools.tools, 'return await external_catalog({})')
    expect(result.success).toBe(true)
    const listed = z
      .object({tools: z.array(z.object({call: z.string(), name: z.string(), mutating: z.boolean()}))})
      .parse(result.result)
    expect(listed.tools.map((entry) => entry.call)).toEqual(['external_canvas_svg', 'external_server_status'])
    expect(listed.tools.map((entry) => entry.name)).toEqual(['canvas.svg', 'server.status'])
  })

  test('filters by search term across name, summary and category', async () => {
    const tools = codeModeOf(
      [capability('canvas.svg'), capability('server.status', {category: 'read'})],
      allowGate,
    ).tools
    const result = await runSandbox(tools, "return await external_catalog({search: 'status'})")
    const listed = z.object({tools: z.array(z.object({name: z.string()}))}).parse(result.result)
    expect(listed.tools.map((entry) => entry.name)).toEqual(['server.status'])
  })

  test('returns one full signature with a type stub naming the real sandbox function', async () => {
    const drawn = capability('canvas.svg', {inputSchema: z.object({shape: z.string()})})
    const result = await runSandbox(
      codeModeOf([drawn], allowGate).tools,
      "return await external_catalog({name: 'canvas.svg'})",
    )
    expect(result.success).toBe(true)
    const detail = z
      .object({call: z.string(), typeStub: z.string(), input: z.unknown(), mutating: z.boolean()})
      .loose()
      .parse(result.result)
    expect(detail.call).toBe('external_canvas_svg')
    expect(detail.typeStub).toContain('external_canvas_svg')
    expect(JSON.stringify(detail.input)).toContain('shape')
  })

  test('a capability mounted after construction is discoverable and callable in the same sandbox', async () => {
    const capabilities: CodeCapability[] = [capability('canvas.svg')]
    const codeMode = makeCodeMode(() => capabilities, request, allowGate)
    if (!codeMode) throw new Error('no code mode')
    capabilities.push(capability('late.arrival', {execute: async () => 'made it'}))
    const listed = await runSandbox(codeMode.tools, 'return await external_catalog({})')
    const names = z
      .object({tools: z.array(z.object({name: z.string()}))})
      .parse(listed.result)
      .tools.map((entry) => entry.name)
    expect(names).toContain('late.arrival')
    const called = await runSandbox(codeMode.tools, 'return await external_late_arrival({})')
    expect(called.success).toBe(true)
    expect(called.result).toBe('made it')
  })
})

describe('declared errors in the sandbox', () => {
  test('two declared codes from one capability stay distinguishable as message prefixes', async () => {
    const flaky = capability('acme.flaky', {
      inputSchema: z.object({which: z.string()}),
      execute: async (input) => {
        const which = z.object({which: z.string()}).parse(input).which
        if (which === 'a') throw toolError('CODE_A', {message: 'first failure'})
        throw toolError('CODE_B', {message: 'second failure'})
      },
    })
    const code = `
      const seen = []
      for (const which of ['a', 'b']) {
        try { await external_acme_flaky({which}) } catch (error) { seen.push(error.message) }
      }
      return seen
    `
    const result = await runSandbox(codeModeOf([flaky], allowGate).tools, code)
    expect(result.success).toBe(true)
    const seen = z.array(z.string()).parse(result.result)
    expect(seen[0]).toBe('CODE_A: first failure')
    expect(seen[1]).toBe('CODE_B: second failure')
  })
})

describe('per-call isolation', () => {
  test('state set in one execution never leaks into the next', async () => {
    const tools = codeModeOf([capability('canvas.svg')], allowGate).tools
    const first = await runSandbox(tools, "globalThis.leak = 'poison'; return 'set'")
    expect(first.success).toBe(true)
    const second = await runSandbox(tools, 'return typeof globalThis.leak')
    expect(second.success).toBe(true)
    expect(second.result).toBe('undefined')
  })

  test('an endless loop dies at the timeout and the sandbox stays usable', async () => {
    const tools = codeModeOf([capability('canvas.svg')], allowGate, {timeoutMs: 500}).tools
    const looped = await runSandbox(tools, 'while (true) {}')
    expect(looped.success).toBe(false)
    const after = await runSandbox(tools, 'return 2')
    expect(after.success).toBe(true)
    expect(after.result).toBe(2)
  }, 20_000)

  test('a memory bomb dies at the limit and the sandbox stays usable', async () => {
    const tools = codeModeOf([capability('canvas.svg')], allowGate).tools
    const bombed = await runSandbox(tools, "const hoard = []; while (true) hoard.push('x'.repeat(1_000_000))").then(
      (result) => result,
      (error: unknown) => ({success: false, error: {message: String(error)}}),
    )
    expect(bombed.success).toBe(false)
    const after = await runSandbox(tools, 'return 3')
    expect(after.success).toBe(true)
    expect(after.result).toBe(3)
  }, 30_000)
})

describe('gatedToolRun', () => {
  test('deny reply blocks execute and throws a refusal', async () => {
    const ran = {value: false}
    const gated = capability('canvas.delete', {
      mutating: true,
      execute: async () => {
        ran.value = true
        return 'deleted'
      },
    })
    const run = gatedToolRun(gated, request, denyingGate())
    await expect(run({})).rejects.toThrow(/denied/i)
    expect(ran.value).toBe(false)
  })

  test('allow reply lets execute run and returns its result', async () => {
    const {gate, asks, approvalId} = replyingGate(5_000)
    const ran = {value: false}
    const gated = capability('canvas.delete', {
      mutating: true,
      execute: async () => {
        ran.value = true
        return 'deleted'
      },
    })
    const run = gatedToolRun(gated, request, gate)
    const pending = run({})
    await sleep(60)
    const id = approvalId()
    if (id === undefined) throw new Error('no approval id')
    asks.reply('conciv_x', id, true)
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
    const dotted = capability('canvas.svg', {
      inputSchema: z.object({shape: z.string()}),
      execute: async () => 'drew',
    })
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
    const dotted = capability('canvas.svg', {mutating: true, execute: async () => 'drew'})
    const run = gatedToolRun(dotted, request, {
      decide: async (_toolName, _toolInput, _sessionId, toolUseId) => {
        decideIds.push(toolUseId)
        return 'allow' as const
      },
    })
    await expect(run({}, context)).resolves.toBe('drew')
    const call = events.find((event) => event.name === 'conciv:tool_call')
    const result = events.find((event) => event.name === 'conciv:tool_result')
    expect(decideIds).toHaveLength(1)
    expect(decideIds[0]).toBe(call?.value.callId)
    expect(result?.value.callId).toBe(call?.value.callId)
  })

  test('gatedToolRun emits conciv:tool_error on deny', async () => {
    const {events, context} = capturingContext()
    const gated = capability('canvas.delete', {mutating: true, execute: async () => 'deleted'})
    const run = gatedToolRun(gated, request, denyingGate())
    await expect(run({}, context)).rejects.toThrow(/denied/i)
    const failure = events.find((event) => event.name === 'conciv:tool_error')
    expect(failure?.value).toMatchObject({error: expect.stringMatching(/denied/i)})
    expect(events.some((event) => event.name === 'conciv:tool_result')).toBe(false)
  })

  test('gatedToolRun emits conciv:tool_error when execute throws', async () => {
    const {events, context} = capturingContext()
    const broken = capability('canvas.svg', {
      execute: async () => {
        throw new Error('draw failed')
      },
    })
    const run = gatedToolRun(broken, request, allowGate)
    await expect(run({}, context)).rejects.toThrow('draw failed')
    expect(events.find((event) => event.name === 'conciv:tool_error')?.value).toMatchObject({error: 'draw failed'})
  })

  test('the real sandbox threads the events through a binding call', async () => {
    const {events, context} = capturingContext()
    const dotted = capability('canvas.svg', {execute: async () => 'drew'})
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
