import {rmSync} from 'node:fs'
import {describe, expect, it, onTestFinished} from 'vitest'
import {drizzleChatStores, quickJSThreadDriver} from '@conciv/ai/server'
import {fakeText} from '@conciv/ai/testkit'
import {eq} from 'drizzle-orm'
import {chatMessages, markers, openDb, sessions as sessionRows, type ConcivDb} from '@conciv/db'
import {defineHarness} from '@conciv/harness'
import {readApprovalAsk, approvalRequestedEvent, ChatEventType, type ChatEvent} from '@conciv/protocol/chat-event-types'
import {HarnessSessionId, SessionId} from '@conciv/protocol/chat-types'
import type {ChatMessage, ContentPart, ModelMessage} from '@conciv/protocol/chat-message-types'
import {SqliteClient} from '@effect/sql-sqlite-node'
import {Effect, Exit, Layer, ManagedRuntime, Schema, Scope} from 'effect'
import {z} from 'zod'
import {
  Agent,
  Bus,
  CodeModeCatalog,
  Database,
  Image,
  Location,
  Permission,
  PermissionSaved,
  PluginHooks,
  Tool,
} from '@conciv/plugin-host'
import {createChatPlane, toolDomainCapabilities, type CodeCapability} from '../src/index.js'
import {tempDir} from '@conciv/vitest-config/temp-dir'

const PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

const model = fakeText()
const answer = model.chatStream.bind(model)
const asking = Object.assign(model, {
  chatStream: async function* (options: Parameters<typeof answer>[0]) {
    yield {
      ...approvalRequestedEvent.create({approvalId: 'per_turn', title: 'turn ask', permission: {always: false}}),
      timestamp: Date.now(),
    }
    yield* answer(options)
  },
})

const harness = defineHarness({
  id: 'fake',
  binName: 'true',
  chatConfig: () => ({adapter: asking}),
  capabilities: {
    resume: false,
    permissionGate: 'none',
    compaction: false,
    systemPrompt: 'file',
    mcp: 'none',
    imageInput: false,
    init: 'none',
    slashCommands: 'none',
    transcriptHistory: false,
  },
})

const NO_EXECUTE: Permission.Ruleset = [{action: 'execute', resource: '*', effect: 'deny'}]

function currentDomain(agent: Agent.Id, rules: Permission.Ruleset = []) {
  return Tool.Service.use((tools) => tools.snapshot(rules)).pipe(Effect.map((snapshot) => ({snapshot, agent})))
}

async function openDatabase() {
  const root = tempDir('conciv-chat-unit-')
  const scope = Scope.makeUnsafe()
  const db = await Effect.runPromise(openDb(root).pipe(Scope.provide(scope)))
  onTestFinished(async () => {
    await Effect.runPromise(Scope.close(scope, Exit.void))
    rmSync(root, {recursive: true, force: true})
  })
  return {root, db}
}

const fakeSessions: Parameters<typeof createChatPlane>[0]['sessions'] = {
  row: async () => ({
    model: null,
    effort: null,
    nativeId: null,
    cwd: '/workspace',
    harnessKind: 'fake',
    deletedAt: null,
  }),
  ensure: async () => undefined,
  recordNativeId: async () => undefined,
  recordUsage: async () => undefined,
  recordContextTokens: async () => undefined,
  recordActivity: async () => undefined,
  onRunStart: async () => undefined,
  publish: () => undefined,
  onRunEnd: async () => undefined,
}

function chatPlane(db: ConcivDb, root: string, overrides: Partial<Parameters<typeof createChatPlane>[0]> = {}) {
  const driver = quickJSThreadDriver({timeout: 10_000, memoryLimit: 64, maxStackSize: 1024 * 1024}, () => undefined)
  onTestFinished(() => driver.dispose())
  return createChatPlane({
    db,
    cwd: root,
    harnessFor: async () => harness,
    systemPrompt: {},
    sessions: fakeSessions,
    toolNames: async () => new Set(),
    capabilities: async () => [],
    attachmentExpanders: {},
    prompt: async (event) => event,
    promptHooked: async () => false,
    context: async (_name, request) => request,
    pluginInstructions: async () => ({initial: '', update: '', told: async () => undefined}),
    log: () => undefined,
    driver,
    ...overrides,
  })
}

describe('permission cards', () => {
  it('a permission card is stored, replayed with its member, kept in order under overlapping writes, and removed without a grant', async () => {
    const {root, db} = await openDatabase()
    const sessionId = SessionId.parse('conciv_cards')
    const plane = await chatPlane(db, root)
    const editId = 'per_edit'
    const pendingIds = async () => (await plane.hydrate(sessionId)).pendingApprovals.map((entry) => entry.approvalId)
    const permissionCard = (approvalId: string, always: boolean) => ({
      approvalId,
      toolCallId: approvalId,
      title: `ask ${approvalId}`,
      input: {approvalId},
      permission: {always},
    })

    await plane.permissionAsked(sessionId, {...permissionCard(editId, true), title: 'edit src/a.ts'})
    expect((await plane.hydrate(sessionId)).pendingApprovals).toEqual([
      {
        approvalId: editId,
        toolCallId: editId,
        toolName: 'edit src/a.ts',
        input: {approvalId: editId},
        runId: null,
        permission: {always: true},
      },
    ])
    expect((await plane.catchUp(sessionId)).map(readApprovalAsk)).toEqual([
      {
        approvalId: editId,
        toolCallId: editId,
        toolName: 'edit src/a.ts',
        input: {approvalId: editId},
        permission: {always: true},
      },
    ])

    await Promise.all([
      plane.permissionAsked(sessionId, permissionCard('per_2', false)),
      plane.permissionAsked(sessionId, permissionCard('per_3', true)),
      plane.permissionSettled(sessionId, editId),
    ])
    expect(await pendingIds()).toEqual(['per_2', 'per_3'])

    await plane.permissionSettled(sessionId, 'per_2')
    expect(await pendingIds()).toEqual(['per_3'])

    model.setResponses([{text: 'done'}])
    await plane.followUp(sessionId, 'go on')
    expect(
      (await plane.hydrate(sessionId)).pendingApprovals.find((entry) => entry.approvalId === 'per_turn'),
    ).toMatchObject({
      toolName: 'turn ask',
      permission: {always: false},
    })
  })
})

