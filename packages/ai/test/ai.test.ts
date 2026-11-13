import {DatabaseSync} from 'node:sqlite'
import {drizzle} from 'drizzle-orm/node-sqlite'
import {migrateSync} from 'drizzle-orm/sqlite-core/async/session'
import {migrations} from '@conciv/db'
import {sql} from 'drizzle-orm'
import {defineAIPersistence} from '@tanstack/ai-persistence'
import {runPersistenceConformance} from '@tanstack/ai-persistence/testkit'
import {
  claudeCode,
  createChatServer,
  drizzleChatStores,
  makeTextAdapter,
  quickJSThreadDriver,
  toolApprovalId,
  type Turn,
  type TurnHooks,
} from '../src/server.js'
import type {ToolBinding} from '@tanstack/ai-code-mode'
import {defineTool} from '@conciv/protocol/chat-tool-types'
import {describe, expect, it, onTestFinished} from 'vitest'
import {z} from 'zod'
import {
  readApprovalAsk,
  type RunLifecycle,
  approvalRequestedEvent,
  ChatEventType,
  defineChatEvent,
  runLifecycleEvent,
  type ChatEvent,
} from '@conciv/protocol/chat-event-types'
import {UsageSnapshotSchema, contextUsedTokens, tokenUsageToSnapshot} from '@conciv/protocol/usage-types'
import {createTextChunks, fakeText, storyConnection} from '../src/testkit.js'
import {localSandbox} from '../src/server/local-sandbox.js'
import type {FakeResponse, FakeResponseStep} from '@tanstack/ai/testing'
import {mkdtempSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {fileURLToPath} from 'node:url'
import {join} from 'node:path'
import {createServer} from 'node:net'
import {once} from 'node:events'
import {parseSync} from 'oxc-parser'
import {subscribe, unsubscribe} from 'node:diagnostics_channel'
import {Worker} from 'node:worker_threads'
import {closePool, openPool} from '../src/server/quickjs-thread.js'
import {createChatSession} from '../src/client.js'
import {createRoot} from 'solid-js'

describe('chat stores', () => {
  function chatDb() {
    const db = drizzle({client: new DatabaseSync(':memory:')})
    migrateSync(migrations, db._.session)
    return db
  }

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
      const db = chatDb()
      const stores = drizzleChatStores(db, {readHarness: () => 'test-harness'})
      await stores.messages.saveThread('paged', THREAD)
      return {db, messages: stores.messages}
    }

    it('pages back from the newest window without splitting a turn, and a shorter save drops the tail', async () => {
      const {messages} = await savedThread()
      expect(await messages.loadThread('paged')).toEqual(THREAD)
      expect(await messages.loadThread('paged', {limit: 4})).toEqual({
        messages: THREAD.slice(2),
        truncated: true,
        cursor: 'u1',
      })
      expect(await messages.loadThread('paged', {limit: 4, before: 'u1'})).toEqual({
        messages: THREAD.slice(0, 2),
        truncated: false,
      })
      expect(await messages.loadThread('paged', {limit: 4, before: 'gone'})).toEqual({messages: [], truncated: false})
      await messages.saveThread('paged', THREAD.slice(0, 2))
      expect(await messages.loadThread('paged')).toEqual(THREAD.slice(0, 2))
      expect(await messages.loadThread('paged', {limit: 4})).toEqual({messages: THREAD.slice(0, 2), truncated: false})
    })

    it('a page read leaves the messages outside its window unread', async () => {
      const {db, messages} = await savedThread()
      db.run(sql`UPDATE chat_messages SET message_json = 'not json' WHERE thread_id = 'paged' AND position < 2`)
      expect(await messages.loadThread('paged', {limit: 4})).toEqual({
        messages: THREAD.slice(2),
        truncated: true,
        cursor: 'u1',
      })
      await expect(messages.loadThread('paged')).rejects.toThrow()
    })

    it('the newest page ends on the last stored message even when a position in between is missing', async () => {
      const {db, messages} = await savedThread()
      db.run(sql`DELETE FROM chat_messages WHERE thread_id = 'paged' AND position = 1`)
      expect(await messages.loadThread('paged', {limit: 2})).toEqual({
        messages: THREAD.slice(6),
        truncated: true,
        cursor: 'u2',
      })
    })
  })

  it('ending a run settles it and logs the failure when the end hook throws', {timeout: 15_000}, async () => {
    const logged: string[] = []
    const started = Promise.withResolvers<void>()
    const stalled = stalledModel(() => started.resolve())
    const hooks = turnHooks(() => ({adapter: stalled}), {
      end: async () => {
        throw new Error('end hook failed')
      },
    })
    const server = await chatServer(hooks, (message) => logged.push(message))
    const driven = say(server, 'thread', 'run')
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
    const hooks = turnHooks((turn) => ({
      adapter: stalledModel(() => {
        launched.push(turn.runId)
        secondLaunched.resolve()
      }),
      setup: async () => {
        if (turn.runId === 'first') {
          firstInSetup.resolve()
          await firstSetup.promise
        }
        return new Map()
      },
    }))
    const server = await chatServer(hooks, () => undefined)
    const first = say(server, 'thread', 'first', 'one')
    await firstInSetup.promise
    const second = say(server, 'thread', 'second', 'two')
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
      const hooks = turnHooks((turn) => ({adapter: stalledModel(() => started.get(turn.threadId)?.resolve())}))
      const server = await chatServer(hooks, () => undefined, db)
      const driven = [...started.keys()].map((threadId) => say(server, threadId, `${threadId}-run`))
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

  describe('a turn driven by an agent CLI', () => {
    const ANSWER = 'the answer'
    const SESSION = 'fake-session'

    const FAKE_CLAUDE = `#!/usr/bin/env node
const fs = require('node:fs')
const data = JSON.parse(fs.readFileSync(require('node:path').join(__dirname, 'claude.json'), 'utf8'))
fs.appendFileSync(data.launches, process.pid + '\\n')
const watched = require('node:net').connect(data.socket, () => {
  watched.unref()
  setTimeout(() => {
    process.stdout.write(data.init)
    if (data.afterSilence === 'answer') process.stdout.write(data.answer + data.result)
    if (data.afterSilence === 'answer') return
    if (data.afterSilence === 'hang') process.stdout.write(data.answer)
    const poll = setInterval(() => {
      if (data.afterSilence === 'hang' || !fs.existsSync(data.gate)) return
      clearInterval(poll)
      process.stdout.write(data.answer + data.result)
    }, 20)
  }, data.silentMs)
})
`

    async function cliAgent(
      behaviour: {silentMs: number; afterSilence: 'answer' | 'gate' | 'hang'},
      firstOutputTimeoutMs?: number,
    ) {
      const dir = mkdtempSync(join(tmpdir(), 'conciv-fake-claude-'))
      const files = {launches: join(dir, 'launches'), gate: join(dir, 'gate'), socket: join(dir, 'agent.sock')}
      const line = (value: unknown) => `${JSON.stringify(value)}\n`
      writeFileSync(
        join(dir, 'claude.json'),
        JSON.stringify({
          ...behaviour,
          ...files,
          init: line({type: 'system', subtype: 'init', session_id: SESSION, model: 'opus', tools: []}),
          answer: line({
            type: 'assistant',
            parent_tool_use_id: null,
            session_id: SESSION,
            message: {id: 'answer', role: 'assistant', content: [{type: 'text', text: ANSWER}]},
          }),
          result: line({
            type: 'result',
            subtype: 'success',
            is_error: false,
            result: ANSWER,
            session_id: SESSION,
            usage: {input_tokens: 1, output_tokens: 1},
          }),
        }),
      )
      writeFileSync(join(dir, 'claude'), FAKE_CLAUDE, {mode: 0o755})
      const gone = Promise.withResolvers<void>()
      const watcher = createServer((connection) => {
        connection.on('error', () => gone.resolve())
        connection.once('close', () => gone.resolve())
      })
      onTestFinished(() => new Promise<void>((resolve) => watcher.close(() => resolve())))
      watcher.listen(files.socket)
      await once(watcher, 'listening')
      const db = chatDb()
      const ended = Promise.withResolvers<RunLifecycle>()
      const answered = Promise.withResolvers<void>()
      const hooks = turnHooks(
        () => ({
          adapter: claudeCode('opus', {claudeExecutable: join(dir, 'claude')}),
          chunk: async (chunk) => {
            if (chunk.type === ChatEventType.TEXT_MESSAGE_CONTENT) answered.resolve()
            return [chunk]
          },
        }),
        {end: async (_turn, run) => ended.resolve(run)},
      )
      return {
        db,
        server: await chatServer(hooks, () => undefined, db, firstOutputTimeoutMs),
        ended: ended.promise,
        answered: answered.promise,
        gone: gone.promise,
        launches: () => readFileSync(files.launches, 'utf8').trim().split('\n').length,
        open: () => writeFileSync(files.gate, ''),
      }
    }

    it('an agent silent for 12s before it answers completes its turn once', {timeout: 30_000}, async () => {
      const agent = await cliAgent({silentMs: 12_000, afterSilence: 'answer'})
      await say(agent.server, 'slow-start', 'slow-start')
      const run = await agent.ended
      expect({
        run: {phase: run.phase, error: run.error},
        launches: agent.launches(),
        answers: await texts(agent.server, 'slow-start', 'assistant'),
      }).toEqual({run: {phase: 'completed', error: null}, launches: 1, answers: [ANSWER]})
    })

    it('an agent silent past the first-output timeout fails with it and is gone', {timeout: 10_000}, async () => {
      const agent = await cliAgent({silentMs: 600_000, afterSilence: 'answer'}, 5_000)
      await say(agent.server, 'silent', 'silent')
      const run = await agent.ended
      await agent.gone
      expect({error: run.error, launches: agent.launches()}).toEqual({
        error: 'the agent produced no output within 5s',
        launches: 1,
      })
    })

    it(
      'a client that leaves mid-turn and returns gets the whole turn once from the agent it left running',
      {timeout: 10_000},
      async () => {
        const agent = await cliAgent({silentMs: 0, afterSilence: 'gate'})
        const response = await agent.server.events(
          new Request('http://conciv.local/chat', {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({
              threadId: 'left',
              runId: 'left',
              messages: [{id: 'user-hi', role: 'user', content: 'hi'}],
              tools: [],
              context: [],
            }),
          }),
        )
        const live = {text: ''}
        for await (const text of response.body?.pipeThrough(new TextDecoderStream()) ?? []) {
          live.text += text
          if (live.text.includes(SESSION)) break
        }
        agent.open()
        const run = await agent.ended
        const replay = await replayed(agent.server, 'left')
        expect({
          agentStartedLive: live.text.includes(SESSION),
          phase: run.phase,
          launches: agent.launches(),
          replayedText: replay.flatMap((chunk) => (chunk.delta === undefined ? [] : [chunk.delta])).join(''),
          replayedFinishes: replay.filter((chunk) => chunk.type === ChatEventType.RUN_FINISHED).length,
          answers: await texts(agent.server, 'left', 'assistant'),
        }).toEqual({
          agentStartedLive: true,
          phase: 'completed',
          launches: 1,
          replayedText: ANSWER,
          replayedFinishes: 1,
          answers: [ANSWER],
        })
      },
    )

    it('a stop during an agent run ends it aborted and the agent is gone', {timeout: 10_000}, async () => {
      const agent = await cliAgent({silentMs: 0, afterSilence: 'hang'})
      const driven = say(agent.server, 'stopped', 'stopped')
      await agent.answered
      await agent.server.stop('stopped', ['stopped'])
      await driven
      const run = await agent.ended
      await agent.gone
      expect({
        phase: run.phase,
        status: agent.db.$client.prepare('SELECT status FROM chat_runs').all(),
      }).toEqual({phase: 'aborted', status: [{status: 'aborted'}]})
    })
  })

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
      await new Promise((resolve) => context?.abortSignal?.addEventListener('abort', resolve, {once: true}))
      return 'stopped'
    })
    const hooks = turnHooks(() => ({
      adapter: scriptedModel([{toolCalls: [{name: 'blocking', input: {}}]}]),
      asking: [blocking],
      setup: async () => new Map([[toolApprovalId('blocking'), true]]),
    }))
    const server = await chatServer(hooks, () => undefined, db)
    const driven = say(server, 'thread', 'run')
    await toolRunning.promise
    await server.endAllRuns()
    expect(db.$client.prepare('SELECT status FROM chat_runs').all()).toEqual([{status: 'aborted'}])
    await driven
  })

  it('a stopped run is never announced and ends aborted, even one finishing by itself', {timeout: 15_000}, async () => {
    const db = chatDb()
    const runs = drizzleChatStores(db, {readHarness: () => 'test-harness'}).runs
    const announced: string[] = []
    const ended: string[] = []
    const launched: string[] = []
    const inSetup = Promise.withResolvers<void>()
    const setupHeld = Promise.withResolvers<void>()
    const streamed = Promise.withResolvers<void>()
    const stopped = Promise.withResolvers<void>()
    const hooks = turnHooks(
      (turn) => ({
        adapter: makeTextAdapter('abortable', async function* (options) {
          launched.push(turn.runId)
          yield {type: ChatEventType.RUN_STARTED, runId: turn.runId, threadId: turn.threadId, timestamp: Date.now()}
          yield* createTextChunks('partial')
          if (turn.runId === 'finishing') return
          streamed.resolve()
          await stopped.promise
          await new Promise((resolve) => options.request?.signal?.addEventListener('abort', resolve, {once: true}))
        }),
        setup: async () => {
          if (turn.runId === 'in-setup') {
            inSetup.resolve()
            await setupHeld.promise
          }
          return new Map()
        },
        chunk: async (chunk) => {
          if (turn.runId === 'finishing' && chunk.type === ChatEventType.TEXT_MESSAGE_END) {
            await runs.update(turn.runId, {cancelRequested: true})
          }
          return [chunk]
        },
      }),
      {started: (turn) => announced.push(turn.runId), end: async (_turn, run) => void ended.push(run.phase)},
    )
    const server = await chatServer(hooks, () => undefined, db)
    const inSetupRun = say(server, 'thread', 'in-setup', 'a')
    await inSetup.promise
    await server.stop('thread', ['in-setup'])
    setupHeld.resolve()
    await inSetupRun
    const streaming = say(server, 'thread', 'streaming', 'b')
    await streamed.promise
    await server.stop('thread', ['streaming'])
    stopped.resolve()
    await streaming
    await say(server, 'thread', 'finishing', 'c')
    expect({
      announced,
      launched,
      runs: db.$client.prepare('SELECT run_id, status, cancel_requested AS cancel FROM chat_runs').all(),
      replayEnds: await Promise.all(['in-setup', 'streaming', 'finishing'].map((runId) => replayEnd(server, runId))),
      ended,
      lastRun: (await server.hydrate('thread')).lastRun?.phase,
      userTexts: await texts(server, 'thread', 'user'),
      stoppedTurns: (await server.hydrate('thread')).messages.flatMap((message) =>
        StoppedTurnSchema.safeParse(message.metadata).success ? message.parts : [],
      ),
    }).toEqual({
      announced: ['streaming', 'finishing'],
      launched: ['streaming', 'finishing'],
      runs: [
        {run_id: 'in-setup', status: 'aborted', cancel: 1},
        {run_id: 'streaming', status: 'aborted', cancel: 1},
        {run_id: 'finishing', status: 'completed', cancel: 1},
      ],
      replayEnds: ['aborted', 'aborted', 'aborted'],
      ended: ['aborted', 'aborted', 'aborted'],
      lastRun: 'aborted',
      userTexts: ['a', 'b', 'c'],
      stoppedTurns: [{type: 'text', content: 'partial'}],
    })
  })

  const StoppedTurnSchema = z.object({tanstack: z.looseObject({stopReason: z.literal('aborted')})})

  const ReplayedChunkSchema = z.looseObject({
    type: z.string(),
    delta: z.string().optional(),
    name: z.string().optional(),
    value: z.looseObject({phase: z.string().optional()}).optional(),
  })

  async function texts(server: ChatServer, threadId: string, role: 'user' | 'assistant') {
    return (await server.hydrate(threadId)).messages
      .filter((message) => message.role === role)
      .flatMap((message) => message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])))
  }

  async function replayed(server: ChatServer, runId: string) {
    const replay = server.resume(new Request(`http://conciv.local/chat?runId=${runId}&offset=-1`))
    return ((await replay?.text()) ?? '')
      .split('\n')
      .flatMap((line) => (line.startsWith('data: ') ? [ReplayedChunkSchema.parse(JSON.parse(line.slice(6)))] : []))
  }

  async function replayEnd(server: ChatServer, runId: string) {
    const phases = (await replayed(server, runId)).flatMap((chunk) =>
      chunk.name === runLifecycleEvent.name && chunk.value?.phase !== undefined ? [chunk.value.phase] : [],
    )
    return phases.at(-1)
  }

  it('a provider wait before any output is retried and the run completes', {timeout: 15_000}, async () => {
    const seen = {calls: 0}
    const ended = Promise.withResolvers<RunLifecycle>()
    const hooks = turnHooks(
      (turn) => ({
        adapter: makeTextAdapter('rate-limited-once', async function* () {
          seen.calls += 1
          yield {type: ChatEventType.RUN_STARTED, runId: turn.runId, threadId: turn.threadId, timestamp: Date.now()}
          if (seen.calls === 1) {
            yield {type: ChatEventType.RUN_ERROR, message: 'rate limited', retryAfterMs: 1, timestamp: Date.now()}
            return
          }
          yield* createTextChunks('answered after the wait')
          yield {
            type: ChatEventType.RUN_FINISHED,
            runId: turn.runId,
            threadId: turn.threadId,
            finishReason: 'stop',
            timestamp: Date.now(),
          }
        }),
      }),
      {end: async (_turn, run) => ended.resolve(run)},
    )
    const server = await chatServer(hooks, () => undefined)
    await expect(
      server.drive({threadId: 'thread', runId: 'anonymous', kind: 'chat'}, [{role: 'user', content: 'no id'}]),
    ).rejects.toThrow(/id/)
    await say(server, 'thread', 'waited')
    const run = await ended.promise
    expect({calls: seen.calls, phase: run.phase}).toEqual({calls: 2, phase: 'completed'})
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

  function turnHooks(
    plan: (turn: Turn) => Pick<ReturnType<TurnHooks['plan']>, 'adapter'> & Partial<ReturnType<TurnHooks['plan']>>,
    hooks: Partial<Omit<TurnHooks, 'plan'>> = {},
  ): TurnHooks {
    return {
      plan: (turn) => ({
        systemPrompts: async () => [],
        codeMode: [],
        search: null,
        asking: [],
        direct: [],
        setup: async () => new Map(),
        expand: async (messages) => messages,
        providerMessages: async (messages) => messages,
        chunk: async (chunk) => [chunk],
        ...plan(turn),
      }),
      usage: async () => undefined,
      started: () => undefined,
      end: async () => undefined,
      ...hooks,
    }
  }

  type ChatServer = Awaited<ReturnType<typeof chatServer>>

  function say(server: ChatServer, threadId: string, runId: string, text = 'hi') {
    return server.drive({threadId, runId, kind: 'chat'}, [{id: `user-${text}`, role: 'user', content: text}])
  }

  async function chatServer(
    hooks: TurnHooks,
    log: (message: string) => void,
    db = chatDb(),
    firstOutputTimeoutMs = 30_000,
  ) {
    const server = await createChatServer({
      stores: drizzleChatStores(db, {readHarness: () => 'test-harness'}),
      sandbox: {dir: mkdtempSync(join(tmpdir(), 'conciv-ai-'))},
      hooks,
      codeModeResult: (value) => value,
      firstOutputTimeoutMs,
      log,
    })
    onTestFinished(() => server.endAllRuns())
    return server
  }

  describe('quickjs code mode runs on a warm worker and shares no state between runs', () => {
    const isWorkerCreated = (message: unknown): message is {worker: Worker} =>
      typeof message === 'object' && message !== null && 'worker' in message && message.worker instanceof Worker
    const trackedWorkers = () => {
      const live = new Set<Worker>()
      const created: Worker[] = []
      const track = (message: unknown) => {
        if (!isWorkerCreated(message)) return
        created.push(message.worker)
        live.add(message.worker)
        message.worker.once('exit', () => live.delete(message.worker))
      }
      subscribe('worker_threads', track)
      onTestFinished(() => {
        unsubscribe('worker_threads', track)
      })
      return {live, created}
    }
    const workersFromHere = () => {
      const {live} = trackedWorkers()
      return () => [...live].map((worker) => worker.threadId)
    }
    const LIMITS = {timeout: 10_000, memoryLimit: 64}

    function binding(name: string, execute: (args: unknown) => Promise<unknown>): ToolBinding {
      return {name, description: name, inputSchema: {}, execute}
    }

    function sandbox(limits: {timeout: number; memoryLimit: number}, bindings: Record<string, ToolBinding> = {}) {
      const logged: string[] = []
      const driver = quickJSThreadDriver({...limits, maxStackSize: 1024 * 1024}, (message) => logged.push(message))
      onTestFinished(() => driver.dispose())
      const run = async (code: string) => {
        const context = await driver.createContext({bindings})
        const result = await context.execute(code)
        await context.dispose()
        return result
      }
      return {driver, run, logged}
    }

    it('the first run uses the worker booted with the driver, later runs and guest throws keep it', async () => {
      const ours = workersFromHere()
      const {run} = sandbox(LIMITS)
      const booted = ours()
      expect(booted).toHaveLength(1)
      for (const value of [1, 2, 3]) {
        expect(await run(`return ${value}`)).toMatchObject({success: true, value})
        expect(ours()).toEqual(booted)
      }
      expect(await run("throw new Error('boom')")).toMatchObject({success: false, error: {message: 'boom'}})
      expect(await run('return 4')).toMatchObject({success: true, value: 4})
      expect(ours()).toEqual(booted)
    })

    it('globals, pending promises and pending tool calls of one run never reach the next', async () => {
      const gate = Promise.withResolvers<unknown>()
      const {run} = sandbox(LIMITS, {
        gate: binding('gate', () => gate.promise),
        now: binding('now', async () => 'now'),
      })
      const first = await run(
        'globalThis.leak = 1; gate({}).then(() => { globalThis.late = 1 }); new Promise(() => {}); Promise.resolve().then(() => { globalThis.micro = 1 }); return typeof setTimeout',
      )
      expect(first).toMatchObject({success: true, value: 'undefined'})
      gate.resolve('open')
      const second = await run('await now({}); return [typeof leak, typeof late, typeof micro]')
      expect(second).toMatchObject({success: true, value: ['undefined', 'undefined', 'undefined']})
    })

    it('a timed out run and a run over its memory limit retire their worker and the next run works', async () => {
      const ours = workersFromHere()
      const {driver, run} = sandbox({timeout: 10_000, memoryLimit: 16})
      const gone = (before: number[]) => before.filter((id) => !ours().includes(id))
      const beforeTimeout = ours()
      const looping = await driver.createContext({bindings: {}, timeout: 1_000})
      expect(await looping.execute('globalThis.leak = 1; while (true) {}')).toMatchObject({
        error: {name: 'TimeoutError'},
      })
      expect(gone(beforeTimeout)).toHaveLength(1)
      expect(await run('return typeof leak')).toMatchObject({success: true, value: 'undefined'})
      const beforeOverMemory = ours()
      const overMemory = await run("globalThis.leak = 1; let text = 'x'; while (true) text += text")
      expect(overMemory).toMatchObject({success: false, error: {name: 'MemoryLimitError'}})
      expect(gone(beforeOverMemory)).toHaveLength(1)
      expect(await run('return typeof leak')).toMatchObject({success: true, value: 'undefined'})
    })

    it('a run that times out retires only its own worker, and a concurrent run keeps its worker', async () => {
      const ours = workersFromHere()
      const entered = Promise.withResolvers<void>()
      const release = Promise.withResolvers<string>()
      const wait = binding('wait', () => {
        entered.resolve()
        return release.promise
      })
      const {driver} = sandbox(LIMITS, {wait})
      const [survivor] = ours()
      const steady = await driver.createContext({bindings: {wait}})
      const waiting = steady.execute('return await wait({})')
      await entered.promise
      const looping = await driver.createContext({bindings: {}, timeout: 1_000})
      expect(await looping.execute("console.log('spinning'); while (true) {}")).toMatchObject({
        success: false,
        error: {name: 'TimeoutError'},
        logs: ['spinning'],
      })
      expect(ours()).toEqual([survivor])
      release.resolve('kept')
      expect(await waiting).toMatchObject({success: true, value: 'kept'})
      expect(ours()).toEqual([survivor])
    })

    it('a worker that errors while its pool shuts down never throws on the server thread, and the worker piscina respawns is shut down too', async () => {
      const {live, created} = trackedWorkers()
      const logged: string[] = []
      const log = (message: string) => logged.push(message)
      const open = openPool(log)
      const [thread] = open.pool.threads
      if (thread === undefined) throw new Error('the pool booted no worker')
      const closing = closePool(open, log)
      expect(() => thread.emit('error', new Error('the worker failed'))).not.toThrow()
      await closing
      expect(created).toHaveLength(2)
      expect(logged).toEqual(['[ai] the QuickJS worker failed: Error: the worker failed'])
      expect([...live]).toEqual([])
    })

    async function heldRun() {
      const {live} = trackedWorkers()
      const entered = Promise.withResolvers<void>()
      const hold = binding('hold', () => {
        entered.resolve()
        return new Promise<never>(() => {})
      })
      const {driver, run, logged} = sandbox(LIMITS, {hold})
      const context = await driver.createContext({bindings: {hold}})
      const running = context.execute('globalThis.leak = 1; await hold({})')
      await entered.promise
      const [worker] = live
      if (worker === undefined) throw new Error('the run has no worker')
      return {driver, context, live, worker, running, logged, next: () => run('return typeof leak')}
    }

    it('a run stopped mid-flight ends its worker and the next run works on a replacement', async () => {
      const {context, live, worker, running, next} = await heldRun()
      await context.dispose()
      expect(await running).toMatchObject({success: false, error: {name: 'AbortError'}})
      expect(live.has(worker)).toBe(false)
      expect(await next()).toMatchObject({success: true, value: 'undefined'})
    })

    it('a worker that dies with a tool call in flight fails that run, logs it, and the next run works', async () => {
      const {worker, running, logged, next} = await heldRun()
      await worker.terminate()
      expect(await running).toMatchObject({success: false})
      expect(logged.filter((message) => message.startsWith('[ai] the QuickJS worker failed'))).toHaveLength(1)
      expect(await next()).toMatchObject({success: true, value: 'undefined'})
    })

    it('a worker that throws with a tool call in flight fails that run, logs it, and the next run works', async () => {
      const {worker, running, logged, next} = await heldRun()
      worker.emit('error', new Error('the worker threw'))
      expect(await running).toMatchObject({success: false, error: {message: 'the worker threw'}})
      expect(logged).toContain('[ai] the QuickJS worker failed: Error: the worker threw')
      expect(await next()).toMatchObject({success: true, value: 'undefined'})
    })

    it('concurrent runs run side by side and each sees only its own globals', async () => {
      const met = {count: 0}
      const both = Promise.withResolvers<void>()
      const meet = binding('meet', async () => {
        met.count += 1
        if (met.count === 2) both.resolve()
        await both.promise
        return null
      })
      const {run} = sandbox(LIMITS, {meet})
      const results = await Promise.all(
        ['one', 'two'].map((name) => run(`globalThis.${name} = 1; await meet({}); return [typeof one, typeof two]`)),
      )
      expect(results).toMatchObject([
        {success: true, value: ['number', 'undefined']},
        {success: true, value: ['undefined', 'number']},
      ])
    })

    it('dispose stops the run in flight, leaves no worker, and a later run boots the pool again', async () => {
      const ours = workersFromHere()
      const {driver, running, next} = await heldRun()
      expect(await next()).toMatchObject({success: true, value: 'undefined'})
      expect(ours().length).toBeGreaterThan(1)
      await driver.dispose()
      expect(await running).toMatchObject({success: false, error: {name: 'AbortError'}})
      expect(ours()).toEqual([])
      expect(await next()).toMatchObject({success: true, value: 'undefined'})
      expect(ours()).toHaveLength(1)
      await driver.dispose()
      expect(ours()).toEqual([])
    })

    it('the chat server runs every return 1 on the worker its driver booted, and endAllRuns frees it until the next run', async () => {
      const ours = workersFromHere()
      const logged: string[] = []
      const server = await chatServer(
        turnHooks(() => {
          throw new Error('no turn runs here')
        }),
        (message) => logged.push(message),
      )
      const onQuickJS = logged.some((message) => message.includes('@tanstack/ai-isolate-node'))
      const echo = defineTool({
        name: 'echo',
        description: 'Echoes its input.',
        inputSchema: z.object({}),
        outputSchema: z.unknown(),
      }).server(async (args) => args)
      const runner = server.codeRunner([echo], null)
      if (runner === null) throw new Error('code mode found no driver')
      const booted = ours()
      expect(booted).toHaveLength(onQuickJS ? 1 : 0)
      for (const _ of Array.from({length: 20})) {
        expect(await runner.run('return 1', () => undefined)).toMatchObject({success: true, result: 1})
        expect(ours()).toEqual(booted)
      }
      await server.endAllRuns()
      expect(ours()).toEqual([])
      expect(await runner.run('return 2', () => undefined)).toMatchObject({success: true, result: 2})
      expect(ours()).toHaveLength(booted.length)
      await server.endAllRuns()
      expect(ours()).toEqual([])
      expect(logged.filter((message) => message.includes('QuickJS worker failed'))).toEqual([])
    })
  })

  runPersistenceConformance(
    'conciv drizzle chat stores',
    () => defineAIPersistence({stores: drizzleChatStores(chatDb(), {readHarness: () => 'test-harness'})}),
    {
      skip: ['interrupts', 'activities', 'generationRuns', 'artifacts', 'blobs', 'log', 'sessions'],
      checks: ['messages.metadata', 'runs.listByThread.state'],
    },
  )
})

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('local sandbox', () => {
  it(
    'forgets a finished run, so a destroy that names no cancelled run stops the live one, even a child that outlives SIGTERM',
    {timeout: 15_000},
    async () => {
      const provider = localSandbox({dir: mkdtempSync(join(tmpdir(), 'conciv-local-sandbox-'))})
      const finished = await provider.create({})
      await (await finished.process.spawn('true')).wait()
      const live = await provider.create({})
      const agent = await live.process.spawn(`(trap '' TERM; echo ready; exec sleep 600) & wait`)
      try {
        expect((await agent.stdout[Symbol.asyncIterator]().next()).value).toBe('ready\n')
        await provider.destroy({id: live.id})
        expect(processAlive(-agent.pid)).toBe(false)
      } finally {
        await agent.kill('SIGKILL')
      }
    },
  )
})

