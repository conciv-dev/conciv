import {
  existsSync,
  mkdtempSync,
  rmSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  mkdirSync,
  utimesSync,
} from 'node:fs'
import {once} from 'node:events'
import {request as httpRequest} from 'node:http'
import {createServer} from 'node:net'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {text as bodyText} from 'node:stream/consumers'
import {randomUUID} from 'node:crypto'
import {setImmediate, setTimeout as wait} from 'node:timers/promises'
import {describe, it, expect, afterEach, onTestFinished, test, vi} from 'vitest'
import {makeTextAdapter} from '@conciv/ai/server'
import {createToolCallChunks, fakeText} from '@conciv/ai/testkit'
import {
  createChatPlane,
  registryCapabilities,
  toolDomainCapabilities,
  type ChatPlane,
  type CodeCapability,
  type FollowUpOutcome,
  type SessionPort,
} from '@conciv/chat'
import {
  browserRpcConnection,
  cappedValue,
  heldBrowserRpcLink,
  makeBrowserRpcClient,
  makeRpcClient,
  safeStringify,
  subscribeRpcReachability,
  SOCKET_TRUST_FRAME,
  type EngineStaleness,
  type HeldBrowserRpcLink,
  type TrustStatus,
} from '@conciv/contract'
import {revokeBrowsers} from '@conciv/protocol/engine-trust'
import {concivStateDir} from '@conciv/protocol/state-types'
import {chatRuns, openDb, sessions as sessionTable, type ConcivDb} from '@conciv/db'
import {
  createClientSettings,
  defineTool,
  defineExtension,
  makeExtRpcClient,
  type AnyExtension,
  type ExtensionScope,
  type SettingsStore,
} from '@conciv/extension'
import {createToolRegistry} from '@conciv/extension/registry'
import {type HarnessAdapter, defineHarness, resolveHarnessModels} from '@conciv/harness'
import {
  ChatEventType,
  readApprovalAsk,
  readApprovalSettled,
  sessionRunEvent,
  type ChatEvent,
} from '@conciv/protocol/chat-event-types'
import {type ChatMessage} from '@conciv/protocol/chat-message-types'
import {CHAT_SSE_PATH, CONCIV_SESSION_HEADER, HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import {ConcivConfigSchema} from '@conciv/protocol/config-types'
import {PUSH_SESSION_PARAM, PUSH_WS_PATH, PushFrameSchema} from '@conciv/protocol/push-types'
import {eq} from 'drizzle-orm'
import {
  Agent,
  Bus,
  CodeModeCatalog,
  Database,
  Location,
  Permission,
  PermissionSaved,
  PluginHooks,
  Rpc,
  SessionEvent,
  SessionProjector,
  Skill,
  SkillInstructions,
  Tool,
} from '@conciv/plugin-host'
import {makeRpc, Rpc as PluginRpc} from '@conciv/plugin'
import {Effect, Exit, Layer, ManagedRuntime, Schema, Scope} from 'effect'
import {isEqual} from 'es-toolkit'
import getPort from 'get-port'
import {WSContext, defineWebSocketHelper} from 'hono/ws'
import {z} from 'zod'
import {hostDocument} from '../src/api/native-page.js'
import {resolveConfig} from '../src/config.js'
import {symbolicateFrame} from '../src/editor/symbolicate.js'
import {readDevEndpoint, removeDevEndpoint, writeDevEndpoint} from '../src/lib/dev-endpoint.js'
import {makeStalenessProbe} from '../src/lib/engine-stamp.js'
import {withSavedModels} from '../src/lib/saved-models.js'
import {statePaths} from '../src/lib/state-paths.js'
import {makeJournal, makePageBus} from '../src/page/page-bus.js'
import {makePageQueues, startQueueFollowUp, type PageQueues} from '../src/page/page-queue.js'
import {makeCoreRuntime} from '../src/runtime/core-runtime.js'
import {makeSessionPrimitives} from '../src/runtime/primitives.js'
import {runWithSession} from '../src/runtime/session-context.js'
import {start, composeSystemPrompt} from '../src/start.js'
import {makeApp} from '../src/app.js'
import {outsideRunCapabilities} from '../src/api/outside-run.js'
import {
  CODE_LIFETIME_MS,
  OPEN_PATHS,
  isOpenPath,
  makeCodeStore,
  makeConnectionTrust,
  rpcSocketGate,
  watchTrustedBrowsers,
} from '../src/engine-login.js'
import {serveHono} from '@conciv/serve'
import {Hono} from 'hono'
import {exchangePrintedCode, loginThroughTerminal, requestPrintedCode} from '@conciv/harness-testkit'
import {os} from '@orpc/server'
import {createORPCClient} from '@orpc/client'
import {RPCLink as FetchRpcLink} from '@orpc/client/fetch'
import {RPCLink as WebsocketRpcLink} from '@orpc/client/websocket'
import {CONCIV_VERSION_HEADER, RPC_WS_PATH, rpcHeader, type RpcContext} from '@conciv/protocol/rpc-types'
import {serveRpcRouter} from '@conciv/harness-testkit/rpc-mounts'
import coreManifest from '../package.json' with {type: 'json'}
import {ensureRow, setPermissions} from '../src/sessions/session-rows.js'
import {
  answerPermission,
  decidePermissionCard,
  followPermissionCards,
  permissionSessions,
  pluginInstructions,
  sessionSnapshot,
} from '../src/runtime/permission-cards.js'
import {bootMadeApp, chunkWithInlineMap, cleanupChunks, makeChatFixture} from './helpers.js'

const NO_CAPABILITIES = {
  resume: false,
  permissionGate: 'none',
  compaction: false,
  systemPrompt: 'file',
  mcp: 'none',
  imageInput: false,
  init: 'none',
  slashCommands: 'none',
} as const

const JSON_TYPE = {'content-type': 'application/json'}

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'conciv-core-unit-'))
  onTestFinished(() => rmSync(dir, {recursive: true, force: true}))
  return dir
}

function bootEngine(root: string, overrides: Partial<Parameters<typeof start>[0]> = {}) {
  const options = {harnessBin: 'true', stateRoot: root, systemPrompt: false}
  return start({options, root, launchEditor: () => {}, ...overrides})
}

async function serveCore(
  root: string,
  extensions: AnyExtension[],
  overrides: Partial<Parameters<typeof makeApp>[0]>,
  port = 0,
) {
  const made = await makeApp({
    cfg: resolveConfig({}, root),
    cwd: root,
    openInEditor: () => {},
    extensions,
    ...overrides,
  })
  const served = await serveHono({fetch: made.fetch, port})
  const stop = async () => {
    await served.close()
    await made.dispose()
  }
  return {made, origin: `http://127.0.0.1:${served.port}`, stop}
}

function rawRequest(port: number, path: string, headers: Record<string, string> = {}, body?: string) {
  const method = body === undefined ? 'GET' : 'POST'
  const options = {host: '127.0.0.1', port, path, method, agent: false, headers: {...JSON_TYPE, ...headers}}
  return new Promise<{status: number; text: string; error?: string}>((resolve) => {
    const request = httpRequest(options, async (response) =>
      resolve({status: response.statusCode ?? 0, text: await bodyText(response)}),
    )
    request.on('error', (error: NodeJS.ErrnoException) => resolve({status: 0, text: '', error: error.code}))
    request.end(body)
  })
}

describe('api native page document', () => {
  it('pins the viewport so the WebView cannot pinch-zoom or rescale the overlay', () => {
    const viewport = /<meta name="viewport" content="([^"]+)">/.exec(hostDocument())?.[1]
    expect(viewport).toContain('maximum-scale=1')
    expect(viewport).toContain('user-scalable=no')
    expect(viewport).toContain('viewport-fit=cover')
  })
})

