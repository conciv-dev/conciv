import {mkdtempSync, rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {describe, expect, it, onTestFinished} from 'vitest'
import {toolApprovalId} from '@conciv/ai/server'
import {fakeText} from '@conciv/ai/testkit'
import {openDb, type ConcivDb} from '@conciv/db'
import {defineHarness} from '@conciv/harness'
import {readApprovalAsk, approvalRequestedEvent} from '@conciv/protocol/chat-event-types'
import {SessionId} from '@conciv/protocol/chat-types'
import {Effect, Layer, ManagedRuntime, Schema, Scope} from 'effect'
import {z} from 'zod'
import {Agent, Bus, Database, Location, Permission, PermissionSaved, PluginHooks, Tool} from '@conciv/plugin-host'
import {createChatPlane, toolDomainCapabilities, type CodeCapability} from '../src/index.js'

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

function openDatabase() {
  const root = mkdtempSync(join(tmpdir(), 'conciv-chat-unit-'))
  const db = openDb(root)
  onTestFinished(() => {
    db.$client.close()
    rmSync(root, {recursive: true, force: true})
  })
  return {root, db}
}

function chatPlane(db: ConcivDb, root: string, overrides: Partial<Parameters<typeof createChatPlane>[0]> = {}) {
  return createChatPlane({
    db,
    hubAccess: 'session',
    hubGeneration: () => 0,
    cwd: root,
    harnessFor: () => harness,
    systemPrompt: {},
    sessions: {
      row: () => ({model: null, effort: null, nativeId: null, cwd: '/workspace', harnessKind: 'fake'}),
      ensure: async () => undefined,
      recordNativeId: async () => undefined,
      recordUsage: async () => undefined,
      recordContextTokens: async () => undefined,
      recordActivity: () => {},
      onRunStart: async () => undefined,
      publish: () => undefined,
      onRunEnd: async () => undefined,
    },
    toolNames: new Set(),
    capabilities: () => [],
    attachmentExpanders: {},
    log: () => undefined,
    ...overrides,
  })
}

describe('permission cards', () => {
  it('a permission card is stored, replayed with its member, kept in order under overlapping writes, and removed without a grant', async () => {
    const {root, db} = openDatabase()
    const sessionId = SessionId.parse('conciv_cards')
    const plane = await chatPlane(db, root)
    const editId = toolApprovalId('edit')
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
    const published: unknown[] = []
    expect(
      await plane.admitCall(sessionId, {
        toolName: 'edit',
        input: {},
        publish: (chunk) => published.push(chunk),
        until: AbortSignal.abort(),
      }),
    ).toMatchObject({reason: 'asked'})

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
    const host = ManagedRuntime.make(Tool.layer.pipe(Layer.provideMerge(PluginHooks.layer)))
    onTestFinished(() => host.dispose())
    const scope = host.runSync(Scope.make())
    const builtin: CodeCapability = {
      name: 'unit_taken',
      description: 'Built in.',
      errors: [],
      inputSchema: z.object({}),
      execute: async () => 'built in',
    }
    const collisions: string[] = []
    const capabilities = (): CodeCapability[] =>
      toolDomainCapabilities(
        [builtin],
        host.runSync(Tool.Service.use((tools) => tools.snapshot())),
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
              Effect.succeed({content: `${input.text.toUpperCase()} in ${context.sessionId}`}),
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

    const {root, db} = openDatabase()
    const chat = await chatPlane(db, root, {capabilities})
    const runner = await chat.codeRunner(SessionId.parse('conciv_plugin'), () => undefined)
    expect(runner?.code?.capabilities.map((capability) => capability.name)).toEqual([
      'unit_taken',
      'unit_shout',
      'unit_double',
      'unit_refuse',
    ])
    expect(new Set(collisions)).toEqual(new Set(['unit_taken']))
    await expect(runner?.code?.run('return await external_unit_shout({text: "hi"})', 'parent')).resolves.toMatchObject({
      result: 'CHANGED BY A HOOK in conciv_plugin',
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
  })
})

describe('refusal text', () => {
  const isAsked = Schema.is(Schema.Struct({id: Permission.Id, action: Schema.String}))

  it('a declined call says the user denied the tool, and a blocked or corrected call says its own message', async () => {
    const {root, db} = openDatabase()
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
        Layer.provideMerge(PluginHooks.layer),
        Layer.provideMerge(Bus.configured()),
        Layer.provideMerge(
          Layer.succeed(
            Location.Service,
            Location.Service.of(Schema.decodeSync(Location.Info)({directory: root, project: {id: root}})),
          ),
        ),
        Layer.provideMerge(Database.layer({path: db.$client.location() ?? ':memory:'})),
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
        })
      }).pipe(Scope.provide(scope)),
    )
    const [guarded] = toolDomainCapabilities(
      [],
      host.runSync(Tool.Service.use((tools) => tools.snapshot())),
      (effect, signal) => host.runPromiseExit(effect, {signal}),
      () => undefined,
    )
    const call = (action: string) =>
      guarded?.execute(
        {action},
        {sessionId: SessionId.parse('conciv_refusal'), agentId: 'conciv_refusal', model: null, toolCallId: action},
      )

    await expect(call('asked')).rejects.toThrow(
      'The user denied running tool "unit_guarded". Do not retry it; continue without it.',
    )
    await expect(call('refused')).rejects.toThrow('Permission denied: refused')
    await expect(call('corrected')).rejects.toThrow('read the example file instead')
  })
})

describe('direct tools', () => {
  it('a codemode false tool reaches the turn and the runner as its own tool, and a session that denies execute gets every plugin tool directly and no code mode', async () => {
    const host = ManagedRuntime.make(Tool.layer.pipe(Layer.provideMerge(PluginHooks.layer)))
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
      description: 'Built in.',
      errors: [],
      inputSchema: z.object({}),
      execute: async () => 'built in',
    }
    const shared = SessionId.parse('conciv_direct')
    const closed = SessionId.parse('conciv_no_execute')
    const capabilities = (sessionId: SessionId): CodeCapability[] =>
      toolDomainCapabilities(
        [builtin],
        host.runSync(
          Tool.Service.use((tools) =>
            tools.snapshot(sessionId === closed ? [{action: 'execute', resource: '*', effect: 'deny'}] : []),
          ),
        ),
        (effect, signal) => host.runPromiseExit(effect, {signal}),
        () => undefined,
      )
    const names = (list: readonly {name: string}[] | undefined) => list?.map((entry) => entry.name)

    expect(capabilities(shared).map(({name, direct}) => ({name, direct}))).toEqual([
      {name: 'unit_builtin', direct: undefined},
      {name: 'unit_coded', direct: undefined},
      {name: 'unit_direct', direct: true},
    ])
    const {root, db} = openDatabase()
    const chat = await chatPlane(db, root, {capabilities})
    const runner = await chat.codeRunner(shared, () => undefined)
    expect(names(runner?.code?.capabilities)).toEqual(['unit_builtin', 'unit_coded'])
    expect(names(runner?.direct)).toEqual(['unit_direct'])
    await expect(runner?.direct[0]?.run({text: 'hi'}, 'parent')).resolves.toBe('direct hi')
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
    ])
    const closedRunner = await chat.codeRunner(closed, () => undefined)
    expect(closedRunner?.code).toBeNull()
    expect(names(closedRunner?.direct)).toEqual(['unit_coded', 'unit_direct'])
    await expect(closedRunner?.direct[0]?.run({text: 'shut'}, 'parent')).resolves.toBe('coded shut')
  })
})
