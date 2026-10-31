import {randomUUID} from 'node:crypto'
import {mkdtempSync, realpathSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, it, afterEach, expect} from 'vitest'
import {defineExtension, defineTool, toolError} from '@conciv/extension'
import {type HarnessAdapter} from '@conciv/harness'
import {
  harnessAvailable,
  createTestHarness,
  makeCallTool,
  makeRunTypescript,
  type Kit,
  connectMcpClient,
  createFakeHarness,
} from '@conciv/harness-testkit'
import {claude} from '@conciv/harness/claude'
import {codex} from '@conciv/harness/codex'
import {geminiCli} from '@conciv/harness/gemini-cli'
import {opencode} from '@conciv/harness/opencode'
import {ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {SessionId, CONCIV_SESSION_HEADER, CONCIV_CLAUDE_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {z} from 'zod'
import {readDevEndpoint} from '../src/lib/dev-endpoint.js'
import {start, type Engine} from '../src/start.js'
import {assertTurnAndResume, requireClaude, bootKit, runTurn, runReal} from './helpers.js'

describe('claude tanstack', () => {
  const runReal = !process.env.CI

  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'claude-tanstack-')))

  describe('claude through claudeCodeText + conciv sandbox/gate', () => {
    it.skipIf(!runReal)(
      'streams a real turn and resumes the session',
      () =>
        assertTurnAndResume({
          harness: claude,
          dir,
          sessionId: SessionId.parse('conciv_it-1'),
          sessionEvent: 'claude-code.session-id',
        }),
      120_000,
    )
  })
})

describe('codex tanstack', () => {
  const runReal = !process.env.CI && harnessAvailable(codex)

  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'codex-tanstack-')))

  describe('codex through codexText + conciv sandbox/gate', () => {
    it.skipIf(!runReal)(
      'streams a real turn and resumes the session',
      () =>
        assertTurnAndResume({
          harness: codex,
          dir,
          sessionId: SessionId.parse('conciv_it-codex-1'),
          sessionEvent: 'codex.session-id',
        }),
      120_000,
    )
  })
})

describe('gemini tanstack', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'gemini-tanstack-')))

  describe('gemini-cli through acpCompatible + conciv sandbox/gate', () => {
    it.todo(
      'streams a real turn and resumes the session (blocked: gemini session/load does not restore context, #96)',
      () =>
        assertTurnAndResume({
          harness: geminiCli,
          dir,
          sessionId: SessionId.parse('conciv_it-gemini-1'),
          sessionEvent: 'gemini-cli.session-id',
        }),
      180_000,
    )
  })
})

describe('opencode tanstack', () => {
  const optIn = process.env.CONCIV_OPENCODE_IT === '1'
  const runReal = !process.env.CI && optIn && harnessAvailable(opencode)

  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'opencode-tanstack-')))

  describe('opencode through opencodeText + conciv sandbox/gate (opt-in: CONCIV_OPENCODE_IT=1 + a funded opencode provider)', () => {
    it.skipIf(!runReal)(
      'streams a real turn and resumes the session',
      () =>
        assertTurnAndResume({
          harness: opencode,
          dir,
          sessionId: SessionId.parse('conciv_it-opencode-1'),
          sessionEvent: 'opencode.session-id',
          ...(process.env.CONCIV_OPENCODE_IT_MODEL ? {model: process.env.CONCIV_OPENCODE_IT_MODEL} : {}),
        }),
      180_000,
    )
  })
})