describe('chat plane', () => {
  it('unserializable values become "value could not be serialized"; small values pass through unchanged', () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    expect(cappedValue({big: 1n})).toMatchObject({error: 'value could not be serialized'})
    expect(JSON.parse(safeStringify(circular))).toMatchObject({error: 'value could not be serialized'})
    expect(cappedValue({ok: 1})).toEqual({ok: 1})
    expect(safeStringify({ok: 1})).toBe('{"ok":1}')
  })

  it('a tool description folds in its hint', () => {
    const registry = createToolRegistry()
    const meta = {summary: 'Do the unit thing', hint: 'Prefer small inputs'}
    const schemas = {inputSchema: z.object({}), outputSchema: z.object({})}
    const tool = defineTool({name: 'unit_tool', description: 'unit', ...schemas, meta}).server(() => ({}))
    registry.register(tool, {owner: 'unit'})
    const [capability] = registryCapabilities(registry.sandboxTools(), async () => null)
    expect(capability?.description).toMatch(/^Do the unit thing\. Prefer small inputs\.\n\nReturns JSON matching: /)
  })

  it('a turn falls back to systemPromptText and logs an unreadable systemPromptFile, a credential-shaped capability fails only its own run, plugin skills and the code-mode catalog reach the system prompt when the starting point resets and the user words in between, and search finds a tool by its parameter', async () => {
    const root = tempDir()
    const cli = fakeCli()
    const log: string[] = []
    const missing = join(root, 'no-such-prompt.md')
    const echo: CodeCapability = {
      name: 'unit_echo',
      path: 'unit_echo',
      description: 'Echo the text back.',
      errors: [],
      inputSchema: z.object({text: z.string()}),
      execute: async (input) => input,
    }
    const secret = {...echo, name: 'unit_secret', path: 'unit_secret', inputSchema: z.object({apiKey: z.string()})}
    const chat = await plane(cliHarness(cli), root, {
      systemPrompt: {systemPromptFile: missing, systemPromptText: 'the fallback prompt'},
      log: (line) => log.push(line),
      capabilities: () => [echo, secret],
    })
    const seen = await readUntil(await startTurn(chat, sessionId('prompt'), 'prompt-run', 'hi'), 'end')
    expect(seen).toContain(ChatEventType.RUN_FINISHED)
    expect(cli.systemPrompts.flat()).toContain('the fallback prompt')
    expect(log.some((line) => line.includes(missing))).toBe(true)
    const runner = await chat.codeRunner(sessionId('prompt'), () => undefined)
    await expect(runner?.code?.run('return await external_unit_secret({apiKey: "k"})', 'parent')).rejects.toThrow(
      /secret/i,
    )

    const skilled = sessionId('skills')
    const builtins = sessionId('builtins')
    const db = openDatabase(root)
    await ensureRow(db, skilled, 'fake-cli', root)
    await ensureRow(db, builtins, 'fake-cli', root)
    const host = ManagedRuntime.make(
      Layer.mergeAll(SkillInstructions.layer, SessionProjector.layer, Tool.layer).pipe(
        Layer.provideMerge(Layer.mergeAll(Skill.layer, Agent.layer, PluginHooks.layer, permissionSessions(db))),
        Layer.provideMerge(Bus.configured()),
        Layer.provideMerge(
          Layer.succeed(
            Location.Service,
            Location.Service.of(
              Schema.decodeSync(Location.Info)({
                directory: root,
                project: {id: root, directory: root, canonical: root},
              }),
            ),
          ),
        ),
        Layer.provideMerge(Database.layer({path: db.$client.location() ?? ':memory:'})),
      ),
    )
    onTestFinished(() => host.dispose())
    await host.context()
    const skillScope = host.runSync(Scope.make())
    const addSkill = (id: string) =>
      host.runPromise(
        Skill.Service.use((skills) =>
          skills.transform((editor) =>
            editor.add(
              Schema.decodeSync(Skill.Info)({
                id,
                name: id,
                description: `The ${id} skill.`,
                path: join(root, id, 'SKILL.md'),
                content: `Do ${id}.`,
              }),
            ),
          ),
        ).pipe(Scope.provide(skillScope)),
      )
    const plugin = (
      namespace: {name: string; description: string},
      names: string[],
      input = z.object({}),
      scope = host.runSync(Scope.make()),
    ) =>
      host
        .runPromise(
          Tool.Service.use((tools) =>
            tools.transform((editor) => {
              editor.namespace(namespace)
              names.forEach((name) =>
                editor.add({
                  name,
                  description: `The ${name} tool.`,
                  input,
                  options: {namespace: namespace.name},
                  execute: (given: object) => Effect.succeed({content: `${name} ${JSON.stringify(given)}`}),
                }),
              )
            }),
          ).pipe(Scope.provide(scope)),
        )
        .then(() => scope)
    const capabilities = (id: SessionId): CodeCapability[] =>
      toolDomainCapabilities(
        id === builtins ? [echo, secret] : [],
        host.runSync(sessionSnapshot(id)),
        (effect, signal) => host.runPromiseExit(effect, {signal}),
        () => undefined,
      )
    const told = fakeCli()
    const instructed = {
      capabilities,
      pluginInstructions: (id: SessionId, reset: 'keep' | 'reset', inventory: CodeModeCatalog.Inventory) =>
        host.runPromise(pluginInstructions(id, reset, inventory)),
    }
    const fresh = await plane(cliHarness(told), root, instructed)
    const resumed = await plane(cliHarness(told, true), root, {
      ...instructed,
      sessions: sessionPort(HarnessSessionId.parse('native-skills')),
    })
    const listed = (...ids: string[]) => new RegExp(ids.map((id) => `<id>${id}</id>`).join('[\\s\\S]*'))
    const noTools =
      'No Code Mode tools are currently available. Later Code Mode catalog updates may add or remove tools. Do not call `execute_typescript` unless there is at least one available Code Mode tool.'
    const preface = expect.stringContaining('Use `console.log()` for debugging (logs are captured)')
    const projectTools = {name: 'tools', description: 'Project utilities'}

    await fresh.followUp(builtins, 'what can you do')
    const [catalog, ...rest] = told.systemPrompts.at(-1) ?? []
    expect(catalog).toContain('## Code Mode tools (call only inside `execute_typescript`)')
    expect(catalog).toContain('The catalog is complete.')
    expect(catalog).toContain('external_unit_echo(input: {')
    expect(catalog).toContain('external_unit_secret(input: {')
    expect(rest).toEqual([preface])
    expect(rest.join('')).not.toContain('external_unit_echo')
    expect(told.tools.at(-1)).toContain('execute_typescript')

    await fresh.followUp(skilled, 'first')
    expect(told.systemPrompts.at(-1)).toEqual([noTools])
    expect(told.tools.at(-1)).not.toContain('execute_typescript')
    expect(told.asked.at(-1)).toBe('first')

    await addSkill('review')
    await resumed.followUp(skilled, 'second')
    expect(told.systemPrompts.at(-1)).toEqual([noTools])
    expect(told.asked.at(-1)).toEqual([
      {type: 'text', content: expect.stringMatching(listed('review'))},
      {type: 'text', content: 'second'},
    ])

    const registered = await plugin(projectTools, ['zeta', 'alpha'])
    await resumed.followUp(skilled, 'third')
    expect(told.systemPrompts.at(-1)).toEqual([noTools, preface])
    expect(told.asked.at(-1)).toEqual([
      {type: 'text', content: expect.stringContaining('This catalog supersedes the previous Code Mode tool catalog.')},
      {type: 'text', content: 'third'},
    ])
    expect(JSON.stringify(told.asked.at(-1))).toContain('- tools (2 tools) // Project utilities')

    await host.runPromise(Scope.close(registered, Exit.void))
    await plugin(projectTools, ['alpha', 'zeta'])
    await resumed.followUp(skilled, 'reordered')
    expect(told.asked.at(-1)).toBe('reordered')

    await plugin({name: 'sky', description: 'Sky readings'}, ['measure'], z.object({declination: z.string()}))
    await resumed.followUp(skilled, 'fourth')
    const [added] = z.array(z.object({content: z.string()})).parse(told.asked.at(-1))
    expect(added?.content).toMatch(
      /^The Code Mode tool catalog has changed\.\n\nNew tools are available:\n- sky \(1 tool\) \/\/ Sky readings\n  - external_sky_measure\(input: \{/,
    )
    expect(added?.content).not.toContain('supersedes')
    expect(added?.content).not.toContain('external_tools_alpha')

    const skilledRunner = await resumed.codeRunner(skilled, () => undefined)
    const found = z
      .object({result: z.object({items: z.array(z.object({path: z.string()}))})})
      .parse(await skilledRunner?.code?.run('return search({query: "declination"})', 'parent'))
    expect(found.result.items.map((item) => item.path)).toEqual(['external_sky_measure'])
    await expect(
      skilledRunner?.code?.run(`return await ${found.result.items[0]?.path}({declination: "north"})`, 'parent'),
    ).resolves.toMatchObject({result: 'measure {"declination":"north"}'})

    await addSkill('deploy')
    await resumed.compact(skilled)
    expect(told.systemPrompts.at(-1)).toEqual([
      expect.stringMatching(/- sky \(1 tool\) \/\/ Sky readings[\s\S]*- tools \(2 tools\) \/\/ Project utilities/),
      preface,
    ])
    expect(told.systemPrompts.at(-1)?.[0]).toMatch(listed('deploy', 'review'))
    expect(told.asked.at(-1)).toEqual(expect.not.stringContaining('<id>'))

    await resumed.followUp(skilled, 'fifth')
    expect(told.systemPrompts.at(-1)?.[0]).toMatch(listed('deploy', 'review'))
    expect(told.asked.at(-1)).toBe('fifth')

    await addSkill('lint')
    await fresh.followUp(skilled, 'sixth')
    expect(told.systemPrompts.at(-1)?.[0]).toMatch(listed('deploy', 'lint', 'review'))
    expect(told.asked.at(-1)).toBe('sixth')
  })

  it('after a restart the finished and interrupted turns all show, and the interrupted run is aborted with a finish time', async () => {
    const root = tempDir()
    const cli = fakeCli('reply', 'partial')
    const first = await plane(cliHarness(cli), root)
    const id = sessionId('durable')
    await readUntil(await startTurn(first, id, 'durable-1', 'finished turn'), 'end')
    await readUntil(await startTurn(first, id, 'durable-2', 'interrupted turn'), ChatEventType.TEXT_MESSAGE_CONTENT)
    const next = await plane(cliHarness(fakeCli()), root)
    const {lastRun} = await next.hydrate(id)
    expect(lastRun).toMatchObject({runId: 'durable-2', phase: 'aborted', finishedAt: expect.any(Number)})
    expect(collectTexts(await next.history(id))).toEqual([
      'finished turn',
      'partial reply',
      'interrupted turn',
      'partial reply',
    ])
    cli.release()
  })

  it('an older page is read from the stored thread without reading the native transcript again', async () => {
    const said = (id: string, role: 'user' | 'assistant', content: string): ChatMessage => ({
      id,
      role,
      parts: [{type: 'text', content}],
    })
    const native: NativeTranscript = {
      reads: 0,
      messages: [0, 1, 2].flatMap((turn) => [
        said(`native-u${turn}`, 'user', `question ${turn}`),
        said(`native-a${turn}`, 'assistant', `answer ${turn}`),
      ]),
    }
    const sessions = sessionPort(HarnessSessionId.parse('native-session'), 'native')
    const chat = await plane(nativeHarness(native), tempDir(), {sessions})
    const id = sessionId('native-paged')
    const newest = await chat.hydrate(id, {limit: 2})
    const readsForNewest = native.reads
    const older = await chat.hydrate(id, {limit: 2, before: newest.page?.truncated === true ? newest.page.cursor : ''})
    expect(collectTexts(newest.messages)).toEqual(['question 2', 'answer 2'])
    expect(collectTexts(older.messages)).toEqual(['question 1', 'answer 1'])
    expect(readsForNewest).toBe(1)
    expect(native.reads).toBe(readsForNewest)
  })

  it('Stop keeps every word the client saw, not the last throttled snapshot, and a stopped tool call survives the next turn', async () => {
    const cli = fakeCli('streaming', 'tooling', 'reply')
    const chat = await plane(cliHarness(cli))
    const id = sessionId('stopped')
    const seen = await readChunks(
      await startTurn(chat, id, 'stopped-mid-text', 'keep talking'),
      (chunks) => streamedText(chunks) === STREAMED_TEXT,
    )
    await chat.stop(id)
    expect(streamedText(seen)).toBe(STREAMED_TEXT)
    expect(collectTexts((await chat.hydrate(id)).messages)).toEqual(['keep talking', STREAMED_TEXT])
    await readUntil(await startTurn(chat, id, 'stopped-tool', 'run the tool'), ChatEventType.TOOL_CALL_END)
    await chat.stop(id)
    const stopped = partTypes(await chat.history(id))
    expect(stopped.flat()).toContain('tool-call')
    await readUntil(await startTurn(chat, id, 'after-stop', 'follow up'), 'end')
    expect(partTypes(await chat.history(id))).toEqual([...stopped, ['text'], ['text']])
    cli.release()
  })

  it('engine stop refuses new requests, ends a run held mid-stream as aborted, and never queries a closed database', async () => {
    const root = tempDir()
    const cli = fakeCli('streaming')
    const written = vi.spyOn(process.stderr, 'write')
    const engine = await bootEngine(root, {harness: cliHarness(cli)})
    const turn = await fetch(`http://127.0.0.1:${engine.port}/t/${engine.agentToken}${CHAT_SSE_PATH}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: turnBody(sessionId('engine-stop'), 'engine-stop-run', 'keep talking'),
    })
    await readUntil(turn, ChatEventType.TEXT_MESSAGE_CONTENT)
    const stopping = engine.stop()
    const late = await rawRequest(engine.port, '/health')
    await stopping
    const db = openDatabase(root)
    const runs = db.select({status: chatRuns.status}).from(chatRuns).where(eq(chatRuns.runId, 'engine-stop-run')).all()
    const logged = written.mock.calls.map(([chunk]) => String(chunk)).join('')
    written.mockRestore()
    cli.release()
    expect.soft(late.error).toBe('ECONNREFUSED')
    expect.soft(runs).toEqual([{status: 'aborted'}])
    expect.soft(logged).not.toMatch(/DrizzleQueryError|database is not open/)
  })

  it('a push socket that opens while a run is going is told about that run', async () => {
    const cli = fakeCli('streaming')
    const engine = await bootEngine(tempDir(), {harness: cliHarness(cli)})
    onTestFinished(async () => {
      cli.release()
      await engine.stop()
    })
    const id = sessionId('late-push')
    const turn = await fetch(`http://127.0.0.1:${engine.port}/t/${engine.agentToken}${CHAT_SSE_PATH}`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: turnBody(id, 'late-push-run', 'keep talking'),
    })
    await readUntil(turn, ChatEventType.TEXT_MESSAGE_CONTENT)
    const socket = new WebSocket(`ws://127.0.0.1:${engine.port}${PUSH_WS_PATH}?${PUSH_SESSION_PARAM}=${id}`)
    onTestFinished(() => socket.close())
    const announced = new Promise<string | null>((resolve) => {
      socket.addEventListener('message', (event) => {
        const frame = PushFrameSchema.safeParse(JSON.parse(String(event.data)))
        if (!frame.success || frame.data.channel !== 'chat') return
        const run = sessionRunEvent.parse(frame.data.chunk)
        if (run !== null) resolve(run.runId)
      })
      socket.addEventListener('close', () => resolve(null))
    })
    socket.addEventListener('open', () =>
      socket.send(JSON.stringify({type: SOCKET_TRUST_FRAME, token: engine.agentToken})),
    )
    expect(await announced).toBe('late-push-run')
  }, 10_000)

  type CliStep = 'reply' | 'partial' | 'streaming' | 'tooling'

  type FakeCli = {
    steps: CliStep[]
    systemPrompts: string[][]
    tools: string[][]
    asked: unknown[]
    gate: Promise<void>
    release: () => void
  }

  const FIRST_DELTA = 'partial reply'

  const STREAMED_TEXT = 'partial reply and the words after the last snapshot'

  function fakeCli(...steps: CliStep[]): FakeCli {
    const gate = Promise.withResolvers<void>()
    return {steps, systemPrompts: [], tools: [], asked: [], gate: gate.promise, release: () => gate.resolve()}
  }

  function cliHarness(cli: FakeCli, resume = false): HarnessAdapter {
    return defineHarness({
      id: 'fake-cli',
      binName: 'true',
      chatConfig: () => ({
        adapter: makeTextAdapter('fake-cli', async function* (options) {
          cli.systemPrompts.push([...(options.systemPrompts ?? [])].map(String))
          cli.tools.push((options.tools ?? []).map((tool) => tool.name))
          cli.asked.push(options.messages.findLast((message) => message.role === 'user')?.content)
          const step = cli.steps.shift() ?? 'reply'
          const run = {threadId: options.threadId ?? '', runId: options.runId ?? ''}
          const messageId = `${run.runId}-a`
          const signal = options.request?.signal
          const heldOrAborted = () =>
            Promise.race([cli.gate, new Promise((settle) => signal?.addEventListener('abort', settle, {once: true}))])
          yield {type: ChatEventType.RUN_STARTED, ...run}
          if (step === 'tooling') {
            yield* createToolCallChunks('Read', {file_path: 'a.ts'}, {parentMessageId: messageId})
            return await heldOrAborted()
          }
          yield {type: ChatEventType.TEXT_MESSAGE_START, messageId, role: 'assistant'}
          yield {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId, delta: FIRST_DELTA}
          if (step === 'streaming') {
            yield {type: ChatEventType.TEXT_MESSAGE_CONTENT, messageId, delta: STREAMED_TEXT.slice(FIRST_DELTA.length)}
            return await heldOrAborted()
          }
          if (step === 'partial') await cli.gate
          yield {type: ChatEventType.TEXT_MESSAGE_END, messageId}
          yield {type: ChatEventType.RUN_FINISHED, ...run}
        }),
      }),
      capabilities: {...NO_CAPABILITIES, resume, transcriptHistory: false},
    })
  }

  type NativeTranscript = {reads: number; messages: ChatMessage[]}

  function nativeHarness(native: NativeTranscript): HarnessAdapter {
    const missing = async () => ({ok: false, reason: 'missing', detail: 'no live transcript'}) as const
    return defineHarness({
      id: 'native',
      binName: 'true',
      chatConfig: () => ({adapter: fakeText()}),
      history: {
        messages: async () => {
          native.reads += 1
          return native.messages
        },
        tail: async () => ({messages: native.messages, earlier: null}),
        observe: () => ({revision: missing, read: missing, close: () => undefined}),
        list: async () => ({sessions: [], next: null}),
        meta: async () => null,
      },
      resume: {command: ({nativeId}) => ({bin: 'native', args: [nativeId]})},
      capabilities: {...NO_CAPABILITIES, transcriptHistory: true},
    })
  }

  function sessionPort(nativeId: HarnessSessionId | null = null, harnessKind = 'fake-cli'): SessionPort {
    return {
      row: () => ({model: null, effort: null, nativeId, cwd: '/workspace', harnessKind}),
      ensure: async () => undefined,
      recordNativeId: async () => undefined,
      recordUsage: async () => undefined,
      recordContextTokens: async () => undefined,
      recordActivity: () => {},
      onRunStart: async () => undefined,
      publish: () => undefined,
      onRunEnd: async () => undefined,
    }
  }

  async function plane(
    harness: HarnessAdapter,
    root = tempDir(),
    overrides: Partial<Parameters<typeof createChatPlane>[0]> = {},
  ): Promise<ChatPlane> {
    const db = openDatabase(root)
    return createChatPlane({
      db,
      hubAccess: 'session',
      hubGeneration: () => 0,
      cwd: root,
      harnessFor: () => harness,
      systemPrompt: {},
      sessions: sessionPort(),
      toolNames: new Set(),
      capabilities: () => [],
      attachmentExpanders: {},
      pluginInstructions: async () => ({initial: '', update: ''}),
      firstOutputTimeoutMs: 30_000,
      log: () => undefined,
      ...overrides,
    })
  }

  const noUpgrade = defineWebSocketHelper(async () => undefined)

  const ChunkSchema = z.object({type: z.string(), delta: z.string().optional()}).loose()

  type WireChunk = z.infer<typeof ChunkSchema>

  function turnBody(threadId: string, runId: string, text: string): string {
    const messages = [{id: `${runId}-user`, role: 'user', content: text}]
    return JSON.stringify({threadId, runId, messages, tools: [], context: []})
  }

  async function startTurn(chat: ChatPlane, threadId: string, runId: string, text: string): Promise<Response> {
    return chat.routes(noUpgrade).request(CHAT_SSE_PATH, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: turnBody(threadId, runId, text),
    })
  }

  async function readChunks(response: Response, enough: (seen: WireChunk[]) => boolean): Promise<WireChunk[]> {
    const seen: WireChunk[] = []
    const buffer = {text: ''}
    for await (const text of response.body?.pipeThrough(new TextDecoderStream()) ?? []) {
      const frames = (buffer.text + text).split('\n\n')
      buffer.text = frames.pop() ?? ''
      const lines = frames.flatMap((frame) => frame.split('\n')).filter((line) => line.startsWith('data: '))
      seen.push(...lines.flatMap((line) => ChunkSchema.safeParse(JSON.parse(line.slice(6))).data ?? []))
      if (enough(seen)) break
    }
    return seen
  }

  async function readUntil(response: Response, type: ChatEvent['type'] | 'end'): Promise<string[]> {
    const seen = await readChunks(response, (chunks) => type !== 'end' && chunks.some((chunk) => chunk.type === type))
    return seen.map((chunk) => chunk.type)
  }

  function streamedText(chunks: WireChunk[]): string {
    return chunks
      .flatMap((chunk) => (chunk.type === ChatEventType.TEXT_MESSAGE_CONTENT && chunk.delta ? [chunk.delta] : []))
      .join('')
  }

  function partTypes(messages: ChatMessage[]): string[][] {
    return messages.map((message) => message.parts.map((part) => part.type))
  }

  function collectTexts(messages: ChatMessage[]): string[] {
    return messages.map((message) =>
      message.parts.flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(''),
    )
  }

  function openDatabase(root: string): ConcivDb {
    const db = openDb(root)
    onTestFinished(() => db.$client.close())
    return db
  }

  function sessionId(name: string): SessionId {
    return SessionId.parse(`conciv_${name}`)
  }
})