describe('events', () => {
  it('defineChatEvent creates only valid CUSTOM events and parses only its own name with a valid value', () => {
    const pinged = defineChatEvent('test.pinged', z.object({count: z.number()}))
    expect(pinged.create({count: 1})).toEqual({type: ChatEventType.CUSTOM, name: 'test.pinged', value: {count: 1}})
    expect(() => pinged.create({count: Number.NaN})).toThrow()
    expect(pinged.parse({type: ChatEventType.CUSTOM, name: 'test.pinged', value: {count: 2}})).toEqual({count: 2})
    expect(pinged.parse({type: ChatEventType.CUSTOM, name: 'test.other', value: {count: 2}})).toBeNull()
    expect(pinged.parse({type: ChatEventType.CUSTOM, name: 'test.pinged', value: {count: 'x'}})).toBeNull()
    expect(pinged.parse({type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId: 'm', delta: 'hi'})).toBeNull()
  })

  describe('conciv events keep their wire shape', () => {
    it('approval-requested makes the same card live and after a reload, permission member included', () => {
      const event = approvalRequestedEvent.create({approvalId: 'per_1', title: 'edit', permission: {always: true}})
      const live = readApprovalAsk({...event, timestamp: 1})
      const stored = live === null ? [] : [{...live, runId: null}]
      const session = createRoot(() =>
        createChatSession({
          sessionId: 'hydrated-card',
          connect: (callbacks) => {
            callbacks.onHydrated({messages: [], messageHarness: {}, lastRun: null, pendingApprovals: stored})
            return {
              subscribe: async function* () {},
              send: async () => undefined,
              refresh: () => Promise.reject(new Error('unused')),
              close: () => undefined,
            }
          },
          stop: async () => undefined,
          decide: async () => ({startsTurn: false}),
        }),
      )
      expect(session.pendingApprovals()).toEqual([live])
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

  it.each([false, true])(
    'a story aborted at its final chunk ends with no RUN_FINISHED or RUN_ERROR (erroring: %s)',
    async (shouldError) => {
      const chunks = createTextChunks('hi')
      const controller = new AbortController()
      const stream = storyConnection({chunks, shouldError}).connect([], undefined, controller.signal, {
        threadId: 'story-thread',
        runId: 'story-run',
      })
      const iterator = stream[Symbol.asyncIterator]()
      const seen = await drainUntilLastChunk(iterator, chunks.length + 1)
      expect(seen.at(-1)?.type).toBe(ChatEventType.TEXT_MESSAGE_END)
      controller.abort()
      expect((await iterator.next()).done).toBe(true)
    },
  )
})

describe('usage', () => {
  it('a snapshot has optional non-negative fields, context from contextTokens only, cost from usage.cost', () => {
    expect(UsageSnapshotSchema.safeParse({}).success).toBe(true)
    expect(UsageSnapshotSchema.safeParse({inputTokens: 10, contextWindow: 200000}).data?.inputTokens).toBe(10)
    expect(UsageSnapshotSchema.safeParse({inputTokens: -1}).success).toBe(false)
    expect(contextUsedTokens({contextTokens: 92000, inputTokens: 100, cacheReadTokens: 50, cacheWriteTokens: 10})).toBe(
      92000,
    )
    expect(contextUsedTokens({inputTokens: 773000, cacheReadTokens: 700000, totalCostUsd: 1})).toBeUndefined()
    expect(tokenUsageToSnapshot({promptTokens: 10, completionTokens: 2, totalTokens: 12, cost: 0.25})).toMatchObject({
      totalCostUsd: 0.25,
    })
  })
})

describe('dist externals', () => {
  const distDir = fileURLToPath(new URL('../dist', import.meta.url))

  type Chunk = {file: string; code: string}

  function collectChunks(dir: string): Chunk[] {
    return readdirSync(dir, {recursive: true, encoding: 'utf8'})
      .filter((name) => name.endsWith('.js'))
      .map((name) => ({file: join(dir, name), code: readFileSync(join(dir, name), 'utf8')}))
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

  describe('@conciv/ai server dist imports the TanStack AI adapters it depends on', () => {
    it('imports each adapter, the sandbox and code mode instead of inlining them', () => {
      for (const name of [
        '@tanstack/ai-acp',
        '@tanstack/ai-claude-code',
        '@tanstack/ai-codex',
        '@tanstack/ai-opencode',
        '@tanstack/ai-sandbox',
        '@tanstack/ai-sandbox-local-process',
        '@tanstack/ai-code-mode',
      ]) {
        expect(importsPackage(name), `dist imports ${name}`).toBe(true)
      }
    })

    it('carries no inlined sandbox capability handle, so the installed @tanstack/ai-sandbox owns the only one (#107)', () => {
      const handles = chunks.flatMap((chunk) => chunk.code.match(/SandboxCapability = createCapability\(\)/g) ?? [])
      expect(handles).toHaveLength(0)
    })
  })
})