describe('plugin tools in code mode', () => {
  it('an empty tool domain changes no list, a plugin tool runs through code mode with its hooks, and a name a built-in capability has is left out', async () => {
    const host = ManagedRuntime.make(
      Tool.layer.pipe(Layer.provideMerge(Layer.mergeAll(PluginHooks.layer, Image.layer))),
    )
    onTestFinished(() => host.dispose())
    const scope = host.runSync(Scope.make())
    const builtin: CodeCapability = {
      name: 'unit_taken',
      path: 'unit_taken',
      description: 'Built in.',
      errors: [],
      inputSchema: z.object({}),
      execute: async () => ({value: 'built in', files: []}),
    }
    const collisions: string[] = []
    const capabilities = (): CodeCapability[] =>
      toolDomainCapabilities(
        [builtin],
        host.runSync(currentDomain(Agent.Id.make('plan'))),
        currentDomain(Agent.Id.make('plan')),
        (effect, signal) => host.runPromiseExit(effect, {signal}),
        (name) => collisions.push(name),
      )
    expect(capabilities()).toEqual([builtin])

    const seen: string[] = []
    await host.runPromise(
      Effect.gen(function* () {
        const tools = yield* Tool.Service
        const hooks = yield* PluginHooks.Service
        yield* tools.transform((editor) => {
          editor.add({
            name: 'unit_shout',
            description: 'Shout the text.',
            input: z.object({text: z.string()}),
            execute: (input: {text: string}, context) =>
              Effect.succeed({content: `${input.text.toUpperCase()} in ${context.sessionId} as ${context.agent}`}),
          })
          editor.add({
            name: 'unit_double',
            description: 'Double the count.',
            input: z.object({
              count: z
                .string()
                .transform(Number)
                .refine(async (count) => count > 0),
            }),
            execute: (input: {count: number}) => Effect.succeed({content: String(input.count * 2)}),
          })
          editor.add({
            name: 'unit_refuse',
            description: 'Refuse every call.',
            input: z.object({}),
            execute: () => Effect.fail(Tool.makeError({message: 'the tool refused'})),
          })
          editor.add({
            name: 'unit_send',
            description: 'Send the draft.',
            input: z.object({}),
            output: z.object({sent: z.boolean()}),
            execute: () => Effect.succeed({output: {sent: true}}),
          })
          editor.add({
            name: 'unit_snap',
            description: 'Snap the page.',
            input: z.object({}),
            execute: () =>
              Effect.succeed({
                content: [
                  {type: 'text', text: 'untrusted page data'},
                  {type: 'file', uri: `data:image/png;base64,${PIXEL_PNG}`, mime: 'image/png', name: 'page.png'},
                  {type: 'file', uri: 'data:application/pdf;base64,JVBERi0=', mime: 'application/pdf'},
                ],
              }),
          })
          editor.add({
            name: 'unit_taken',
            description: 'A plugin copy.',
            input: z.object({}),
            execute: () => Effect.succeed({content: 'plugin'}),
          })
        })
        yield* hooks.register('tool', 'execute.before', (event) =>
          Effect.sync(() => {
            seen.push(`before ${event.tool} ${event.messageId ?? 'without a message'} ${JSON.stringify(event.input)}`)
            if (event.tool === 'unit_shout') event.input = {text: 'changed by a hook'}
          }),
        )
        yield* hooks.register('tool', 'execute.after', (event) =>
          Effect.sync(() => seen.push(`after ${event.tool} ${event.status}`)),
        )
      }).pipe(Scope.provide(scope)),
    )

    const {root, db} = await openDatabase()
    const chat = await chatPlane(db, root, {capabilities: async () => capabilities()})
    const published: ChatEvent[] = []
    const runner = await chat.codeRunner(SessionId.parse('conciv_plugin'), (chunk) => published.push(chunk))
    expect(runner?.code?.capabilities.map((capability) => capability.name)).toEqual([
      'unit_taken',
      'unit_shout',
      'unit_double',
      'unit_refuse',
      'unit_send',
      'unit_snap',
    ])
    await expect(
      runner?.code?.run('return (await search({})).items.map((item) => item.signature)', 'parent'),
    ).resolves.toMatchObject({
      result: [
        'external_unit_double({\n  count: string;\n}): Promise<string | null>',
        'external_unit_refuse(): Promise<string | null>',
        'external_unit_send(): Promise<{\n  sent: boolean;\n}>',
        'external_unit_shout({\n  text: string;\n}): Promise<string | null>',
        'external_unit_snap(): Promise<string | null>',
        'external_unit_taken(): Promise<unknown>',
      ],
    })
    expect(new Set(collisions)).toEqual(new Set(['unit_taken']))
    await expect(runner?.code?.run('return await external_unit_shout({text: "hi"})', 'parent')).resolves.toMatchObject({
      result: 'CHANGED BY A HOOK in conciv_plugin as plan',
    })
    expect(seen).toEqual(['before unit_shout without a message {"text":"hi"}', 'after unit_shout completed'])
    await expect(runner?.code?.run('return await external_unit_double({count: "2"})', 'parent')).resolves.toMatchObject(
      {
        result: '4',
      },
    )
    expect(seen.slice(2)).toEqual(['before unit_double without a message {"count":"2"}', 'after unit_double completed'])
    await expect(runner?.code?.run('return await external_unit_refuse({})', 'parent')).resolves.toMatchObject({
      success: false,
      error: {message: expect.stringContaining('the tool refused')},
    })
    await expect(runner?.code?.run('return await external_unit_taken({})', 'parent')).resolves.toMatchObject({
      result: 'built in',
    })
    const snapFiles = [
      {type: 'image', source: {type: 'data', value: PIXEL_PNG, mimeType: 'image/png'}},
      {type: 'text', content: 'Attached document or image follows.'},
    ]
    await expect(runner?.code?.run('return await external_unit_snap({})', 'parent')).resolves.toEqual({
      success: true,
      result: 'untrusted page data',
      logs: [],
      files: snapFiles,
    })
    const snapCall = published.find(
      (chunk) => chunk.type === ChatEventType.TOOL_CALL_START && chunk.toolCallName === 'unit_snap',
    )
    const snapResult = published.find(
      (chunk) =>
        chunk.type === ChatEventType.TOOL_CALL_RESULT &&
        snapCall?.type === ChatEventType.TOOL_CALL_START &&
        chunk.toolCallId === snapCall.toolCallId,
    )
    const snapContent = snapResult?.type === ChatEventType.TOOL_CALL_RESULT ? snapResult.content : null
    expect(typeof snapContent === 'string' ? JSON.parse(snapContent) : snapContent).toEqual([
      {type: 'text', content: 'untrusted page data'},
      ...snapFiles,
    ])
    await expect(
      runner?.code?.run(
        'await external_unit_snap({}); await external_unit_shout({text: "a"}); return "done"',
        'parent',
      ),
    ).resolves.toMatchObject({success: true, result: 'done', files: snapFiles})
    await expect(
      runner?.code?.run(
        'await external_unit_snap({}); await external_unit_snap({}); throw new Error("boom")',
        'parent',
      ),
    ).resolves.toMatchObject({
      success: false,
      error: {message: expect.stringContaining('boom')},
      files: [...snapFiles, ...snapFiles],
    })
    await expect(runner?.code?.run('return "no files"', 'parent')).resolves.toEqual({
      success: true,
      result: 'no files',
      logs: [],
    })
  })

  it('a tool outside the listed budget is found by search and called through the returned path', async () => {
    const host = ManagedRuntime.make(
      Tool.layer.pipe(Layer.provideMerge(Layer.mergeAll(PluginHooks.layer, Image.layer))),
    )
    onTestFinished(() => host.dispose())
    const scope = host.runSync(Scope.make())
    const helper = (index: number) =>
      `Bulk helper ${index} reads, filters and reshapes the shared demo records for the weekly reporting pages.`
    const target = 'Measure the quasar brightness of one sky region.'
    await host.runPromise(
      Effect.gen(function* () {
        const tools = yield* Tool.Service
        yield* tools.transform((editor) => {
          editor.namespace({name: 'bulk', description: 'Bulk record helpers'})
          Array.from({length: 120}, (_, index) =>
            editor.add({
              name: `helper_${index}`,
              description: helper(index),
              input: z.object({id: z.string()}),
              options: {namespace: 'bulk'},
              execute: (input: {id: string}) => Effect.succeed({content: input.id}),
            }),
          )
          editor.add({
            name: 'zz_quasar',
            description: target,
            input: z.object({region: z.string()}),
            options: {namespace: 'bulk'},
            execute: (input: {region: string}) => Effect.succeed({content: `bright ${input.region}`}),
          })
        })
      }).pipe(Scope.provide(scope)),
    )
    const listed = CodeModeCatalog.summarize({
      tools: [
        {
          type: 'namespace',
          name: 'bulk',
          tools: [
            ...Array.from({length: 120}, (_, index) => ({
              type: 'tool' as const,
              name: `helper_${index}`,
              description: helper(index),
              signature: '',
            })),
            {type: 'tool', name: 'zz_quasar', description: target, signature: ''},
          ],
        },
      ],
    })
    expect(listed.namespaces[0]?.entries.map((entry) => entry.path)).not.toContain('bulk.zz_quasar')

    const capabilities = (): CodeCapability[] =>
      toolDomainCapabilities(
        [],
        host.runSync(currentDomain(Agent.defaultId)),
        currentDomain(Agent.defaultId),
        (effect, signal) => host.runPromiseExit(effect, {signal}),
        () => undefined,
      )
    const {root, db} = await openDatabase()
    const chat = await chatPlane(db, root, {capabilities: async () => capabilities()})
    const runner = await chat.codeRunner(SessionId.parse('conciv_search'), () => undefined)
    await expect(runner?.code?.run('return search({query: "quasar brightness"})', 'parent')).resolves.toMatchObject({
      success: true,
      result: {
        items: [
          {
            path: 'external_bulk_zz_quasar',
            description: target,
            signature: expect.stringContaining('region: string'),
          },
        ],
      },
    })
    await expect(
      runner?.code?.run('return await external_bulk_zz_quasar({region: "north"})', 'parent'),
    ).resolves.toMatchObject({result: 'bright north'})
  })

  it('a nested call in a resent unfinished message stays shown but out of what the model reads next', async () => {
    const {root, db} = await openDatabase()
    const sessionId = SessionId.parse('conciv_nested_history')
    const chat = await chatPlane(db, root)
    const read: ModelMessage[][] = []
    model.setResponses([
      ({request}) => {
        read.push(request.messages)
        return {text: 'read'}
      },
    ])
    await collected(
      chat.send({
        threadId: sessionId,
        runId: 'run-resent',
        messages: [
          {
            id: 'resent-assistant',
            role: 'assistant',
            metadata: {tanstack: {toolCallMetadata: {nested_resent: {parentToolCallId: 'call_resent'}}}},
            toolCalls: [
              {id: 'call_resent', type: 'function', function: {name: 'execute_typescript', arguments: '{}'}},
              {id: 'nested_resent', type: 'function', function: {name: 'unit_snap', arguments: '{}'}},
            ],
          },
          {role: 'tool', id: 'tool-nested_resent', toolCallId: 'nested_resent', content: '"page data"'},
          {role: 'tool', id: 'tool-call_resent', toolCallId: 'call_resent', content: '"snapped"'},
          {id: 'resent-user', role: 'user', content: 'and again'},
        ],
      }),
    )
    expect(
      read[0]?.flatMap((message) => [
        ...(message.toolCalls ?? []).map((call) => call.function.name),
        ...(message.role === 'tool' ? [JSON.stringify(message.content)] : []),
      ]),
    ).toEqual(['execute_typescript', JSON.stringify('"snapped"')])
    expect(
      (await chat.history(sessionId)).flatMap((message) =>
        message.parts.flatMap((part) => (part.type === 'tool-call' ? [part.name] : [])),
      ),
    ).toEqual(['execute_typescript', 'unit_snap'])
  })
})