describe('config', () => {
  const saved = {...process.env}
  afterEach(() => {
    process.env = {...saved}
  })

  it('defaults to claude under the root, options win over env, and the deprecated CONCIV_CLAUDE_* aliases resolve', () => {
    const defaults = resolveConfig({}, '/root')
    expect(defaults).toMatchObject({harness: 'claude', stateRoot: '/root', systemPrompt: expect.any(String)})
    process.env.CONCIV_HARNESS = 'codex'
    process.env.CONCIV_HARNESS_BIN = 'codex-bin'
    process.env.CONCIV_SESSION_ID = 'conciv_env-sess'
    const fromEnv = {harness: 'claude', harnessBin: 'codex-bin', sessionId: 'conciv_env-sess'}
    expect(resolveConfig({harness: 'claude'}, '/root')).toMatchObject(fromEnv)
    process.env = {...saved, CONCIV_CLAUDE_PATH: 'old-claude', CONCIV_CLAUDE_SESSION_ID: 'old-sess'}
    expect(resolveConfig({}, '/root')).toMatchObject({harnessBin: 'old-claude', harnessSessionId: 'old-sess'})
  })

  it('reads the plugins list from JSON with both entry forms and a remove entry, and resolveConfig keeps it', () => {
    const plugins = ['./local-plugin', ['@acme/plugin', {level: 2, tags: ['a']}], '-@acme/old']
    const parsed = ConcivConfigSchema.parse(JSON.parse(JSON.stringify({plugins})))
    expect(parsed.plugins).toEqual(plugins)
    expect(resolveConfig(parsed, '/root').plugins).toEqual(plugins)
    expect(resolveConfig({}, '/root').plugins).toEqual([])
  })
})

describe('local state files', () => {
  it('the dev endpoint file is owner-only, reads null when missing or malformed, and only its owner pid removes it', () => {
    const dir = tempDir()
    const file = join(dir, 'dev-endpoint.json')
    expect(readDevEndpoint(dir)).toBeNull()
    writeFileSync(file, 'not json')
    expect(readDevEndpoint(dir)).toBeNull()
    writeFileSync(file, JSON.stringify({apiBase: '', token: null, pid: -1}))
    expect(readDevEndpoint(dir)).toBeNull()
    const endpoint = {apiBase: 'http://127.0.0.1:4599/t/secret', token: 'secret', pid: 100}
    writeDevEndpoint(dir, endpoint)
    expect(readDevEndpoint(dir)).toEqual(endpoint)
    expect(statSync(file).mode & 0o777).toBe(0o600)
    removeDevEndpoint(dir, 999)
    expect(readDevEndpoint(dir)?.pid).toBe(100)
    removeDevEndpoint(dir, 100)
    expect(readDevEndpoint(dir)).toBeNull()
  })

  it('the staleness probe turns stale on a content change only, names that package, and mints a new fingerprint', () => {
    const dir = tempDir()
    const [core, tools] = [join(dir, 'core.js'), join(dir, 'tools.js')]
    writeFileSync(core, 'export const a = 1')
    writeFileSync(tools, 'export const b = 1')
    const probe = makeStalenessProbe([
      {label: '@conciv/core', path: core},
      {label: '@conciv/tools', path: tools},
    ])
    const fresh = probe()
    expect(fresh).toMatchObject({stale: false, changed: []})
    writeFileSync(tools, 'export const b = 1')
    const later = new Date(Date.now() + 5000)
    utimesSync(tools, later, later)
    expect(probe()).toEqual(fresh)
    writeFileSync(tools, 'export const b = 2')
    expect(probe()).toMatchObject({stale: true, changed: ['@conciv/tools']})
    expect(probe().fingerprint).not.toBe(fresh.fingerprint)
  })

  describe('saved harness models', () => {
    type Listed = {id: string; name: string; group: string}
    const OPUS: Listed = {id: 'opus', name: 'Opus 5.5', group: 'Claude'}
    const SONNET: Listed = {id: 'sonnet', name: 'Sonnet 5.5', group: 'Claude'}

    function listing(dir: string, models: () => Promise<Listed[]>): HarnessAdapter {
      const harness = defineHarness({
        id: 'listing',
        binName: 'listing',
        models,
        chatConfig: () => ({adapter: fakeText()}),
        capabilities: {...NO_CAPABILITIES, transcriptHistory: false},
      })
      return withSavedModels(harness, dir)
    }

    it('waits for the first live list, then answers from the saved one at once while a refresh, a failure or an empty list lands', async () => {
      const dir = tempDir()
      const savedFile = () => JSON.parse(readFileSync(join(dir, 'listing-models.json'), 'utf8'))
      expect(await resolveHarnessModels(listing(dir, async () => [OPUS]))).toEqual([OPUS])
      expect(savedFile()).toEqual([OPUS])
      expect(await resolveHarnessModels(listing(dir, () => Promise.reject(new Error('probe failed'))))).toEqual([OPUS])
      expect(savedFile()).toEqual([OPUS])
      const grown = Promise.withResolvers<Listed[]>()
      const growing = listing(dir, () => grown.promise)
      expect(await resolveHarnessModels(growing)).toEqual([OPUS])
      grown.resolve([OPUS, SONNET])
      await setImmediate()
      expect(savedFile()).toEqual([OPUS, SONNET])
      expect(await resolveHarnessModels(growing)).toEqual([OPUS, SONNET])
      const emptied = Promise.withResolvers<Listed[]>()
      const emptying = listing(dir, () => emptied.promise)
      expect(await resolveHarnessModels(emptying)).toEqual([OPUS, SONNET])
      emptied.resolve([])
      await setImmediate()
      expect(await resolveHarnessModels(emptying)).toEqual([])
      expect(savedFile()).toEqual([])
    })

    it('reports the failure when nothing is saved and retries on the next call', async () => {
      const outcomes: Promise<Listed[]>[] = [Promise.reject(new Error('probe failed')), Promise.resolve([OPUS])]
      outcomes[0]?.catch(() => {})
      const harness = listing(tempDir(), () => outcomes.shift() ?? Promise.resolve([]))
      await expect(resolveHarnessModels(harness)).rejects.toThrow('probe failed')
      expect(await resolveHarnessModels(harness)).toEqual([OPUS])
    })
  })
})

describe('editor symbolicate', () => {
  afterEach(() => cleanupChunks())

  it('reads a React server frame, fetches a loopback http frame, and never fetches another host', async () => {
    const chunk = await chunkWithInlineMap('app/page.tsx', 17, 4)
    const fetched: string[] = []
    const fakeFetch: typeof fetch = async (input) => {
      fetched.push(String(input))
      return new Response(readFileSync(chunk, 'utf8'))
    }
    const at = (fileName: string) => symbolicateFrame({fileName, line: 2, column: 1}, tmpdir(), fakeFetch)
    expect((await at(`about://React/Server/file://${chunk}?42`))?.file).toBe('app/page.tsx')
    expect((await at('http://localhost:3000/src/App.tsx?x=1'))?.file).toBe('app/page.tsx')
    expect(await at('http://169.254.169.254/latest/meta-data')).toBeNull()
    expect(fetched.some((url) => url.includes('169.254'))).toBe(false)
  })
})

describe('engine boot writes .conciv/mcp-endpoint.json', () => {
  it('start records the MCP endpoint a headless stdio bridge reads, and the endpoint answers', async () => {
    const root = tempDir()
    const engine = await bootEngine(root)
    try {
      const file = join(statePaths(root).dir, 'mcp-endpoint.json')
      const {mcpUrl} = z.object({mcpUrl: z.string()}).parse(JSON.parse(readFileSync(file, 'utf8')))
      expect(mcpUrl).toBe(`http://127.0.0.1:${engine.port}/t/${engine.agentToken}/api/mcp`)
      expect(statSync(file).mode & 0o777).toBe(0o600)
      const params = {protocolVersion: '2025-06-18', capabilities: {}, clientInfo: {name: 'endpoint', version: '0.0.0'}}
      const response = await fetch(mcpUrl, {
        method: 'POST',
        headers: {'content-type': 'application/json', accept: 'application/json, text/event-stream'},
        body: JSON.stringify({jsonrpc: '2.0', id: 1, method: 'initialize', params}),
      })
      expect(response.status).toBe(200)
      await response.body?.cancel()
    } finally {
      await engine.stop()
    }
  })

  it('releases the port when the endpoint file cannot be written', async () => {
    const root = tempDir()
    const port = await getPort()
    mkdirSync(join(statePaths(root).dir, 'mcp-endpoint.json'), {recursive: true})
    await expect(bootEngine(root, {port: {exact: port}})).rejects.toThrow()
    const probe = createServer().listen(port, '127.0.0.1')
    await once(probe, 'listening')
    await once(probe.close(), 'close')
  })

  it('a taken port fails start with the bind error even when disposing an extension also fails', async () => {
    const port = await getPort()
    const taken = createServer().listen(port, '127.0.0.1')
    await once(taken, 'listening')
    const written = vi.spyOn(console, 'error')
    const failingDispose = defineExtension({name: 'failing-dispose'}).server(() => ({
      context: null,
      dispose: () => {
        throw new Error('extension dispose failed')
      },
    }))
    try {
      const booting = bootEngine(tempDir(), {port: {exact: port}, extensions: [failingDispose]})
      await expect(booting).rejects.toMatchObject({code: 'EADDRINUSE'})
      const logged = written.mock.calls.flat().map(String).join('\n')
      expect.soft(logged).toContain('conciv: cleanup after a failed start also failed')
      expect.soft(logged).toContain('extension dispose failed')
    } finally {
      written.mockRestore()
      await once(taken.close(), 'close')
    }
  })
})

describe('configured session rows', () => {
  it('the configured conciv and harness session rows exist once the engine resolves', async () => {
    const root = tempDir()
    const configured = {sessionId: 'conciv_configured', claudeSessionId: 'native-configured'}
    const made = await makeApp({cfg: resolveConfig(configured, root), cwd: root, openInEditor: () => {}})
    try {
      const rows = await made.chat.db.select().from(sessionTable)
      expect(rows.map((row) => row.id)).toContain('conciv_configured')
      expect(rows.map((row) => row.harnessSessionId)).toContain('native-configured')
    } finally {
      await made.dispose()
    }
  })
})