describe('extension tool call id', () => {
  const echoCallId = defineTool({
    name: 'acme_echo_call_id',
    description: 'Echo the tool call id the request carries',
    inputSchema: z.object({}),
    outputSchema: z.object({toolCallId: z.string()}),
    meta: {summary: 'echo the request tool call id', category: 'fixture', mutating: false},
  }).server((_input, _ctx, request) => ({toolCallId: request.toolCallId ?? 'none'}))

  const acme = defineExtension({name: 'acme', tools: [echoCallId]})

  const EchoResultSchema = z.object({toolCallId: z.string()})

  const cleanups: (() => Promise<void>)[] = []
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup()
  })

  describe('an extension tool run from a chat turn knows which tool call it is answering', () => {
    it('hands the tool the same call id the turn put on the wire', async () => {
      const harness = createTestHarness(requireClaude())
      const kit = await bootKit({extensions: [acme]}, harness)
      cleanups.push(() => kit.cleanup())
      const sessionId = await kit.session()
      harness.script.scriptToolCall('execute_typescript', {
        typescriptCode: 'return await external_acme_echo_call_id({})',
      })
      const stream = await kit.turn('echo the call id', {session: sessionId, runId: randomUUID()})
      const events = await stream.done({hangGuardMs: 20_000})

      const call = events.toolCalls('acme_echo_call_id').at(-1)
      if (call === undefined) throw new Error('the chat turn never carried the tool call')
      const answer = events.all.findLast(
        (chunk) => chunk.type === ChatEventType.TOOL_CALL_RESULT && chunk.toolCallId === call.toolCallId,
      )
      if (
        answer === undefined ||
        answer.type !== ChatEventType.TOOL_CALL_RESULT ||
        typeof answer.content !== 'string'
      ) {
        throw new Error('the chat turn never carried a result for the tool call')
      }
      expect(EchoResultSchema.parse(JSON.parse(answer.content)).toolCallId).toBe(call.toolCallId)
    }, 40_000)
  })
})

describe('extension tool session', () => {
  const echo = defineTool({
    name: 'acme_echo_session',
    description: 'Echo the request session back',
    inputSchema: z.object({}),
    outputSchema: z.object({sessionId: z.string().nullable()}),
    meta: {summary: 'echo the request session back', category: 'fixture', mutating: false},
  }).server((_input, _ctx, request) => ({sessionId: request.sessionId}))

  const acme = defineExtension({name: 'acme', tools: [echo]})

  describe('/api/mcp threads the request session into extension tool execute', () => {
    it('echoes the header session id', async () => {
      const server = await bootKit({extensions: [acme]})
      try {
        const call = makeCallTool(server.base, 'conciv_x')
        const result = JSON.stringify(await call('acme_echo_session', {}))
        expect(result).toContain('conciv_x')
      } finally {
        await server.cleanup()
      }
    }, 30_000)
  })
})

describe('registry extension tools', () => {
  const lens = defineTool({
    name: 'acme_lens',
    description: 'Inspect the acme lens assembly.',
    inputSchema: z.object({zoom: z.number().int().min(1)}),
    outputSchema: z.object({zoom: z.number(), focused: z.boolean()}),
    errors: {LENS_JAMMED: {message: 'the lens is jammed'}},
    meta: {summary: 'inspect the lens assembly', category: 'acme', mutating: false},
  }).server((input) => {
    if (input.zoom > 3) throw toolError('LENS_JAMMED', {message: 'the lens is jammed'})
    return {zoom: input.zoom, focused: true}
  })

  const acme = defineExtension({name: 'acme', tools: [lens]})

  const halfDeclared = defineTool({
    name: 'acme_dial',
    description: 'Turn the acme dial without declaring meta or an output schema.',
    inputSchema: z.object({turns: z.number().int()}),
  }).server((input) => ({turns: input.turns}))

  const legacy = defineExtension({name: 'legacy-acme', tools: [halfDeclared]})

  async function discover(kit: Kit, name: string): Promise<unknown> {
    const client = await connectMcpClient(`${kit.base}/api/mcp`, {[CONCIV_SESSION_HEADER]: await kit.session()})
    try {
      const tool = (await client.tools()).find((entry) => entry.name === 'discover_tools')
      if (tool === undefined) throw new Error('discover_tools is not on /api/mcp')
      return await tool.execute({toolNames: [name]})
    } finally {
      await client.close()
    }
  }

  async function runSandbox(kit: Kit, typescriptCode: string): Promise<unknown> {
    const session = await kit.session()
    return makeRunTypescript(kit.base, session)(typescriptCode)
  }

  describe('registry-declared extension tools ride the tool registry into the sandbox', () => {
    it('appears in discover_tools with its declared summary and input', async () => {
      const kit = await bootKit({extensions: [acme]})
      try {
        const found = JSON.stringify(await discover(kit, 'acme_lens'))
        expect(found).toContain('inspect the lens assembly')
        expect(found).toContain('zoom')
      } finally {
        await kit.cleanup()
      }
    }, 30_000)

    it('is callable through the code-mode sandbox and surfaces its declared error by code', async () => {
      const kit = await bootKit({extensions: [acme]})
      try {
        const drawn = await runSandbox(kit, 'return await external_acme_lens({zoom: 2})')
        expect(JSON.stringify(drawn)).toContain('focused')
        const failed = await runSandbox(
          kit,
          "try { await external_acme_lens({zoom: 9}); return 'no-error' } catch (error) { return String(error) }",
        )
        expect(z.string().parse(failed)).toContain('LENS_JAMMED')
      } finally {
        await kit.cleanup()
      }
    }, 30_000)

    it('rejects malformed input with a loud validation error, never a silent success', async () => {
      const kit = await bootKit({extensions: [acme]})
      try {
        const failed = await runSandbox(
          kit,
          "try { await external_acme_lens({zoom: 'way too much'}); return 'no-error' } catch (error) { return String(error) }",
        )
        expect(z.string().parse(failed)).not.toBe('no-error')
        expect(z.string().parse(failed).toLowerCase()).toMatch(/input|invalid|zoom/)
      } finally {
        await kit.cleanup()
      }
    }, 30_000)

    it('surfaces the capability exactly once, never through two declaration paths', async () => {
      const kit = await bootKit({extensions: [acme]})
      try {
        const found = JSON.stringify(await discover(kit, 'acme_lens'))
        expect(found.split('external_acme_lens(').length - 1).toBe(1)
      } finally {
        await kit.cleanup()
      }
    }, 30_000)

    it('refuses to boot a tool declared without meta and an output schema instead of forwarding it', async () => {
      await expect(bootKit({extensions: [acme, legacy]})).rejects.toThrow(/acme_dial/)
    }, 30_000)
  })
})