describe('refusal text', () => {
  const isAsked = Schema.is(Schema.Struct({id: Permission.Id, action: Schema.String}))

  it('a declined call says the user denied the tool, also when a promise tool rethrew the decline, and a blocked or corrected call says its own message', async () => {
    const {root, db} = await openDatabase()
    const sessions = Layer.succeed(
      Permission.PermissionSessions,
      Permission.PermissionSessions.of({
        get: () =>
          Effect.succeed({
            agent: Agent.defaultId,
            permissions: [
              {action: 'refused', resource: '*', effect: 'deny'},
              {action: 'asked', resource: '*', effect: 'ask'},
              {action: 'corrected', resource: '*', effect: 'ask'},
            ],
          }),
      }),
    )
    const host = ManagedRuntime.make(
      Layer.mergeAll(Tool.layer, Permission.layer).pipe(
        Layer.provideMerge(Layer.mergeAll(Agent.layer, PermissionSaved.layer, sessions)),
        Layer.provideMerge(Layer.mergeAll(PluginHooks.layer, Image.layer)),
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
        Layer.provideMerge(Database.configuredClient(Layer.succeed(SqliteClient.SqliteClient, db.$client))),
      ),
    )
    onTestFinished(() => host.dispose())
    await host.context()
    const scope = host.runSync(Scope.make())
    await host.runPromise(
      Effect.gen(function* () {
        const tools = yield* Tool.Service
        const permission = yield* Permission.Service
        const bus = yield* Bus.Service
        yield* bus.listen((event) => {
          if (event.type !== Permission.Event.Asked.type || !isAsked(event.data)) return Effect.void
          const message = event.data.action === 'corrected' ? {message: 'read the example file instead'} : {}
          return permission.reply({requestId: event.data.id, reply: 'reject', ...message}).pipe(Effect.ignore)
        })
        yield* tools.transform((editor) => {
          editor.add({
            name: 'unit_guarded',
            description: 'Assert a permission.',
            input: z.object({action: z.string()}),
            execute: (input: {action: string}, context) =>
              permission
                .assert({...Permission.invocation(context), action: input.action, resources: ['src/.env']})
                .pipe(Effect.orDie, Effect.as({content: 'ran'})),
          })
          editor.add({
            name: 'unit_promised',
            description: 'Assert a permission from a promise and wrap what it rejects with.',
            input: z.object({action: z.string()}),
            execute: (input: {action: string}, context) =>
              Effect.tryPromise({
                try: () =>
                  host.runPromise(
                    permission.assert({
                      ...Permission.invocation(context),
                      action: input.action,
                      resources: ['src/.env'],
                    }),
                  ),
                catch: (error) =>
                  Tool.makeError({message: error instanceof Error ? error.message : String(error), error}),
              }).pipe(Effect.as({content: 'ran'})),
          })
          editor.add({
            name: 'unit_wrapped',
            description: 'Assert a permission and wrap its failure.',
            input: z.object({action: z.string()}),
            execute: (input: {action: string}, context) => {
              if (input.action === 'missing')
                return Effect.fail(Tool.makeError({message: 'Unable to load skill missing'}))
              const asserted: Effect.Effect<void, unknown> =
                input.action === 'empty'
                  ? Effect.fail(new Error(''))
                  : permission.assert({
                      ...Permission.invocation(context),
                      action: input.action,
                      resources: ['src/.env'],
                    })
              return asserted.pipe(
                Effect.mapError((error) => Tool.makeError({message: `Unable to load skill ${input.action}`, error})),
                Effect.as({content: 'ran'}),
              )
            },
          })
        })
      }).pipe(Scope.provide(scope)),
    )
    const [guarded, promised, wrapped] = toolDomainCapabilities(
      [],
      host.runSync(currentDomain(Agent.defaultId)),
      currentDomain(Agent.defaultId),
      (effect, signal) => host.runPromiseExit(effect, {signal}),
      () => undefined,
    )
    const request = (action: string) => ({
      sessionId: SessionId.parse('conciv_refusal'),
      agentId: 'conciv_refusal',
      model: null,
      toolCallId: action,
    })
    const call = (action: string) => guarded?.execute({action}, request(action))

    await expect(call('asked')).rejects.toThrow(
      'The user denied running tool "unit_guarded". Do not retry it; continue without it.',
    )
    await expect(call('refused')).rejects.toThrow('Permission denied: refused')
    await expect(call('corrected')).rejects.toThrow('read the example file instead')
    expect(promised?.name).toBe('unit_promised')
    await expect(promised?.execute({action: 'asked'}, request('promised-asked'))).rejects.toThrow(
      'The user denied running tool "unit_promised". Do not retry it; continue without it.',
    )
    await expect(promised?.execute({action: 'corrected'}, request('promised-corrected'))).rejects.toMatchObject({
      type: 'permission.rejected',
      message: 'read the example file instead',
    })
    expect(wrapped?.name).toBe('unit_wrapped')
    await expect(wrapped?.execute({action: 'missing'}, request('wrapped-missing'))).rejects.toMatchObject({
      type: 'tool.execution',
      message: 'Unable to load skill missing',
    })
    await expect(wrapped?.execute({action: 'refused'}, request('wrapped-refused'))).rejects.toMatchObject({
      type: 'permission.rejected',
      message: 'Permission denied: refused',
    })
    await expect(wrapped?.execute({action: 'corrected'}, request('wrapped-corrected'))).rejects.toMatchObject({
      type: 'permission.rejected',
      message: 'read the example file instead',
    })
    await expect(wrapped?.execute({action: 'empty'}, request('wrapped-empty'))).rejects.toMatchObject({
      type: 'tool.execution',
      message: 'Unable to load skill empty',
    })
  })
})