describe('page bus and the session scope', () => {
  const SESSION_A = SessionId.parse('conciv_ambient_a')
  const SESSION_B = SessionId.parse('conciv_ambient_b')

  function readRequestId(frame: unknown): string | null {
    if (typeof frame !== 'object' || frame === null || !('requestId' in frame)) return null
    return typeof frame.requestId === 'string' ? frame.requestId : null
  }

  const QueueFrameSchema = z.object({
    requestId: z.string(),
    queue: z.object({id: z.string(), replies: z.array(z.string())}),
  })

  type QueueFrame = z.infer<typeof QueueFrameSchema>

  function queueingTab(
    bus: ReturnType<typeof makePageBus>,
    focus?: () => {focusedAt: number; visible: boolean},
  ): QueueFrame[] {
    return arrivingTab(bus, focus).queued
  }

  function arrivingTab(
    bus: ReturnType<typeof makePageBus>,
    focus?: () => {focusedAt: number; visible: boolean},
  ): {queued: QueueFrame[]; frame: (index: number) => Promise<QueueFrame>} {
    const queued: QueueFrame[] = []
    const arrivals = new Map<number, PromiseWithResolvers<QueueFrame>>()
    const arrival = (index: number): PromiseWithResolvers<QueueFrame> => {
      const known = arrivals.get(index)
      if (known !== undefined) return known
      const made = Promise.withResolvers<QueueFrame>()
      arrivals.set(index, made)
      return made
    }
    bus.subscribe(
      SESSION_A,
      (frame) => {
        const parsed = QueueFrameSchema.safeParse(frame)
        if (!parsed.success) return
        queued.push(parsed.data)
        arrival(queued.length - 1).resolve(parsed.data)
        queueMicrotask(() => bus.resolve(SESSION_A, parsed.data.requestId, {ok: true, result: {}}))
      },
      focus,
    )
    return {queued, frame: (index) => arrival(index).promise}
  }

  function pageQueues(bus: ReturnType<typeof makePageBus>, syncMs?: number): PageQueues {
    const db = openDb(tempDir())
    onTestFinished(() => db.$client.close())
    return makePageQueues({bus, journal: makeJournal(db), syncMs})
  }

  function trackFinished(queues: PageQueues): (queueId: string) => Promise<void> {
    const seen = new Map<string, PromiseWithResolvers<void>>()
    const of = (queueId: string): PromiseWithResolvers<void> => {
      const known = seen.get(queueId)
      if (known !== undefined) return known
      const made = Promise.withResolvers<void>()
      seen.set(queueId, made)
      return made
    }
    queues.finished((record) => of(record.queueId).resolve())
    return (queueId) => of(queueId).promise
  }

  const queueStart = (actions: Record<string, unknown>[]) => ({
    agentId: SESSION_A,
    input: {actions},
    outside: true,
    toolCallId: undefined,
  })

  it('queued replies that arrive out of order are each kept for their own action', async () => {
    const bus = makePageBus(2000)
    const queued = queueingTab(bus)
    const queues = pageQueues(bus)
    const checks = ['#first', '#second', '#third'].map((selector) => ({tool: 'page_check', selector}))
    const {queueId} = await queues.start(SESSION_A, queueStart(checks))
    const [first, second, third] = queued[0]?.queue.replies ?? []
    const checked = (selector: string) => ({ok: true as const, result: {checked: selector}})
    expect(bus.resolve(SESSION_A, second ?? '', checked('#second'))).toBe(true)
    expect(bus.resolve(SESSION_A, third ?? '', checked('#third'))).toBe(true)
    expect(bus.resolve(SESSION_A, first ?? '', checked('#first'))).toBe(true)
    expect(await queues.wait(SESSION_A, queueId, 2000)).toEqual({
      queueId,
      status: 'finished',
      outcomes: ['#first', '#second', '#third'].map((selector, index) => ({
        index,
        tool: 'page_check',
        ok: true,
        result: {checked: selector},
      })),
      failed: 0,
      played: 3,
    })
  })

  it('a queued action the page never confirms is unconfirmed: it may already have run and does not count as played', async () => {
    const bus = makePageBus(2000, 50)
    const queued = queueingTab(bus)
    const queues = pageQueues(bus)
    const fill = {tool: 'page_fill', selector: '#name', value: 'Ada'}
    const {queueId} = await queues.start(SESSION_A, queueStart([fill, {tool: 'page_check', selector: '#agree'}]))
    const [onTab] = queued
    expect(bus.resolve(SESSION_A, onTab?.queue.replies[0] ?? '', {ok: true, result: {value: 'Ada'}})).toBe(true)
    expect(await queues.wait(SESSION_A, queueId, 2000)).toEqual({
      queueId,
      status: 'lost',
      outcomes: [
        {index: 0, tool: 'page_fill', ok: true, result: {value: 'Ada'}},
        {
          index: 1,
          tool: 'page_check',
          ok: false,
          error: 'the page did not confirm page_check in time; it may already have run',
        },
      ],
      failed: 0,
      played: 1,
    })
  })

  it('a sync queue returns its result in-call, and it is never announced or owed afterwards', async () => {
    const bus = makePageBus(2000)
    const tab = arrivingTab(bus)
    const queues = pageQueues(bus)
    const announced: string[] = []
    queues.finished((record) => announced.push(record.queueId))
    const played = queues.play(SESSION_A, queueStart([{tool: 'page_check', selector: '#agree'}]))
    const onTab = await tab.frame(0)
    bus.resolve(SESSION_A, onTab.queue.replies[0] ?? '', {ok: true, result: {checked: true}})
    const result = await played
    expect(result).toMatchObject({status: 'finished', played: 1, failed: 0})
    await setImmediate()
    expect(announced).toEqual([])
    expect(queues.undelivered(SESSION_A, true)).toEqual([])
    expect(queues.startedBy(SESSION_A, new Set())).toEqual([])
  })

  it('a sync queue that outlasts its bound returns the progress and its queueId, and the result is owed later', async () => {
    const bus = makePageBus(2000)
    const queued = queueingTab(bus)
    const queues = pageQueues(bus, 20)
    const finished = trackFinished(queues)
    const checks = ['#first', '#second'].map((selector) => ({tool: 'page_check', selector}))
    const progress = await queues.play(SESSION_A, {...queueStart(checks), toolCallId: 'call-1'})
    const queueId = queued[0]?.queue.id ?? ''
    expect(progress).toEqual({queueId, status: 'playing', done: 0, of: 2})
    expect(queues.startedBy(SESSION_A, new Set(['call-1']))).toEqual([{queueId, actions: 2}])
    for (const reply of queued[0]?.queue.replies ?? []) bus.resolve(SESSION_A, reply, {ok: true, result: {}})
    await finished(queueId)
    expect(queues.startedBy(SESSION_A, new Set(['call-1']))).toEqual([])
    expect(queues.undelivered(SESSION_A, true)).toEqual([
      expect.objectContaining({queueId, status: 'finished', played: 2}),
    ])
    expect(queues.undelivered(SESSION_A, true)).toEqual([])
  })

  it('undelivered results are never evicted: at 1000 owed a new queue is refused before it plays, and delivering one frees a place', async () => {
    const bus = makePageBus(2000)
    const queued = queueingTab(bus)
    const queues = pageQueues(bus)
    const finished = trackFinished(queues)
    const check = [{tool: 'page_check', selector: '#agree'}]
    const started: string[] = []
    for (const index of Array.from({length: 1000}, (_, at) => at)) {
      const {queueId} = await queues.start(SESSION_A, queueStart(check))
      bus.resolve(SESSION_A, queued[index]?.queue.replies[0] ?? '', {ok: true, result: {checked: true}})
      await finished(queueId)
      started.push(queueId)
    }
    await expect(queues.start(SESSION_A, queueStart(check))).rejects.toThrow(
      '1000 queue results are still undelivered; collect them before queueing more',
    )
    expect(queued).toHaveLength(1000)
    expect(await queues.wait(SESSION_A, started[0] ?? '', 0)).toMatchObject({queueId: started[0], status: 'finished'})
    const {queueId: freed} = await queues.start(SESSION_A, queueStart(check))
    expect(queued.at(-1)?.queue.id).toBe(freed)
    expect(queues.undelivered(SESSION_A, true).map((result) => result.queueId)).toEqual(started.slice(1))
  })

  it('an async queue started while another plays answers its queueId at once, and its actions reach the tab only after the first finishes', async () => {
    const bus = makePageBus(2000)
    const tab = arrivingTab(bus)
    const queued = tab.queued
    const queues = pageQueues(bus)
    const finished = trackFinished(queues)
    const check = [{tool: 'page_check', selector: '#agree'}]
    const earlier = await queues.start(SESSION_A, queueStart(check))
    const later = await Promise.race([queues.start(SESSION_A, queueStart(check)), setImmediate(null)])
    expect(later).toEqual({queueId: expect.stringMatching(/^q_/), actions: 1})
    expect(queued.map((frame) => frame.queue.id)).toEqual([earlier.queueId])
    expect(await queues.wait(SESSION_A, later?.queueId ?? '', 0)).toEqual({
      queueId: later?.queueId,
      status: 'playing',
      done: 0,
      of: 1,
    })
    bus.resolve(SESSION_A, queued[0]?.queue.replies[0] ?? '', {ok: true, result: {checked: true}})
    await finished(earlier.queueId)
    const second = await tab.frame(1)
    expect(queued.map((frame) => frame.queue.id)).toEqual([earlier.queueId, later?.queueId])
    bus.resolve(SESSION_A, second.queue.replies[0] ?? '', {ok: true, result: {checked: true}})
    await finished(later?.queueId ?? '')
  })

  it('a sync queue started while another plays waits for its turn and returns its own result', async () => {
    const bus = makePageBus(2000)
    const tab = arrivingTab(bus)
    const queued = tab.queued
    const queues = pageQueues(bus)
    const finished = trackFinished(queues)
    const check = [{tool: 'page_check', selector: '#agree'}]
    const earlier = await queues.start(SESSION_A, queueStart(check))
    const played = queues.play(SESSION_A, queueStart(check))
    await setImmediate()
    expect(queued).toHaveLength(1)
    bus.resolve(SESSION_A, queued[0]?.queue.replies[0] ?? '', {ok: true, result: {checked: true}})
    await finished(earlier.queueId)
    const second = await tab.frame(1)
    bus.resolve(SESSION_A, second.queue.replies[0] ?? '', {ok: true, result: {checked: false}})
    expect(await played).toMatchObject({queueId: second.queue.id, status: 'finished', played: 1, failed: 0})
  })

  it('queues started all at once past 1000 owed are refused: a start that is still waiting for the page holds its place', async () => {
    const bus = makePageBus(2000)
    const queued: z.infer<typeof QueueFrameSchema>[] = []
    bus.subscribe(SESSION_A, (frame) => {
      const parsed = QueueFrameSchema.safeParse(frame)
      if (!parsed.success) return
      queued.push(parsed.data)
      queueMicrotask(() => {
        bus.resolve(SESSION_A, parsed.data.requestId, {ok: true, result: {}})
        bus.resolve(SESSION_A, parsed.data.queue.replies[0] ?? '', {ok: true, result: {checked: true}})
      })
    })
    const queues = pageQueues(bus)
    const finished = trackFinished(queues)
    const check = [{tool: 'page_check', selector: '#agree'}]
    const starts = await Promise.allSettled(
      Array.from({length: 1001}, () => queues.start(SESSION_A, queueStart(check))),
    )
    expect(starts.filter((each) => each.status === 'rejected')).toEqual([
      {
        status: 'rejected',
        reason: new Error('1000 queue results are still undelivered; collect them before queueing more'),
      },
    ])
    await Promise.all(starts.flatMap((each) => (each.status === 'fulfilled' ? [finished(each.value.queueId)] : [])))
    expect(queued).toHaveLength(1000)
  })

  it('a follow-up turn that fails to start gives its results back even when 200 delivered queues pass them while it starts', async () => {
    const bus = makePageBus(2000)
    const queued = queueingTab(bus)
    const queues = pageQueues(bus)
    const finished = trackFinished(queues)
    const check = [{tool: 'page_check', selector: '#agree'}]
    const played = async (outside: boolean): Promise<string> => {
      const {queueId} = await queues.start(SESSION_A, {...queueStart(check), outside})
      bus.resolve(SESSION_A, queued.at(-1)?.queue.replies[0] ?? '', {ok: true, result: {checked: true}})
      await finished(queueId)
      return queueId
    }
    const owed = await played(false)
    const turns: string[] = []
    const starting = Promise.withResolvers<FollowUpOutcome>()
    const entered = Promise.withResolvers<void>()
    const plane = {
      live: async () => false,
      followUp: async (_sessionId: SessionId, input: string): Promise<FollowUpOutcome> => {
        turns.push(input)
        entered.resolve()
        return turns.length === 1 ? starting.promise : {kind: 'delivered'}
      },
    }
    const following = startQueueFollowUp(queues, plane, SESSION_A)
    await entered.promise
    for (const _ of Array.from({length: 205})) {
      const queueId = await played(true)
      await queues.wait(SESSION_A, queueId, 0)
    }
    starting.resolve({kind: 'busy'})
    await following
    expect(queues.owedTurn(SESSION_A).map((record) => record.queueId)).toEqual([owed])
    await startQueueFollowUp(queues, plane, SESSION_A)
    expect(turns).toHaveLength(2)
    expect(turns[1]).toContain(`queue ${owed} finished`)
    expect(queues.owedTurn(SESSION_A)).toEqual([])
  })

  async function followUpFixture() {
    const fixture = await makeChatFixture()
    onTestFinished(() => fixture.dispose())
    const bus = makePageBus(2000)
    bus.subscribe(fixture.sessionId, (frame) => {
      const parsed = QueueFrameSchema.safeParse(frame)
      if (!parsed.success) return
      queueMicrotask(() => {
        bus.resolve(fixture.sessionId, parsed.data.requestId, {ok: true, result: {}})
        for (const reply of parsed.data.queue.replies) {
          bus.resolve(fixture.sessionId, reply, {ok: true, result: {checked: true}})
        }
      })
    })
    const queues = pageQueues(bus)
    const finished = trackFinished(queues)
    const played = async (): Promise<string> => {
      const {queueId} = await queues.start(fixture.sessionId, {
        agentId: fixture.sessionId,
        input: {actions: [{tool: 'page_check', selector: '#agree'}]},
        outside: false,
        toolCallId: undefined,
      })
      await finished(queueId)
      return queueId
    }
    const owedIds = () => queues.owedTurn(fixture.sessionId).map((record) => record.queueId)
    const runStatuses = () =>
      fixture.db
        .select({status: chatRuns.status})
        .from(chatRuns)
        .where(eq(chatRuns.threadId, fixture.sessionId))
        .orderBy(chatRuns.startedAt)
        .all()
        .map((run) => run.status)
    return {fixture, queues, played, owedIds, runStatuses}
  }

  it('a follow-up run that ends in RUN_ERROR is retried, and the retry that finishes delivers the result', async () => {
    const {fixture, queues, played, owedIds, runStatuses} = await followUpFixture()
    await played()
    fixture.harness.script.scriptError('the harness could not launch')
    await startQueueFollowUp(queues, fixture.plane, fixture.sessionId)
    expect(runStatuses()).toEqual(['failed', 'completed'])
    expect(owedIds()).toEqual([])
    expect(queues.undelivered(fixture.sessionId, false)).toEqual([])
  })

  it('three failed follow-up runs end follow-ups for the result, and the next reply delivers it', async () => {
    const {fixture, queues, played, runStatuses} = await followUpFixture()
    const owed = await played()
    for (const attempt of [1, 2, 3]) fixture.harness.script.scriptError(`launch failure ${attempt}`)
    await startQueueFollowUp(queues, fixture.plane, fixture.sessionId)
    expect(runStatuses()).toEqual(['failed', 'failed', 'failed'])
    expect(queues.owedTurn(fixture.sessionId).map((record) => record.delivery)).toEqual(['nextReply'])
    await startQueueFollowUp(queues, fixture.plane, fixture.sessionId)
    expect(runStatuses()).toEqual(['failed', 'failed', 'failed'])
    expect(queues.undelivered(fixture.sessionId, false).map((result) => result.queueId)).toEqual([owed])
    expect(queues.undelivered(fixture.sessionId, false)).toEqual([])
  })

  it('a result whose follow-ups failed rides the next follow-up another queue starts, and nothing else starts one', async () => {
    const {fixture, queues, played, runStatuses} = await followUpFixture()
    const stranded = await played()
    const [record] = queues.owedTurn(fixture.sessionId)
    for (const attempt of [1, 2, 3]) fixture.harness.script.scriptError(`launch failure ${attempt}`)
    await startQueueFollowUp(queues, fixture.plane, fixture.sessionId)
    expect(record?.delivery).toBe('nextReply')
    await startQueueFollowUp(queues, fixture.plane, fixture.sessionId)
    expect(runStatuses()).toEqual(['failed', 'failed', 'failed'])
    const later = await played()
    const inputs: string[] = []
    const plane = {
      live: fixture.plane.live,
      followUp: (sessionId: SessionId, input: string): Promise<FollowUpOutcome> => {
        inputs.push(input)
        return fixture.plane.followUp(sessionId, input)
      },
    }
    await startQueueFollowUp(queues, plane, fixture.sessionId)
    expect(runStatuses()).toEqual(['failed', 'failed', 'failed', 'completed'])
    expect(inputs).toHaveLength(1)
    expect(inputs[0]).toContain(`queue ${stranded} finished`)
    expect(inputs[0]).toContain(`queue ${later} finished`)
    expect(record?.delivery).toBe('delivered')
    expect(queues.undelivered(fixture.sessionId, false)).toEqual([])
  })

  it('a follow-up run the user stops is not retried, and its result waits for the next reply', async () => {
    const {fixture, queues, played, runStatuses} = await followUpFixture()
    const owed = await played()
    fixture.harness.script.hold()
    const started = Promise.withResolvers<void>()
    const unlisten = fixture.runtime.forSession(fixture.sessionId).stream.listen((chunk) => {
      if (sessionRunEvent.parse(chunk) !== null) started.resolve()
    })
    onTestFinished(unlisten)
    const following = startQueueFollowUp(queues, fixture.plane, fixture.sessionId)
    await started.promise
    await fixture.plane.stop(fixture.sessionId)
    fixture.harness.script.release()
    await following
    expect(runStatuses()).toEqual(['aborted'])
    expect(queues.undelivered(fixture.sessionId, false).map((result) => result.queueId)).toEqual([owed])
  })

  it('a follow-up the plane declines because a run is driving is not retried', async () => {
    const {fixture, queues, played, owedIds, runStatuses} = await followUpFixture()
    const owed = await played()
    fixture.harness.script.hold()
    const driving = fixture.plane.followUp(fixture.sessionId, 'an earlier follow-up')
    const plane = {
      live: async () => false,
      followUp: async (sessionId: SessionId, input: string): Promise<FollowUpOutcome> => {
        const declined = await fixture.plane.followUp(sessionId, input)
        fixture.harness.script.release()
        await driving
        return declined
      },
    }
    await startQueueFollowUp(queues, plane, fixture.sessionId)
    expect(runStatuses()).toEqual(['completed'])
    expect(owedIds()).toEqual([owed])
  })

  it('a follow-up run that finishes confirms its result delivered', async () => {
    const {fixture, queues, played, owedIds} = await followUpFixture()
    await played()
    await startQueueFollowUp(queues, fixture.plane, fixture.sessionId)
    expect(owedIds()).toEqual([])
    expect(queues.undelivered(fixture.sessionId, false)).toEqual([])
    expect(await fixture.plane.followUp(fixture.sessionId, 'queue q_a finished')).toEqual({kind: 'delivered'})
    fixture.harness.script.scriptError('the harness could not launch')
    expect(await fixture.plane.followUp(fixture.sessionId, 'queue q_b finished')).toEqual({
      kind: 'failed',
      error: expect.stringContaining('the harness could not launch'),
    })
  })

  it('a queue the page refuses plays nothing: it ends lost with no action counted as played', async () => {
    const bus = makePageBus(2000)
    bus.subscribe(SESSION_A, (frame) => {
      const parsed = QueueFrameSchema.safeParse(frame)
      if (!parsed.success) return
      queueMicrotask(() =>
        bus.resolve(SESSION_A, parsed.data.requestId, {ok: false, error: {code: 'invalid-args', message: 'no list'}}),
      )
    })
    const queues = pageQueues(bus)
    const result = await queues.play(SESSION_A, queueStart([{tool: 'page_check', selector: '#agree'}]))
    expect(result).toMatchObject({
      status: 'lost',
      played: 0,
      failed: 0,
      outcomes: [{index: 0, tool: 'page_check', ok: false, error: expect.stringContaining('refused the queue')}],
    })
  })

  it('a queue started while a mutating call is in flight reaches the tab only after that call answers', async () => {
    const bus = makePageBus(2000)
    const frames: unknown[] = []
    const queueFrame = Promise.withResolvers<QueueFrame>()
    bus.subscribe(SESSION_A, (frame) => {
      frames.push(frame)
      const parsed = QueueFrameSchema.safeParse(frame)
      if (!parsed.success) return
      queueFrame.resolve(parsed.data)
      queueMicrotask(() => bus.resolve(SESSION_A, parsed.data.requestId, {ok: true, result: {}}))
    })
    const queues = pageQueues(bus)
    const clicked = bus.ask(
      SESSION_A,
      {name: 'fixture_click', input: {}, agentId: SESSION_A, mutating: true},
      {mutating: true},
    )
    await setImmediate()
    const clickId = readRequestId(frames[0]) ?? ''
    const {queueId} = await queues.start(SESSION_A, queueStart([{tool: 'page_check', selector: '#agree'}]))
    await setImmediate()
    expect(frames).toHaveLength(1)
    expect(bus.resolve(SESSION_A, clickId, {ok: true, result: {clicked: true}})).toBe(true)
    await clicked
    expect((await queueFrame.promise).queue.id).toBe(queueId)
  })

  it('a queue for a session whose earlier queue still plays reaches the newly focused tab only once that queue is done', async () => {
    const bus = makePageBus(2000)
    const focusedAt = {first: 2, second: 1}
    const first = queueingTab(bus, () => ({focusedAt: focusedAt.first, visible: true}))
    const second = queueingTab(bus, () => ({focusedAt: focusedAt.second, visible: true}))
    const queues = pageQueues(bus)
    const finished = trackFinished(queues)
    const check = [{tool: 'page_check', selector: '#agree'}]
    const earlier = await queues.start(SESSION_A, queueStart(check))
    focusedAt.second = 3
    const later = queues.start(SESSION_A, queueStart(check))
    expect(second).toHaveLength(0)
    expect(bus.resolve(SESSION_A, first[0]?.queue.replies[0] ?? '', {ok: true, result: {checked: true}})).toBe(true)
    await finished(earlier.queueId)
    expect((await later).queueId).toBe(second[0]?.queue.id)
    expect(first).toHaveLength(1)
  })

  it('a queue waiting behind another plays on the tab that serves the session when its turn comes, though the tab it was queued for closed', async () => {
    const bus = makePageBus(2000)
    const onFirst: z.infer<typeof QueueFrameSchema>[] = []
    const closeFirst = bus.subscribe(SESSION_A, (frame) => {
      const parsed = QueueFrameSchema.safeParse(frame)
      if (!parsed.success) return
      onFirst.push(parsed.data)
      queueMicrotask(() => bus.resolve(SESSION_A, parsed.data.requestId, {ok: true, result: {}}))
    })
    const queues = pageQueues(bus)
    const finished = trackFinished(queues)
    const check = [{tool: 'page_check', selector: '#agree'}]
    const earlier = await queues.start(SESSION_A, queueStart(check))
    const later = queues.start(SESSION_A, queueStart(check))
    closeFirst()
    const second = arrivingTab(bus)
    const {queueId} = await later
    const onSecond = await second.frame(0)
    expect(onFirst.map((frame) => frame.queue.id)).toEqual([earlier.queueId])
    expect(second.queued.map((frame) => frame.queue.id)).toEqual([queueId])
    expect(bus.resolve(SESSION_A, onSecond.queue.replies[0] ?? '', {ok: true, result: {checked: true}})).toBe(true)
    await finished(queueId)
    expect(await queues.wait(SESSION_A, queueId, 0)).toMatchObject({queueId, status: 'finished', played: 1})
  })

  it('a queue wait its caller aborts rejects at once and leaves the result owed to the next reply', async () => {
    const bus = makePageBus(2000)
    const queued = queueingTab(bus)
    const queues = pageQueues(bus)
    const finished = trackFinished(queues)
    const {queueId} = await queues.start(SESSION_A, queueStart([{tool: 'page_check', selector: '#agree'}]))
    const caller = new AbortController()
    const waiting = queues.wait(SESSION_A, queueId, 60_000, caller.signal)
    caller.abort()
    await expect(waiting).rejects.toMatchObject({name: 'AbortError'})
    bus.resolve(SESSION_A, queued[0]?.queue.replies[0] ?? '', {ok: true, result: {checked: true}})
    await finished(queueId)
    expect(queues.undelivered(SESSION_A, true)).toEqual([expect.objectContaining({queueId, status: 'finished'})])
  })

  it('an ask in flight fails at once when its browser tab unsubscribes, and its late reply settles nothing', async () => {
    const bus = makePageBus(2000)
    const frames: unknown[] = []
    const unsubscribe = bus.subscribe(SESSION_A, (frame) => frames.push(frame))
    const answered = bus.ask(SESSION_A, {name: 'fixture_click', input: {}, agentId: SESSION_A})
    bus.subscribe(SESSION_A, () => {})
    unsubscribe()
    await expect(answered).rejects.toMatchObject({
      error: {code: 'no-widget', message: 'browser tab b1 closed before it replied'},
    })
    const requestId = frames.map(readRequestId).find((found) => found !== null)
    expect(bus.resolve(SESSION_A, requestId ?? '', {ok: true, result: {clicked: 'yes'}})).toBe(false)
  })

  function replyingTab(bus: ReturnType<typeof makePageBus>, result: Record<string, unknown>): unknown[] {
    const frames: unknown[] = []
    bus.subscribe(SESSION_A, (frame) => {
      frames.push(frame)
      const requestId = readRequestId(frame)
      if (requestId !== null) queueMicrotask(() => bus.resolve(SESSION_A, requestId, {ok: true, result}))
    })
    return frames
  }

  it('a reading call that loses its browser tab is sent once more to the next tab that serves the session', async () => {
    const bus = makePageBus(2000)
    const lost = bus.subscribe(SESSION_A, () => {})
    const answered = bus.ask(SESSION_A, {name: 'page_route', input: {}, agentId: SESSION_A}, {mutating: false})
    lost()
    await setImmediate()
    const reloaded = replyingTab(bus, {href: '/after-reload'})
    expect(await answered).toEqual({result: {href: '/after-reload'}})
    expect(reloaded).toHaveLength(1)
  })

  it('a reading call that loses its browser tab goes at once to the other tab of the session, focused last', async () => {
    const bus = makePageBus(2000)
    const other = replyingTab(bus, {href: '/other'})
    const lost = bus.subscribe(
      SESSION_A,
      () => {},
      () => ({focusedAt: 1, visible: true}),
    )
    const answered = bus.ask(SESSION_A, {name: 'page_snapshot', input: {}, agentId: SESSION_A}, {mutating: false})
    lost()
    expect(await answered).toEqual({result: {href: '/other'}})
    expect(other).toHaveLength(1)
  })

  it('a reading call whose browser tab never comes back fails as before once its own timeout runs out', async () => {
    const bus = makePageBus(100)
    const lost = bus.subscribe(SESSION_A, () => {})
    const answered = bus.ask(SESSION_A, {name: 'page_route', input: {}, agentId: SESSION_A}, {mutating: false})
    lost()
    await expect(answered).rejects.toMatchObject({
      error: {code: 'no-widget', message: 'browser tab b1 closed before it replied'},
    })
  })

  it('a call whose browser tab stays open and never replies times out once, never as a lost tab', async () => {
    const bus = makePageBus(100)
    const frames: unknown[] = []
    bus.subscribe(SESSION_A, (frame) => frames.push(frame))
    const reading = bus.ask(SESSION_A, {name: 'page_route', input: {}, agentId: SESSION_A}, {mutating: false})
    await expect(reading).rejects.toMatchObject({error: {code: 'timeout'}})
    expect(frames.map(readRequestId).filter((found) => found !== null)).toHaveLength(1)
    const changing = bus.ask(SESSION_A, {name: 'page_click', input: {}, agentId: SESSION_A}, {mutating: true})
    await expect(changing).rejects.toMatchObject({error: {code: 'timeout'}})
  })

  it('a changing call that loses its browser tab is never sent again and says it may already have run', async () => {
    const bus = makePageBus(2000)
    const lost = bus.subscribe(SESSION_A, () => {})
    const answered = bus.ask(SESSION_A, {name: 'page_click', input: {}, agentId: SESSION_A}, {mutating: true})
    lost()
    await expect(answered).rejects.toMatchObject({
      error: {
        code: 'no-widget',
        message:
          'the page reloaded or closed during page_click; it may already have run. Take a new snapshot before continuing',
      },
    })
    expect(replyingTab(bus, {})).toHaveLength(0)
  })

  it('a call its caller aborts rejects at once, settles nothing later and is never sent again', async () => {
    const bus = makePageBus(60_000)
    const frames: unknown[] = []
    const lost = bus.subscribe(SESSION_A, (frame) => frames.push(frame))
    const route = {name: 'page_route', input: {}, agentId: SESSION_A}
    const waiting = new AbortController()
    const answered = bus.ask(SESSION_A, route, {mutating: false}, waiting.signal)
    waiting.abort()
    await expect(answered).rejects.toMatchObject({name: 'AbortError'})
    const requestId = frames.map(readRequestId).find((found) => found !== null)
    expect(bus.resolve(SESSION_A, requestId ?? '', {ok: true, result: {}})).toBe(false)
    const lostTab = new AbortController()
    const reading = bus.ask(SESSION_A, route, {mutating: false}, lostTab.signal)
    lost()
    await setImmediate()
    lostTab.abort()
    await expect(reading).rejects.toMatchObject({name: 'AbortError'})
    const returned = replyingTab(bus, {href: '/after-abort'})
    await expect(bus.ask(SESSION_A, route, {mutating: false}, lostTab.signal)).rejects.toMatchObject({
      name: 'AbortError',
    })
    expect(returned).toHaveLength(0)
    expect(frames.map(readRequestId).filter((found) => found !== null)).toHaveLength(2)
  })

  it('two page queue follow-ups asked for at once start one run', async () => {
    const fixture = await makeChatFixture()
    try {
      const started = await Promise.all([
        fixture.plane.followUp(fixture.sessionId, 'queue q_a finished'),
        fixture.plane.followUp(fixture.sessionId, 'queue q_b finished'),
      ])
      expect(started).toEqual([{kind: 'delivered'}, {kind: 'busy'}])
    } finally {
      await fixture.dispose()
    }
  })

  it('a page tool asks, journals and is reachable under the established session, never the one the request names', async () => {
    const fixture = await makeChatFixture()
    try {
      const fresh: EngineStaleness = {stale: false, changed: [], tracked: [], bootedAt: 0, fingerprint: 'test'}
      const primitives = makeSessionPrimitives({
        db: fixture.db,
        root: fixture.stateRoot,
        storeCapture: () => Promise.resolve(),
        bundler: () => undefined,
        openInEditor: () => {},
        listTabs: async () => ({tabs: [], unreachable: []}),
      })
      const clicker = defineTool({
        name: 'fixture_click',
        description: 'Click something on the page',
        inputSchema: z.object({ref: z.string()}),
        outputSchema: z.object({clicked: z.string()}),
        meta: {summary: 'click a page element', category: 'fixture', mutating: true},
      }).client()
      primitives.registry.register(clicker, {owner: 'a fixture'})
      const {plane, db} = fixture
      const runtime = makeCoreRuntime({primitives, plane, db, model: () => null, staleness: () => fresh})
      const unsubscribe = primitives.page.bus.subscribe(SESSION_A, (frame) => {
        const requestId = readRequestId(frame)
        if (requestId === null) return
        queueMicrotask(() => primitives.page.bus.resolve(SESSION_A, requestId, {ok: true, result: {clicked: 'a'}}))
      })
      const reachableIn = (id: SessionId) => runtime.forSession(id).tools.catalog.get('fixture_click').reachable
      expect([reachableIn(SESSION_A), reachableIn(SESSION_B)]).toEqual([true, false])
      const request = {sessionId: SESSION_B, agentId: SESSION_B, model: null}
      const result = await runWithSession(runtime.forSession(SESSION_A), () =>
        primitives.registry.call('fixture_click', {ref: 'r1'}, {request}),
      )
      unsubscribe()
      expect(result).toEqual({clicked: 'a'})
      expect(await runtime.forSession(SESSION_A).page.changes()).toHaveLength(1)
      expect(await runtime.forSession(SESSION_B).page.changes()).toHaveLength(0)
    } finally {
      await fixture.dispose()
    }
  }, 30_000)
})

