import {DatabaseSync} from 'node:sqlite'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {sql} from 'drizzle-orm'
import {defineAIPersistence} from '@tanstack/ai-persistence'
import {runPersistenceConformance} from '@tanstack/ai-persistence/testkit'
import {
  chatRuns,
  claudeCode,
  createChatServer,
  drizzleChatStores,
  toolApprovalId,
  type TurnHooks,
} from '../src/server.js'
import {defineTool} from '@conciv/protocol/chat-tool-types'
import {describe, expect, it} from 'vitest'
import {z} from 'zod'
import {
  approvalAskOf,
  type RunLifecycle,
  approvalRequestedEvent,
  ChatEventType,
  defineChatEvent,
  isRunPhaseTerminal,
  runLifecycleEvent,
  type ChatEvent,
} from '@conciv/protocol/chat-event-types'
import {UsageSnapshotSchema, contextUsedTokens, tokenUsageToSnapshot} from '@conciv/protocol/usage-types'
import {createTextChunks, fakeText, storyConnection} from '../src/testkit.js'
import type {FakeResponse, FakeResponseStep} from '@tanstack/ai/testing'
import {chmodSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {parseSync} from 'oxc-parser'

describe('chat stores', () => {
  const CHAT_TABLES = `CREATE TABLE \`chat_runs\` (
	\`run_id\` text PRIMARY KEY,
	\`thread_id\` text NOT NULL,
	\`harness_id\` text NOT NULL,
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
CREATE TABLE \`chat_messages\` (
	\`thread_id\` text NOT NULL,
	\`position\` integer NOT NULL,
	\`message_id\` text,
	\`role\` text NOT NULL,
	\`message_json\` text NOT NULL,
	CONSTRAINT \`chat_messages_pk\` PRIMARY KEY(\`thread_id\`, \`position\`)
);
CREATE INDEX \`chat_messages_thread_message\` ON \`chat_messages\` (\`thread_id\`,\`message_id\`);`

  function chatDb() {
    const client = new DatabaseSync(':memory:')
    client.exec(CHAT_TABLES)
    return drizzle({client})
  }

  it('a run row records the harness of its thread when it is created', async () => {
    const db = chatDb()
    const stores = drizzleChatStores(db, {harnessOf: (threadId) => `harness-of-${threadId}`})
    await stores.runs.createOrResume({runId: 'r1', threadId: 't1', startedAt: 1})
    expect(db.select({runId: chatRuns.runId, harnessId: chatRuns.harnessId}).from(chatRuns).all()).toEqual([
      {runId: 'r1', harnessId: 'harness-of-t1'},
    ])
  })

  describe('a paged thread read', () => {
    const THREAD = [
      {id: 'u0', role: 'user' as const, content: 'first question'},
      {id: 'a0', role: 'assistant' as const, content: 'first answer'},
      {id: 'u1', role: 'user' as const, content: 'run a tool'},
      {
        id: 'a1',
        role: 'assistant' as const,
        content: null,
        toolCalls: [{id: 'call-1', type: 'function' as const, function: {name: 'look', arguments: '{}'}}],
      },
      {role: 'tool' as const, toolCallId: 'call-1', content: 'looked'},
      {id: 'a1b', role: 'assistant' as const, content: 'tool done'},
      {id: 'u2', role: 'user' as const, content: 'last question'},
      {id: 'a2', role: 'assistant' as const, content: 'last answer'},
    ]

    async function savedThread() {
      const stores = drizzleChatStores(chatDb(), {harnessOf: () => 'test-harness'})
      await stores.messages.saveThread('paged', THREAD)
      return stores
    }

    it('returns the newest window as a page that starts on a user message, so no turn is split', async () => {
      const stores = await savedThread()
      expect(await stores.messages.loadThread('paged', {limit: 4})).toEqual({
        messages: THREAD.slice(2),
        truncated: true,
        cursor: 'u1',
      })
    })

    it('walks to the window before a cursor and marks the first window complete', async () => {
      const stores = await savedThread()
      expect(await stores.messages.loadThread('paged', {limit: 4, before: 'u1'})).toEqual({
        messages: THREAD.slice(0, 2),
        truncated: false,
      })
    })

    it('a cursor the thread does not hold yields an empty, complete page', async () => {
      const stores = await savedThread()
      expect(await stores.messages.loadThread('paged', {limit: 4, before: 'gone'})).toEqual({
        messages: [],
        truncated: false,
      })
    })

    it('a page read leaves the messages outside its window unread', async () => {
      const db = chatDb()
      const stores = drizzleChatStores(db, {harnessOf: () => 'test-harness'})
      await stores.messages.saveThread('paged', THREAD)
      db.run(sql`UPDATE chat_messages SET message_json = 'not json' WHERE thread_id = 'paged' AND position < 2`)

      expect(await stores.messages.loadThread('paged', {limit: 4})).toEqual({
        messages: THREAD.slice(2),
        truncated: true,
        cursor: 'u1',
      })
      await expect(stores.messages.loadThread('paged')).rejects.toThrow()
    })

    it('the newest page ends on the last stored message even when a position in between is missing', async () => {
      const db = chatDb()
      const stores = drizzleChatStores(db, {harnessOf: () => 'test-harness'})
      await stores.messages.saveThread('paged', THREAD)
      db.run(sql`DELETE FROM chat_messages WHERE thread_id = 'paged' AND position = 1`)

      expect(await stores.messages.loadThread('paged', {limit: 2})).toEqual({
        messages: THREAD.slice(6),
        truncated: true,
        cursor: 'u2',
      })
    })

    it('saving a shorter thread drops the messages past its end', async () => {
      const stores = await savedThread()
      await stores.messages.saveThread('paged', THREAD.slice(0, 2))
      expect(await stores.messages.loadThread('paged')).toEqual(THREAD.slice(0, 2))
      expect(await stores.messages.loadThread('paged', {limit: 4})).toEqual({
        messages: THREAD.slice(0, 2),
        truncated: false,
      })
    })

    it('a read without a window still returns the whole transcript', async () => {
      const stores = await savedThread()
      expect(await stores.messages.loadThread('paged')).toEqual(THREAD)
    })
  })

  it('ending a run settles it and logs the failure when the end hook throws', {timeout: 15_000}, async () => {
    const logged: string[] = []
    const started = Promise.withResolvers<void>()
    const stalled = stalledModel(() => started.resolve())
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
    const server = await chatServer(hooks, (message) => logged.push(message))
    const driven = server.drive({threadId: 'thread', runId: 'run', kind: 'chat'}, [{role: 'user', content: 'hi'}])
    await started.promise
    await server.endRuns('thread')
    await driven
    expect(logged.join('\n')).toContain('end hook failed')
  })

  it('a run ended by a newer run before it reaches the model never starts its CLI', {timeout: 15_000}, async () => {
    const launched: string[] = []
    const firstInSetup = Promise.withResolvers<void>()
    const firstSetup = Promise.withResolvers<void>()
    const secondLaunched = Promise.withResolvers<void>()
    const hooks: TurnHooks = {
      plan: (turn) => ({
        adapter: stalledModel(() => {
          launched.push(turn.runId)
          secondLaunched.resolve()
        }),
        systemPrompts: [],
        codeMode: [],
        asking: [],
        setup: async () => {
          if (turn.runId === 'first') {
            firstInSetup.resolve()
            await firstSetup.promise
          }
          return new Map()
        },
        expand: async (messages) => messages,
        providerMessages: async (messages) => messages,
        chunk: async (chunk) => [chunk],
      }),
      usage: async () => undefined,
      started: () => undefined,
      end: async () => undefined,
    }
    const server = await chatServer(hooks, () => undefined)
    const first = server.drive({threadId: 'thread', runId: 'first', kind: 'chat'}, [{role: 'user', content: 'one'}])
    await firstInSetup.promise
    const second = server.drive({threadId: 'thread', runId: 'second', kind: 'chat'}, [{role: 'user', content: 'two'}])
    await secondLaunched.promise
    firstSetup.resolve()
    await first
    await server.endRuns('thread')
    await second
    expect(launched).toEqual(['second'])
  })

  it(
    'a failed cancel write still ends every live run and endAllRuns settles them before it rejects',
    {timeout: 15_000},
    async () => {
      const db = chatDb()
      db.$client.exec(`CREATE TRIGGER cancel_write_fails BEFORE UPDATE OF cancel_requested ON chat_runs
      WHEN NEW.cancel_requested = 1 AND OLD.cancel_requested IS NOT 1
      BEGIN SELECT RAISE(ABORT, 'cancel write failed'); END`)
      const started = new Map(['one', 'two'].map((threadId) => [threadId, Promise.withResolvers<void>()]))
      const hooks: TurnHooks = {
        plan: (turn) => ({
          adapter: stalledModel(() => started.get(turn.threadId)?.resolve()),
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
        end: async () => undefined,
      }
      const server = await chatServer(hooks, () => undefined, db)
      const driven = [...started.keys()].map((threadId) =>
        server.drive({threadId, runId: `${threadId}-run`, kind: 'chat'}, [{role: 'user', content: 'hi'}]),
      )
      await Promise.all([...started.values()].map((gate) => gate.promise))
      const outcome = await server.endAllRuns().then(
        () => 'resolved',
        (error: unknown) => (error instanceof AggregateError ? 'aggregate' : String(error)),
      )
      const runs = db.$client.prepare('SELECT thread_id, status FROM chat_runs ORDER BY thread_id').all()
      expect.soft(runs).toEqual([
        {thread_id: 'one', status: 'aborted'},
        {thread_id: 'two', status: 'aborted'},
      ])
      expect.soft(outcome).toBe('aggregate')
      await Promise.all(driven)
    },
  )

  it(
    'a CLI silent past the journal default but inside the first-output budget still reports its exit',
    {timeout: 25_000},
    async () => {
      const bin = join(mkdtempSync(join(tmpdir(), 'conciv-slow-cli-')), 'claude')
      writeFileSync(bin, '#!/bin/sh\nsleep 11\nexit 1\n')
      chmodSync(bin, 0o755)
      const ended = Promise.withResolvers<RunLifecycle>()
      const hooks: TurnHooks = {
        plan: () => ({
          adapter: claudeCode('opus', {claudeExecutable: bin}),
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
        end: async (_turn, run) => ended.resolve(run),
      }
      const server = await chatServer(hooks, () => undefined)
      await server.drive({threadId: 'thread', runId: 'slow', kind: 'chat'}, [{role: 'user', content: 'hi'}])
      const run = await ended.promise
      expect(run.error).toBe('Agent process exited with code 1')
    },
  )

  it('endAllRuns interrupts a run blocked in a tool call and records it aborted', {timeout: 15_000}, async () => {
    const db = chatDb()
    const toolRunning = Promise.withResolvers<void>()
    const blocking = defineTool({
      name: 'blocking',
      description: 'Waits until the run is stopped.',
      inputSchema: z.object({}),
      outputSchema: z.unknown(),
    }).server(async (_args, context) => {
      toolRunning.resolve()
      const signal = context?.abortSignal
      await new Promise((resolve) => signal?.addEventListener('abort', resolve, {once: true}))
      return 'stopped'
    })
    const hooks: TurnHooks = {
      plan: () => ({
        adapter: scriptedModel([{toolCalls: [{name: 'blocking', input: {}}]}]),
        systemPrompts: [],
        codeMode: [],
        asking: [blocking],
        setup: async () => new Map([[toolApprovalId('blocking'), true]]),
        expand: async (messages) => messages,
        providerMessages: async (messages) => messages,
        chunk: async (chunk) => [chunk],
      }),
      usage: async () => undefined,
      started: () => undefined,
      end: async () => undefined,
    }
    const server = await chatServer(hooks, () => undefined, db)
    const driven = server.drive({threadId: 'thread', runId: 'run', kind: 'chat'}, [{role: 'user', content: 'hi'}])
    await toolRunning.promise
    const outcome = await Promise.race([
      server.endAllRuns().then(() => 'ended'),
      new Promise((resolve) => setTimeout(resolve, 3_000, 'still waiting on the tool')),
    ])
    expect(outcome).toBe('ended')
    expect(db.$client.prepare('SELECT status FROM chat_runs').all()).toEqual([{status: 'aborted'}])
    await driven
  })

  function scriptedModel(responses: FakeResponseStep[]) {
    const model = fakeText()
    model.setResponses(responses)
    return model
  }

  function stalledModel(called: () => void) {
    return scriptedModel([
      () => {
        called()
        return new Promise<FakeResponse>(() => undefined)
      },
    ])
  }

  async function chatServer(hooks: TurnHooks, log: (message: string) => void, db = chatDb()) {
    const dir = mkdtempSync(join(tmpdir(), 'conciv-ai-'))
    return createChatServer({
      stores: drizzleChatStores(db, {harnessOf: () => 'test-harness'}),
      sandbox: {dir, journalDir: join(dir, 'runs')},
      hooks,
      codeModeResult: (value) => value,
      firstOutputTimeoutMs: 30_000,
      log,
    })
  }

  runPersistenceConformance(
    'conciv drizzle chat stores',
    () => defineAIPersistence({stores: drizzleChatStores(chatDb(), {harnessOf: () => 'test-harness'})}),
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

    it('takes the cost from usage.cost when providerUsageDetails carries none', () => {
      expect(tokenUsageToSnapshot({promptTokens: 10, completionTokens: 2, totalTokens: 12, cost: 0.25})).toMatchObject({
        totalCostUsd: 0.25,
      })
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
      expect(code).toMatch(
        /const root = workspace\.root \?\? "\/workspace";\s+const workspaceHash = computeWorkspaceHash\(workspace\)/,
      )
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