describe('direct tools', () => {
  it('a codemode false tool reaches the turn and the runner as its own tool, and a session that denies execute gets every plugin tool directly and no code mode', async () => {
    const host = ManagedRuntime.make(
      Tool.layer.pipe(Layer.provideMerge(Layer.mergeAll(PluginHooks.layer, Image.layer))),
    )
    onTestFinished(() => host.dispose())
    const scope = host.runSync(Scope.make())
    const ran: string[] = []
    await host.runPromise(
      Effect.gen(function* () {
        const tools = yield* Tool.Service
        yield* tools.transform((editor) => {
          editor.add({
            name: 'unit_direct',
            description: 'Echo the text directly.',
            input: z.object({text: z.string()}),
            options: {codemode: false},
            execute: (input: {text: string}, context) =>
              Effect.sync(() => {
                ran.push(`unit_direct ${input.text} ${context.sessionId}`)
                return {content: `direct ${input.text}`}
              }),
          })
          editor.add({
            name: 'unit_direct_snap',
            description: 'Snap the page directly.',
            input: z.object({}),
            options: {codemode: false},
            execute: (_input, context) =>
              Effect.succeed({
                content: [
                  {type: 'text', text: `untrusted page data for ${context.agent}`},
                  {type: 'file', uri: `data:image/png;base64,${PIXEL_PNG}`, mime: 'image/png'},
                ],
              }),
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
    const builtin: CodeCapability = {
      name: 'unit_builtin',
      path: 'unit_builtin',
      description: 'Built in.',
      errors: [],
      inputSchema: z.object({}),
      execute: async () => ({value: 'built in', files: []}),
    }
    const shared = SessionId.parse('conciv_direct')
    const closed = SessionId.parse('conciv_no_execute')
    const capabilities = (sessionId: SessionId): CodeCapability[] =>
      toolDomainCapabilities(
        [builtin],
        host.runSync(currentDomain(Agent.Id.make('plan'), sessionId === closed ? NO_EXECUTE : [])),
        currentDomain(Agent.Id.make('plan'), sessionId === closed ? NO_EXECUTE : []),
        (effect, signal) => host.runPromiseExit(effect, {signal}),
        () => undefined,
      )
    const names = (list: readonly {name: string}[] | undefined) => list?.map((entry) => entry.name)

    expect(capabilities(shared).map(({name, direct}) => ({name, direct}))).toEqual([
      {name: 'unit_builtin', direct: undefined},
      {name: 'unit_coded', direct: undefined},
      {name: 'unit_direct', direct: true},
      {name: 'unit_direct_snap', direct: true},
    ])
    const {root, db} = await openDatabase()
    const chat = await chatPlane(db, root, {capabilities: async (sessionId) => capabilities(sessionId)})
    const runner = await chat.codeRunner(shared, () => undefined)
    expect(names(runner?.code?.capabilities)).toEqual(['unit_builtin', 'unit_coded'])
    expect(names(runner?.direct)).toEqual(['unit_direct', 'unit_direct_snap'])
    await expect(runner?.direct[0]?.run({text: 'hi'}, 'parent')).resolves.toBe('direct hi')
    await expect(runner?.direct[1]?.run({}, 'parent')).resolves.toEqual([
      {type: 'text', content: 'untrusted page data for plan'},
      {type: 'image', source: {type: 'data', value: PIXEL_PNG, mimeType: 'image/png'}},
    ])
    expect(ran).toEqual(['unit_direct hi conciv_direct'])

    const offered: string[][] = []
    model.setResponses([
      ({request}) => {
        offered.push(names(request.tools) ?? [])
        return {
          toolCalls: [{name: 'unit_direct', input: {text: 'turn'}, id: 'call_direct'}],
          finishReason: 'tool_calls',
        }
      },
      {text: 'done'},
    ])
    await chat.followUp(shared, 'call it')
    expect(offered[0]?.filter((name) => name === 'unit_direct')).toEqual(['unit_direct'])
    expect(offered[0]).not.toContain('unit_coded')
    expect(ran).toEqual(['unit_direct hi conciv_direct', 'unit_direct turn conciv_direct'])
    expect((await chat.hydrate(shared)).pendingApprovals.map((entry) => entry.toolName)).toEqual(['turn ask'])

    expect(capabilities(closed).map(({name, direct}) => ({name, direct}))).toEqual([
      {name: 'unit_coded', direct: true},
      {name: 'unit_direct', direct: true},
      {name: 'unit_direct_snap', direct: true},
    ])
    const closedRunner = await chat.codeRunner(closed, () => undefined)
    expect(closedRunner?.code).toBeNull()
    expect(names(closedRunner?.direct)).toEqual(['unit_coded', 'unit_direct', 'unit_direct_snap'])
    await expect(closedRunner?.direct[0]?.run({text: 'shut'}, 'parent')).resolves.toBe('coded shut')
  })
})

describe('plugin instructions', () => {
  it('the initial text is one more system prompt and an empty one adds none, the change text goes once in front of the user words, and the code-mode inventory reaches the instructions in place of the library listing', async () => {
    const {root, db} = await openDatabase()
    const sessionId = SessionId.parse('conciv_instructions')
    const settled = async () => undefined
    const told = [
      {initial: 'the skill list', update: 'a skill was added', told: settled},
      {initial: '', update: '', told: settled},
    ]
    const note: CodeCapability = {
      name: 'unit_note',
      path: 'unit_note',
      description: 'Note the text.',
      errors: [],
      inputSchema: z.object({text: z.string()}),
      execute: async () => ({value: 'noted', files: []}),
    }
    const inventories: (CodeModeCatalog.Inventory | undefined)[] = []
    const chat = await chatPlane(db, root, {
      systemPrompt: {systemPromptText: 'the base prompt'},
      capabilities: async () => [note],
      pluginInstructions: async (_sessionId, _reset, inventory) => {
        inventories.push(inventory)
        return told.shift() ?? {initial: '', update: '', told: settled}
      },
    })
    const preface = expect.stringContaining('Use `console.log()` for debugging (logs are captured)')
    const sent: {systemPrompts: unknown[]; messages: ModelMessage[]}[] = []
    const recorded = ({request}: {request: {systemPrompts?: readonly unknown[]; messages: ModelMessage[]}}) => {
      sent.push({systemPrompts: [...(request.systemPrompts ?? [])], messages: request.messages})
      return {text: 'done'}
    }
    const lastUserContent = (index: number) =>
      sent[index]?.messages.findLast((message) => message.role === 'user')?.content

    model.setResponses([recorded])
    await chat.followUp(sessionId, 'look around')
    expect(sent[0]?.systemPrompts).toEqual(['the base prompt', 'the skill list', preface])
    expect(JSON.stringify(sent[0]?.systemPrompts)).not.toContain('external_unit_note')
    expect(inventories).toHaveLength(1)
    expect(CodeModeCatalog.summarize(inventories[0] ?? {tools: []}).namespaces).toEqual([
      {
        name: 'unit_note',
        tools: ['unit_note'],
        entries: [
          {
            path: 'unit_note',
            line: '  - external_unit_note({\n  text: string;\n}): Promise<unknown> // Note the text.',
          },
        ],
      },
    ])
    expect(lastUserContent(0)).toEqual([
      {type: 'text', content: 'a skill was added\n\n'},
      {type: 'text', content: 'look around'},
    ])
    expect(JSON.stringify(sent[0]?.messages).split('a skill was added')).toHaveLength(2)

    model.setResponses([recorded])
    await chat.followUp(sessionId, 'and again')
    expect(sent[1]?.systemPrompts).toEqual(['the base prompt', preface])
    expect(lastUserContent(1)).toBe('and again')
    expect(JSON.stringify(sent[1]?.messages)).not.toContain('a skill was added')
  })
})

describe('the session prompt hook', () => {
  it('a turn with no prompt hook never reaches the hook service, and a registered hook rewrites the words the model gets', async () => {
    const host = ManagedRuntime.make(PluginHooks.layer)
    onTestFinished(() => host.dispose())
    const scope = host.runSync(Scope.make())
    const triggered: string[] = []
    const {root, db} = await openDatabase()
    const sessionId = SessionId.parse('conciv_prompt_hook')
    const chat = await chatPlane(db, root, {
      prompt: (event) => {
        triggered.push(event.prompt.text)
        return host.runPromise(PluginHooks.Service.use((hooks) => hooks.trigger('session', 'prompt', event)))
      },
      promptHooked: () => host.runPromise(PluginHooks.Service.use((hooks) => hooks.has('session', 'prompt'))),
    })
    const sent: unknown[] = []
    const recorded = ({request}: {request: {messages: ModelMessage[]}}) => {
      sent.push(request.messages.findLast((message) => message.role === 'user')?.content)
      return {text: 'done'}
    }
    const say = async (runId: string, text: string) => {
      await collected(
        chat.send({threadId: sessionId, runId, messages: [{id: `${runId}-user`, role: 'user', content: text}]}),
      )
    }

    model.setResponses([recorded])
    await say('run-plain', 'plain words')
    expect(triggered).toEqual([])
    expect(sent).toEqual(['plain words'])

    await host.runPromise(
      PluginHooks.Service.use((hooks) =>
        hooks.register('session', 'prompt', (event) =>
          Effect.sync(() => {
            event.prompt.text += ' rewritten'
          }),
        ),
      ).pipe(Scope.provide(scope)),
    )
    model.setResponses([recorded])
    await say('run-hooked', 'hooked words')
    expect(triggered).toEqual(['hooked words'])
    expect(sent).toEqual(['plain words', [{type: 'text', content: 'hooked words rewritten'}]])
  })
})

describe('text parts keep their own paragraph', () => {
  it('the instructions update and the attached text file reach the model as separate paragraphs', async () => {
    const {root, db} = await openDatabase()
    const sessionId = SessionId.parse('conciv_text_parts')
    const chat = await chatPlane(db, root, {
      pluginInstructions: async () => ({initial: '', update: 'a skill was added', told: async () => undefined}),
    })
    const prompts: string[] = []
    model.setResponses([
      ({request}: {request: {messages: ModelMessage[]}}) => {
        const content = request.messages.findLast((message) => message.role === 'user')?.content
        prompts.push(
          typeof content === 'string'
            ? content
            : (content ?? []).flatMap((part) => (part.type === 'text' ? [part.content] : [])).join(''),
        )
        return {text: 'done'}
      },
    ])
    await collected(
      chat.send({
        threadId: sessionId,
        runId: 'run-text-parts',
        messages: [{id: 'run-text-parts-user', role: 'user', content: 'hello\n\nAttachment x.txt:\nthe file body'}],
      }),
    )
    expect(prompts).toEqual(['a skill was added\n\nhello\n\nAttachment x.txt:\nthe file body'])
  })
})

describe('attachment expansion', () => {
  it('an expander that throws leaves the attachment in place, tells the model it could not be processed, and logs why', async () => {
    const {root, db} = await openDatabase()
    const sessionId = SessionId.parse('conciv_broken_attachment')
    const logged: string[] = []
    const chat = await chatPlane(db, root, {
      attachmentExpanders: {
        'application/x-broken': async () => {
          throw new Error('the payload is unreadable')
        },
      },
      log: (line) => logged.push(line),
    })
    const document: ContentPart = {
      type: 'document',
      source: {type: 'data', mimeType: 'application/x-broken', value: 'eA=='},
    }
    const sent: unknown[] = []
    model.setResponses([
      ({request}: {request: {messages: ModelMessage[]}}) => {
        sent.push(request.messages.findLast((message) => message.role === 'user')?.content)
        return {text: 'done'}
      },
    ])
    await collected(
      chat.send({
        threadId: sessionId,
        runId: 'run-broken',
        messages: [{id: 'run-broken-user', role: 'user', content: [{type: 'text', content: 'why?'}, document]}],
      }),
    )
    expect(sent).toEqual([
      [
        {type: 'text', content: 'why?'},
        document,
        {type: 'text', content: '[attachment could not be processed]', metadata: {modelOnly: true}},
      ],
    ])
    expect(logged).toContainEqual(expect.stringContaining('the payload is unreadable'))
  })
})

describe('stopping a run', () => {
  it('a stop says whether it stopped a live run, a repeat stop does not, and the session settles once the run has ended', async () => {
    const {root, db} = await openDatabase()
    const sessionId = SessionId.parse('conciv_stopping')
    const chat = await chatPlane(db, root)
    const reached = Promise.withResolvers<void>()
    const released = Promise.withResolvers<void>()
    model.setResponses([
      async () => {
        reached.resolve()
        await released.promise
        return {text: 'too late'}
      },
    ])

    const turn = chat.followUp(sessionId, 'work for a while')
    await reached.promise
    expect(await chat.live(sessionId)).toBe(true)
    let settledYet = false
    const settling = chat.settled(sessionId).then(() => {
      settledYet = true
    })
    expect(await chat.stop(sessionId, ['another run'])).toEqual({ok: true, stopped: false})
    const together = await Promise.all([chat.stop(sessionId), chat.stop(sessionId)])
    expect(together.map(({stopped}) => stopped).toSorted()).toEqual([false, true])
    expect(await chat.stop(sessionId)).toEqual({ok: true, stopped: false})
    expect(settledYet).toBe(false)

    released.resolve()
    await settling
    expect(chat.driving(sessionId)).toBe(false)
    expect(await chat.live(sessionId)).toBe(false)
    expect(await turn).toEqual({kind: 'stopped'})

    expect(await chat.stop(sessionId)).toEqual({ok: true, stopped: false})
    await chat.settled(sessionId)
    expect(chat.driving(sessionId)).toBe(false)
  })
})

async function collected<T>(source: AsyncIterable<T>): Promise<T[]> {
  const seen: T[] = []
  for await (const value of source) seen.push(value)
  return seen
}

describe('a session deleted while its transcript is read', () => {
  it('a compact and the transcript sync it hydrates write no marker and no thread once the session is deleted', async () => {
    const {root, db} = await openDatabase()
    const sessionId = SessionId.parse('conciv_deleted_mid_read')
    const nativeId = HarnessSessionId.parse('native-deleted-mid-read')
    await Effect.runPromise(
      db.insert(sessionRows).values({
        id: sessionId,
        harnessSessionId: nativeId,
        harnessKind: 'transcribed',
        origin: 'chat',
        cwd: '/workspace',
        createdAt: 1,
        updatedAt: 1,
      }),
    )
    const reading = Promise.withResolvers<void>()
    const transcript = Promise.withResolvers<ChatMessage[]>()
    const unobserved = async () => ({ok: false, reason: 'missing', detail: 'no live transcript'}) as const
    const transcribed = defineHarness({
      id: 'transcribed',
      binName: 'true',
      chatConfig: () => ({adapter: fakeText()}),
      history: {
        messages: async () => {
          reading.resolve()
          return transcript.promise
        },
        tail: async () => ({messages: [], earlier: null}),
        observe: () => ({revision: unobserved, read: unobserved, close: () => undefined}),
        list: async () => ({sessions: [], next: null}),
        meta: async () => null,
      },
      resume: {command: () => ({bin: 'transcribed', args: []})},
      capabilities: {...harness.capabilities, transcriptHistory: true},
    })
    const readRow = async () => {
      const row = await Effect.runPromise(db.select().from(sessionRows).where(eq(sessionRows.id, sessionId)).get())
      return row === undefined
        ? null
        : {
            model: null,
            effort: null,
            nativeId,
            cwd: row.cwd,
            harnessKind: row.harnessKind,
            deletedAt: row.deletedAt,
          }
    }
    const chat = await chatPlane(db, root, {
      harnessFor: async () => transcribed,
      sessions: {...fakeSessions, row: readRow},
    })

    const compacting = chat.compact(sessionId)
    await reading.promise
    await Effect.runPromise(db.update(sessionRows).set({deletedAt: 2}).where(eq(sessionRows.id, sessionId)))
    transcript.resolve([
      {id: 'native-question', role: 'user', parts: [{type: 'text', content: 'read after the delete'}]},
    ])

    await Promise.allSettled([compacting])
    expect(await Effect.runPromise(db.select().from(chatMessages).where(eq(chatMessages.threadId, sessionId)))).toEqual(
      [],
    )
    expect(await Effect.runPromise(db.select().from(markers).where(eq(markers.sessionId, sessionId)))).toEqual([])
    await expect(compacting).rejects.toThrow(`session "${sessionId}" does not exist`)
  })
})

describe('importing the native transcript', () => {
  it('a message recorded while the import waits on the tool names survives the import', async () => {
    const {root, db} = await openDatabase()
    const sessionId = SessionId.parse('conciv_importing')
    const transcript: ChatMessage[] = [
      {id: 'native-1', role: 'assistant', parts: [{type: 'text', content: 'from the cli'}]},
    ]
    const missing = async () => ({ok: false, reason: 'missing', detail: 'no live transcript'}) as const
    const native = defineHarness({
      id: 'native',
      binName: 'true',
      chatConfig: () => ({adapter: fakeText()}),
      history: {
        messages: async () => transcript,
        tail: async () => ({messages: transcript, earlier: null}),
        observe: () => ({revision: missing, read: missing, close: () => undefined}),
        list: async () => ({sessions: [], next: null}),
        meta: async () => null,
      },
      resume: {command: ({nativeId}) => ({bin: 'native', args: [nativeId]})},
      capabilities: {...harness.capabilities, transcriptHistory: true},
    })
    const asked = Promise.withResolvers<void>()
    const named = Promise.withResolvers<ReadonlySet<string>>()
    const toolNames = [named.promise]
    const chat = await chatPlane(db, root, {
      harnessFor: async () => native,
      sessions: {
        ...fakeSessions,
        row: async () => ({
          model: null,
          effort: null,
          nativeId: HarnessSessionId.parse('native-session'),
          cwd: '/workspace',
          harnessKind: 'native',
          deletedAt: null,
        }),
      },
      toolNames: async () => {
        asked.resolve()
        return toolNames.shift() ?? new Set()
      },
    })

    const hydrating = chat.hydrate(sessionId)
    await asked.promise
    const writer = drizzleChatStores(db, {readHarness: async () => 'native', saved: async () => undefined})
    await writer.messages.saveThread(sessionId, [{id: 'recorded', role: 'user', content: 'recorded meanwhile'}])
    named.resolve(new Set())

    const {messages} = await hydrating
    expect(messages.map((message) => message.id)).toEqual(['recorded', 'native-1'])
  })
})