describe('system prompt', () => {
  it('folds in extension prompts but never tool prose, grounds a factory in parsed config and cwd, and skips an absent config', () => {
    const demoTool = defineTool({
      name: 'demo_tool',
      description: 'Does a demo thing.',
      inputSchema: z.object({}),
      promptSnippet: 'NEVER-IN-PROMPT',
      approval: 'ask',
    }).server(async () => ({}))
    const demo = defineExtension({name: 'demo', systemPrompt: 'Demo extension rules.', tools: [demoTool]})
    const ios = defineExtension({
      name: 'ios',
      systemPrompt: (config, context) => `simulator ${config.simulator} in ${config.projectRoot} under ${context.cwd}`,
      configSchema: z.preprocess(
        (raw) => (raw && typeof raw === 'object' && Object.keys(raw).length === 0 ? undefined : raw),
        z
          .object({projectRoot: z.string(), simulator: z.string().default('iPhone 17 Pro')})
          .transform((config) => ({...config, projectRoot: config.projectRoot.replace(/\/+$/, '')}))
          .optional(),
      ),
    })
    const standing = composeSystemPrompt('base prompt', [demo], {cwd: '/repo'})
    expect(standing).toContain('base prompt')
    expect(standing).toContain('Demo extension rules.')
    expect(standing).not.toContain('NEVER-IN-PROMPT')
    expect(composeSystemPrompt('base prompt', [ios], {cwd: '/repo', extensions: {}})).toBe('base prompt')
    expect(composeSystemPrompt(undefined, [ios], {cwd: '/repo', extensions: {ios: {projectRoot: '/app/'}}})).toBe(
      'simulator iPhone 17 Pro in /app under /repo',
    )
  })
})