describe('start dev endpoint', () => {
  type EngineCase = {
    accessToken?: string
    serveNativePage?: boolean
  }

  async function withStartedEngine(
    engineCase: EngineCase,
    assertEndpoint: (engine: Engine, endpointDir: string) => Promise<void>,
  ): Promise<void> {
    const root = mkdtempSync(join(tmpdir(), 'conciv-start-endpoint-'))
    const endpointDir = mkdtempSync(join(tmpdir(), 'conciv-endpoint-dir-'))
    try {
      const engine = await start({
        options: {harnessBin: 'true', stateRoot: root, systemPrompt: false},
        root,
        launchEditor: () => {},
        accessToken: engineCase.accessToken,
        nativePageDir: engineCase.serveNativePage ? root : undefined,
        devEndpointDir: endpointDir,
      })
      await assertEndpoint(engine, endpointDir)
    } finally {
      rmSync(root, {recursive: true, force: true})
      rmSync(endpointDir, {recursive: true, force: true})
    }
  }

  describe('start pairing file', () => {
    it('writes the endpoint on boot when a native page is served and removes it on stop', async () => {
      await withStartedEngine(
        {accessToken: 'c56a4180-65aa-42ec-a945-5fd21dec0538', serveNativePage: true},
        async (engine, endpointDir) => {
          const endpoint = readDevEndpoint(endpointDir)
          expect(endpoint).toEqual({
            apiBase: `http://127.0.0.1:${engine.port}/t/c56a4180-65aa-42ec-a945-5fd21dec0538`,
            token: 'c56a4180-65aa-42ec-a945-5fd21dec0538',
            pid: process.pid,
          })
          await engine.stop()
          expect(readDevEndpoint(endpointDir)).toBeNull()
        },
      )
    })

    it('serves /native and writes a tokenless endpoint with no ios config (the zero-config widget path)', async () => {
      await withStartedEngine({serveNativePage: true}, async (engine, endpointDir) => {
        const page = await fetch(`http://127.0.0.1:${engine.port}/native`)
        expect(page.status).toBe(200)
        expect(await page.text()).toContain('data-conciv-native-root')

        expect(readDevEndpoint(endpointDir)).toEqual({
          apiBase: `http://127.0.0.1:${engine.port}`,
          token: null,
          pid: process.pid,
        })
        await engine.stop()
        expect(readDevEndpoint(endpointDir)).toBeNull()
      })
    })

    it('does not write the endpoint when no native page is served', async () => {
      await withStartedEngine({}, async (engine, endpointDir) => {
        expect(readDevEndpoint(endpointDir)).toBeNull()
        await engine.stop()
      })
    })
  })
})

