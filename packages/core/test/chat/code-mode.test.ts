import {describe, expect, test} from 'vitest'
import {z} from 'zod'
import type {AnyTool, StreamChunk} from '@tanstack/ai'
import {approvalIds} from '@conciv/harness-testkit'
import {toolError, type ToolRequest} from '@conciv/extension'
import {createToolRegistry} from '@conciv/extension/registry'
import {PAGE_TOOL_DEFS} from '@conciv/extension-page/defs'
import {SessionId} from '@conciv/protocol/chat-types'
import {createAskRegistry, type AskRegistry} from '../../src/chat/ask.js'
import {asksFor, makeAskGate, type PermissionGate} from '../../src/chat/gate.js'
import {gatedToolRun, makeCodeMode, type CodeMode} from '../../src/chat/code-mode.js'
import {registryCapabilities, type CodeCapability} from '../../src/chat/capabilities.js'

const SESSION = SessionId.parse('conciv_x')

const request: ToolRequest = {sessionId: SESSION, model: null}

const allowGate = {decide: async () => 'allow' as const}

const attached = () => true

const untouchableGate: PermissionGate = {
  decide: async () => {
    throw new Error('the gate must not be consulted for a read')
  },
}

function capability(
  name: string,
  options: {
    approval?: 'ask'
    mutating?: boolean
    category?: string
    keywords?: readonly string[]
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
    keywords: options.keywords ?? [],
    ...(options.approval === undefined ? {} : {approval: options.approval}),
    mutating: options.mutating ?? false,
    reachable: true,
    errors: [],
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

async function codeModeOf(
  capabilities: CodeCapability[],
  gate: PermissionGate,
  options: {timeoutMs?: number} = {},
): Promise<CodeMode> {
  const result = await makeCodeMode(() => capabilities, request.sessionId, request, gate, {
    ...options,
    listening: attached,
  })
  if (!result) throw new Error('code mode unavailable: isolated-vm probe reported incompatible')
  return result
}

function expiringGate(): PermissionGate {
  return makeAskGate({asks: asksFor(createAskRegistry(), SESSION), emit: () => {}, timeoutMs: 30})
}

function replyingGate(timeoutMs: number): {
  gate: PermissionGate
  asks: AskRegistry
  approvalId: () => string | undefined
} {
  const asks = createAskRegistry()
  const emitted: StreamChunk[] = []
  const gate = makeAskGate({asks: asksFor(asks, SESSION), emit: (chunk) => emitted.push(chunk), timeoutMs})
  return {gate, asks, approvalId: () => emitted.flatMap(approvalIds)[0]}
}

describe('makeCodeMode', () => {
  test('returns null for an empty capability list', async () => {
    await expect(
      makeCodeMode(() => [], request.sessionId, request, allowGate, {listening: attached}),
    ).resolves.toBeNull()
  })

  test('exposes one tool whose prompt documents only the catalog, never a capability', async () => {
    const result = await makeCodeMode(
      () => [capability('safe_tool'), capability('risky_tool', {mutating: true})],
      request.sessionId,
      request,
      allowGate,
      {listening: attached},
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
    const result = await runSandbox((await codeModeOf([leaky], allowGate)).tools, 'return 1')
    expect(result.success).toBe(false)
    expect(result.error?.message).toMatch(/secret/i)
  })

  test('caps an oversized capability result before the chat surface returns it', async () => {
    const flood = capability('flood', {execute: async () => 'x'.repeat(200_000)})
    const codeMode = await codeModeOf([flood], allowGate)
    const entry = codeMode.tools.find((candidate) => candidate.name === 'execute_typescript')
    if (!entry?.execute) throw new Error('no execute_typescript tool')
    const serialized = JSON.stringify(await entry.execute({typescriptCode: 'return await external_flood({})'}, {}))
    expect(serialized).toContain('conciv:truncated')
    expect(serialized.length).toBeLessThan(60_000)
  })

  test('ranks a bounded category sample', async () => {
    const capabilities = [
      capability('a_one', {category: 'read'}),
      capability('a_two', {category: 'read'}),
      capability('b_one', {category: 'act'}),
      capability('c_one', {category: 'edit-live'}),
      capability('d_one', {category: 'react'}),
      capability('e_one', {category: 'server'}),
      capability('f_one', {category: 'extension'}),
      capability('g_one', {category: 'assist'}),
    ]
    const result = await codeModeOf(capabilities, allowGate)
    expect(result.categories.length).toBeLessThanOrEqual(6)
    expect(result.categories[0]).toBe('read')
  })
})

describe('code mode bindings', () => {
  test('a capability binds under external_ plus its exact registered name', async () => {
    const mode = await codeModeOf([capability('canvas_svg')], allowGate)
    const listed = await runSandbox(mode.tools, 'return await external_catalog({})')
    expect(listed.result).toMatchObject({tools: [{call: 'external_canvas_svg', name: 'canvas_svg'}]})
  })

  test('a reserved-word capability name binds verbatim, with no sanitizing prefix', async () => {
    const mode = await codeModeOf([capability('delete', {execute: async () => 'gone'})], allowGate)
    const ran = await runSandbox(mode.tools, 'return await external_delete({})')
    expect(ran.error?.message).toBeUndefined()
    expect(ran.result).toBe('gone')
  })

  test('two capabilities keep their own bindings instead of one being suffixed away', async () => {
    const mode = await codeModeOf([capability('canvas_svg'), capability('canvas_draw')], allowGate)
    const listed = await runSandbox(mode.tools, 'return await external_catalog({})')
    expect(listed.result).toMatchObject({
      tools: [{call: 'external_canvas_svg'}, {call: 'external_canvas_draw'}],
    })
  })
})

describe('code mode sandbox execution', () => {
  test('runs a trivial script when a capability is registered', async () => {
    const result = await runSandbox((await codeModeOf([capability('canvas_svg')], allowGate)).tools, 'return 1')
    expect(result.error?.message).toBeUndefined()
    expect(result.success).toBe(true)
    expect(result.result).toBe(1)
  })

  test('exposes a capability as a callable external_ binding', async () => {
    const drawer = capability('canvas_svg', {execute: async () => 'drew'})
    const result = await runSandbox(
      (await codeModeOf([drawer], allowGate)).tools,
      'return await external_canvas_svg({})',
    )
    expect(result.error?.message).toBeUndefined()
    expect(result.success).toBe(true)
    expect(result.result).toBe('drew')
  })

  test('an unanswered approval-declared capability fails with the no-decision wording where the code called it', async () => {
    const ran = {value: false}
    const gated = capability('canvas_delete', {
      approval: 'ask',
      mutating: true,
      execute: async () => {
        ran.value = true
        return 'deleted'
      },
    })
    const codeMode = await codeModeOf([gated], expiringGate())
    const result = await runSandbox(codeMode.tools, 'return await external_canvas_delete({})')
    expect(result.success).toBe(false)
    expect(result.error?.message).toContain('received no approval decision')
    expect(result.error?.message).toContain('the ask timed out')
    expect(ran.value).toBe(false)
  })

  test('a read never consults the gate', async () => {
    const read = capability('canvas_read', {execute: async () => 'read'})
    const result = await runSandbox(
      (await codeModeOf([read], untouchableGate)).tools,
      'return await external_canvas_read({})',
    )
    expect(result.success).toBe(true)
    expect(result.result).toBe('read')
  })
})

describe('snippet bindings', () => {
  test('the dynamic getSnippetBindings hook is wired, not silently dropped by an option-name typo', async () => {
    const zoomed = capability('canvas_zoom', {execute: async () => 'zoomed'})
    const result = await runSandbox(
      (await codeModeOf([zoomed], allowGate)).tools,
      'return await external_canvas_zoom({})',
    )
    expect(result.error?.message).toBeUndefined()
    expect(result.success).toBe(true)
    expect(result.result).toBe('zoomed')
  })
})

describe('catalog binding', () => {
  test('lists every capability with its callable sandbox name', async () => {
    const tools = await codeModeOf(
      [capability('canvas_svg'), capability('server_status', {category: 'read'})],
      allowGate,
    )
    const result = await runSandbox(tools.tools, 'return await external_catalog({})')
    expect(result.success).toBe(true)
    const listed = z
      .object({tools: z.array(z.object({call: z.string(), name: z.string(), mutating: z.boolean()}))})
      .parse(result.result)
    expect(listed.tools.map((entry) => entry.call)).toEqual(['external_canvas_svg', 'external_server_status'])
    expect(listed.tools.map((entry) => entry.name)).toEqual(['canvas_svg', 'server_status'])
  })

  test('surfaces the approval declaration in the list and the detail so the model can predict a prompt', async () => {
    const tools = await codeModeOf(
      [capability('canvas_delete', {approval: 'ask', mutating: true}), capability('canvas_read')],
      allowGate,
    )
    const listed = await runSandbox(tools.tools, 'return await external_catalog({})')
    const entries = z
      .object({tools: z.array(z.object({name: z.string(), approval: z.literal('ask').optional()}).loose())})
      .parse(listed.result).tools
    expect(entries.find((entry) => entry.name === 'canvas_delete')?.approval).toBe('ask')
    expect(entries.find((entry) => entry.name === 'canvas_read')?.approval).toBeUndefined()
    const detail = await runSandbox(tools.tools, "return await external_catalog({name: 'canvas_delete'})")
    const parsed = z
      .object({approval: z.literal('ask').optional()})
      .loose()
      .parse(detail.result)
    expect(parsed.approval).toBe('ask')
  })

  test('filters by search term across name, summary and category', async () => {
    const tools = (
      await codeModeOf([capability('canvas_svg'), capability('server_status', {category: 'read'})], allowGate)
    ).tools
    const result = await runSandbox(tools, "return await external_catalog({search: 'status'})")
    const listed = z.object({tools: z.array(z.object({name: z.string()}))}).parse(result.result)
    expect(listed.tools.map((entry) => entry.name)).toEqual(['server_status'])
  })

  async function searchNames(capabilities: CodeCapability[], term: string): Promise<string[]> {
    const tools = (await codeModeOf(capabilities, allowGate)).tools
    const result = await runSandbox(tools, `return await external_catalog({search: ${JSON.stringify(term)}})`)
    return z
      .object({tools: z.array(z.object({name: z.string()}))})
      .parse(result.result)
      .tools.map((entry) => entry.name)
  }

  test('a hand-curated keyword nobody wrote into the name or summary still finds its capability', async () => {
    const names = await searchNames(
      [capability('canvas_svg'), capability('page_snapshot', {keywords: ['form', 'controls']})],
      'form',
    )
    expect(names).toEqual(['page_snapshot'])
  })

  test('a term that only the description carries finds its capability', async () => {
    expect(await searchNames([capability('canvas_svg')], 'extra prose')).toEqual(['canvas_svg'])
  })

  test('returns one full signature with a type stub naming the real sandbox function', async () => {
    const drawn = capability('canvas_svg', {inputSchema: z.object({shape: z.string()})})
    const result = await runSandbox(
      (await codeModeOf([drawn], allowGate)).tools,
      "return await external_catalog({name: 'canvas_svg'})",
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
    const capabilities: CodeCapability[] = [capability('canvas_svg')]
    const codeMode = await makeCodeMode(() => capabilities, request.sessionId, request, allowGate, {
      listening: attached,
    })
    if (!codeMode) throw new Error('no code mode')
    capabilities.push(capability('late_arrival', {execute: async () => 'made it'}))
    const listed = await runSandbox(codeMode.tools, 'return await external_catalog({})')
    const names = z
      .object({tools: z.array(z.object({name: z.string()}))})
      .parse(listed.result)
      .tools.map((entry) => entry.name)
    expect(names).toContain('late_arrival')
    const called = await runSandbox(codeMode.tools, 'return await external_late_arrival({})')
    expect(called.success).toBe(true)
    expect(called.result).toBe('made it')
  })
})

describe('declared errors in the sandbox', () => {
  test('two declared codes from one capability stay distinguishable as message prefixes', async () => {
    const flaky = capability('acme_flaky', {
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
    const result = await runSandbox((await codeModeOf([flaky], allowGate)).tools, code)
    expect(result.success).toBe(true)
    const seen = z.array(z.string()).parse(result.result)
    expect(seen[0]).toBe('CODE_A: first failure')
    expect(seen[1]).toBe('CODE_B: second failure')
  })

  test('normalizes a space-less declared prefix so the code stays parseable', async () => {
    const jam = capability('acme_jam', {
      execute: async () => {
        throw toolError('CODE_A', {message: 'CODE_A:jam'})
      },
    })
    const code = 'try { await external_acme_jam({}) } catch (error) { return error.message }'
    const result = await runSandbox((await codeModeOf([jam], allowGate)).tools, code)
    expect(result.success).toBe(true)
    expect(result.result).toBe('CODE_A: jam')
  })
})

describe('per-call isolation', () => {
  test('state set in one execution never leaks into the next', async () => {
    const tools = (await codeModeOf([capability('canvas_svg')], allowGate)).tools
    const first = await runSandbox(tools, "globalThis.leak = 'poison'; return 'set'")
    expect(first.success).toBe(true)
    const second = await runSandbox(tools, 'return typeof globalThis.leak')
    expect(second.success).toBe(true)
    expect(second.result).toBe('undefined')
  })

  test('an endless loop dies at the timeout and the sandbox stays usable', async () => {
    const tools = (await codeModeOf([capability('canvas_svg')], allowGate, {timeoutMs: 500})).tools
    const looped = await runSandbox(tools, 'while (true) {}')
    expect(looped.success).toBe(false)
    const after = await runSandbox(tools, 'return 2')
    expect(after.success).toBe(true)
    expect(after.result).toBe(2)
  }, 20_000)

  test('a memory bomb dies at the limit and the sandbox stays usable', async () => {
    const tools = (await codeModeOf([capability('canvas_svg')], allowGate)).tools
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
  test('an ask that expires blocks execute and throws the no-decision refusal', async () => {
    const ran = {value: false}
    const gated = capability('canvas_delete', {
      approval: 'ask',
      mutating: true,
      execute: async () => {
        ran.value = true
        return 'deleted'
      },
    })
    const run = gatedToolRun(gated, request.sessionId, request, expiringGate(), attached)
    await expect(run({})).rejects.toThrow('received no approval decision (the ask timed out)')
    expect(ran.value).toBe(false)
  })

  test('an unattached session refuses an approval-gated capability without waiting for the ask', async () => {
    const ran = {value: false}
    const gated = capability('canvas_delete', {
      approval: 'ask',
      mutating: true,
      execute: async () => {
        ran.value = true
        return 'deleted'
      },
    })
    const asked = {value: false}
    const neverAnswers = {
      decide: async () => {
        asked.value = true
        return new Promise<'allow'>(() => {})
      },
    }
    const run = gatedToolRun(gated, request.sessionId, request, neverAnswers, () => false)
    await expect(run({})).rejects.toThrow('nothing is attached to session "conciv_x" to answer')
    expect(asked.value).toBe(false)
    expect(ran.value).toBe(false)
  })

  test('a deny reply blocks execute and throws the denial wording, distinct from a timeout', async () => {
    const {gate, asks, approvalId} = replyingGate(5_000)
    const ran = {value: false}
    const gated = capability('canvas_delete', {
      approval: 'ask',
      mutating: true,
      execute: async () => {
        ran.value = true
        return 'deleted'
      },
    })
    const pending = gatedToolRun(gated, request.sessionId, request, gate, attached)({})
    await sleep(60)
    const id = approvalId()
    if (id === undefined) throw new Error('no approval id')
    asks.reply(SESSION, id, false)
    await expect(pending).rejects.toThrow('was denied by the user')
    expect(ran.value).toBe(false)
  })

  test('allow reply lets execute run and returns its result', async () => {
    const {gate, asks, approvalId} = replyingGate(5_000)
    const ran = {value: false}
    const gated = capability('canvas_delete', {
      approval: 'ask',
      mutating: true,
      execute: async () => {
        ran.value = true
        return 'deleted'
      },
    })
    const run = gatedToolRun(gated, request.sessionId, request, gate, attached)
    const pending = run({})
    await sleep(60)
    const id = approvalId()
    if (id === undefined) throw new Error('no approval id')
    asks.reply(SESSION, id, true)
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
    const dotted = capability('canvas_svg', {
      inputSchema: z.object({shape: z.string()}),
      execute: async () => 'drew',
    })
    const run = gatedToolRun(dotted, request.sessionId, request, allowGate, attached)
    await expect(run({shape: 'circle'}, context)).resolves.toBe('drew')
    const call = events.find((event) => event.name === 'conciv:tool_call')
    expect(call?.value).toMatchObject({name: 'canvas_svg', input: {shape: 'circle'}})
    expect(typeof call?.value.callId).toBe('string')
    const result = events.find((event) => event.name === 'conciv:tool_result')
    expect(result?.value).toEqual({callId: call?.value.callId, result: 'drew'})
  })

  test('gatedToolRun decides with the same id it stamps on the emitted call and result', async () => {
    const {events, context} = capturingContext()
    const decideIds: string[] = []
    const dotted = capability('canvas_svg', {approval: 'ask', mutating: true, execute: async () => 'drew'})
    const run = gatedToolRun(
      dotted,
      request.sessionId,
      request,
      {
        decide: async (_toolName: string, _toolInput: unknown, toolUseId: string) => {
          decideIds.push(toolUseId)
          return 'allow' as const
        },
      },
      attached,
    )
    await expect(run({}, context)).resolves.toBe('drew')
    const call = events.find((event) => event.name === 'conciv:tool_call')
    const result = events.find((event) => event.name === 'conciv:tool_result')
    expect(decideIds).toHaveLength(1)
    expect(decideIds[0]).toBe(call?.value.callId)
    expect(result?.value.callId).toBe(call?.value.callId)
  })

  test('gatedToolRun emits conciv:tool_error on an unanswered ask', async () => {
    const {events, context} = capturingContext()
    const gated = capability('canvas_delete', {approval: 'ask', mutating: true, execute: async () => 'deleted'})
    const run = gatedToolRun(gated, request.sessionId, request, expiringGate(), attached)
    await expect(run({}, context)).rejects.toThrow(/no approval decision/)
    const failure = events.find((event) => event.name === 'conciv:tool_error')
    expect(failure?.value).toMatchObject({error: expect.stringMatching(/no approval decision/)})
    expect(events.some((event) => event.name === 'conciv:tool_result')).toBe(false)
  })

  test('gatedToolRun emits conciv:tool_error when execute throws', async () => {
    const {events, context} = capturingContext()
    const broken = capability('canvas_svg', {
      execute: async () => {
        throw new Error('draw failed')
      },
    })
    const run = gatedToolRun(broken, request.sessionId, request, allowGate, attached)
    await expect(run({}, context)).rejects.toThrow('draw failed')
    expect(events.find((event) => event.name === 'conciv:tool_error')?.value).toMatchObject({error: 'draw failed'})
  })

  test('gatedToolRun caps an oversized result on the emitted event while the caller still gets the raw value', async () => {
    const {events, context} = capturingContext()
    const flood = capability('canvas_flood', {execute: async () => 'x'.repeat(200_000)})
    const run = gatedToolRun(flood, request.sessionId, request, allowGate, attached)
    const raw = await run({}, context)
    expect(raw).toBe('x'.repeat(200_000))
    const result = events.find((event) => event.name === 'conciv:tool_result')
    expect(result?.value.result).toMatchObject({'conciv:truncated': true, truncated: true})
    expect(JSON.stringify(result?.value).length).toBeLessThan(60_000)
  })

  test('gatedToolRun carries the serialization-failure payload for a bigint result without throwing', async () => {
    const {events, context} = capturingContext()
    const untallied = capability('canvas_bigint', {execute: async () => ({amount: 10n})})
    const run = gatedToolRun(untallied, request.sessionId, request, allowGate, attached)
    const raw = await run({}, context)
    expect(raw).toEqual({amount: 10n})
    const result = events.find((event) => event.name === 'conciv:tool_result')
    expect(result?.value.result).toMatchObject({error: 'value could not be serialized'})
    expect(() => JSON.stringify(result?.value)).not.toThrow()
  })

  test('the real sandbox threads the events through a binding call', async () => {
    const {events, context} = capturingContext()
    const dotted = capability('canvas_svg', {execute: async () => 'drew'})
    const tools = (await codeModeOf([dotted], allowGate)).tools
    const entry = tools.find((candidate) => candidate.name === 'execute_typescript')
    if (!entry?.execute) throw new Error('no execute_typescript tool')
    const outcome = CodeResultSchema.parse(
      await entry.execute({typescriptCode: 'return await external_canvas_svg({})'}, context),
    )
    expect(outcome.success).toBe(true)
    const call = events.find((event) => event.name === 'conciv:tool_call')
    expect(call?.value).toMatchObject({name: 'canvas_svg'})
    const result = events.find((event) => event.name === 'conciv:tool_result')
    expect(result?.value).toMatchObject({callId: call?.value.callId, result: 'drew'})
  })
})

describe('discovering the page capabilities the way the model does', () => {
  function pageCapabilities(): CodeCapability[] {
    const registry = createToolRegistry({pageCaller: async () => ({ok: true}), isAnyPageConnected: () => true})
    for (const def of PAGE_TOOL_DEFS) registry.register(def.client(), {owner: 'the page extension'})
    return registryCapabilities(registry.sandboxTools(), async () => undefined)
  }

  async function pageSearch(term: string): Promise<string[]> {
    const tools = (await codeModeOf(pageCapabilities(), allowGate)).tools
    const result = await runSandbox(tools, `return await external_catalog({search: ${JSON.stringify(term)}})`)
    return z
      .object({tools: z.array(z.object({name: z.string()}))})
      .parse(result.result)
      .tools.map((entry) => entry.name)
  }

  test.each(['form', 'value', 'state'])('searching %s surfaces page_snapshot', async (term) => {
    expect(await pageSearch(term)).toContain('page_snapshot')
  })
})