describe('engine login', () => {
  const requester = {browser: 'Chrome 156 | macOS', origin: 'http://localhost:5173'}

  const REISSUE = '{"json":{"reissue":true}}'

  const probeOs = os.$context<RpcContext>()
  const versionRouter = probeOs.router({
    clientVersion: probeOs.handler(({context}) => context.clientVersion ?? null),
  })

  test('one code prints per request; it expires after five minutes and is retired by five misses, a success or a reissue', () => {
    const clock = {now: 1_000}
    const printed: string[] = []
    const store = makeCodeStore({now: () => clock.now, print: (text) => printed.push(text)})
    const lastCode = (): string => /#conciv_otp=(\d{6})/.exec(printed.at(-1) ?? '')?.[1] ?? ''
    store.request(requester, false)
    store.request(requester, false)
    expect(printed).toHaveLength(1)
    expect(printed[0]).toContain('Chrome 156 | macOS at http://localhost:5173')
    const expiring = lastCode()
    clock.now += CODE_LIFETIME_MS
    expect(store.exchange(expiring)).toBe('expired')
    store.request(requester, false)
    const first = lastCode()
    const wrong = first === '000000' ? '111111' : '000000'
    for (const _ of [1, 2, 3, 4, 5]) expect(store.exchange(wrong)).toBe('mismatch')
    expect(store.exchange(first)).toBe('expired')
    store.request(requester, false)
    const second = lastCode()
    store.request(requester, true)
    expect(store.exchange(second)).not.toBe('trusted')
    expect(store.exchange(lastCode())).toBe('trusted')
    expect(store.exchange(lastCode())).toBe('expired')
  })

  test('the gate refuses until a printed code is exchanged, and the browser stays trusted across a restart', async () => {
    const root = tempDir()
    const printed: string[] = []
    const clientRequests = {count: 0}
    const boot = () =>
      bootEngine(root, {print: (text) => printed.push(text), onClientRequest: () => (clientRequests.count += 1)})
    const first = await boot()
    const origin = `http://127.0.0.1:${first.port}`
    expect((await fetch(`${origin}/t/not-a-token/rpc/meta/engine`, {method: 'POST'})).status).toBe(401)
    const requestCode = (from: string) => rawRequest(first.port, '/rpc/auth/requestCode', {origin: from}, REISSUE)
    expect((await requestCode('http://conciv.example')).status).toBe(403)
    expect((await requestCode('http://localhost:5173')).status).toBe(200)
    expect(printed.at(-1)).toContain('http://localhost:5173/#conciv_otp=')
    await requestPrintedCode(origin, () => printed.join('\n'))
    expect(printed.at(-1)).toContain(`${origin}/#conciv_otp=`)
    await expect(exchangePrintedCode(origin, '000000')).rejects.toThrow(/refused the printed login code: mismatch/)
    const token = await loginThroughTerminal(origin, () => printed.join('\n'))
    const headers = {authorization: `Bearer ${token}`}
    expect((await fetch(`${origin}/rpc/meta/engine`, {method: 'POST', headers})).status).not.toBe(401)
    expect(clientRequests.count).toBe(1)
    await first.stop()
    const second = await boot()
    try {
      expect(second.port).toBe(first.port)
      const server = JSON.parse(readFileSync(statePaths(root).server, 'utf8'))
      expect(server).toEqual({port: first.port, token: second.agentToken})
      const check = (host: string) =>
        rawRequest(second.port, '/rpc/auth/trust', {host}, JSON.stringify({json: {token}}))
      expect(JSON.parse((await check(`localhost:${second.port}`)).text)).toMatchObject({json: {trusted: true}})
      expect((await check(`conciv.example:${second.port}`)).status).toBe(403)
      const rebound = {host: `conciv.example:${second.port}`}
      expect((await rawRequest(second.port, `/t/${second.agentToken}/rpc/meta/engine`, rebound, REISSUE)).status).toBe(
        403,
      )
    } finally {
      await second.stop()
    }
  })

  test('every route refuses an unknown caller except the declared open paths, and every response names the core version', async () => {
    const root = tempDir()
    const probe = defineExtension({name: 'probe'}).server(() => ({
      context: {},
      app: new Hono().get('/ping', (c) => c.text('pong')),
      router: versionRouter,
    }))
    const {made, origin, stop} = await serveCore(root, [probe], {nativePageDir: root})
    try {
      const routes = made.app.routes.map((route) => ({
        method: route.method === 'ALL' ? 'GET' : route.method,
        path: route.path.replaceAll(/:[^/]+|\*/g, 'x'),
      }))
      expect(routes.map((route) => route.path)).toEqual(
        expect.arrayContaining(['/api/ext/probe/ping', '/chat-ws', '/push-ws']),
      )
      const versions = new Set<string | null>()
      const sent = async (url: string, init: RequestInit = {}) => {
        const response = await fetch(url, init)
        versions.add(response.headers.get(CONCIV_VERSION_HEADER))
        return response
      }
      const refused = async (url: string, method: string): Promise<boolean> => {
        const response = await sent(url, {method, ...(method === 'GET' ? {} : {body: '{}'})})
        return response.status === 401 && (await response.text()).includes('"unauthorized"')
      }
      for (const route of routes) {
        expect(await refused(`${origin}${route.path}`, route.method), route.path).toBe(!isOpenPath(route.path))
        expect(await refused(`${origin}/t/${made.agentToken}${route.path}`, route.method), route.path).toBe(false)
      }
      const open = ['/health', '/rpc/auth/trust', '/rpc/auth/exchange', '/rpc/auth/requestCode', '/native', '/native/*']
      expect(OPEN_PATHS).toEqual(open)
      const auth = makeRpcClient(origin).auth
      expect(await auth.trust({token: 'not-a-token'})).toEqual({trusted: false})
      expect(await auth.trust({token: made.agentToken})).toEqual({trusted: true})
      expect(await auth.exchange({code: '000000'})).toEqual({refused: 'expired'})
      expect((await sent(`${origin}/health`, {headers: {origin: 'http://conciv.example'}})).status).toBe(403)
      const preflight = await sent(`${origin}/rpc/meta/engine`, {
        method: 'OPTIONS',
        headers: {
          origin: 'http://localhost:5173',
          'access-control-request-method': 'POST',
          'access-control-request-headers': `authorization,${CONCIV_VERSION_HEADER}`,
        },
      })
      expect(preflight.status).toBe(204)
      expect(preflight.headers.get('access-control-allow-headers')).toContain('authorization')
      expect(preflight.headers.get('access-control-allow-headers')).toContain(CONCIV_VERSION_HEADER)
      expect(preflight.headers.get('access-control-expose-headers')).toContain(CONCIV_VERSION_HEADER)
      expect([...versions]).toEqual([coreManifest.version])
      const client = makeExtRpcClient<typeof versionRouter>(`${origin}/t/${made.agentToken}`, 'probe')
      expect(await client.clientVersion()).toBe(coreManifest.version)
      const {sessionId} = await makeRpcClient(`${origin}/t/${made.agentToken}`).sessions.create(undefined)
      const pushSocket = (frame: string) =>
        new Promise<string>((resolve) => {
          const socket = new WebSocket(
            `${origin.replace('http', 'ws')}${PUSH_WS_PATH}?${PUSH_SESSION_PARAM}=${sessionId}`,
          )
          socket.addEventListener('open', () => {
            for (const outgoing of [frame, JSON.stringify({channel: 'page-serving', serving: true})])
              socket.send(outgoing)
          })
          socket.addEventListener('message', (event) => {
            resolve(String(event.data))
            socket.close()
          })
          socket.addEventListener('close', (event) => resolve(`closed ${event.code}`))
        })
      const untrusted = JSON.stringify({type: SOCKET_TRUST_FRAME, token: 'not-a-token'})
      const closed = await Promise.all([pushSocket(untrusted), pushSocket('{"channel":"ready"}')])
      expect(closed).toEqual(['closed 1008', 'closed 1008'])
    } finally {
      await stop()
    }
  })

  test('the rpc mount keeps a valid client version from the http and websocket links and drops a malformed one', async () => {
    const served = await serveRpcRouter({router: versionRouter})
    const sockets: WebSocket[] = []
    const versionCall = (link: FetchRpcLink<Record<never, never>> | WebsocketRpcLink<Record<never, never>>) =>
      createORPCClient<{clientVersion: () => Promise<string | null>}>(link).clientVersion()
    const overBoth = (version: string) => {
      const websocket = new WebSocket(served.wsUrl)
      sockets.push(websocket)
      const headers = {[CONCIV_VERSION_HEADER]: version}
      return [
        versionCall(new FetchRpcLink({url: served.rpcUrl, headers})),
        versionCall(new WebsocketRpcLink({websocket, headers})),
      ]
    }
    try {
      const kept = ['1.2.3', '4.5.6-beta.1', '1.2.3+build.7']
      const dropped = ['not a version', '', '01.2.3', '1.2.3-beta..1']
      expect(await Promise.all(kept.flatMap(overBoth))).toEqual(kept.flatMap((version) => [version, version]))
      expect(await Promise.all(dropped.flatMap(overBoth))).toEqual(dropped.flatMap(() => [null, null]))
    } finally {
      for (const websocket of sockets) websocket.close()
      await served.close()
    }
  })
})

