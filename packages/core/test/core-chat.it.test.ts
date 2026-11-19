import {randomUUID} from 'node:crypto'
import {realpathSync, rmSync} from 'node:fs'
import {describe, it, afterEach, afterAll, beforeAll, expect} from 'vitest'
import {Plugin} from '@conciv/plugin'
import {
  harnessAvailable,
  createTestHarness,
  makeRunTypescript,
  type Kit,
  connectMcpClient,
} from '@conciv/harness-testkit'
import {claude} from '@conciv/harness/claude'
import {codex} from '@conciv/harness/codex'
import {opencode} from '@conciv/harness/opencode'
import {ChatEventType} from '@conciv/protocol/chat-event-types'
import {SessionId, CONCIV_SESSION_HEADER} from '@conciv/protocol/chat-types'
import {z} from 'zod'
import {readDevEndpoint} from '../src/lib/dev-endpoint.js'
import {start, type Engine} from '../src/start.js'
import {assertTurnAndResume, requireClaude, bootKit, runTurn, runReal, removeTurnTranscripts} from './helpers.js'
import {tempDir} from '@conciv/vitest-config/temp-dir'

describe('claude tanstack', () => {
  const runReal = !process.env.CI

  const dir = realpathSync(tempDir('claude-tanstack-'))

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

  const dir = realpathSync(tempDir('codex-tanstack-'))

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

describe('opencode tanstack', () => {
  const optIn = process.env.CONCIV_OPENCODE_IT === '1'
  const runReal = !process.env.CI && optIn && harnessAvailable(opencode)

  const dir = realpathSync(tempDir('opencode-tanstack-'))

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

function acmePlugin(tools: readonly Parameters<Plugin.Context['tool']['transform']>[0][]) {
  return Plugin.define({
    id: 'acme',
    async setup(ctx) {
      for (const transform of tools) await ctx.tool.transform(transform)
    },
  })
}

describe('plugin tool call id', () => {
  const acme = acmePlugin([
    (tools) =>
      tools.add({
        name: 'acme_echo_call_id',
        description: 'Echo the tool call id the request carries',
        input: z.object({}),
        output: z.object({toolCallId: z.string()}),
        execute: async (_input, context) => ({output: {toolCallId: context.id}}),
      }),
  ])

  const EchoResultSchema = z.object({toolCallId: z.string()})

  const cleanups: (() => Promise<void>)[] = []
  afterEach(async () => {
    for (const cleanup of cleanups.splice(0)) await cleanup()
  })

  describe('a plugin tool run from a chat turn knows which tool call it is answering', () => {
    it('hands the tool the same call id the turn put on the wire', async () => {
      const harness = createTestHarness(requireClaude())
      const kit = await bootKit({plugins: [acme]}, harness)
      cleanups.push(() => kit.cleanup())
      const sessionId = await kit.session()
      harness.script.scriptToolCall('execute_typescript', {
        typescriptCode: 'return await external_acme_echo_call_id({})',
      })
      const stream = await kit.turn('echo the call id', {session: sessionId, runId: randomUUID()})
      const events = await stream.done()

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

describe('registry plugin tools', () => {
  const acme = acmePlugin([
    (tools) =>
      tools.add({
        name: 'acme_lens',
        description: 'Inspect the lens assembly.',
        input: z.object({zoom: z.number().int().min(1)}),
        output: z.object({zoom: z.number(), focused: z.boolean()}),
        execute: async ({zoom}) => ({output: {zoom, focused: true}}),
      }),
    (tools) =>
      tools.add({
        name: 'acme dial',
        description: 'A tool whose name the host refuses.',
        input: z.object({turns: z.number().int()}),
        execute: async ({turns}) => ({output: {turns}}),
      }),
  ])

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

  describe('plugin tools ride the tool service into the sandbox', () => {
    const shared: {kit: Kit | undefined} = {kit: undefined}

    beforeAll(async () => {
      shared.kit = await bootKit({plugins: [acme]})
    })

    afterAll(async () => {
      await shared.kit?.cleanup()
    })

    function kit(): Kit {
      if (shared.kit === undefined) throw new Error('the app did not boot')
      return shared.kit
    }

    it('appears in discover_tools with its declared summary and input', async () => {
      const found = JSON.stringify(await discover(kit(), 'acme_lens'))
      expect(found).toContain('Inspect the lens assembly.')
      expect(found).toContain('zoom')
    })

    it('rejects malformed input with a loud validation error, never a silent success', async () => {
      const failed = await runSandbox(
        kit(),
        "try { await external_acme_lens({zoom: 'way too much'}); return 'no-error' } catch (error) { return String(error) }",
      )
      expect(z.string().parse(failed)).not.toBe('no-error')
      expect(z.string().parse(failed).toLowerCase()).toMatch(/input|invalid|zoom/)
    })

    it('leaves out a tool whose name the host refuses while the rest of the plugin stays offered', async () => {
      const catalog = (await kit().rpc.registry.catalog(undefined)).map((signature) => signature.name)
      expect(catalog).toContain('acme_lens')
      expect(catalog).not.toContain('acme dial')
    })
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
    const root = tempDir('conciv-start-endpoint-')
    const endpointDir = tempDir('conciv-endpoint-dir-')
    try {
      const engine = await start({
        options: {stateRoot: root, systemPrompt: false},
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

    it('serves /native open and writes the generated agent token into the endpoint when no access token is given', async () => {
      await withStartedEngine({serveNativePage: true}, async (engine, endpointDir) => {
        const page = await fetch(`http://127.0.0.1:${engine.port}/native`)
        expect(page.status).toBe(200)
        expect(await page.text()).toContain('data-conciv-native-root')

        expect(readDevEndpoint(endpointDir)).toEqual({
          apiBase: `http://127.0.0.1:${engine.port}/t/${engine.agentToken}`,
          token: engine.agentToken,
          pid: process.pid,
        })
        await engine.stop()
        expect(readDevEndpoint(endpointDir)).toBeNull()
      })
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
        const keepTranscripts = removeTurnTranscripts(requireClaude(), kit.stateRoot, 'claude-code.session-id')
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
          keepTranscripts(events)
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
  const acme = acmePlugin([
    (tools) =>
      tools.add({
        name: 'acme_echo_session',
        description: 'Echo the request session back',
        input: z.object({}),
        output: z.object({sessionId: z.string()}),
        execute: async (_input, context) => ({output: {sessionId: context.sessionId}}),
      }),
  ])

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
    it('keeps honouring the conciv session header the owned and tty paths send', async () => {
      const kit = await bootKit({plugins: [acme]})
      try {
        expect(await echoedSession(kit.base, {[CONCIV_SESSION_HEADER]: 'conciv_x'})).toBe('conciv_x')
      } finally {
        await kit.cleanup()
      }
    }, 30_000)
  })
})