describe('start harness di', () => {
  describe('start harness DI', () => {
    it('uses the injected harness instead of the registry', async () => {
      const fake = createFakeHarness({id: 'fake-start-di', text: 'ok'})
      const marker = {seen: false}
      const harness: HarnessAdapter = Object.assign({}, fake)
      Object.defineProperty(harness, 'id', {
        get() {
          marker.seen = true
          return 'fake-start-di'
        },
      })
      const root = mkdtempSync(join(tmpdir(), 'conciv-start-di-'))
      const engine = await start({
        options: {stateRoot: root, systemPrompt: false, harness: 'fake-start-di'},
        root,
        harness,
        extensions: [],
        launchEditor: () => {},
      })
      expect(marker.seen).toBe(true)
      await engine.stop()
      rmSync(root, {recursive: true, force: true})
    })
  })
})

describe('api mcp claude image', () => {
  const PNG_RED_64x64 =
    'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAAXNSR0IArs4c6QAAAERlWElmTU0AKgAAAAgAAYdpAAQAAAABAAAAGgAAAAAAA6ABAAMAAAABAAEAAKACAAQAAAABAAAAQKADAAQAAAABAAAAQAAAAABGUUKwAAAAqklEQVRoBe3SsQ0AIRDEwHv675kvYgJ0ksm9Apvvzu5zdl9/pge8LliBCqCBvhAKZLwCrBAHKoACGa8AK8SBCqBAxivACnGgAiiQ8QqwQhyoAApkvAKsEAcqgAIZrwArxIEKoEDGK8AKcaACKJDxCrBCHKgACmS8AqwQByqAAhmvACvEgQqgQMYrwApxoAIokPEKsEIcqAAKZLwCrBAHKoACGa8AK8SB9QV+UoUBf2UT5GIAAAAASUVORK5CYII='

  describe('claude native image input', () => {
    it.skipIf(!runReal)(
      'delivers an image to claude so the model sees its pixels',
      async () => {
        const kit = await bootKit()
        try {
          const events = await runTurn(
            kit,
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  content: 'An image is included in this message. Reply with ONLY the dominant color name.',
                },
                {type: 'image', source: {type: 'data', mimeType: 'image/png', value: PNG_RED_64x64}},
              ],
            },
            await kit.session(),
          )
          expect(events.text().toLowerCase()).toContain('red')
        } finally {
          await kit.cleanup()
        }
      },
      120_000,
    )
  })
})

describe('api mcp claude session header', () => {
  const echo = defineTool({
    name: 'acme_echo_session',
    description: 'Echo the request session back',
    inputSchema: z.object({}),
    outputSchema: z.object({sessionId: z.string().nullable()}),
    meta: {summary: 'echo the request session back', category: 'fixture', mutating: false},
  }).server((_input, _ctx, request) => ({sessionId: request.sessionId}))

  const acme = defineExtension({name: 'acme', tools: [echo]})

  async function echoedSession(base: string, headers: Record<string, string>): Promise<string> {
    const mcp = await connectMcpClient(`${base}/api/mcp`, headers)
    try {
      const tool = (await mcp.tools()).find((candidate) => candidate.name === 'execute_typescript')
      if (!tool?.execute) throw new Error('execute_typescript not registered on /api/mcp')
      const raw = await tool.execute({typescriptCode: 'return await external_acme_echo_session({})'})
      const reply = z
        .object({result: z.object({sessionId: z.string()})})
        .loose()
        .parse(JSON.parse(z.string().parse(raw)))
      return reply.result.sessionId
    } finally {
      await mcp.close()
    }
  }

  describe('/api/mcp resolves the calling claude session', () => {
    it('scopes tools to the conciv session that adopted that claude session', async () => {
      const kit = await bootKit({extensions: [acme]})
      try {
        const claudeSessionId = randomUUID()
        const sessionId = await kit.session(claudeSessionId)
        expect(sessionId).toMatch(/^conciv_/)

        expect(await echoedSession(kit.base, {[CONCIV_CLAUDE_SESSION_HEADER]: claudeSessionId})).toBe(sessionId)
      } finally {
        await kit.cleanup()
      }
    }, 30_000)

    it('mints a fresh, unadopted session when that claude session maps to nothing', async () => {
      const kit = await bootKit({extensions: [acme]})
      try {
        const first = await echoedSession(kit.base, {[CONCIV_CLAUDE_SESSION_HEADER]: randomUUID()})
        const second = await echoedSession(kit.base, {[CONCIV_CLAUDE_SESSION_HEADER]: randomUUID()})
        expect(first).toMatch(/^conciv_/)
        expect(second).toMatch(/^conciv_/)
        expect(first).not.toBe(second)
      } finally {
        await kit.cleanup()
      }
    }, 30_000)

    it('keeps honouring the conciv session header the owned and tty paths send', async () => {
      const kit = await bootKit({extensions: [acme]})
      try {
        expect(await echoedSession(kit.base, {[CONCIV_SESSION_HEADER]: 'conciv_x'})).toBe('conciv_x')
      } finally {
        await kit.cleanup()
      }
    }, 30_000)
  })
})