describe('browser rpc over one websocket', () => {
  const requester = {browser: 'Chrome 156 | macOS', origin: 'http://localhost:5173'}
  const sessionOs = os.$context<RpcContext>()
  const sessionProbe = defineExtension({name: 'session probe'}).server(() => ({
    context: {},
    router: sessionOs.router({session: sessionOs.handler(({context}) => rpcHeader(context, CONCIV_SESSION_HEADER))}),
  }))

  type Wire = {httpRpc: number; sockets: number}

  async function engine(root: string, port = 0, agentToken?: string) {
    const made = await makeApp({
      cfg: resolveConfig({}, root),
      cwd: root,
      openInEditor: () => {},
      extensions: [sessionProbe],
      ...(agentToken ? {agentToken} : {}),
    })
    const wire: Wire = {httpRpc: 0, sockets: 0}
    const served = await serveHono({
      port,
      fetch: (request, env) => {
        const {pathname} = new URL(request.url)
        if (pathname === RPC_WS_PATH && request.headers.get('upgrade') === 'websocket') wire.sockets += 1
        if (pathname.startsWith('/rpc/')) wire.httpRpc += 1
        return made.fetch(request, env)
      },
    })
    const stop = async () => {
      await served.close()
      await made.dispose()
    }
    return {made, wire, port: served.port, origin: `http://127.0.0.1:${served.port}`, stop}
  }

  test('an untrusted socket is refused until an auth call on that same socket trusts it, and nothing rides http', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-rpc-ws-'))
    const served = await engine(root)
    const client = makeBrowserRpcClient(served.origin)
    const connection = browserRpcConnection(served.origin)
    try {
      const {trust} = connection
      const {rpc} = client
      await expect(rpc.sessions.list(undefined)).rejects.toMatchObject({status: 401})
      expect(await trust.requestTrust()).toBe(false)
      expect(trust.status()).toBe('untrusted')
      expect(await trust.requestTrustWithToken(served.made.agentToken)).toBe(true)
      expect(await rpc.sessions.list(undefined)).toMatchObject({sessions: []})
      const probes = [() => 'conciv_first', () => 'conciv_second', undefined].map((session) =>
        heldBrowserRpcLink(() => served.origin, session),
      )
      const probe = (held: HeldBrowserRpcLink) =>
        createORPCClient<{ext: {'session-probe': {session: () => Promise<string | null>}}}>(held.link).ext[
          'session-probe'
        ].session()
      expect(await Promise.all(probes.map(probe))).toEqual(['conciv_first', 'conciv_second', null])
      expect(served.wire).toEqual({httpRpc: 0, sockets: 1})
      for (const held of probes) held.release()
    } finally {
      connection.release()
      client.close()
      await served.stop()
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('an open changes stream keeps delivering after the engine restarts on the same port', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-rpc-ws-'))
    const first = await engine(root)
    const token = first.made.trustBrowser(requester, Date.now())
    const votes: boolean[] = []
    const unsubscribe = subscribeRpcReachability(first.origin, (reachable) => votes.push(reachable))
    const restarted: {current: Awaited<ReturnType<typeof engine>> | null} = {current: null}
    const client = makeBrowserRpcClient(first.origin)
    const connection = browserRpcConnection(first.origin)
    try {
      expect(await connection.trust.requestTrustWithToken(token)).toBe(true)
      const changes = await client.rpc.sessions.changes()
      expect((await changes.next()).done).toBe(false)
      await first.stop()
      await vi.waitFor(() => expect(votes.at(-1)).toBe(false), {timeout: 5_000})
      restarted.current = await engine(root, first.port)
      expect((await changes.next()).done).toBe(false)
      expect(votes.at(-1)).toBe(true)
      await changes.return(undefined)
      expect(first.wire).toEqual({httpRpc: 0, sockets: 1})
      expect(restarted.current.wire.httpRpc).toBe(0)
    } finally {
      unsubscribe()
      connection.release()
      client.close()
      await restarted.current?.stop()
      rmSync(root, {recursive: true, force: true})
    }
  }, 20_000)

  test('a socket that closed before its auth call finished is never trusted afterwards', () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-rpc-ws-'))
    const browsers = watchTrustedBrowsers(concivStateDir(root))
    const agentToken = 'conciv-agent-token'
    try {
      const gate = rpcSocketGate(makeConnectionTrust(agentToken, browsers), undefined)
      gate.open(new WSContext({send: () => {}, close: () => {}, readyState: 1}))
      expect(gate.trust.admit(agentToken)).toBe(true)
      expect(gate.trust.allows(['sessions', 'list'])).toBe(true)
      gate.close()
      expect(gate.trust.admit(agentToken)).toBe(false)
      expect(gate.trust.allows(['sessions', 'list'])).toBe(false)
      expect(gate.trust.allows(['auth', 'trust'])).toBe(false)
    } finally {
      browsers.close()
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('each api base keeps its own socket, and one closing client leaves the base open for the others', async () => {
    const [firstRoot, secondRoot] = [
      mkdtempSync(join(tmpdir(), 'conciv-rpc-ws-')),
      mkdtempSync(join(tmpdir(), 'conciv-rpc-ws-')),
    ]
    const first = await engine(firstRoot)
    const second = await engine(secondRoot)
    const firstClient = makeBrowserRpcClient(first.origin)
    const sharingClient = makeBrowserRpcClient(first.origin)
    const secondClient = makeBrowserRpcClient(second.origin)
    const firstLogin = browserRpcConnection(first.origin)
    const secondLogin = browserRpcConnection(second.origin)
    try {
      expect(await firstLogin.trust.requestTrustWithToken(first.made.agentToken)).toBe(true)
      expect(await secondLogin.trust.requestTrustWithToken(second.made.agentToken)).toBe(true)
      expect(await firstClient.rpc.sessions.list(undefined)).toMatchObject({sessions: []})
      expect(await secondClient.rpc.sessions.list(undefined)).toMatchObject({sessions: []})
      expect(await sharingClient.rpc.sessions.list(undefined)).toMatchObject({sessions: []})
      sharingClient.close()
      expect(await firstClient.rpc.sessions.list(undefined)).toMatchObject({sessions: []})
      expect(await secondClient.rpc.sessions.list(undefined)).toMatchObject({sessions: []})
      expect([first.wire, second.wire]).toEqual([
        {httpRpc: 0, sockets: 1},
        {httpRpc: 0, sockets: 1},
      ])
    } finally {
      firstLogin.release()
      secondLogin.release()
      firstClient.close()
      secondClient.close()
      await first.stop()
      await second.stop()
      rmSync(firstRoot, {recursive: true, force: true})
      rmSync(secondRoot, {recursive: true, force: true})
    }
  }, 20_000)

  test('a trust observer keeps hearing its base after the last client released it and a new client opened', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-rpc-ws-'))
    const served = await engine(root)
    const observer = browserRpcConnection(served.origin)
    const heard: TrustStatus[] = []
    const stopObserving = observer.trust.subscribe((status) => heard.push(status))
    const first = makeBrowserRpcClient(served.origin)
    const second = makeBrowserRpcClient(served.origin)
    try {
      await expect(first.rpc.sessions.list(undefined)).rejects.toMatchObject({status: 401})
      first.close()
      await expect(second.rpc.sessions.list(undefined)).rejects.toMatchObject({status: 401})
      const login = browserRpcConnection(served.origin)
      expect(await login.trust.requestTrustWithToken(served.made.agentToken)).toBe(true)
      login.release()
      expect(heard).toEqual(['trusted'])
      expect(await second.rpc.sessions.list(undefined)).toMatchObject({sessions: []})
    } finally {
      stopObserving()
      observer.release()
      second.close()
      await served.stop()
      rmSync(root, {recursive: true, force: true})
    }
  })

  test('a revoked token closes the socket and the next call opens a fresh untrusted one', async () => {
    const root = mkdtempSync(join(tmpdir(), 'conciv-rpc-ws-'))
    const served = await engine(root)
    const {trust, release} = browserRpcConnection(served.origin)
    try {
      expect(await trust.requestTrustWithToken(served.made.trustBrowser(requester, Date.now()))).toBe(true)
      revokeBrowsers(concivStateDir(root), 'all')
      await vi.waitFor(() => expect(trust.status()).toBe('revoked'), {timeout: 5_000})
      expect(await trust.requestTrust()).toBe(false)
      expect(trust.status()).toBe('untrusted')
      expect(served.wire).toEqual({httpRpc: 0, sockets: 2})
    } finally {
      release()
      await served.stop()
      rmSync(root, {recursive: true, force: true})
    }
  }, 20_000)
})

describe('settings storage', () => {
  const pretty = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`
  const fileText = (path: string) => (existsSync(path) ? readFileSync(path, 'utf8') : null)
  const fileBecomes = (path: string, text: string) =>
    vi.waitFor(() => expect(fileText(path)).toBe(text), {timeout: 5_000})
  async function valueBecomes<T extends object>(store: SettingsStore<T>, expected: Partial<T>) {
    const reached = Promise.withResolvers<void>()
    const unsubscribe = await store.onChange((value) => {
      if (isEqual(value, expected)) reached.resolve()
    })
    return {reached: reached.promise.finally(unsubscribe)}
  }

  async function bootSettings(
    root: string,
    home: string,
    namespace: string,
    fixed: {agentToken?: string; port?: number} = {},
  ) {
    const scopes: ((name: string) => ExtensionScope<string>)[] = []
    const probe = defineExtension({name: 'settings probe'}).server((api) => {
      scopes.push(api.scope)
      return {context: {}}
    })
    const {made, origin, stop} = await serveCore(root, [probe], {home, agentToken: fixed.agentToken}, fixed.port)
    const scope = scopes[0]
    if (scope === undefined) throw new Error('the probe extension did not mount')
    return {scope, server: scope(namespace).settings, rpc: makeRpcClient(`${origin}/t/${made.agentToken}`), stop}
  }

  test('the server store, the rpc client store and a second subscriber share one debounced file per scope', async () => {
    const [root, home] = [tempDir(), tempDir()]
    const projectFolder = join(root, '.conciv', 'settings')
    const globalFolder = join(home, 'settings')
    mkdirSync(projectFolder, {recursive: true})
    mkdirSync(globalFolder, {recursive: true})
    const engine = await bootSettings(root, home, 'probe')
    const stream = new AbortController()
    try {
      type Probe = {theme: string; size: number; tags: string[]}
      const client = createClientSettings<Probe>(engine.rpc, 'probe', stream.signal)
      const project = {scope: 'project', namespace: 'probe'} as const
      const subscriber = await engine.rpc.settings.changes(project, {signal: stream.signal})
      expect((await subscriber.next()).value).toMatchObject({value: {}})
      const heard: unknown[] = []
      const unsubscribe = await client.project.onChange((value) => heard.push(value))
      const full = {theme: 'dark', size: 3, tags: ['a']}
      const projectFile = join(projectFolder, 'probe.json')
      const mirrored = await valueBecomes(client.project, full)
      await Promise.all([
        engine.server.project.set('theme', 'dark'),
        engine.server.project.set('size', 3),
        engine.server.project.set('tags', ['a']),
      ])
      expect(existsSync(projectFile)).toBe(false)
      await mirrored.reached
      expect(await client.project.all()).toEqual(full)
      expect(await client.project.get('size')).toBe(3)
      expect((await subscriber.next()).value).toMatchObject({value: {theme: 'dark'}})
      await fileBecomes(projectFile, pretty(full))
      expect(readdirSync(projectFolder)).toEqual(['probe.json'])
      const globalFile = join(globalFolder, 'probe.json')
      await client.project.delete('size')
      expect(await engine.server.project.get('size')).toBeUndefined()
      await client.global.set('theme', 'light')
      expect(await engine.server.global.all()).toEqual({theme: 'light'})
      await fileBecomes(projectFile, pretty({theme: 'dark', tags: ['a']}))
      await fileBecomes(globalFile, pretty({theme: 'light'}))
      expect(heard).toContainEqual(full)
      expect(heard.at(-1)).toEqual({theme: 'dark', tags: ['a']})
      unsubscribe()
      const blue = await valueBecomes(client.project, {theme: 'blue', tags: ['a']})
      await engine.server.project.set('theme', 'blue')
      await blue.reached
      expect(await client.project.get('theme')).toBe('blue')
      expect(heard.at(-1)).toEqual({theme: 'dark', tags: ['a']})
    } finally {
      stream.abort()
      await engine.stop()
    }
  })

  test('a browser client keeps following a scope across an engine restart longer than the one-shot retry budget', async () => {
    const [root, home] = [tempDir(), tempDir()]
    const fixed = {agentToken: randomUUID(), port: await getPort()}
    const project = {scope: 'project', namespace: 'probe'} as const
    const first = await bootSettings(root, home, 'probe', fixed)
    const browser = makeBrowserRpcClient(`http://127.0.0.1:${fixed.port}/t/${fixed.agentToken}`)
    const stream = new AbortController()
    const engines = {running: first}
    try {
      const client = createClientSettings<{theme: string; size: number}>(browser.rpc, 'probe', stream.signal)
      const saved = await valueBecomes(client.project, {theme: 'dark', size: 3})
      const restarted = await valueBecomes(client.project, {theme: 'light', size: 3})
      await first.server.project.set('theme', 'dark')
      await first.server.project.set('size', 3)
      await saved.reached
      const before = await first.rpc.settings.all(project)
      expect(before).toMatchObject({version: 2})
      await first.stop()
      await wait(4000)
      const second = await bootSettings(root, home, 'probe', fixed)
      engines.running = second
      const after = await second.rpc.settings.all(project)
      expect(after).toMatchObject({version: 0, value: {theme: 'dark', size: 3}})
      expect(after.generation).not.toBe(before.generation)
      await second.server.project.set('theme', 'light')
      await restarted.reached
      expect(await client.project.all()).toEqual({theme: 'light', size: 3})
    } finally {
      stream.abort()
      browser.close()
      await engines.running.stop()
    }
  }, 30_000)

  test('saved settings survive a restart, a corrupt file starts empty, and a namespace outside the folder is refused', async () => {
    const [root, home] = [tempDir(), tempDir()]
    const folder = join(root, '.conciv', 'settings')
    mkdirSync(folder, {recursive: true})
    writeFileSync(join(folder, 'saved.json'), '{"__proto__": {"polluted": true}, "theme": "dark"}')
    writeFileSync(join(folder, 'broken.json'), '{not json')
    const first = await bootSettings(root, home, 'saved')
    await first.server.global.set('size', 4)
    await first.stop()
    const engine = await bootSettings(root, home, 'saved')
    try {
      expect(await engine.server.global.all()).toEqual({size: 4})
      expect(await engine.server.project.all()).toEqual({theme: 'dark'})
      expect(Object.getPrototypeOf(await engine.server.project.all())).toBe(Object.prototype)
      expect(await engine.server.project.get('__proto__')).toBeUndefined()
      expect(await engine.server.global.get('constructor')).toBeUndefined()
      const broken = {scope: 'project', namespace: 'broken'} as const
      expect(await engine.rpc.settings.all(broken)).toMatchObject({value: {}})
      expect(fileText(join(folder, 'broken.json'))).toBe('{not json')
      await engine.rpc.settings.set({...broken, key: 'fixed', value: true})
      await fileBecomes(join(folder, 'broken.json'), pretty({fixed: true}))
      const refusal = (pattern: RegExp) => ({
        code: 'BAD_REQUEST',
        data: {issues: [expect.objectContaining({message: expect.stringMatching(pattern)})]},
      })
      expect(
        await engine.rpc.settings.set({scope: 'project', namespace: 'release..prefs', key: 'on', value: true}),
      ).toMatchObject({value: {on: true}})
      await expect(engine.rpc.settings.all({scope: 'project', namespace: 'acme/editor'})).rejects.toMatchObject(
        refusal(/settings folder/),
      )
      await expect(engine.rpc.settings.all({scope: 'project', namespace: '../escape'})).rejects.toMatchObject(
        refusal(/settings folder/),
      )
      await expect(engine.rpc.settings.all({scope: 'global', namespace: 'nul\0name'})).rejects.toMatchObject(
        refusal(/NUL/),
      )
      await expect(engine.scope('../../escape').settings.project.set('theme', 'dark')).rejects.toThrow(
        /settings folder/,
      )
      expect(existsSync(join(root, 'escape.json'))).toBe(false)
    } finally {
      await engine.stop()
    }
  })
})

describe('plugin host bus', () => {
  test('deleting a session delivers one session.deleted event to a bus subscriber', async () => {
    const served = await serveCore(tempDir(), [], {})
    try {
      const rpc = makeRpcClient(`${served.origin}/t/${served.made.agentToken}`)
      const {sessionId} = await rpc.sessions.create(undefined)
      const heard: {type: string; data: unknown}[] = []
      await served.made.pluginHost.runPromise(
        Bus.Service.use((bus) => bus.listen((event) => Effect.sync(() => heard.push(event)))),
      )
      await rpc.sessions.delete({sessionId})
      expect(heard.filter((event) => event.type === SessionEvent.Deleted.type)).toEqual([
        expect.objectContaining({data: {sessionID: sessionId}}),
      ])
    } finally {
      await served.stop()
    }
  })
})

