import {DatabaseSync} from 'node:sqlite'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {defineAIPersistence} from '@tanstack/ai-persistence'
import {runPersistenceConformance} from '@tanstack/ai-persistence/testkit'
import {createChatServer, drizzleChatStores, makeTextAdapter, type TurnHooks} from '../src/server.js'
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {
  approvalAskOf,
  approvalRequestedEvent,
  ChatEventType,
  defineChatEvent,
  isRunPhaseTerminal,
  runLifecycleEvent,
  type ChatEvent,
} from '@conciv/protocol/chat-event-types'
import {UsageSnapshotSchema, contextUsedTokens} from '@conciv/protocol/usage-types'
import {createTextChunks, storyConnection} from '../src/testkit.js'
import {mkdtempSync, readdirSync, readFileSync, statSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {parseSync} from 'oxc-parser'

describe('chat stores', () => {
  const CHAT_TABLES = `CREATE TABLE \`chat_runs\` (
	\`run_id\` text PRIMARY KEY,
	\`thread_id\` text NOT NULL,
	\`status\` text NOT NULL,
	\`started_at\` integer NOT NULL,
	\`finished_at\` integer,
	\`error\` text,
	\`error_code\` text,
	\`usage_json\` text,
	\`sandbox_key\` text,
	\`detached_since\` integer,
	\`cancel_requested\` integer,
	\`driver_epoch\` integer
);
CREATE INDEX \`chat_runs_status_detached\` ON \`chat_runs\` (\`status\`,\`detached_since\`);
CREATE INDEX \`chat_runs_thread_started\` ON \`chat_runs\` (\`thread_id\`,\`started_at\`);
CREATE TABLE \`chat_metadata\` (
	\`namespace\` text NOT NULL,
	\`key\` text NOT NULL,
	\`value_json\` text NOT NULL,
	CONSTRAINT \`chat_metadata_pk\` PRIMARY KEY(\`namespace\`, \`key\`)
);
CREATE TABLE \`chat_threads\` (
	\`thread_id\` text PRIMARY KEY,
	\`messages_json\` text NOT NULL,
	\`updated_at\` integer NOT NULL
);`

  function chatDb() {
    const client = new DatabaseSync(':memory:')
    client.exec(CHAT_TABLES)
    return drizzle({client})
  }

  it('ending a run settles it and logs the failure when the end hook throws', {timeout: 15_000}, async () => {
    const logged: string[] = []
    const started = Promise.withResolvers<void>()
    const stalled = makeTextAdapter('stalled', async function* () {
      yield {type: ChatEventType.RUN_STARTED, runId: 'run', threadId: 'thread', timestamp: Date.now()}
      started.resolve()
      await new Promise(() => undefined)
    })
    const hooks: TurnHooks = {
      plan: () => ({
        adapter: stalled,
        systemPrompts: [],
        codeMode: [],
        asking: [],
        setup: async () => new Map(),
        expand: async (messages) => messages,
        providerMessages: async (messages) => messages,
        chunk: async (chunk) => [chunk],
      }),
      usage: async () => undefined,
      started: () => undefined,
      end: async () => {
        throw new Error('end hook failed')
      },
    }
    const dir = mkdtempSync(join(tmpdir(), 'conciv-ai-'))
    const server = await createChatServer({
      stores: drizzleChatStores(chatDb()),
      sandbox: {dir, journalDir: join(dir, 'runs'), commands: {allow: [], ask: [], deny: []}},
      hooks,
      codeModeResult: (value) => value,
      firstOutputTimeoutMs: 30_000,
      log: (message) => logged.push(message),
    })
    const driven = server.drive({threadId: 'thread', runId: 'run', kind: 'chat'}, [{role: 'user', content: 'hi'}])
    await started.promise
    await server.endRuns('thread')
    await driven
    expect(logged.join('\n')).toContain('end hook failed')
  })

  runPersistenceConformance(
    'conciv drizzle chat stores',
    () => defineAIPersistence({stores: drizzleChatStores(chatDb())}),
    {
      skip: ['interrupts', 'activities', 'generationRuns', 'artifacts', 'blobs', 'log', 'sessions'],
      checks: ['messages.metadata', 'runs.listByThread.state'],
    },
  )
})

describe('events', () => {
  const lifecycle = {
    runId: 'r1',
    phase: 'running' as const,
    startedAt: 1,
    finishedAt: null,
    serverNow: 2,
    error: null,
  }

  describe('defineChatEvent', () => {
    const pinged = defineChatEvent('test.pinged', z.object({count: z.number()}))

    it('creates a CUSTOM event carrying the validated value', () => {
      expect(pinged.create({count: 1})).toEqual({type: ChatEventType.CUSTOM, name: 'test.pinged', value: {count: 1}})
    })

    it('rejects an invalid value on create', () => {
      expect(() => pinged.create({count: Number.NaN})).toThrow()
    })

    it('parses only its own name with a valid value', () => {
      expect(pinged.parse({type: ChatEventType.CUSTOM, name: 'test.pinged', value: {count: 2}})).toEqual({count: 2})
      expect(pinged.parse({type: ChatEventType.CUSTOM, name: 'test.other', value: {count: 2}})).toBeNull()
      expect(pinged.parse({type: ChatEventType.CUSTOM, name: 'test.pinged', value: {count: 'x'}})).toBeNull()
      expect(pinged.parse({type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: 'hi'})).toBeNull()
    })
  })

  describe('conciv events keep their wire shape', () => {
    it('approval-requested, the shape the sandbox adapters emit', () => {
      const event = approvalRequestedEvent.create({
        approvalId: 'claude-code:command:ls',
        title: 'Bash: ls',
        command: 'ls',
      })
      expect(event).toEqual({
        type: ChatEventType.CUSTOM,
        name: 'approval-requested',
        value: {approvalId: 'claude-code:command:ls', title: 'Bash: ls', command: 'ls'},
      })
      expect(approvalAskOf({...event, timestamp: 1})).toEqual({
        approvalId: 'claude-code:command:ls',
        toolCallId: 'claude-code:command:ls',
        toolName: 'Bash: ls',
        input: {command: 'ls'},
      })
    })

    it('run lifecycle', () => {
      const event = runLifecycleEvent.create(lifecycle)
      expect(event).toEqual({type: ChatEventType.CUSTOM, name: 'conciv.run-lifecycle', value: lifecycle})
      expect(runLifecycleEvent.parse(event)).toEqual(lifecycle)
      expect(isRunPhaseTerminal('stopping')).toBe(false)
      expect(isRunPhaseTerminal('aborted')).toBe(true)
    })
  })
})

describe('testkit', () => {
  async function drainUntilLastChunk(iterator: AsyncIterator<ChatEvent>, expected: number): Promise<ChatEvent[]> {
    const seen: ChatEvent[] = []
    while (seen.length < expected) {
      const step = await iterator.next()
      if (step.done) return seen
      seen.push(step.value)
    }
    return seen
  }

  describe('storyConnection abort at the last chunk yield', () => {
    it('emits no RUN_FINISHED when aborted while suspended at the final chunk', async () => {
      const chunks = createTextChunks('hi')
      const controller = new AbortController()
      const stream = storyConnection({chunks}).connect([], undefined, controller.signal, {
        threadId: 'story-thread',
        runId: 'story-run',
      })
      const iterator = stream[Symbol.asyncIterator]()
      const seen = await drainUntilLastChunk(iterator, chunks.length + 1)
      expect(seen.at(-1)?.type).toBe(ChatEventType.TEXT_MESSAGE_END)
      controller.abort()
      const resumed = await iterator.next()
      expect(resumed.done).toBe(true)
    })

    it('emits no RUN_ERROR when an erroring stream is aborted at the final chunk', async () => {
      const chunks = createTextChunks('hi')
      const controller = new AbortController()
      const stream = storyConnection({chunks, shouldError: true}).connect([], undefined, controller.signal, {
        threadId: 'story-thread',
        runId: 'story-run',
      })
      const iterator = stream[Symbol.asyncIterator]()
      await drainUntilLastChunk(iterator, chunks.length + 1)
      controller.abort()
      const resumed = await iterator.next()
      expect(resumed.done).toBe(true)
    })
  })
})

describe('usage', () => {
  describe('usage-types', () => {
    it('parses a partial snapshot (all fields optional)', () => {
      expect(UsageSnapshotSchema.safeParse({}).success).toBe(true)
      const r = UsageSnapshotSchema.safeParse({inputTokens: 10, contextWindow: 200000})
      expect(r.success && r.data.inputTokens).toBe(10)
    })

    it('rejects negative tokens', () => {
      expect(UsageSnapshotSchema.safeParse({inputTokens: -1}).success).toBe(false)
    })

    it('reports occupancy from contextTokens, never the billing sum', () => {
      expect(
        contextUsedTokens({contextTokens: 92000, inputTokens: 100, cacheReadTokens: 50, cacheWriteTokens: 10}),
      ).toBe(92000)
    })

    it('returns undefined when no occupancy is present (billing totals are not occupancy)', () => {
      expect(contextUsedTokens({inputTokens: 773000, cacheReadTokens: 700000, totalCostUsd: 1})).toBeUndefined()
    })
  })
})

describe('dist externals', () => {
  const distDir = fileURLToPath(new URL('../dist', import.meta.url))

  type Chunk = {file: string; code: string}

  function collectChunks(dir: string): Chunk[] {
    const chunks: Chunk[] = []
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        chunks.push(...collectChunks(full))
      } else if (name.endsWith('.js')) {
        chunks.push({file: full, code: readFileSync(full, 'utf8')})
      }
    }
    return chunks
  }

  function stripQuotes(text: string): string {
    if (/^['"].*['"]$/.test(text)) return text.slice(1, -1)
    return text
  }

  function moduleSources(chunk: Chunk): string[] {
    const parsed = parseSync(chunk.file, chunk.code, {sourceType: 'module'})
    if (parsed.errors.length > 0) throw new Error(`failed to parse dist chunk ${chunk.file}`)
    const staticSources = parsed.module.staticImports.map((statement) => statement.moduleRequest.value)
    const reexportSources = parsed.module.staticExports.flatMap((statement) =>
      statement.entries.flatMap((entry) => (entry.moduleRequest ? [entry.moduleRequest.value] : [])),
    )
    const dynamicSources = parsed.module.dynamicImports.map((statement) =>
      stripQuotes(chunk.code.slice(statement.moduleRequest.start, statement.moduleRequest.end)),
    )
    return [...staticSources, ...reexportSources, ...dynamicSources]
  }

  const chunks = collectChunks(distDir)
  const sources = chunks.flatMap(moduleSources)

  const importsPackage = (name: string) => sources.some((source) => source === name || source.startsWith(`${name}/`))

  describe('@conciv/ai dist keeps @tanstack/ai-sandbox free of peer edges (#107)', () => {
    it('bundles the @tanstack/ai-* adapters instead of importing them', () => {
      for (const adapter of [
        '@tanstack/ai-acp',
        '@tanstack/ai-claude-code',
        '@tanstack/ai-codex',
        '@tanstack/ai-opencode',
      ]) {
        expect(importsPackage(adapter), `dist imports ${adapter}`).toBe(false)
      }
    })

    it('bundles the patched @tanstack/ai-sandbox-local-process so no peer edge on ai-sandbox reaches consumers', () => {
      expect(importsPackage('@tanstack/ai-sandbox-local-process')).toBe(false)
    })

    it('bundles the patched @tanstack/ai-sandbox and @tanstack/ai-code-mode, patches included', () => {
      expect(importsPackage('@tanstack/ai-sandbox')).toBe(false)
      expect(importsPackage('@tanstack/ai-code-mode')).toBe(false)
      const code = chunks.map((chunk) => chunk.code).join('\n')
      expect(code).toContain('toolCallId: callId')
      expect(code).toContain('chunk.metadata?.tanstack?.state === "output-error"')
      expect(code).toContain('provides: [SandboxCapability],')
      expect(code).not.toContain('provides: [SandboxCapability, ProjectionCapability]')
    })

    it('externalizes @tanstack/ai', () => {
      expect(importsPackage('@tanstack/ai')).toBe(true)
    })

    it('bundles one sandbox capability handle (a second copy breaks chat() validate)', () => {
      const handles = chunks.flatMap((chunk) => chunk.code.match(/var SandboxCapability = createCapability\(\)/g) ?? [])
      expect(handles).toHaveLength(1)
    })
  })
})
