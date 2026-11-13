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
import {Effect, Layer, ManagedRuntime, Scope} from 'effect'
import {z} from 'zod'
import {PluginHooks, Tool} from '@conciv/plugin-host'
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
        (effect, signal) => host.runPromise(effect, {signal}),
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
    expect(runner?.capabilities.map((capability) => capability.name)).toEqual([
      'unit_taken',
      'unit_shout',
      'unit_double',
      'unit_refuse',
    ])
    expect(new Set(collisions)).toEqual(new Set(['unit_taken']))
    await expect(runner?.run('return await external_unit_shout({text: "hi"})', 'parent')).resolves.toMatchObject({
      result: 'CHANGED BY A HOOK in conciv_plugin',
    })
    expect(seen).toEqual(['before unit_shout without a message {"text":"hi"}', 'after unit_shout completed'])
    await expect(runner?.run('return await external_unit_double({count: "2"})', 'parent')).resolves.toMatchObject({
      result: '4',
    })
    expect(seen.slice(2)).toEqual(['before unit_double without a message {"count":"2"}', 'after unit_double completed'])
    await expect(runner?.run('return await external_unit_refuse({})', 'parent')).resolves.toMatchObject({
      success: false,
      error: {message: expect.stringContaining('the tool refused')},
    })
    await expect(runner?.run('return await external_unit_taken({})', 'parent')).resolves.toMatchObject({
      result: 'built in',
    })
  })
})