describe('plugin rpc over the socket', () => {
  const Acme = Rpc.define({
    id: 'acme',
    methods: {
      search: {
        input: Schema.Struct({query: Schema.String}),
        output: Schema.Struct({hits: Schema.Array(Schema.String)}),
        errors: {limited: Schema.Struct({retryAfter: Schema.Number})},
      },
      explode: {input: Schema.Undefined, output: Schema.String},
      malformed: {input: Schema.Undefined, output: Schema.String.check(Schema.isMinLength(3))},
    },
    events: {indexed: {schema: Schema.Struct({count: Schema.Number})}},
  })
  const AcmeClient = PluginRpc.define({
    id: 'acme',
    methods: {
      search: {
        input: z.object({query: z.unknown()}),
        output: z.object({hits: z.array(z.string())}),
        errors: {limited: z.object({retryAfter: z.number()})},
      },
      missing: {input: z.undefined(), output: z.string()},
      explode: {input: z.undefined(), output: z.string()},
      malformed: {input: z.undefined(), output: z.string()},
    },
    events: {indexed: {schema: z.object({count: z.number()})}},
  })
  const Nobody = PluginRpc.define({
    id: 'nobody',
    methods: {search: {input: z.object({query: z.string()}), output: z.object({hits: z.array(z.string())})}},
    events: {},
  })

  test('a registered contract answers a socket client, every failure keeps its text, and an event reaches two subscribers', async () => {
    const served = await serveCore(tempDir(), [], {})
    const client = makeBrowserRpcClient(served.origin)
    const connection = browserRpcConnection(served.origin)
    const host = served.made.pluginHost
    try {
      expect(await connection.trust.requestTrustWithToken(served.made.agentToken)).toBe(true)
      const registration = await host.runPromise(
        Rpc.Service.use((rpc) =>
          rpc.register(Acme, {
            search: (input, context) =>
              input.query === 'slow'
                ? Effect.fail(context.error('limited', 'try later', {retryAfter: 5}))
                : Effect.succeed({hits: [input.query]}),
            explode: () => Effect.die(new Error('handler defect')),
            malformed: () => Effect.succeed('ab'),
          }),
        ).pipe(Scope.provide(host.runSync(Scope.make()))),
      )
      const {plugin} = client.rpc
      const opened = Promise.withResolvers<void>()
      const api = makeRpc(plugin.call, async (input, options) => {
        const events = await plugin.events(input, options)
        opened.resolve()
        return events
      })
      const acme = api(AcmeClient)
      expect(await acme.search({query: 'docs'})).toEqual({hits: ['docs']})

      const inProcess = (rpcId: string, method: string, input: unknown) =>
        host.runPromise(Rpc.Service.use((rpc) => rpc.call(rpcId, method, input)).pipe(Effect.flip))
      const failures: [string, string, unknown, string, () => Promise<unknown>][] = [
        ['nobody', 'search', {query: 'docs'}, 'rpc.unavailable', () => api(Nobody).search({query: 'docs'})],
        ['acme', 'missing', undefined, 'rpc.method_not_found', () => acme.missing()],
        ['acme', 'search', {query: 1}, 'rpc.invalid_input', () => acme.search({query: 1})],
        ['acme', 'explode', undefined, 'rpc.internal', () => acme.explode()],
        ['acme', 'malformed', undefined, 'rpc.invalid_output', () => acme.malformed()],
      ]
      for (const [rpcId, method, input, type, call] of failures) {
        const expected = await inProcess(rpcId, method, input)
        expect(expected.type).toBe(type)
        await expect(call()).rejects.toStrictEqual({type, message: expected.message})
      }
      await expect(acme.search({query: 'slow'})).rejects.toStrictEqual({
        type: 'limited',
        message: 'try later',
        data: {retryAfter: 5},
      })

      const typed = acme.events.subscribe('indexed')[Symbol.asyncIterator]()
      const typedNext = typed.next()
      const all = await plugin.events({rpcId: 'acme'})
      await opened.promise
      await host.runPromise(registration.events.emit('indexed', {count: 3}))
      const indexed = {done: false, value: expect.objectContaining({type: 'rpc.acme.indexed', data: {count: 3}})}
      expect(await Promise.all([typedNext, all.next()])).toEqual([indexed, indexed])
      await typed.return?.()
      await all.return()
    } finally {
      connection.release()
      client.close()
      await served.stop()
    }
  })
})

describe('plugin permission cards', () => {
  async function readNextEvent<T>(events: AsyncGenerator<ChatEvent>, pick: (event: ChatEvent) => T | null): Promise<T> {
    const next = await events.next()
    if (next.done) throw new Error('the session stream ended before the expected event')
    return pick(next.value) ?? readNextEvent(events, pick)
  }

  it('a plugin tool asks once on every client, an answer settles it without a turn, a gone request is cleared on click, another session cannot answer, session rules allow and hide, and a restart sweeps permission cards', async () => {
    const fixture = await makeChatFixture()
    const {plane, runtime, db, sessionId: id, stateRoot} = fixture
    const other = SessionId.parse('conciv_other')
    await ensureRow(db, other, fixture.harness.id, stateRoot)
    const host = ManagedRuntime.make(
      Layer.mergeAll(Tool.layer, Permission.layer).pipe(
        Layer.provideMerge(Layer.mergeAll(Agent.layer, PermissionSaved.layer, permissionSessions(db))),
        Layer.provideMerge(PluginHooks.layer),
        Layer.provideMerge(Bus.configured()),
        Layer.provideMerge(
          Layer.succeed(
            Location.Service,
            Location.Service.of(
              Schema.decodeSync(Location.Info)({
                directory: stateRoot,
                project: {id: stateRoot, directory: stateRoot, canonical: stateRoot},
              }),
            ),
          ),
        ),
        Layer.provideMerge(Database.layer({path: db.$client.location() ?? ':memory:'})),
      ),
    )
    const clients = new AbortController()
    onTestFinished(async () => {
      clients.abort()
      await host.dispose()
      await fixture.dispose()
    })
    await host.context()
    const logged: string[] = []
    const scope = host.runSync(Scope.make())
    await host.runPromise(
      followPermissionCards({
        plane,
        publish: (sessionId, chunk) => runtime.forSession(sessionId).stream.publish(chunk),
        log: (line) => logged.push(line),
      }),
    )
    await host.runPromise(
      Effect.gen(function* () {
        const tools = yield* Tool.Service
        const permission = yield* Permission.Service
        yield* tools.transform((editor) => {
          editor.add({
            name: 'unit_read_env',
            description: 'Read an env file.',
            input: z.object({file: z.string()}),
            execute: (input: {file: string}, context) =>
              permission
                .assert({
                  ...Permission.invocation(context),
                  action: 'read',
                  resources: [input.file],
                  save: [input.file],
                  metadata: {file: input.file},
                })
                .pipe(Effect.orDie, Effect.as({content: `read ${input.file}`})),
          })
        })
      }).pipe(Scope.provide(scope)),
    )
    const buildCapabilities = (sessionId: SessionId) =>
      toolDomainCapabilities(
        [],
        host.runSync(sessionSnapshot(sessionId)),
        (effect, signal) => host.runPromiseExit(effect, {signal}),
        () => undefined,
      )
    const [readEnv] = buildCapabilities(id)
    const call = (sessionId: SessionId, file: string) =>
      readEnv?.execute({file}, {sessionId, agentId: sessionId, model: null, toolCallId: randomUUID()})
    const answer = (sessionId: SessionId, requestId: string, reply: Permission.Reply) =>
      host.runPromise(answerPermission(sessionId, requestId, reply))
    const publish = (sessionId: SessionId, chunk: ChatEvent) => runtime.forSession(sessionId).stream.publish(chunk)
    const decide = (sessionId: SessionId, approvalId: string, approved: boolean, lasting: 'once' | 'session') =>
      decidePermissionCard({plane, answer, publish}, sessionId, {approvalId, approved, scope: lasting})
    const first = runtime.forSession(id).stream.events(clients.signal)
    const second = runtime.forSession(id).stream.events(clients.signal)

    const reading = call(id, 'src/.env')
    const shown = await readNextEvent(first, readApprovalAsk)
    expect(shown).toMatchObject({toolName: 'read src/.env', input: {file: 'src/.env'}, permission: {always: true}})
    expect(shown.approvalId).toMatch(/^per/)
    expect(shown.toolCallId).toBe(shown.approvalId)
    expect(await readNextEvent(second, readApprovalAsk)).toEqual(shown)
    expect((await plane.hydrate(id)).pendingApprovals).toEqual([
      {
        approvalId: shown.approvalId,
        toolCallId: shown.approvalId,
        toolName: 'read src/.env',
        input: {file: 'src/.env'},
        runId: null,
        permission: {always: true},
      },
    ])

    expect(await decide(id, shown.approvalId, true, 'session')).toEqual({startsTurn: false})
    await expect(reading).resolves.toBe('read src/.env')
    expect(await readNextEvent(second, readApprovalSettled)).toBe(shown.approvalId)
    expect((await plane.hydrate(id)).pendingApprovals).toEqual([])
    expect(await plane.decide(id, shown.approvalId, true, 'once')).toBeNull()
    await expect(call(id, 'src/.env')).resolves.toBe('read src/.env')

    const foreign = call(other, 'other/.env')
    const otherAsk = await readNextEvent(runtime.forSession(other).stream.events(clients.signal), readApprovalAsk)
    expect(await answer(id, otherAsk.approvalId, 'once')).toBe('foreign')
    expect(await decide(id, otherAsk.approvalId, true, 'once')).toBeNull()
    expect(await decide(other, otherAsk.approvalId, false, 'once')).toEqual({startsTurn: false})
    await expect(foreign).rejects.toThrow()

    await setPermissions(db, other, [{action: 'read', resource: '*', effect: 'allow'}])
    await expect(call(other, 'other/.env')).resolves.toBe('read other/.env')
    await setPermissions(db, other, [{action: 'unit_read_env', resource: '*', effect: 'deny'}])
    expect(buildCapabilities(other)).toEqual([])
    expect(buildCapabilities(id).map((capability) => capability.name)).toEqual(['unit_read_env'])

    await plane.permissionAsked(id, {
      approvalId: 'per_gone',
      toolCallId: 'per_gone',
      title: 'read gone',
      input: {},
      permission: {always: false},
    })
    expect(await decide(id, 'per_gone', true, 'once')).toBeNull()
    expect(await readNextEvent(second, readApprovalSettled)).toBe('per_gone')
    expect((await plane.hydrate(id)).pendingApprovals).toEqual([])

    await plane.permissionAsked(id, {
      approvalId: 'per_left',
      toolCallId: 'per_left',
      title: 'read left',
      input: {},
      permission: {always: false},
    })
    expect(
      await plane.admitCall(id, {
        toolName: 'unit_kept',
        input: {},
        publish: () => undefined,
        until: AbortSignal.abort(),
      }),
    ).toMatchObject({reason: 'asked'})
    const restarted = await bootMadeApp({stateRoot, cwd: stateRoot, harness: fixture.harness, print: () => {}})
    onTestFinished(() => restarted.dispose())
    expect((await restarted.plane.hydrate(id)).pendingApprovals.map((entry) => entry.toolName)).toEqual(['unit_kept'])
    expect(logged).toEqual([])
  })
})

describe('direct tools on the MCP surface', () => {
  const ToolsListed = z.object({result: z.object({tools: z.array(z.object({name: z.string()}))})})
  const ToolsDescribed = z.object({
    result: z.object({tools: z.array(z.object({name: z.string(), description: z.string()}))}),
  })
  const ToolCalled = z.object({
    result: z.object({content: z.array(z.object({text: z.string()})), isError: z.boolean().optional()}),
  })

  it('a codemode false tool is its own MCP tool that runs without an approval card, an outside run keeps it, and a session that denies execute lists every plugin tool directly and no execute tool', async () => {
    const root = tempDir()
    const {made, origin, stop} = await serveCore(root, [], {})
    onTestFinished(stop)
    const id = SessionId.parse('conciv_mcp_direct')
    await ensureRow(made.chat.db, id, made.chat.defaultHarness.id, root)
    const scope = made.pluginHost.runSync(Scope.make())
    await made.pluginHost.runPromise(
      Effect.gen(function* () {
        const tools = yield* Tool.Service
        yield* tools.transform((editor) => {
          editor.add({
            name: 'unit_direct',
            description: 'Echo the text directly.',
            input: z.object({text: z.string()}),
            options: {codemode: false},
            execute: (input: {text: string}) => Effect.succeed({content: `direct ${input.text}`}),
          })
          editor.add({
            name: 'unit_coded',
            description: 'Echo the text in code mode.',
            input: z.object({text: z.string()}),
            execute: (input: {text: string}) => Effect.succeed({content: `coded ${input.text}`}),
          })
        })
      }).pipe(Scope.provide(scope)),
    )
    const post = async (method: string, params: Record<string, unknown>) => {
      const response = await fetch(`${origin}/t/${made.agentToken}/api/mcp`, {
        method: 'POST',
        headers: {
          ...JSON_TYPE,
          accept: 'application/json, text/event-stream',
          [CONCIV_SESSION_HEADER]: id,
        },
        body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}),
      })
      const text = await response.text()
      const data = text.split('\n').find((line) => line.startsWith('data: '))
      return JSON.parse(data === undefined ? text : data.slice('data: '.length))
    }
    const listed = async () => ToolsListed.parse(await post('tools/list', {})).result.tools.map((tool) => tool.name)

    const open = await listed()
    expect(open).toContain('execute_typescript')
    expect(open.filter((name) => name === 'unit_direct')).toEqual(['unit_direct'])
    expect(open).not.toContain('unit_coded')
    const described = ToolsDescribed.parse(await post('tools/list', {})).result.tools
    const execute = described.find((tool) => tool.name === 'execute_typescript')?.description ?? ''
    expect(execute.length).toBeLessThanOrEqual(4096)
    expect(execute).toContain('Rules of the sandbox:')
    expect(execute).toContain('## Code Mode tools (call only inside `execute_typescript`)')
    expect(execute).not.toContain('More capabilities, by name only')
    const searched = ToolCalled.parse(
      await post('tools/call', {
        name: 'execute_typescript',
        arguments: {typescriptCode: 'return search({query: "unit_coded"})'},
      }),
    )
    expect(searched.result.content.map((part) => part.text).join('')).toContain('external_unit_coded')
    const called = ToolCalled.parse(await post('tools/call', {name: 'unit_direct', arguments: {text: 'hi'}}))
    expect(called.result.isError).not.toBe(true)
    expect(called.result.content.map((part) => part.text).join('')).toContain('direct hi')
    expect((await made.plane.hydrate(id)).pendingApprovals).toEqual([])

    const direct: CodeCapability = {
      name: 'unit_kept_direct',
      path: 'unit_kept_direct',
      description: 'Direct.',
      errors: [],
      inputSchema: z.object({}),
      direct: true,
      execute: async () => 'kept',
    }
    const [kept] = outsideRunCapabilities([direct])
    await expect(kept?.execute({}, {sessionId: id, agentId: id, model: null})).resolves.toBe('kept')

    await setPermissions(made.chat.db, id, [{action: 'execute', resource: '*', effect: 'deny'}])
    expect((await listed()).toSorted()).toEqual(['unit_coded', 'unit_direct'])
    const shut = ToolCalled.parse(await post('tools/call', {name: 'unit_coded', arguments: {text: 'shut'}}))
    expect(shut.result.content.map((part) => part.text).join('')).toContain('coded shut')
  })
})