describe('api mcp execute stream', () => {
  const draw = defineTool({
    name: 'canvas_svg',
    description: 'Draw an svg shape on the canvas',
    inputSchema: z.object({shape: z.string()}),
    outputSchema: z.object({drawn: z.string()}),
    meta: {summary: 'draw an svg shape on the canvas', category: 'fixture', mutating: false},
  }).server((input) => ({drawn: input.shape}))

  const acme = defineExtension({name: 'acme', tools: [draw]})

  async function executeRaw(base: string, session: string, typescriptCode: string): Promise<unknown> {
    const mcp = await connectMcpClient(`${base}/api/mcp`, {[CONCIV_SESSION_HEADER]: session})
    try {
      const tool = (await mcp.tools()).find((entry) => entry.name === 'execute_typescript')
      if (!tool?.execute) throw new Error('execute_typescript not on /api/mcp')
      return await tool.execute({typescriptCode})
    } finally {
      await mcp.close()
    }
  }

  function toolCallStarts(chunks: ChatEvent[]): {toolCallId: string; name: string; parent?: string}[] {
    return chunks.flatMap((chunk) => {
      if (chunk.type !== ChatEventType.TOOL_CALL_START) return []
      const name = chunk.toolCallName
      const meta = z
        .object({parentToolCallId: z.string().optional()})
        .loose()
        .safeParse(chunk.metadata ?? {})
      return [{toolCallId: chunk.toolCallId, name, parent: meta.success ? meta.data.parentToolCallId : undefined}]
    })
  }

  describe('/api/mcp sandbox calls render as nested action cards on the session stream', () => {
    it('publishes the execute call and its capability calls, nested by parent id', async () => {
      const kit = await bootKit({extensions: [acme]})
      try {
        const session = await kit.session()
        const stream = await kit.events(session)
        await executeRaw(kit.base, session, "return await external_canvas_svg({shape: 'circle'})")
        const childStart = await stream.waitFor(
          (chunk) => toolCallStarts([chunk]).some((call) => call.name === 'canvas_svg'),
          {hangGuardMs: 10_000},
        )
        const child = toolCallStarts([childStart])[0]
        if (!child) throw new Error('no canvas_svg tool call on the stream')
        expect(child.parent).toBeDefined()
        const parentStart = await stream.waitFor(
          (chunk) => toolCallStarts([chunk]).some((call) => call.name === 'execute_typescript'),
          {hangGuardMs: 10_000},
        )
        const parent = toolCallStarts([parentStart])[0]
        expect(parent?.toolCallId).toBe(child.parent)
        const childResult = await stream.waitFor(
          (chunk) => chunk.type === ChatEventType.TOOL_CALL_RESULT && chunk.toolCallId === child.toolCallId,
          {hangGuardMs: 10_000},
        )
        expect(JSON.stringify(childResult)).toContain('circle')
      } finally {
        await kit.cleanup()
      }
    }, 30_000)
  })
})
